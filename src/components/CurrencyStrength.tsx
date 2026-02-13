import { useState, useEffect, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { fetchQuotes } from '../lib/yahooFinance'

// Forex pairs used to calculate relative currency strength
const PAIRS = [
  { symbol: 'EURUSD=X', base: 'EUR', quote: 'USD' },
  { symbol: 'GBPUSD=X', base: 'GBP', quote: 'USD' },
  { symbol: 'USDJPY=X', base: 'USD', quote: 'JPY' },
  { symbol: 'USDCHF=X', base: 'USD', quote: 'CHF' },
  { symbol: 'AUDUSD=X', base: 'AUD', quote: 'USD' },
  { symbol: 'USDCAD=X', base: 'USD', quote: 'CAD' },
  { symbol: 'NZDUSD=X', base: 'NZD', quote: 'USD' },
]

const CURRENCIES = [
  { code: 'USD', flag: '🇺🇸', name: 'US Dollar' },
  { code: 'EUR', flag: '🇪🇺', name: 'Euro' },
  { code: 'GBP', flag: '🇬🇧', name: 'British Pound' },
  { code: 'JPY', flag: '🇯🇵', name: 'Japanese Yen' },
  { code: 'CHF', flag: '🇨🇭', name: 'Swiss Franc' },
  { code: 'AUD', flag: '🇦🇺', name: 'Australian Dollar' },
  { code: 'CAD', flag: '🇨🇦', name: 'Canadian Dollar' },
  { code: 'NZD', flag: '🇳🇿', name: 'New Zealand Dollar' },
]

const REFRESH_INTERVAL = 90_000

interface CurrencyScore {
  code: string
  flag: string
  name: string
  score: number // aggregate % change
}

export default function CurrencyStrength() {
  const [scores, setScores] = useState<CurrencyScore[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const data = await fetchQuotes(PAIRS.map(p => p.symbol))

      // Calculate strength: for each currency, sum up its % changes
      // If currency is base: positive pair change = currency strong
      // If currency is quote: positive pair change = currency weak
      const strength: Record<string, number[]> = {}
      CURRENCIES.forEach(c => { strength[c.code] = [] })

      for (const pair of PAIRS) {
        const q = data.get(pair.symbol)
        if (!q) continue
        const pct = q.regularMarketChangePercent

        if (strength[pair.base]) strength[pair.base].push(pct)
        if (strength[pair.quote]) strength[pair.quote].push(-pct)
      }

      const result: CurrencyScore[] = CURRENCIES.map(c => ({
        code: c.code,
        flag: c.flag,
        name: c.name,
        score: strength[c.code].length > 0
          ? strength[c.code].reduce((a, b) => a + b, 0) / strength[c.code].length
          : 0,
      })).sort((a, b) => b.score - a.score)

      setScores(result)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    const iv = setInterval(fetchData, REFRESH_INTERVAL)
    return () => clearInterval(iv)
  }, [fetchData])

  const maxAbs = Math.max(...scores.map(s => Math.abs(s.score)), 0.01)

  return (
    <div className="h-full flex flex-col gap-1.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-samurai-steel font-mono">
          MAJOR CURRENCIES · RELATIVE STRENGTH
        </span>
        <button onClick={() => { setLoading(true); fetchData() }} disabled={loading}
          className="p-1 rounded hover:bg-samurai-grey-dark transition-colors">
          <RefreshCw className={`w-3 h-3 text-samurai-steel ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Strength bars */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {loading && scores.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[10px] text-samurai-steel animate-pulse font-mono">Loading forex data...</span>
          </div>
        ) : (
          scores.map((curr, idx) => {
            const isPositive = curr.score >= 0
            const barWidth = Math.min((Math.abs(curr.score) / maxAbs) * 100, 100)

            return (
              <div key={curr.code} className="flex items-center gap-2">
                {/* Rank */}
                <span className="text-[8px] font-mono text-samurai-steel/50 w-3 text-right">{idx + 1}</span>

                {/* Flag + code */}
                <div className="flex items-center gap-1 w-16 flex-shrink-0">
                  <span className="text-[11px]">{curr.flag}</span>
                  <span className="text-[10px] font-bold text-white font-mono">{curr.code}</span>
                </div>

                {/* Bar */}
                <div className="flex-1 h-4 relative">
                  {/* Center line */}
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-samurai-grey-dark/60" />

                  {/* Bar from center */}
                  {isPositive ? (
                    <div
                      className="absolute top-0.5 bottom-0.5 rounded-r"
                      style={{
                        left: '50%',
                        width: `${barWidth / 2}%`,
                        background: 'linear-gradient(90deg, rgba(16,185,129,0.4), rgba(16,185,129,0.7))',
                      }}
                    />
                  ) : (
                    <div
                      className="absolute top-0.5 bottom-0.5 rounded-l"
                      style={{
                        right: '50%',
                        width: `${barWidth / 2}%`,
                        background: 'linear-gradient(270deg, rgba(239,68,68,0.4), rgba(239,68,68,0.7))',
                      }}
                    />
                  )}
                </div>

                {/* Score */}
                <span className={`text-[9px] font-mono font-bold w-12 text-right ${
                  isPositive ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {isPositive ? '+' : ''}{curr.score.toFixed(3)}%
                </span>
              </div>
            )
          })
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between text-[7px] text-samurai-steel/40 font-mono">
        <span>← Weakening</span>
        <span>Based on 7 major forex pairs</span>
        <span>Strengthening →</span>
      </div>
    </div>
  )
}
