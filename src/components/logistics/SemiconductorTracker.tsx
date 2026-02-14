import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, TrendingDown, Cpu, RefreshCw } from 'lucide-react'
import { fetchQuotes, type YahooQuote } from '../../lib/yahooFinance'
import { SEMICONDUCTOR_TICKERS } from '../../lib/logisticsApi'

export default function SemiconductorTracker() {
  const [quotes, setQuotes] = useState<Map<string, YahooQuote>>(new Map())
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const data = await fetchQuotes(SEMICONDUCTOR_TICKERS.map(t => t.symbol))
    setQuotes(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 300_000)
    return () => clearInterval(iv)
  }, [refresh])

  // Sector average change
  const changes = SEMICONDUCTOR_TICKERS.map(t => quotes.get(t.symbol)?.regularMarketChangePercent ?? 0)
  const avgChange = changes.length > 0 ? changes.reduce((a, b) => a + b, 0) / changes.length : 0
  const sectorColor = avgChange > 0 ? '#22c55e' : avgChange < 0 ? '#ef4444' : '#6b7280'

  return (
    <div className="h-full flex flex-col text-[10px] font-mono">
      <div className="flex items-center justify-between px-2 py-1 border-b border-samurai-grey-dark/50">
        <div className="flex items-center gap-2">
          <Cpu className="w-3 h-3 text-purple-500" />
          <span className="text-samurai-steel text-[8px] uppercase tracking-wider">Semiconductor Supply Chain</span>
          <span className="text-[9px] font-bold" style={{ color: sectorColor }}>
            {avgChange >= 0 ? '+' : ''}{avgChange.toFixed(2)}% avg
          </span>
        </div>
        <button onClick={refresh} className="p-0.5 hover:bg-samurai-grey-dark rounded">
          <RefreshCw className={`w-3 h-3 text-samurai-steel ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {SEMICONDUCTOR_TICKERS.map(t => {
          const q = quotes.get(t.symbol)
          const pct = q?.regularMarketChangePercent ?? 0
          const color = pct > 0 ? '#22c55e' : pct < 0 ? '#ef4444' : '#6b7280'
          const Icon = pct >= 0 ? TrendingUp : TrendingDown

          return (
            <div key={t.symbol} className="flex items-center px-2 py-1.5 border-b border-samurai-grey-dark/20 hover:bg-samurai-grey-dark/10">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-white font-bold">{t.symbol}</span>
                  <span className="text-samurai-steel text-[8px]">{t.name}</span>
                </div>
                <span className="text-[8px] text-purple-400">{t.region}</span>
              </div>
              <div className="text-right">
                <div className="text-white">{q ? `$${q.regularMarketPrice.toFixed(2)}` : '—'}</div>
                {q && (
                  <div className="flex items-center justify-end gap-0.5" style={{ color }}>
                    <Icon className="w-2.5 h-2.5" />
                    <span>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
