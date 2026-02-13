import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { fetchQuotes, fetchSparklines, INDICES, type YahooQuote } from '../lib/yahooFinance'
import Sparkline from './Sparkline'

export default function GlobalEquities() {
  const [quotes, setQuotes] = useState<Map<string, YahooQuote>>(new Map())
  const [sparks, setSparks] = useState<Map<string, number[]>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const syms = INDICES.map(i => i.symbol)
    const load = async () => {
      const data = await fetchQuotes(syms)
      setQuotes(data)
      setLoading(false)
    }
    load()
    fetchSparklines(syms).then(setSparks)
    const interval = setInterval(load, 60_000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-xs text-samurai-steel animate-pulse font-mono">Loading indices...</div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="text-samurai-steel font-mono border-b border-samurai-grey-dark/30">
            <th className="text-left py-1 px-1">Index</th>
            <th className="text-center py-1 px-1 hidden sm:table-cell">5D</th>
            <th className="text-right py-1 px-1">Price</th>
            <th className="text-right py-1 px-1">Chg%</th>
            <th className="text-right py-1 px-1 hidden sm:table-cell">Status</th>
          </tr>
        </thead>
        <tbody>
          {INDICES.map(idx => {
            const q = quotes.get(idx.symbol)
            if (!q) return null
            const up = q.regularMarketChangePercent >= 0
            return (
              <tr key={idx.symbol} className="border-b border-samurai-grey-dark/10 hover:bg-samurai-grey-dark/20">
                <td className="py-1.5 px-1">
                  <div className="flex items-center gap-1">
                    <span>{idx.flag}</span>
                    <span className="text-white font-medium">{idx.name}</span>
                  </div>
                </td>
                <td className="py-1.5 px-1 hidden sm:table-cell">
                  <Sparkline data={sparks.get(idx.symbol) || []} width={48} height={16} positive={q.regularMarketChangePercent >= 0} />
                </td>
                <td className="text-right py-1.5 px-1 font-mono text-white">
                  {q.regularMarketPrice.toLocaleString(undefined, { minimumFractionDigits: q.regularMarketPrice > 1000 ? 0 : 2, maximumFractionDigits: q.regularMarketPrice > 1000 ? 0 : 2 })}
                </td>
                <td className={`text-right py-1.5 px-1 font-mono font-bold ${up ? 'text-samurai-green' : 'text-samurai-red'}`}>
                  <div className="flex items-center justify-end gap-0.5">
                    {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                    {up ? '+' : ''}{q.regularMarketChangePercent.toFixed(2)}%
                  </div>
                </td>
                <td className="text-right py-1.5 px-1 hidden sm:table-cell">
                  <span className={`text-[8px] font-mono px-1 py-0.5 rounded ${
                    q.marketState === 'REGULAR' ? 'bg-samurai-green/20 text-samurai-green' :
                    q.marketState === 'PRE' || q.marketState === 'POST' ? 'bg-samurai-amber/20 text-samurai-amber' :
                    'bg-samurai-steel/20 text-samurai-steel'
                  }`}>
                    {q.marketState === 'REGULAR' ? 'OPEN' : q.marketState === 'PRE' ? 'PRE' : q.marketState === 'POST' ? 'AFTER' : 'CLOSED'}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
