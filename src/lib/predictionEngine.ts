import { API, fetchCoinGecko } from './api'
import { fetchQuotes, INDICES, METALS, ENERGY, FOREX, BONDS, POPULAR_STOCKS, calcGSR } from './yahooFinance'
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

export interface StockFundamentals {
  symbol: string; name: string; price: number; changePct: number
  volume: number; dayHigh: number; dayLow: number
}

export interface CoinDetail {
  symbol: string; name: string; price: number; change24h: number
  change7d: number; change30d: number; mcap: number; mcapRank: number
  totalSupply: number | null; circulatingSupply: number
  ath: number; athChangePct: number
}

export interface PredictionSnapshot {
  indices: Map<string, YahooQuote>; metals: Map<string, YahooQuote>
  energy: Map<string, YahooQuote>; forex: Map<string, YahooQuote>
  bonds: Map<string, YahooQuote>; gsr: number | null
  fng: { value: number; classification: string } | null
  crypto: { mcapChange: number; btcDom: number; totalVolume: number } | null
  topCoins: CoinDetail[]
  stocks: StockFundamentals[]
  headlines: { title: string; link: string; source: string }[]
}

export async function gatherPredictionData(): Promise<PredictionSnapshot> {
  const allSyms = [...INDICES, ...METALS, ...ENERGY, ...FOREX, ...BONDS, ...POPULAR_STOCKS].map(x => x.symbol)
  const [qR, fR, gR, cR, nR] = await Promise.allSettled([
    fetchQuotes(allSyms), fetch(API.fng('/fng/?limit=1')), fetchCoinGecko('/api/v3/global'),
    fetchCoinGecko('/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&sparkline=false&price_change_percentage=7d%2C30d'),
    fetchPredHeadlines(),
  ])
  const q = qR.status === 'fulfilled' ? qR.value : new Map<string, YahooQuote>()
  const pick = (s: string[]) => { const m = new Map<string, YahooQuote>(); s.forEach(k => { const v = q.get(k); if (v) m.set(k, v) }); return m }
  let fng: PredictionSnapshot['fng'] = null
  if (fR.status === 'fulfilled' && fR.value.ok) try { const j = await fR.value.json(); fng = { value: +j.data[0].value, classification: j.data[0].value_classification } } catch {}
  let crypto: PredictionSnapshot['crypto'] = null
  if (gR.status === 'fulfilled' && gR.value.ok) try { const d = (await gR.value.json()).data; crypto = { mcapChange: d.market_cap_change_percentage_24h_usd, btcDom: d.market_cap_percentage.btc, totalVolume: d.total_volume.usd } } catch {}
  let topCoins: CoinDetail[] = []
  if (cR.status === 'fulfilled' && cR.value.ok) try {
    topCoins = (await cR.value.json()).slice(0, 20).map((c: any) => ({
      symbol: c.symbol.toUpperCase(), name: c.name, price: c.current_price,
      change24h: c.price_change_percentage_24h || 0,
      change7d: c.price_change_percentage_7d_in_currency || 0,
      change30d: c.price_change_percentage_30d_in_currency || 0,
      mcap: c.market_cap || 0, mcapRank: c.market_cap_rank || 0,
      totalSupply: c.total_supply, circulatingSupply: c.circulating_supply || 0,
      ath: c.ath || 0, athChangePct: c.ath_change_percentage || 0,
    }))
  } catch {}
  const stocks: StockFundamentals[] = POPULAR_STOCKS.map(s => {
    const sq = q.get(s.symbol)
    if (!sq) return null
    return { symbol: s.symbol, name: s.name, price: sq.regularMarketPrice, changePct: sq.regularMarketChangePercent, volume: sq.regularMarketVolume, dayHigh: sq.regularMarketDayHigh, dayLow: sq.regularMarketDayLow }
  }).filter(Boolean) as StockFundamentals[]
  return { indices: pick(INDICES.map(i => i.symbol)), metals: pick(METALS.map(m => m.symbol)), energy: pick(ENERGY.map(e => e.symbol)), forex: pick(FOREX.map(f => f.symbol)), bonds: pick(BONDS.map(b => b.symbol)), gsr: calcGSR(q), fng, crypto, topCoins, stocks, headlines: nR.status === 'fulfilled' ? nR.value : [] }
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
  if (snap.crypto) s.push(`CRYPTO GLOBAL: Mcap24h ${snap.crypto.mcapChange >= 0 ? '+' : ''}${snap.crypto.mcapChange.toFixed(1)}% BTCdom ${snap.crypto.btcDom.toFixed(1)}% Vol $${(snap.crypto.totalVolume / 1e9).toFixed(1)}B`)
  if (snap.topCoins.length) {
    const coinLines = snap.topCoins.map(c => {
      const p = c.price < 1 ? c.price.toFixed(4) : c.price.toFixed(2)
      const supply = c.totalSupply ? `supply ${(c.circulatingSupply / 1e6).toFixed(1)}M/${(c.totalSupply / 1e6).toFixed(1)}M` : `circ ${(c.circulatingSupply / 1e6).toFixed(1)}M`
      return `  #${c.mcapRank} ${c.symbol} (${c.name}): $${p} 24h:${c.change24h >= 0 ? '+' : ''}${c.change24h.toFixed(1)}% 7d:${c.change7d >= 0 ? '+' : ''}${c.change7d.toFixed(1)}% 30d:${c.change30d >= 0 ? '+' : ''}${c.change30d.toFixed(1)}% ATH:$${c.ath.toFixed(2)}(${c.athChangePct.toFixed(0)}%) mcap:$${(c.mcap / 1e9).toFixed(1)}B ${supply}`
    })
    s.push('TOP CRYPTO FUNDAMENTALS:\n' + coinLines.join('\n'))
  }
  if (snap.stocks.length) {
    const stockLines = snap.stocks.map(st => {
      const vol = st.volume > 1e6 ? `${(st.volume / 1e6).toFixed(1)}M` : `${(st.volume / 1e3).toFixed(0)}K`
      return `  ${st.symbol} (${st.name}): $${st.price.toFixed(2)} (${st.changePct >= 0 ? '+' : ''}${st.changePct.toFixed(2)}%) vol:${vol} range:$${st.dayLow.toFixed(2)}-$${st.dayHigh.toFixed(2)}`
    })
    s.push('TOP STOCKS:\n' + stockLines.join('\n'))
  }
  if (snap.fng) s.push(`FEAR&GREED: ${snap.fng.value} (${snap.fng.classification})`)
  if (snap.headlines.length) s.push('NEWS:\n' + snap.headlines.map(h => `  [${h.source}] ${h.title}`).join('\n'))
  return s.join('\n\n')
}

export const PREDICTION_PROMPT = `You are NSIT Predictions Engine, an elite quantitative trading analyst with access to real-time data AND fundamentals across all asset classes.

You have: index prices, commodity prices, forex rates, bond yields, yield curve spread, Fear & Greed sentiment, crypto fundamentals (price, 7d/30d trends, supply metrics, ATH distance, market cap rank), and top stock fundamentals (price, volume, day range).

Use fundamentals to inform picks:
- For crypto: consider ATH distance (coins far from ATH may have upside), supply dynamics (low circ/total ratio = inflation risk), 7d/30d momentum divergence, market cap rank
- For stocks: consider volume (high volume = conviction), day range position (near low = potential bounce, near high = breakout or exhaustion)
- For commodities: consider GSR, energy/metals correlation with DXY
- Cross-asset: yield curve shape, DXY direction, Fear & Greed extremes

Output EXACTLY this format:

===MARKET_BIAS===
One sentence: overall direction and risk appetite.

===BEST_BUYS===
Exactly 3 best buy opportunities across ANY market. One line each:
BUY|Asset Name|Market|Entry Price|Exit Target|Stop Loss|Confidence 0-100|Timeframe|Rationale

===BEST_CONTRACTS===
Exactly 3 stop/loss plays (LONG or SHORT). One line each:
LONG|Asset|Market|Entry|Target|Stop|Confidence|Timeframe|Rationale
or SHORT|Asset|Market|Entry|Target|Stop|Confidence|Timeframe|Rationale

Rules: Real prices from data. Realistic targets. Tight stops. Diverse markets. At least one SHORT if bearish signals. Reference specific fundamentals data (volume, supply, ATH%, 7d/30d trends). No markdown.`

export function parsePredictions(raw: string): PredictionSet | null {
  try {
    const ts = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })

    // Flexible line parser — accepts 5+ pipe fields, fills missing with defaults
    const pL = (l: string): Prediction | null => {
      const p = l.split('|').map(s => s.trim())
      if (p.length < 3) return null
      const d = p[0].toUpperCase().replace(/[^A-Z]/g, '')
      if (!['BUY','LONG','SHORT'].includes(d)) return null
      return {
        asset: p[1] || 'Unknown',
        market: p[2] || 'Mixed',
        direction: d === 'SHORT' ? 'SHORT' : 'LONG',
        entry: p[3] || 'Market',
        exitTarget: p[4] || 'TBD',
        stopLoss: p[5] || 'TBD',
        confidence: Math.min(100, Math.max(0, parseInt(p[6]) || 65)),
        timeframe: p[7] || '1-4 weeks',
        rationale: p[8] || p.slice(3).join(' ') || 'Based on current market conditions',
      }
    }
    const parseLines = (t?: string) => t ? t.split('\n').filter(l => l.includes('|')).map(pL).filter(Boolean) as Prediction[] : []

    // Try structured format first (flexible header matching)
    const bM = raw.match(/={2,}\s*MARKET.?BIAS\s*={0,}\s*\n(.*?)(?=\n={2,}|$)/si)
    const buM = raw.match(/={2,}\s*BEST.?BUY\S*\s*={0,}\s*\n(.*?)(?=\n={2,}|$)/si)
    const cM = raw.match(/={2,}\s*BEST.?CONTRACT\S*\s*={0,}\s*\n(.*?)(?=\n={2,}|$)/si)

    const bb = parseLines(buM?.[1]).slice(0, 3)
    const bc = parseLines(cM?.[1]).slice(0, 3)

    if (bb.length || bc.length) {
      return { bestBuys: bb, bestContracts: bc, marketBias: bM?.[1]?.trim() || extractBias(raw), generatedAt: ts }
    }

    // Fallback: extract ANY pipe-delimited lines from the entire response
    const allPipes = raw.split('\n').filter(l => l.includes('|'))
    const allParsed = allPipes.map(pL).filter(Boolean) as Prediction[]
    if (allParsed.length > 0) {
      const buys = allParsed.filter(p => p.direction === 'LONG').slice(0, 3)
      const shorts = allParsed.filter(p => p.direction === 'SHORT').slice(0, 3)
      // If all are LONG, split them between buys and contracts
      if (shorts.length === 0 && buys.length > 3) {
        return { bestBuys: buys.slice(0, 3), bestContracts: buys.slice(3, 6), marketBias: extractBias(raw), generatedAt: ts }
      }
      return { bestBuys: buys.length ? buys : allParsed.slice(0, 3), bestContracts: shorts.length ? shorts : allParsed.slice(3, 6), marketBias: extractBias(raw), generatedAt: ts }
    }

    // Last resort: try to build predictions from raw text mentioning BUY/SELL/LONG/SHORT
    const lastResort = extractFromFreeText(raw)
    if (lastResort.length > 0) {
      return { bestBuys: lastResort.slice(0, 3), bestContracts: lastResort.slice(3, 6), marketBias: extractBias(raw), generatedAt: ts }
    }

    return null
  } catch { return null }
}

function extractBias(raw: string): string {
  // Try to find a sentence about market direction
  const lines = raw.split('\n').filter(l => l.trim().length > 20 && !l.includes('|'))
  const biasLine = lines.find(l => /bull|bear|neutral|risk|cautious|optimis|pessimis|market/i.test(l))
  return biasLine?.trim().slice(0, 200) || 'Mixed signals across markets.'
}

function extractFromFreeText(raw: string): Prediction[] {
  const results: Prediction[] = []
  const lines = raw.split('\n')
  for (const line of lines) {
    const buyMatch = line.match(/\b(BUY|LONG|SHORT|SELL)\b[:\s]+([A-Z]{2,10}|\w[\w\s]{1,20})/i)
    if (buyMatch) {
      const dir = buyMatch[1].toUpperCase()
      const asset = buyMatch[2].trim()
      const priceMatch = line.match(/\$[\d,.]+/)
      results.push({
        asset, market: 'Mixed', direction: (dir === 'SELL' || dir === 'SHORT') ? 'SHORT' : 'LONG',
        entry: priceMatch?.[0] || 'Market', exitTarget: 'TBD', stopLoss: 'TBD',
        confidence: 55, timeframe: '1-4 weeks',
        rationale: line.trim().slice(0, 150),
      })
    }
    if (results.length >= 6) break
  }
  return results
}
