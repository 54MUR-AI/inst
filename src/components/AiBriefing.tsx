import { useState, useEffect } from 'react'
import { Brain, RefreshCw, AlertTriangle } from 'lucide-react'

interface BriefingItem {
  type: 'trend' | 'alert' | 'insight'
  title: string
  body: string
  timestamp: string
}

export default function AiBriefing() {
  const [items, setItems] = useState<BriefingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [ollamaAvailable, setOllamaAvailable] = useState(false)

  useEffect(() => {
    // Check if Ollama is available via RMG bridge
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OLLAMA_AVAILABLE') {
        setOllamaAvailable(true)
      }
      if (event.data?.type === 'OLLAMA_BRIEFING_RESPONSE') {
        try {
          const parsed = JSON.parse(event.data.content)
          if (Array.isArray(parsed)) {
            setItems(parsed)
          }
        } catch {
          // If not JSON, treat as single insight
          setItems([{
            type: 'insight',
            title: 'AI Analysis',
            body: event.data.content,
            timestamp: new Date().toLocaleTimeString(),
          }])
        }
        setLoading(false)
      }
    }
    window.addEventListener('message', handleMessage)

    // Generate placeholder briefing from market data
    generateLocalBriefing()

    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const generateLocalBriefing = async () => {
    setLoading(true)
    // Generate briefing from publicly available data
    try {
      const [fngRes, globalRes] = await Promise.allSettled([
        fetch('https://api.alternative.me/fng/?limit=1'),
        fetch('https://api.coingecko.com/api/v3/global'),
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

      // Add Ollama prompt hint
      if (!ollamaAvailable) {
        briefings.push({
          type: 'insight',
          title: 'AI Enhancement Available',
          body: 'Connect Ollama via the RMG extension for deeper AI-powered analysis including trend detection, anomaly alerts, and cross-market synthesis.',
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
            {ollamaAvailable ? 'OLLAMA CONNECTED' : 'LOCAL ANALYSIS'}
          </span>
        </div>
        <button
          onClick={generateLocalBriefing}
          disabled={loading}
          className="p-1 rounded hover:bg-samurai-grey-dark transition-colors"
          title="Refresh briefing"
        >
          <RefreshCw className={`w-3 h-3 text-samurai-steel ${loading ? 'animate-spin' : ''}`} />
        </button>
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
