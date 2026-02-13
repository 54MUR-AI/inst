import { API, fetchCoinGecko, getSharedMarkets } from './api'
import { fetchQuotes, INDICES, METALS, ENERGY, FOREX, BONDS, POPULAR_STOCKS, calcGSR } from './yahooFinance'
import type { YahooQuote } from './yahooFinance'
import { buildFredContext } from './fred'

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
  fredContext: string | null
}

export async function gatherPredictionData(): Promise<PredictionSnapshot> {
  const allSyms = [...INDICES, ...METALS, ...ENERGY, ...FOREX, ...BONDS, ...POPULAR_STOCKS].map(x => x.symbol)
  const [qR, fR, gR, cR, nR] = await Promise.allSettled([
    fetchQuotes(allSyms), fetch(API.fng('/fng/?limit=1')), fetchCoinGecko('/api/v3/global'),
    getSharedMarkets(),
    fetchPredHeadlines(),
  ])
  const q = qR.status === 'fulfilled' ? qR.value : new Map<string, YahooQuote>()
  const pick = (s: string[]) => { const m = new Map<string, YahooQuote>(); s.forEach(k => { const v = q.get(k); if (v) m.set(k, v) }); return m }
  let fng: PredictionSnapshot['fng'] = null
  if (fR.status === 'fulfilled' && fR.value.ok) try { const j = await fR.value.json(); fng = { value: +j.data[0].value, classification: j.data[0].value_classification } } catch {}
  let crypto: PredictionSnapshot['crypto'] = null
  if (gR.status === 'fulfilled' && gR.value.ok) try { const d = (await gR.value.json()).data; crypto = { mcapChange: d.market_cap_change_percentage_24h_usd, btcDom: d.market_cap_percentage.btc, totalVolume: d.total_volume.usd } } catch {}
  let topCoins: CoinDetail[] = []
  if (cR.status === 'fulfilled') try {
    const coins = cR.value as any[]
    topCoins = coins.slice(0, 20).map((c: any) => ({
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
  // Try to get FRED macro data (requires LDGR key)
  let fredContext: string | null = null
  try { fredContext = await buildFredContext() } catch {}
  return { indices: pick(INDICES.map(i => i.symbol)), metals: pick(METALS.map(m => m.symbol)), energy: pick(ENERGY.map(e => e.symbol)), forex: pick(FOREX.map(f => f.symbol)), bonds: pick(BONDS.map(b => b.symbol)), gsr: calcGSR(q), fng, crypto, topCoins, stocks, headlines: nR.status === 'fulfilled' ? nR.value : [], fredContext }
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
  if (snap.fredContext) s.push(snap.fredContext)
  if (snap.headlines.length) s.push('NEWS:\n' + snap.headlines.map(h => `  [${h.source}] ${h.title}`).join('\n'))
  return s.join('\n\n')
}

export const PREDICTION_PROMPT = `You are a trading prediction engine. Output ONLY the format below. Do NOT use markdown, headers, bold, bullet points, or any other formatting. ONLY plain text and pipe-delimited lines.

===MARKET_BIAS===
Bearish risk-off environment driven by extreme fear and global equity weakness.

===BEST_BUYS===
BUY|Gold|Commodities|$2680.00|$2750.00|$2640.00|78|2-4 weeks|Safe haven demand rising with extreme fear at 9 and DXY weakness
BUY|SOL|Crypto|$148.00|$175.00|$135.00|65|1-2 weeks|30-day loss -71% from ATH but 7-day surge +10% signals short squeeze
BUY|Apple|Stocks|$198.50|$210.00|$192.00|70|2-4 weeks|Volume 45M near day low $197 suggests accumulation at support

===BEST_CONTRACTS===
SHORT|Nikkei 225|Indices|$35800|$34500|$36200|72|1-2 weeks|Down -5.2% with Asian contagion and yen strengthening
LONG|Bitcoin|Crypto|$97500|$105000|$93000|68|2-4 weeks|Extreme fear 9 historically marks bottoms with 30d -28.9% washout
SHORT|Natural Gas|Energy|$3.45|$3.15|$3.65|60|2-4 weeks|Seasonal demand decline with mild weather forecasts

CRITICAL RULES:
Use REAL prices from the data provided.
Each line MUST have exactly 9 pipe-separated fields.
Asset names must be the FULL name (e.g. "Bitcoin" not "BTC", "Gold" not "GC").
Entry/Target/Stop must include dollar sign and actual numbers.
Confidence is 0-100 integer.
NO markdown. No hash signs, no asterisks, no dashes, no backticks, no bold, no headers.
NO explanatory text outside the three sections above.`

// Strip markdown formatting from LLM output
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s*/g, '')        // headers
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1') // bold/italic
    .replace(/`{1,3}[^`]*`{1,3}/g, '') // code blocks
    .replace(/^[-*]\s+/gm, '')         // bullet points
    .replace(/^>\s+/gm, '')            // blockquotes
    .replace(/---+/g, '')              // horizontal rules
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .trim()
}

export function parsePredictions(raw: string): PredictionSet | null {
  try {
    const ts = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
    const cleaned = stripMarkdown(raw)

    // Parse a pipe-delimited line — require at least 5 fields with a recognizable asset
    const parseLine = (l: string): Prediction | null => {
      const p = l.split('|').map(s => s.trim())
      if (p.length < 5) return null
      const d = p[0].toUpperCase().replace(/[^A-Z]/g, '')
      if (!['BUY','LONG','SHORT'].includes(d)) return null
      const asset = p[1]
      if (!asset || asset.length < 2 || asset.length > 40) return null
      return {
        asset,
        market: p[2] || 'Mixed',
        direction: d === 'SHORT' ? 'SHORT' : 'LONG',
        entry: p[3] || 'Market',
        exitTarget: p[4] || 'TBD',
        stopLoss: p[5] || 'TBD',
        confidence: Math.min(100, Math.max(0, parseInt(p[6]) || 65)),
        timeframe: p[7] || '1-4 weeks',
        rationale: stripMarkdown(p[8] || p.slice(3).join(' ') || 'Based on current market conditions'),
      }
    }
    const parseSection = (t?: string) => t ? t.split('\n').filter(l => l.includes('|')).map(parseLine).filter(Boolean) as Prediction[] : []

    // Try structured format (flexible header matching)
    const bM = cleaned.match(/={2,}\s*MARKET.?BIAS\s*={0,}\s*\n(.*?)(?=\n={2,}|$)/si)
    const buM = cleaned.match(/={2,}\s*BEST.?BUY\S*\s*={0,}\s*\n(.*?)(?=\n={2,}|$)/si)
    const cM = cleaned.match(/={2,}\s*BEST.?CONTRACT\S*\s*={0,}\s*\n(.*?)(?=\n={2,}|$)/si)

    const bb = parseSection(buM?.[1]).slice(0, 3)
    const bc = parseSection(cM?.[1]).slice(0, 3)

    if (bb.length || bc.length) {
      return { bestBuys: bb, bestContracts: bc, marketBias: stripMarkdown(bM?.[1]?.trim() || extractBias(cleaned)), generatedAt: ts }
    }

    // Fallback: extract ALL pipe-delimited lines from the entire cleaned response
    const allPipes = cleaned.split('\n').filter(l => (l.match(/\|/g) || []).length >= 4)
    const allParsed = allPipes.map(parseLine).filter(Boolean) as Prediction[]
    if (allParsed.length > 0) {
      const buys = allParsed.filter(p => p.direction === 'LONG')
      const shorts = allParsed.filter(p => p.direction === 'SHORT')
      return {
        bestBuys: (buys.length ? buys : allParsed).slice(0, 3),
        bestContracts: (shorts.length ? shorts : allParsed.slice(3)).slice(0, 3),
        marketBias: extractBias(cleaned),
        generatedAt: ts,
      }
    }

    // Last resort: extract numbered/bulleted recommendations from markdown-style output
    const lastResort = extractFromStructuredText(cleaned)
    if (lastResort.length > 0) {
      const buys = lastResort.filter(p => p.direction === 'LONG')
      const shorts = lastResort.filter(p => p.direction === 'SHORT')
      return {
        bestBuys: (buys.length ? buys : lastResort).slice(0, 3),
        bestContracts: (shorts.length ? shorts : lastResort.slice(3)).slice(0, 3),
        marketBias: extractBias(cleaned),
        generatedAt: ts,
      }
    }

    return null
  } catch { return null }
}

function extractBias(text: string): string {
  const lines = text.split('\n').filter(l => l.trim().length > 20 && !l.includes('|'))
  const biasLine = lines.find(l => /bull|bear|neutral|risk|cautious|optimis|pessimis|fear|greed|sell.?off|rally/i.test(l))
  return biasLine ? stripMarkdown(biasLine).slice(0, 200) : 'Mixed signals across markets.'
}

// Known asset names/tickers to look for in free text
const KNOWN_ASSETS = [
  'BTC', 'Bitcoin', 'ETH', 'Ethereum', 'SOL', 'Solana', 'XRP', 'BNB', 'ADA', 'DOGE', 'DOT', 'AVAX', 'MATIC', 'LINK',
  'AAPL', 'Apple', 'MSFT', 'Microsoft', 'NVDA', 'NVIDIA', 'GOOGL', 'Alphabet', 'AMZN', 'Amazon', 'META', 'TSLA', 'Tesla', 'JPM', 'JPMorgan',
  'Gold', 'Silver', 'Crude Oil', 'Natural Gas', 'Copper', 'Platinum',
  'S&P 500', 'SPX', 'Nasdaq', 'Dow', 'Nikkei', 'DAX', 'FTSE', 'Hang Seng',
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'DXY',
]

function extractFromStructuredText(text: string): Prediction[] {
  const results: Prediction[] = []
  const lines = text.split('\n')

  for (const line of lines) {
    if (results.length >= 6) break
    // Find lines mentioning known assets with a direction
    const dirMatch = line.match(/\b(buy|long|short|sell)\b/i)
    if (!dirMatch) continue

    const dir = dirMatch[1].toUpperCase()
    const asset = KNOWN_ASSETS.find(a => line.toLowerCase().includes(a.toLowerCase()))
    if (!asset) continue

    // Extract prices
    const prices = [...line.matchAll(/\$[\d,]+\.?\d*/g)].map(m => m[0])
    const confMatch = line.match(/(\d{1,3})\s*%/)

    results.push({
      asset,
      market: inferMarket(asset),
      direction: (dir === 'SELL' || dir === 'SHORT') ? 'SHORT' : 'LONG',
      entry: prices[0] || 'Market',
      exitTarget: prices[1] || 'TBD',
      stopLoss: prices[2] || 'TBD',
      confidence: confMatch ? Math.min(100, parseInt(confMatch[1])) : 60,
      timeframe: extractTimeframe(line) || '1-4 weeks',
      rationale: line.trim().slice(0, 150),
    })
  }
  return results
}

function inferMarket(asset: string): string {
  if (/BTC|ETH|SOL|XRP|BNB|ADA|DOGE|DOT|AVAX|MATIC|LINK|Bitcoin|Ethereum|Solana/i.test(asset)) return 'Crypto'
  if (/AAPL|MSFT|NVDA|GOOGL|AMZN|META|TSLA|JPM|Apple|Microsoft|NVIDIA|Amazon|Tesla/i.test(asset)) return 'Stocks'
  if (/Gold|Silver|Crude|Natural Gas|Copper|Platinum/i.test(asset)) return 'Commodities'
  if (/S&P|SPX|Nasdaq|Dow|Nikkei|DAX|FTSE|Hang Seng/i.test(asset)) return 'Indices'
  if (/EUR|GBP|USD|JPY|DXY/i.test(asset)) return 'Forex'
  return 'Mixed'
}

function extractTimeframe(line: string): string | null {
  const m = line.match(/(\d+[-–]\d+\s*(?:day|week|month)s?|\d+\s*(?:day|week|month)s?|short.?term|medium.?term|long.?term|intraday|swing)/i)
  return m ? m[1] : null
}
