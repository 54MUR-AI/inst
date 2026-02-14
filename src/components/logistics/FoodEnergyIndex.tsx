import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, TrendingDown, Wheat, Fuel, RefreshCw } from 'lucide-react'
import { fetchQuotes, type YahooQuote } from '../../lib/yahooFinance'
import { FOOD_COMMODITY_SYMBOLS } from '../../lib/logisticsApi'
import { ENERGY } from '../../lib/yahooFinance'

export default function FoodEnergyIndex() {
  const [quotes, setQuotes] = useState<Map<string, YahooQuote>>(new Map())
  const [loading, setLoading] = useState(true)

  const allSymbols = [...FOOD_COMMODITY_SYMBOLS, ...ENERGY.map(e => ({ symbol: e.symbol, name: e.name, unit: e.unit }))]

  const refresh = useCallback(async () => {
    setLoading(true)
    const data = await fetchQuotes(allSymbols.map(s => s.symbol))
    setQuotes(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 300_000)
    return () => clearInterval(iv)
  }, [refresh])

  return (
    <div className="h-full flex flex-col text-[10px] font-mono">
      <div className="flex items-center justify-between px-2 py-1 border-b border-samurai-grey-dark/50">
        <span className="text-samurai-steel text-[8px] uppercase tracking-wider">Food & Energy Security</span>
        <button onClick={refresh} className="p-0.5 hover:bg-samurai-grey-dark rounded">
          <RefreshCw className={`w-3 h-3 text-samurai-steel ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Food section */}
        <div className="px-2 py-1 bg-samurai-grey-dark/20 flex items-center gap-1">
          <Wheat className="w-3 h-3 text-green-500" />
          <span className="text-[8px] text-green-500 uppercase font-bold tracking-wider">Food Commodities</span>
        </div>
        {FOOD_COMMODITY_SYMBOLS.map(s => {
          const q = quotes.get(s.symbol)
          const pct = q?.regularMarketChangePercent ?? 0
          const color = pct > 0 ? '#22c55e' : pct < 0 ? '#ef4444' : '#6b7280'
          const Icon = pct >= 0 ? TrendingUp : TrendingDown
          return (
            <div key={s.symbol} className="flex items-center px-2 py-1 border-b border-samurai-grey-dark/20 hover:bg-samurai-grey-dark/10">
              <span className="text-white font-bold w-16">{s.name}</span>
              <span className="text-samurai-steel text-[8px] flex-1">{s.unit}</span>
              <span className="text-white mr-2">{q ? `$${q.regularMarketPrice.toFixed(2)}` : '—'}</span>
              {q && (
                <span className="flex items-center gap-0.5 w-16 justify-end" style={{ color }}>
                  <Icon className="w-2.5 h-2.5" />
                  {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                </span>
              )}
            </div>
          )
        })}

        {/* Energy section */}
        <div className="px-2 py-1 bg-samurai-grey-dark/20 flex items-center gap-1 mt-1">
          <Fuel className="w-3 h-3 text-orange-500" />
          <span className="text-[8px] text-orange-500 uppercase font-bold tracking-wider">Energy</span>
        </div>
        {ENERGY.map(s => {
          const q = quotes.get(s.symbol)
          const pct = q?.regularMarketChangePercent ?? 0
          const color = pct > 0 ? '#22c55e' : pct < 0 ? '#ef4444' : '#6b7280'
          const Icon = pct >= 0 ? TrendingUp : TrendingDown
          return (
            <div key={s.symbol} className="flex items-center px-2 py-1 border-b border-samurai-grey-dark/20 hover:bg-samurai-grey-dark/10">
              <span className="text-white font-bold w-16">{s.name}</span>
              <span className="text-samurai-steel text-[8px] flex-1">{s.unit}</span>
              <span className="text-white mr-2">{q ? `$${q.regularMarketPrice.toFixed(2)}` : '—'}</span>
              {q && (
                <span className="flex items-center gap-0.5 w-16 justify-end" style={{ color }}>
                  <Icon className="w-2.5 h-2.5" />
                  {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
