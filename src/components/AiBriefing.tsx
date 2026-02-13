import { useState, useEffect } from 'react'
import { Brain, RefreshCw, AlertTriangle, Sparkles } from 'lucide-react'
import { API, fetchCoinGecko } from '../lib/api'
import ollamaProxy from '../lib/ollamaProxy'

interface BriefingItem {
  type: 'trend' | 'alert' | 'insight'
  title: string
  body: string
  timestamp: string
}

interface AiBriefingProps {
  selectedModel?: string
}

export default function AiBriefing({ selectedModel }: AiBriefingProps) {
  const [items, setItems] = useState<BriefingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [ollamaAvailable, setOllamaAvailable] = useState(ollamaProxy.isAvailable)
  const [deepLoading, setDeepLoading] = useState(false)

  useEffect(() => {
    // Listen for bridge status changes
    const unsub = ollamaProxy.onStatusChange(() => {
      setOllamaAvailable(ollamaProxy.isAvailable)
    })

    // Request models from bridge on mount
    ollamaProxy.requestModels()

    // Generate local briefing from market data
    generateLocalBriefing()

    return unsub
  }, [])

  const generateLocalBriefing = async () => {
    setLoading(true)
    // Generate briefing from publicly available data
    try {
      const [fngRes, globalRes] = await Promise.allSettled([
        fetch(API.fng('/fng/?limit=1')),
        fetchCoinGecko('/api/v3/global'),
      ])

      const briefings: BriefingItem[] = []
      const now = new Date().toLocaleTimeString()

      // Fear & Greed analysis
      if (fngRes.status === 'fulfilled' && fngRes.value.ok) {
        const fng = await fngRes.value.json()
        const val = parseInt(fng.data[0].value)
        const cls = fng.data[0].value_classification
        briefings.push({
          type: val <= 30 ? 'alert' : val >= 70 ? 'trend' : 'insight',
          title: `Market Sentiment: ${cls}`,
          body: val <= 25
            ? `Fear & Greed Index at ${val} — Extreme Fear. Historically, extreme fear has preceded strong buying opportunities. Contrarian signal active.`
            : val <= 45
            ? `Fear & Greed Index at ${val} — Fear zone. Market participants are cautious. Watch for accumulation patterns in large-cap assets.`
            : val <= 55
            ? `Fear & Greed Index at ${val} — Neutral territory. Market is balanced between buyers and sellers. No strong directional bias.`
            : val <= 75
            ? `Fear & Greed Index at ${val} — Greed zone. Momentum is bullish but watch for overextension. Consider tightening risk management.`
            : `Fear & Greed Index at ${val} — Extreme Greed. Markets may be overheated. Historical data suggests increased probability of correction.`,
          timestamp: now,
        })
      }

      // Global market analysis
      if (globalRes.status === 'fulfilled' && globalRes.value.ok) {
        const global = await globalRes.value.json()
        const d = global.data
        const mcapChange = d.market_cap_change_percentage_24h_usd
        const btcDom = d.market_cap_percentage.btc

        briefings.push({
          type: mcapChange >= 3 ? 'trend' : mcapChange <= -3 ? 'alert' : 'insight',
          title: 'Global Crypto Market',
          body: `Total market cap ${mcapChange >= 0 ? 'up' : 'down'} ${Math.abs(mcapChange).toFixed(1)}% in 24h. BTC dominance at ${btcDom.toFixed(1)}%. ${
            btcDom > 60 ? 'High BTC dominance suggests capital concentration — altcoin season unlikely near-term.' :
            btcDom < 45 ? 'Low BTC dominance — capital rotating into altcoins. Alt season indicators elevated.' :
            'BTC dominance in normal range. Mixed market conditions.'
          }`,
          timestamp: now,
        })

        briefings.push({
          type: 'insight',
          title: 'Market Structure',
          body: `${d.active_cryptocurrencies.toLocaleString()} active cryptocurrencies across ${d.markets.toLocaleString()} markets. 24h trading volume: $${(d.total_volume.usd / 1e9).toFixed(1)}B.`,
          timestamp: now,
        })
      }

      setItems(briefings.length > 0 ? briefings : [{
        type: 'insight',
        title: 'Initializing...',
        body: 'Gathering market intelligence. Briefing will update shortly.',
        timestamp: now,
      }])
    } catch {
      setItems([{
        type: 'insight',
        title: 'Briefing Unavailable',
        body: 'Unable to fetch market data for analysis. Will retry automatically.',
        timestamp: new Date().toLocaleTimeString(),
      }])
    }
    setLoading(false)
  }

  const generateDeepBriefing = async () => {
    if (!ollamaProxy.isAvailable) return
    setDeepLoading(true)

    // Build context from current local briefing items
    const context = items.map(i => `[${i.type.toUpperCase()}] ${i.title}: ${i.body}`).join('\n')
    const model = selectedModel || ollamaProxy.availableModels[0] || 'llama3:latest'

    try {
      const result = await ollamaProxy.chat(model, [
        {
          role: 'system',
          content: 'You are a concise financial analyst. Given market data, provide 2-3 short actionable insights. Each insight should be 1-2 sentences. Format as bullet points starting with a category tag like [TREND], [ALERT], or [INSIGHT]. Do not use markdown. Be direct and specific.',
        },
        {
          role: 'user',
          content: `Analyze this market data and provide deeper insights:\n\n${context}`,
        },
      ])

      const response = (result as { message?: { content?: string } })?.message?.content || ''
      if (!response) throw new Error('Empty response')

      const now = new Date().toLocaleTimeString()
      const aiItems: BriefingItem[] = response
        .split('\n')
        .filter((l: string) => l.trim().length > 10)
        .slice(0, 4)
        .map((line: string) => {
          const type: BriefingItem['type'] = line.includes('[ALERT]') ? 'alert' : line.includes('[TREND]') ? 'trend' : 'insight'
          const body = line.replace(/^\s*[-•*]\s*/, '').replace(/\[(TREND|ALERT|INSIGHT)\]\s*/i, '').trim()
          return {
            type,
            title: type === 'alert' ? 'AI Alert' : type === 'trend' ? 'AI Trend' : 'AI Insight',
            body,
            timestamp: now,
          }
        })

      if (aiItems.length > 0) {
        setItems(prev => [...aiItems, ...prev])
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setItems(prev => [{
        type: 'alert',
        title: 'Ollama Error',
        body: `Deep analysis failed: ${msg}. Check that Ollama is running locally.`,
        timestamp: new Date().toLocaleTimeString(),
      }, ...prev])
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
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-samurai-steel font-mono">
            {ollamaAvailable
              ? `OLLAMA · ${selectedModel || ollamaProxy.availableModels[0] || 'no model'}`
              : 'LOCAL ANALYSIS'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {ollamaAvailable && (
            <button
              onClick={generateDeepBriefing}
              disabled={deepLoading || loading}
              className="p-1 rounded hover:bg-samurai-grey-dark transition-colors"
              title="Deep AI analysis via Ollama"
            >
              <Sparkles className={`w-3 h-3 text-samurai-red ${deepLoading ? 'animate-pulse' : ''}`} />
            </button>
          )}
          <button
            onClick={generateLocalBriefing}
            disabled={loading}
            className="p-1 rounded hover:bg-samurai-grey-dark transition-colors"
            title="Refresh briefing"
          >
            <RefreshCw className={`w-3 h-3 text-samurai-steel ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Briefing items */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-xs text-samurai-steel animate-pulse font-mono">Analyzing markets...</div>
          </div>
        ) : (
          items.map((item, i) => (
            <div
              key={i}
              className={`bg-samurai-black rounded-md p-2.5 border-l-2 ${getTypeBorder(item.type)} border border-samurai-grey-dark/30`}
            >
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

      {/* Disclaimer */}
      <div className="text-[8px] text-samurai-steel/50 text-center font-mono">
        AI-generated analysis. Not financial advice.
      </div>
    </div>
  )
}
