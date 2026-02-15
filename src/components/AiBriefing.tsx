import { useState, useEffect, useCallback } from 'react'
import { Brain, RefreshCw, AlertTriangle, Sparkles } from 'lucide-react'
import { API, fetchCoinGecko } from '../lib/api'
import { fetchQuotes, INDICES, METALS, ENERGY, FOREX, BONDS, calcGSR } from '../lib/yahooFinance'
import type { YahooQuote } from '../lib/yahooFinance'
import ollamaProxy from '../lib/ollamaProxy'
import { scrapeMultiple, checkHealth } from '../lib/scrpBridge'
import { loadAiCache, saveAiCache } from '../lib/aiCache'

interface BriefingItem {
  type: 'trend' | 'alert' | 'insight'
  title: string
  body: string
  timestamp: string
}

interface AiBriefingProps {
  selectedModel?: string
}

// ── Data gathering ──

interface MarketSnapshot {
  indices: Map<string, YahooQuote>
  metals: Map<string, YahooQuote>
  energy: Map<string, YahooQuote>
  forex: Map<string, YahooQuote>
  bonds: Map<string, YahooQuote>
  gsr: number | null
  fng: { value: number; classification: string } | null
  crypto: { mcapChange: number; btcDom: number; totalVolume: number; activeCryptos: number } | null
  headlines: { title: string; link: string; source: string }[]
}

async function gatherMarketData(): Promise<MarketSnapshot> {
  const allSymbols = [
    ...INDICES.map(i => i.symbol),
    ...METALS.map(m => m.symbol),
    ...ENERGY.map(e => e.symbol),
    ...FOREX.map(f => f.symbol),
    ...BONDS.map(b => b.symbol),
  ]

  const [quotesMap, fngRes, globalRes, newsRes] = await Promise.allSettled([
    fetchQuotes(allSymbols),
    fetch(API.fng('/fng/?limit=1')),
    fetchCoinGecko('/api/v3/global'),
    fetchNewsHeadlines(),
  ])

  const quotes = quotesMap.status === 'fulfilled' ? quotesMap.value : new Map<string, YahooQuote>()

  // Split quotes into categories
  const pick = (syms: string[]) => {
    const m = new Map<string, YahooQuote>()
    for (const s of syms) { const q = quotes.get(s); if (q) m.set(s, q) }
    return m
  }

  const indices = pick(INDICES.map(i => i.symbol))
  const metals = pick(METALS.map(m => m.symbol))
  const energy = pick(ENERGY.map(e => e.symbol))
  const forex = pick(FOREX.map(f => f.symbol))
  const bonds = pick(BONDS.map(b => b.symbol))

  let fng: MarketSnapshot['fng'] = null
  if (fngRes.status === 'fulfilled' && fngRes.value.ok) {
    try {
      const j = await fngRes.value.json()
      fng = { value: parseInt(j.data[0].value), classification: j.data[0].value_classification }
    } catch { /* skip */ }
  }

  let crypto: MarketSnapshot['crypto'] = null
  if (globalRes.status === 'fulfilled' && globalRes.value.ok) {
    try {
      const d = (await globalRes.value.json()).data
      crypto = {
        mcapChange: d.market_cap_change_percentage_24h_usd,
        btcDom: d.market_cap_percentage.btc,
        totalVolume: d.total_volume.usd,
        activeCryptos: d.active_cryptocurrencies,
      }
    } catch { /* skip */ }
  }

  const headlines = newsRes.status === 'fulfilled' ? newsRes.value : []

  return { indices, metals, energy, forex, bonds, gsr: calcGSR(quotes), fng, crypto, headlines }
}

async function fetchNewsHeadlines(): Promise<{ title: string; link: string; source: string }[]> {
  const feeds = [
    { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk' },
    { url: 'https://feeds.marketwatch.com/marketwatch/topstories/', source: 'MarketWatch' },
    { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', source: 'BBC' },
    { url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', source: 'CNBC' },
  ]
  const results = await Promise.allSettled(
    feeds.map(async (f) => {
      const res = await fetch(API.rss(`/v1/api.json?rss_url=${encodeURIComponent(f.url)}`))
      if (!res.ok) return []
      const j = await res.json()
      if (j.status !== 'ok' || !j.items) return []
      return j.items.slice(0, 3).map((it: { title: string; link: string }) => ({
        title: it.title,
        link: it.link,
        source: f.source,
      }))
    })
  )
  const all: { title: string; link: string; source: string }[] = []
  for (const r of results) if (r.status === 'fulfilled') all.push(...r.value)
  return all.slice(0, 12)
}

// ── Local analysis (no LLM needed) ──

function generateLocalInsights(snap: MarketSnapshot): BriefingItem[] {
  const items: BriefingItem[] = []
  const now = new Date().toLocaleTimeString()

  // Fear & Greed
  if (snap.fng) {
    const v = snap.fng.value
    items.push({
      type: v <= 30 ? 'alert' : v >= 70 ? 'trend' : 'insight',
      title: `Sentiment: ${snap.fng.classification}`,
      body: v <= 25
        ? `Fear & Greed at ${v} — Extreme Fear. Historically precedes strong buying opportunities. Contrarian signal active.`
        : v <= 45
        ? `Fear & Greed at ${v} — Fear zone. Market cautious. Watch for accumulation in large-caps.`
        : v <= 55
        ? `Fear & Greed at ${v} — Neutral. No strong directional bias.`
        : v <= 75
        ? `Fear & Greed at ${v} — Greed. Momentum bullish but watch for overextension.`
        : `Fear & Greed at ${v} — Extreme Greed. Markets may be overheated. Correction probability elevated.`,
      timestamp: now,
    })
  }

  // Major indices summary
  if (snap.indices.size > 0) {
    const sp = snap.indices.get('^GSPC')
    const dji = snap.indices.get('^DJI')
    const nq = snap.indices.get('^IXIC')
    const parts: string[] = []
    if (sp) parts.push(`S&P 500 ${sp.regularMarketChangePercent >= 0 ? '+' : ''}${sp.regularMarketChangePercent.toFixed(2)}%`)
    if (dji) parts.push(`Dow ${dji.regularMarketChangePercent >= 0 ? '+' : ''}${dji.regularMarketChangePercent.toFixed(2)}%`)
    if (nq) parts.push(`NASDAQ ${nq.regularMarketChangePercent >= 0 ? '+' : ''}${nq.regularMarketChangePercent.toFixed(2)}%`)

    const avgChange = [...snap.indices.values()].reduce((s, q) => s + q.regularMarketChangePercent, 0) / snap.indices.size
    items.push({
      type: Math.abs(avgChange) >= 1.5 ? (avgChange > 0 ? 'trend' : 'alert') : 'insight',
      title: 'Global Equities',
      body: parts.join(' · ') + `. Global indices avg ${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%.`,
      timestamp: now,
    })
  }

  // Gold, Silver, GSR
  if (snap.metals.size > 0) {
    const gold = snap.metals.get('GC=F')
    const silver = snap.metals.get('SI=F')
    let body = ''
    if (gold) body += `Gold $${gold.regularMarketPrice.toFixed(0)} (${gold.regularMarketChangePercent >= 0 ? '+' : ''}${gold.regularMarketChangePercent.toFixed(2)}%)`
    if (silver) body += ` · Silver $${silver.regularMarketPrice.toFixed(2)} (${silver.regularMarketChangePercent >= 0 ? '+' : ''}${silver.regularMarketChangePercent.toFixed(2)}%)`
    if (snap.gsr) {
      body += ` · GSR ${snap.gsr.toFixed(1)}`
      if (snap.gsr > 80) body += ' (historically elevated — silver undervalued relative to gold)'
      else if (snap.gsr < 60) body += ' (low — silver outperforming gold)'
    }
    items.push({ type: 'insight', title: 'Precious Metals', body, timestamp: now })
  }

  // Energy
  if (snap.energy.size > 0) {
    const wti = snap.energy.get('CL=F')
    const brent = snap.energy.get('BZ=F')
    const ng = snap.energy.get('NG=F')
    const parts: string[] = []
    if (wti) parts.push(`WTI $${wti.regularMarketPrice.toFixed(2)} (${wti.regularMarketChangePercent >= 0 ? '+' : ''}${wti.regularMarketChangePercent.toFixed(1)}%)`)
    if (brent) parts.push(`Brent $${brent.regularMarketPrice.toFixed(2)}`)
    if (ng) parts.push(`NatGas $${ng.regularMarketPrice.toFixed(2)} (${ng.regularMarketChangePercent >= 0 ? '+' : ''}${ng.regularMarketChangePercent.toFixed(1)}%)`)
    items.push({ type: 'insight', title: 'Energy', body: parts.join(' · '), timestamp: now })
  }

  // Yield curve + DXY
  if (snap.bonds.size >= 2) {
    const t3m = snap.bonds.get('^IRX')
    const t10y = snap.bonds.get('^TNX')
    const t30y = snap.bonds.get('^TYX')
    const dxy = snap.forex.get('DX-Y.NYB')
    let body = ''
    if (t10y) body += `10Y yield ${t10y.regularMarketPrice.toFixed(2)}%`
    if (t30y) body += ` · 30Y ${t30y.regularMarketPrice.toFixed(2)}%`
    if (t3m && t10y) {
      const spread = t10y.regularMarketPrice - t3m.regularMarketPrice
      body += ` · 10Y-3M spread ${spread >= 0 ? '+' : ''}${spread.toFixed(2)}%`
      if (spread < 0) body += ' ⚠️ INVERTED (recession signal)'
    }
    if (dxy) body += ` · DXY ${dxy.regularMarketPrice.toFixed(2)} (${dxy.regularMarketChangePercent >= 0 ? '+' : ''}${dxy.regularMarketChangePercent.toFixed(2)}%)`
    const isInverted = t3m && t10y && (t10y.regularMarketPrice - t3m.regularMarketPrice) < 0
    items.push({ type: isInverted ? 'alert' : 'insight', title: 'Bonds & Dollar', body, timestamp: now })
  }

  // Crypto
  if (snap.crypto) {
    const c = snap.crypto
    items.push({
      type: Math.abs(c.mcapChange) >= 3 ? (c.mcapChange > 0 ? 'trend' : 'alert') : 'insight',
      title: 'Crypto Markets',
      body: `Total crypto mcap ${c.mcapChange >= 0 ? '+' : ''}${c.mcapChange.toFixed(1)}% 24h. BTC dominance ${c.btcDom.toFixed(1)}%. Volume $${(c.totalVolume / 1e9).toFixed(1)}B. ${
        c.btcDom > 60 ? 'High BTC dominance — altcoin rotation unlikely.' :
        c.btcDom < 45 ? 'Low BTC dominance — alt season indicators elevated.' :
        'Normal dominance range.'
      }`,
      timestamp: now,
    })
  }

  // Top headlines
  if (snap.headlines.length > 0) {
    items.push({
      type: 'insight',
      title: 'Top Headlines',
      body: snap.headlines.slice(0, 4).map(h => `• [${h.source}] ${h.title}`).join(' '),
      timestamp: now,
    })
  }

  return items
}

// ── Build context string for Ollama ──

function buildOllamaContext(snap: MarketSnapshot): string {
  const sections: string[] = []

  // Indices
  if (snap.indices.size > 0) {
    const lines = INDICES.map(i => {
      const q = snap.indices.get(i.symbol)
      return q ? `  ${i.name}: ${q.regularMarketPrice.toFixed(2)} (${q.regularMarketChangePercent >= 0 ? '+' : ''}${q.regularMarketChangePercent.toFixed(2)}%)` : null
    }).filter(Boolean)
    sections.push('GLOBAL INDICES:\n' + lines.join('\n'))
  }

  // Metals + GSR
  if (snap.metals.size > 0) {
    const lines = METALS.map(m => {
      const q = snap.metals.get(m.symbol)
      return q ? `  ${m.name}: $${q.regularMarketPrice.toFixed(2)} (${q.regularMarketChangePercent >= 0 ? '+' : ''}${q.regularMarketChangePercent.toFixed(2)}%)` : null
    }).filter(Boolean)
    if (snap.gsr) lines.push(`  Gold/Silver Ratio: ${snap.gsr.toFixed(1)}`)
    sections.push('PRECIOUS METALS:\n' + lines.join('\n'))
  }

  // Energy
  if (snap.energy.size > 0) {
    const lines = ENERGY.map(e => {
      const q = snap.energy.get(e.symbol)
      return q ? `  ${e.name}: $${q.regularMarketPrice.toFixed(2)} (${q.regularMarketChangePercent >= 0 ? '+' : ''}${q.regularMarketChangePercent.toFixed(2)}%)` : null
    }).filter(Boolean)
    sections.push('ENERGY:\n' + lines.join('\n'))
  }

  // Forex
  if (snap.forex.size > 0) {
    const lines = FOREX.map(f => {
      const q = snap.forex.get(f.symbol)
      return q ? `  ${f.name}: ${q.regularMarketPrice.toFixed(4)} (${q.regularMarketChangePercent >= 0 ? '+' : ''}${q.regularMarketChangePercent.toFixed(2)}%)` : null
    }).filter(Boolean)
    sections.push('FOREX:\n' + lines.join('\n'))
  }

  // Bonds
  if (snap.bonds.size > 0) {
    const lines = BONDS.map(b => {
      const q = snap.bonds.get(b.symbol)
      return q ? `  ${b.name} (${b.tenor}): ${q.regularMarketPrice.toFixed(2)}%` : null
    }).filter(Boolean)
    const t3m = snap.bonds.get('^IRX')
    const t10y = snap.bonds.get('^TNX')
    if (t3m && t10y) lines.push(`  10Y-3M Spread: ${(t10y.regularMarketPrice - t3m.regularMarketPrice).toFixed(2)}%`)
    sections.push('US TREASURY YIELDS:\n' + lines.join('\n'))
  }

  // Crypto
  if (snap.crypto) {
    const c = snap.crypto
    sections.push(`CRYPTO:\n  Market cap 24h change: ${c.mcapChange >= 0 ? '+' : ''}${c.mcapChange.toFixed(1)}%\n  BTC dominance: ${c.btcDom.toFixed(1)}%\n  24h volume: $${(c.totalVolume / 1e9).toFixed(1)}B`)
  }

  // Fear & Greed
  if (snap.fng) {
    sections.push(`FEAR & GREED INDEX: ${snap.fng.value} (${snap.fng.classification})`)
  }

  // Headlines
  if (snap.headlines.length > 0) {
    sections.push('BREAKING NEWS HEADLINES:\n' + snap.headlines.map(h => `  [${h.source}] ${h.title}`).join('\n'))
  }

  return sections.join('\n\n')
}

const SYSTEM_PROMPT = `You are N-SIT (Networked - Strategic Intelligence Tool), an elite financial analyst AI embedded in a real-time market dashboard. You have access to live data across global equities, commodities, forex, bonds, and crypto markets.

Your job is to synthesize the provided market snapshot into 3-5 actionable intelligence briefings. For each briefing:

1. Start with a tag: [TREND], [ALERT], or [INSIGHT]
2. Follow with a bold title phrase, then a colon, then 1-3 sentences of analysis
3. Connect dots across asset classes (e.g., rising DXY + falling gold + yield curve steepening = risk-off rotation)
4. Flag anomalies, divergences, or historically significant levels
5. Reference specific numbers from the data

Style: Direct, institutional-grade. No fluff. Think Bloomberg terminal meets hedge fund morning briefing. Use precise language. Mention specific prices, percentages, and spreads.

Do NOT use markdown formatting. Do NOT use bullet point characters. Write each briefing as a single paragraph starting with the tag.`

// ══════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════

export default function AiBriefing({ selectedModel }: AiBriefingProps) {
  const [items, setItems] = useState<BriefingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [ollamaAvailable, setOllamaAvailable] = useState(ollamaProxy.isAvailable)
  const [deepLoading, setDeepLoading] = useState(false)
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null)

  useEffect(() => {
    const unsub = ollamaProxy.onStatusChange(() => setOllamaAvailable(ollamaProxy.isAvailable))
    ollamaProxy.requestModels()
    // Try loading cached briefing first
    loadAiCache<BriefingItem[]>('briefing').then(cached => {
      if (cached && cached.content.length > 0) {
        setItems(cached.content)
        setLoading(false)
        // Still refresh market data in background
        gatherMarketData().then(snap => setSnapshot(snap)).catch(() => {})
      } else {
        refreshBriefing()
      }
    }).catch(() => refreshBriefing())
    return unsub
  }, [])

  const refreshBriefing = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await gatherMarketData()
      setSnapshot(snap)
      const insights = generateLocalInsights(snap)
      if (insights.length > 0) saveAiCache('briefing', insights)
      setItems(insights.length > 0 ? insights : [{
        type: 'insight', title: 'Initializing...', body: 'Gathering market intelligence across all asset classes.', timestamp: new Date().toLocaleTimeString(),
      }])
    } catch {
      setItems([{
        type: 'alert', title: 'Data Unavailable', body: 'Unable to fetch market data. Will retry on refresh.', timestamp: new Date().toLocaleTimeString(),
      }])
    }
    setLoading(false)
  }, [])

  const generateDeepBriefing = async () => {
    if (!ollamaProxy.isAvailable || !snapshot) return
    setDeepLoading(true)

    let context = buildOllamaContext(snapshot)
    const model = selectedModel || ollamaProxy.availableModels[0] || 'llama3:latest'

    // Try to scrape top news articles via SCRP for full content
    try {
      const scrpUp = await checkHealth()
      if (scrpUp && snapshot.headlines.length > 0) {
        const topUrls = snapshot.headlines.slice(0, 4).map(h => h.link).filter(Boolean)
        if (topUrls.length > 0) {
          const scraped = await scrapeMultiple(topUrls, { summarize: false })
          const articleTexts: string[] = []
          scraped.forEach((result, url) => {
            if (result.success && result.content?.content) {
              const preview = result.content.content.slice(0, 1500)
              articleTexts.push(`ARTICLE: ${result.content.title || url}\n${preview}`)
            }
          })
          if (articleTexts.length > 0) {
            context += '\n\nSCRAPED ARTICLE CONTENT (via SCRP):\n' + articleTexts.join('\n\n---\n\n')
          }
        }
      }
    } catch {
      // SCRP unavailable — continue with headlines only
    }

    try {
      const result = await ollamaProxy.chat(model, [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Analyze this real-time market snapshot and provide your intelligence briefing:\n\n${context}` },
      ])

      const response = (result as { message?: { content?: string } })?.message?.content || ''
      if (!response) throw new Error('Empty response')

      const now = new Date().toLocaleTimeString()
      const aiItems: BriefingItem[] = response
        .split('\n')
        .filter((l: string) => l.trim().length > 15)
        .slice(0, 5)
        .map((line: string) => {
          const type: BriefingItem['type'] = line.includes('[ALERT]') ? 'alert' : line.includes('[TREND]') ? 'trend' : 'insight'
          const body = line.replace(/^\s*[-•*]\s*/, '').replace(/\[(TREND|ALERT|INSIGHT)\]\s*/i, '').trim()
          return { type, title: type === 'alert' ? '🤖 AI Alert' : type === 'trend' ? '🤖 AI Trend' : '🤖 AI Insight', body, timestamp: now }
        })

      if (aiItems.length > 0) {
        const merged = [...aiItems, ...items]
        setItems(merged)
        saveAiCache('briefing', merged)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setItems(prev => [{ type: 'alert', title: 'Ollama Error', body: `Deep analysis failed: ${msg}`, timestamp: new Date().toLocaleTimeString() }, ...prev])
    }
    setDeepLoading(false)
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'alert': return <AlertTriangle className="w-3.5 h-3.5 text-samurai-amber" />
      case 'trend': return <Brain className="w-3.5 h-3.5 text-samurai-green" />
      default: return <Brain className="w-3.5 h-3.5 text-samurai-cyan" />
    }
  }

  const getTypeBorder = (type: string) => {
    switch (type) {
      case 'alert': return 'border-l-samurai-amber'
      case 'trend': return 'border-l-samurai-green'
      default: return 'border-l-samurai-cyan'
    }
  }

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-samurai-steel font-mono">
            {ollamaAvailable
              ? `OLLAMA · ${selectedModel || ollamaProxy.availableModels[0] || 'no model'}`
              : 'LOCAL ANALYSIS · ALL MARKETS'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {ollamaAvailable && (
            <button onClick={generateDeepBriefing} disabled={deepLoading || loading}
              className="p-1 rounded hover:bg-samurai-grey-dark transition-colors" title="Deep AI analysis via Ollama">
              <Sparkles className={`w-3 h-3 text-samurai-red ${deepLoading ? 'animate-pulse' : ''}`} />
            </button>
          )}
          <button onClick={refreshBriefing} disabled={loading}
            className="p-1 rounded hover:bg-samurai-grey-dark transition-colors" title="Refresh briefing">
            <RefreshCw className={`w-3 h-3 text-samurai-steel ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-xs text-samurai-steel animate-pulse font-mono">Scanning all markets...</div>
          </div>
        ) : (
          items.map((item, i) => (
            <div key={i} className={`bg-samurai-black rounded-md p-2.5 border-l-2 ${getTypeBorder(item.type)} border border-samurai-grey-dark/30`}>
              <div className="flex items-center gap-1.5 mb-1">
                {getTypeIcon(item.type)}
                <span className="text-[11px] font-bold text-white">{item.title}</span>
                <span className="text-[9px] text-samurai-steel font-mono ml-auto">{item.timestamp}</span>
              </div>
              <p className="text-[10px] text-samurai-steel-light leading-relaxed">{item.body}</p>
            </div>
          ))
        )}
      </div>

      <div className="text-[8px] text-samurai-steel/50 text-center font-mono">
        AI-generated analysis from live data. Not financial advice.
      </div>
    </div>
  )
}
