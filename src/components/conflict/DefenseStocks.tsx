import { useState, useEffect, useCallback } from 'react'
import { Shield, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react'
import { fetchQuotes } from '../../lib/yahooFinance'
import type { YahooQuote } from '../../lib/yahooFinance'
import { DEFENSE_TICKERS } from '../../lib/conflictApi'

export default function DefenseStocks() {
  const [quotes, setQuotes] = useState<Map<string, YahooQuote>>(new Map())
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await fetchQuotes(DEFENSE_TICKERS)
      setQuotes(new Map(data))
    } catch { /* handled */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 60_000)
    return () => clearInterval(iv)
  }, [refresh])

  const sectorAvg = () => {
    const vals = Array.from(quotes.values())
    if (vals.length === 0) return 0
    return vals.reduce((s, q) => s + q.regularMarketChangePercent, 0) / vals.length
  }

  const avg = sectorAvg()

  return (
    <div className="h-full flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-samurai-steel font-mono">DEFENSE SECTOR</span>
          <span className={`text-[9px] font-mono font-bold ${avg >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {avg >= 0 ? '+' : ''}{avg.toFixed(2)}%
          </span>
        </div>
        <button
          onClick={() => { setLoading(true); refresh() }}
          disabled={loading}
          className="p-1 rounded hover:bg-samurai-grey-dark transition-colors"
        >
          <RefreshCw className={`w-3 h-3 text-samurai-steel ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
        {loading && quotes.size === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[10px] text-samurai-steel animate-pulse font-mono">Loading defense stocks...</span>
          </div>
        ) : quotes.size === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Shield className="w-6 h-6 text-samurai-red/20" />
            <p className="text-[10px] text-samurai-steel">No data available</p>
          </div>
        ) : (
          DEFENSE_TICKERS.map(sym => {
            const q = quotes.get(sym)
            if (!q) return null
            const isUp = q.regularMarketChangePercent >= 0
            return (
              <div key={sym} className="bg-samurai-black rounded-md border border-samurai-grey-dark/30 px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isUp
                      ? <TrendingUp className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                      : <TrendingDown className="w-3 h-3 text-red-400 flex-shrink-0" />
                    }
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-white font-mono">{sym}</div>
                      <div className="text-[8px] text-samurai-steel truncate">{q.shortName}</div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[10px] font-mono font-bold text-white">
                      ${q.regularMarketPrice.toFixed(2)}
                    </div>
                    <div className={`text-[8px] font-mono font-bold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isUp ? '+' : ''}{q.regularMarketChangePercent.toFixed(2)}%
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="text-[7px] text-samurai-steel/40 text-center font-mono">
        RTX · LMT · NOC · BA · GD · HII · LHX · LDOS
      </div>
    </div>
  )
}
