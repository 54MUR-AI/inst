import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { fetchQuotes, fetchSparklines, METALS, ENERGY, calcGSR, type YahooQuote } from '../lib/yahooFinance'
import Sparkline from './Sparkline'

export default function CommoditiesMetals() {
  const [quotes, setQuotes] = useState<Map<string, YahooQuote>>(new Map())
  const [sparks, setSparks] = useState<Map<string, number[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'metals' | 'energy'>('metals')

  useEffect(() => {
    const symbols = [...METALS, ...ENERGY].map(m => m.symbol)
    const load = async () => {
      const data = await fetchQuotes(symbols)
      setQuotes(data)
      setLoading(false)
    }
    load()
    fetchSparklines(symbols).then(setSparks)
    const interval = setInterval(load, 60_000)
    return () => clearInterval(interval)
  }, [])

  const gsr = calcGSR(quotes)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-xs text-samurai-steel animate-pulse font-mono">Loading commodities...</div>
      </div>
    )
  }

  const items = tab === 'metals' ? METALS : ENERGY

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Tab bar + GSR */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(['metals', 'energy'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-[9px] font-mono px-2 py-0.5 rounded transition-colors ${
                tab === t ? 'bg-samurai-red text-white' : 'text-samurai-steel hover:text-white'
              }`}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
        {gsr !== null && (
          <div className="text-[9px] font-mono text-samurai-steel">
            GSR: <span className="text-samurai-amber font-bold">{gsr.toFixed(1)}</span>
          </div>
        )}
      </div>

      {/* Commodity cards */}
      <div className="flex-1 overflow-y-auto space-y-1.5">
        {items.map(item => {
          const q = quotes.get(item.symbol)
          if (!q) return null
          const up = q.regularMarketChangePercent >= 0
          return (
            <div key={item.symbol} className="bg-samurai-black rounded-md p-2 border border-samurai-grey-dark/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div>
                    <div className="text-[11px] font-bold text-white">{item.name}</div>
                    <div className="text-[9px] text-samurai-steel font-mono">{item.symbol.replace('=F', '')} COMEX</div>
                  </div>
                  <Sparkline data={sparks.get(item.symbol) || []} width={52} height={20} positive={q.regularMarketChangePercent >= 0} />
                </div>
                <div className="text-right">
                  <div className="text-[12px] font-mono font-bold text-white">
                    ${q.regularMarketPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="text-[8px] text-samurai-steel">{item.unit}</span>
                  </div>
                  <div className={`text-[10px] font-mono flex items-center justify-end gap-0.5 ${up ? 'text-samurai-green' : 'text-samurai-red'}`}>
                    {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                    {up ? '+' : ''}{q.regularMarketChange.toFixed(2)} ({up ? '+' : ''}{q.regularMarketChangePercent.toFixed(2)}%)
                  </div>
                </div>
              </div>
              {/* Day range bar */}
              <div className="mt-1.5">
                <div className="flex justify-between text-[8px] text-samurai-steel font-mono">
                  <span>L: ${q.regularMarketDayLow.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  <span>H: ${q.regularMarketDayHigh.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="w-full h-1 bg-samurai-grey-dark rounded-full mt-0.5 relative">
                  {q.regularMarketDayHigh > q.regularMarketDayLow && (
                    <div
                      className="absolute h-1 w-1.5 bg-samurai-red rounded-full top-0"
                      style={{
                        left: `${((q.regularMarketPrice - q.regularMarketDayLow) / (q.regularMarketDayHigh - q.regularMarketDayLow)) * 100}%`,
                        transform: 'translateX(-50%)',
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
