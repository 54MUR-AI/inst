import { API, fetchCoinGecko } from './api'
import { fetchQuotes, INDICES, METALS, ENERGY, FOREX, BONDS, calcGSR } from './yahooFinance'
import type { YahooQuote } from './yahooFinance'

export interface Prediction {
  asset: string; market: string; direction: 'LONG' | 'SHORT'
  entry: string; exitTarget: string; stopLoss: string
  confidence: number; timeframe: string; rationale: string
}

export interface PredictionSet {
  bestBuys: Prediction[]; bestContracts: Prediction[]
  marketBias: string; generatedAt: string
}

export interface PredictionSnapshot {
  indices: Map<string, YahooQuote>; metals: Map<string, YahooQuote>
  energy: Map<string, YahooQuote>; forex: Map<string, YahooQuote>
  bonds: Map<string, YahooQuote>; gsr: number | null
  fng: { value: number; classification: string } | null
  crypto: { mcapChange: number; btcDom: number; totalVolume: number } | null
  topCoins: { symbol: string; price: number; change24h: number }[]
  headlines: { title: string; link: string; source: string }[]
}

export async function gatherPredictionData(): Promise<PredictionSnapshot> {
  const syms = [...INDICES, ...METALS, ...ENERGY, ...FOREX, ...BONDS].map(x => x.symbol)
  const [qR, fR, gR, cR, nR] = await Promise.allSettled([
    fetchQuotes(syms), fetch(API.fng('/fng/?limit=1')), fetchCoinGecko('/api/v3/global'),
    fetchCoinGecko('/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&sparkline=false'),
    fetchPredHeadlines(),
  ])
  const q = qR.status === 'fulfilled' ? qR.value : new Map<string, YahooQuote>()
  const pick = (s: string[]) => { const m = new Map<string, YahooQuote>(); s.forEach(k => { const v = q.get(k); if (v) m.set(k, v) }); return m }
  let fng: PredictionSnapshot['fng'] = null
  if (fR.status === 'fulfilled' && fR.value.ok) try { const j = await fR.value.json(); fng = { value: +j.data[0].value, classification: j.data[0].value_classification } } catch {}
  let crypto: PredictionSnapshot['crypto'] = null
  if (gR.status === 'fulfilled' && gR.value.ok) try { const d = (await gR.value.json()).data; crypto = { mcapChange: d.market_cap_change_percentage_24h_usd, btcDom: d.market_cap_percentage.btc, totalVolume: d.total_volume.usd } } catch {}
  let topCoins: PredictionSnapshot['topCoins'] = []
  if (cR.status === 'fulfilled' && cR.value.ok) try { topCoins = (await cR.value.json()).slice(0, 20).map((c: any) => ({ symbol: c.symbol.toUpperCase(), price: c.current_price, change24h: c.price_change_percentage_24h || 0 })) } catch {}
  return { indices: pick(INDICES.map(i => i.symbol)), metals: pick(METALS.map(m => m.symbol)), energy: pick(ENERGY.map(e => e.symbol)), forex: pick(FOREX.map(f => f.symbol)), bonds: pick(BONDS.map(b => b.symbol)), gsr: calcGSR(q), fng, crypto, topCoins, headlines: nR.status === 'fulfilled' ? nR.value : [] }
}

async function fetchPredHeadlines(): Promise<{ title: string; link: string; source: string }[]> {
  const feeds = [
    { url: 'https://feeds.marketwatch.com/marketwatch/topstories/', source: 'MarketWatch' },
    { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', source: 'BBC' },
  ]
  const res = await Promise.allSettled(feeds.map(async f => {
    const r = await fetch(API.rss(`/v1/api.json?rss_url=${encodeURIComponent(f.url)}`))
    if (!r.ok) return []
    const j = await r.json()
    return j.status === 'ok' && j.items ? j.items.slice(0, 4).map((it: any) => ({ title: it.title, link: it.link, source: f.source })) : []
  }))
  const all: any[] = []
  res.forEach(r => { if (r.status === 'fulfilled') all.push(...r.value) })
  return all.slice(0, 8)
}

export function buildPredictionContext(snap: PredictionSnapshot): string {
  const s: string[] = []
  const fmt = (label: string, defs: { symbol: string; name: string }[], map: Map<string, YahooQuote>) => {
    const l = defs.map(i => { const q = map.get(i.symbol); return q ? `  ${i.name}: $${q.regularMarketPrice.toFixed(2)} (${q.regularMarketChangePercent >= 0 ? '+' : ''}${q.regularMarketChangePercent.toFixed(2)}%)` : null }).filter(Boolean)
    if (l.length) s.push(`${label}:\n${l.join('\n')}`)
  }
  fmt('INDICES', INDICES, snap.indices); fmt('METALS', METALS, snap.metals)
  if (snap.gsr) s.push(`  GSR: ${snap.gsr.toFixed(1)}`)
  fmt('ENERGY', ENERGY, snap.energy); fmt('FOREX', FOREX, snap.forex)
  if (snap.bonds.size) {
    const l = BONDS.map(b => { const q = snap.bonds.get(b.symbol); return q ? `  ${b.name}(${b.tenor}): ${q.regularMarketPrice.toFixed(2)}%` : null }).filter(Boolean)
    const t3 = snap.bonds.get('^IRX'), t10 = snap.bonds.get('^TNX')
    if (t3 && t10) l.push(`  10Y-3M Spread: ${(t10.regularMarketPrice - t3.regularMarketPrice).toFixed(2)}%`)
    s.push('YIELDS:\n' + l.join('\n'))
  }
  if (snap.crypto) s.push(`CRYPTO: Mcap24h ${snap.crypto.mcapChange >= 0 ? '+' : ''}${snap.crypto.mcapChange.toFixed(1)}% BTCdom ${snap.crypto.btcDom.toFixed(1)}%`)
  if (snap.topCoins.length) s.push('TOP CRYPTO:\n' + snap.topCoins.map(c => `  ${c.symbol}: $${c.price < 1 ? c.price.toFixed(4) : c.price.toFixed(2)} (${c.change24h >= 0 ? '+' : ''}${c.change24h.toFixed(1)}%)`).join('\n'))
  if (snap.fng) s.push(`FEAR&GREED: ${snap.fng.value} (${snap.fng.classification})`)
  if (snap.headlines.length) s.push('NEWS:\n' + snap.headlines.map(h => `  [${h.source}] ${h.title}`).join('\n'))
  return s.join('\n\n')
}

export const PREDICTION_PROMPT = `You are NSIT Predictions Engine, an elite quantitative trading analyst. Analyze the market snapshot and output EXACTLY this format:

===MARKET_BIAS===
One sentence: overall direction and risk appetite.

===BEST_BUYS===
Exactly 3 best buy opportunities across ANY market. One line each:
BUY|Asset Name|Market|Entry Price|Exit Target|Stop Loss|Confidence 0-100|Timeframe|Rationale

===BEST_CONTRACTS===
Exactly 3 stop/loss plays (LONG or SHORT). One line each:
LONG|Asset|Market|Entry|Target|Stop|Confidence|Timeframe|Rationale
or SHORT|Asset|Market|Entry|Target|Stop|Confidence|Timeframe|Rationale

Rules: Real prices from data. Realistic targets. Tight stops. Diverse markets. At least one SHORT if bearish signals. Reference specific data. No markdown.`

export function parsePredictions(raw: string): PredictionSet | null {
  try {
    const bM = raw.match(/===MARKET_BIAS===\s*\n(.*?)(?=\n===|$)/s)
    const buM = raw.match(/===BEST_BUYS===\s*\n(.*?)(?=\n===|$)/s)
    const cM = raw.match(/===BEST_CONTRACTS===\s*\n(.*?)(?=\n===|$)/s)
    const pL = (l: string): Prediction | null => {
      const p = l.split('|').map(s => s.trim()); if (p.length < 9) return null
      const d = p[0].toUpperCase(); if (!['BUY','LONG','SHORT'].includes(d)) return null
      return { asset: p[1], market: p[2], direction: d === 'SHORT' ? 'SHORT' : 'LONG', entry: p[3], exitTarget: p[4], stopLoss: p[5], confidence: Math.min(100, Math.max(0, parseInt(p[6]) || 0)), timeframe: p[7], rationale: p[8] }
    }
    const pS = (t?: string) => t ? t.split('\n').filter(l => l.includes('|')).map(pL).filter(Boolean) as Prediction[] : []
    const bb = pS(buM?.[1]).slice(0, 3), bc = pS(cM?.[1]).slice(0, 3)
    if (!bb.length && !bc.length) return null
    return { bestBuys: bb, bestContracts: bc, marketBias: bM?.[1]?.trim() || 'Unable to determine.', generatedAt: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) }
  } catch { return null }
}
