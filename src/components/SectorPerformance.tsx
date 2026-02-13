import { useState, useEffect, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { fetchQuotes } from '../lib/yahooFinance'
import type { YahooQuote } from '../lib/yahooFinance'

// SPDR Sector ETFs — the standard way to track S&P 500 sector performance
const SECTORS = [
  { symbol: 'XLK', name: 'Technology', color: '#3b82f6' },
  { symbol: 'XLF', name: 'Financials', color: '#10b981' },
  { symbol: 'XLV', name: 'Healthcare', color: '#ef4444' },
  { symbol: 'XLC', name: 'Communication', color: '#8b5cf6' },
  { symbol: 'XLY', name: 'Consumer Disc.', color: '#f59e0b' },
  { symbol: 'XLP', name: 'Consumer Staples', color: '#06b6d4' },
  { symbol: 'XLE', name: 'Energy', color: '#f97316' },
  { symbol: 'XLI', name: 'Industrials', color: '#6366f1' },
  { symbol: 'XLU', name: 'Utilities', color: '#84cc16' },
  { symbol: 'XLRE', name: 'Real Estate', color: '#ec4899' },
  { symbol: 'XLB', name: 'Materials', color: '#14b8a6' },
]

const REFRESH_INTERVAL = 90_000

export default function SectorPerformance() {
  const [quotes, setQuotes] = useState<Map<string, YahooQuote>>(new Map())
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<'perf' | 'alpha'>('perf')

  const fetchData = useCallback(async () => {
    try {
      const data = await fetchQuotes(SECTORS.map(s => s.symbol))
      setQuotes(new Map(data))
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    const iv = setInterval(fetchData, REFRESH_INTERVAL)
    return () => clearInterval(iv)
  }, [fetchData])

  // Build sorted sector data
  const sectorData = SECTORS.map(s => {
    const q = quotes.get(s.symbol)
    return {
      ...s,
      price: q?.regularMarketPrice ?? 0,
      change: q?.regularMarketChangePercent ?? 0,
      volume: q?.regularMarketVolume ?? 0,
    }
  }).sort((a, b) => {
    if (sortBy === 'perf') return b.change - a.change
    return a.name.localeCompare(b.name)
  })

  const maxAbsChange = Math.max(...sectorData.map(s => Math.abs(s.change)), 0.01)

  // Market breadth
  const up = sectorData.filter(s => s.change > 0).length
  const down = sectorData.filter(s => s.change < 0).length
  const avgChange = sectorData.reduce((sum, s) => sum + s.change, 0) / (sectorData.length || 1)

  return (
    <div className="h-full flex flex-col gap-1.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-samurai-steel font-mono">
            S&P 500 SECTORS · {up}↑ {down}↓
          </span>
          <span className={`text-[9px] font-mono font-bold ${avgChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            avg {avgChange >= 0 ? '+' : ''}{avgChange.toFixed(2)}%
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSortBy(sortBy === 'perf' ? 'alpha' : 'perf')}
            className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-samurai-grey-dark/30 text-samurai-steel hover:text-white transition-colors"
          >
            {sortBy === 'perf' ? 'By %' : 'A-Z'}
          </button>
          <button onClick={() => { setLoading(true); fetchData() }} disabled={loading}
            className="p-1 rounded hover:bg-samurai-grey-dark transition-colors">
            <RefreshCw className={`w-3 h-3 text-samurai-steel ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Heatmap grid */}
      <div className="flex-1 overflow-y-auto">
        {loading && quotes.size === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[10px] text-samurai-steel animate-pulse font-mono">Loading sectors...</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1">
            {sectorData.map(sector => {
              const isUp = sector.change >= 0
              const intensity = Math.min(Math.abs(sector.change) / maxAbsChange, 1)
              const bgColor = isUp
                ? `rgba(16, 185, 129, ${0.08 + intensity * 0.25})`
                : `rgba(239, 68, 68, ${0.08 + intensity * 0.25})`
              const borderColor = isUp
                ? `rgba(16, 185, 129, ${0.15 + intensity * 0.35})`
                : `rgba(239, 68, 68, ${0.15 + intensity * 0.35})`

              return (
                <div
                  key={sector.symbol}
                  className="rounded-lg px-2.5 py-2 relative overflow-hidden"
                  style={{ background: bgColor, border: `1px solid ${borderColor}` }}
                >
                  {/* Performance bar background */}
                  <div
                    className="absolute inset-y-0 left-0 opacity-20"
                    style={{
                      width: `${intensity * 100}%`,
                      background: isUp
                        ? 'linear-gradient(90deg, rgba(16,185,129,0.3), transparent)'
                        : 'linear-gradient(90deg, rgba(239,68,68,0.3), transparent)',
                    }}
                  />

                  <div className="relative flex items-center justify-between gap-1">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: sector.color }} />
                        <span className="text-[10px] font-bold text-white truncate">{sector.name}</span>
                      </div>
                      <span className="text-[8px] text-samurai-steel font-mono">{sector.symbol}</span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className={`text-[11px] font-mono font-bold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isUp ? '+' : ''}{sector.change.toFixed(2)}%
                      </div>
                      {sector.price > 0 && (
                        <div className="text-[8px] text-samurai-steel font-mono">
                          ${sector.price.toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Breadth bar */}
      {quotes.size > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-[7px] text-samurai-steel font-mono">BREADTH</span>
          <div className="flex-1 h-1.5 bg-samurai-grey-dark rounded-full overflow-hidden flex">
            <div
              className="h-full bg-emerald-500 rounded-l-full"
              style={{ width: `${(up / SECTORS.length) * 100}%` }}
            />
            <div
              className="h-full bg-red-500 rounded-r-full"
              style={{ width: `${(down / SECTORS.length) * 100}%` }}
            />
          </div>
          <span className="text-[7px] text-samurai-steel font-mono">{up}/{SECTORS.length}</span>
        </div>
      )}
    </div>
  )
}
