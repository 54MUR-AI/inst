import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { fetchQuotes, FOREX, BONDS, type YahooQuote } from '../lib/yahooFinance'

export default function ForexBonds() {
  const [quotes, setQuotes] = useState<Map<string, YahooQuote>>(new Map())
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'forex' | 'bonds'>('forex')

  useEffect(() => {
    const load = async () => {
      const symbols = [...FOREX, ...BONDS].map(f => f.symbol)
      const data = await fetchQuotes(symbols)
      setQuotes(data)
      setLoading(false)
    }
    load()
    const interval = setInterval(load, 60_000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-xs text-samurai-steel animate-pulse font-mono">Loading forex & bonds...</div>
      </div>
    )
  }

  // Yield curve spread (10Y - 2Y proxy: 10Y - 3M since we have ^IRX for 3M)
  const y10 = quotes.get('^TNX')
  const y3m = quotes.get('^IRX')
  const spread = y10 && y3m ? (y10.regularMarketPrice - y3m.regularMarketPrice).toFixed(2) : null
  const inverted = spread !== null && parseFloat(spread) < 0

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Tab bar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(['forex', 'bonds'] as const).map(t => (
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
        {tab === 'bonds' && spread !== null && (
          <div className="text-[9px] font-mono text-samurai-steel">
            10Y-3M: <span className={`font-bold ${inverted ? 'text-samurai-red' : 'text-samurai-green'}`}>
              {spread}bp {inverted ? '(INVERTED)' : ''}
            </span>
          </div>
        )}
      </div>

      {tab === 'forex' ? (
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-samurai-steel font-mono border-b border-samurai-grey-dark/30">
                <th className="text-left py-1 px-1">Pair</th>
                <th className="text-right py-1 px-1">Rate</th>
                <th className="text-right py-1 px-1">Chg%</th>
              </tr>
            </thead>
            <tbody>
              {FOREX.map(fx => {
                const q = quotes.get(fx.symbol)
                if (!q) return null
                const up = q.regularMarketChangePercent >= 0
                return (
                  <tr key={fx.symbol} className="border-b border-samurai-grey-dark/10 hover:bg-samurai-grey-dark/20">
                    <td className="py-1.5 px-1">
                      <div className="flex items-center gap-1">
                        <span>{fx.flag}</span>
                        <span className="text-white font-medium">{fx.name}</span>
                      </div>
                    </td>
                    <td className="text-right py-1.5 px-1 font-mono text-white">
                      {q.regularMarketPrice.toFixed(q.regularMarketPrice > 100 ? 2 : 4)}
                    </td>
                    <td className={`text-right py-1.5 px-1 font-mono font-bold ${up ? 'text-samurai-green' : 'text-samurai-red'}`}>
                      <div className="flex items-center justify-end gap-0.5">
                        {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                        {up ? '+' : ''}{q.regularMarketChangePercent.toFixed(2)}%
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2">
          {/* Yield curve visual */}
          <div className="bg-samurai-black rounded-md p-2 border border-samurai-grey-dark/30">
            <div className="text-[9px] text-samurai-steel font-mono mb-2">US TREASURY YIELD CURVE</div>
            <div className="flex items-end justify-between h-16 px-2">
              {BONDS.map(bond => {
                const q = quotes.get(bond.symbol)
                if (!q) return null
                const yld = q.regularMarketPrice
                const barH = Math.max(8, (yld / 6) * 100) // scale: 6% = full height
                return (
                  <div key={bond.symbol} className="flex flex-col items-center gap-1">
                    <div
                      className={`w-6 rounded-t transition-all ${yld > 0 ? 'bg-samurai-red' : 'bg-samurai-steel'}`}
                      style={{ height: `${Math.min(barH, 100)}%` }}
                    />
                    <div className="text-[9px] font-mono text-white font-bold">{yld.toFixed(2)}%</div>
                    <div className="text-[8px] font-mono text-samurai-steel">{bond.tenor}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Bond detail rows */}
          {BONDS.map(bond => {
            const q = quotes.get(bond.symbol)
            if (!q) return null
            const up = q.regularMarketChangePercent >= 0
            return (
              <div key={bond.symbol} className="bg-samurai-black rounded-md p-2 border border-samurai-grey-dark/30 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold text-white">US {bond.name} Treasury</div>
                  <div className="text-[9px] text-samurai-steel font-mono">{bond.tenor} Yield</div>
                </div>
                <div className="text-right">
                  <div className="text-[12px] font-mono font-bold text-white">{q.regularMarketPrice.toFixed(2)}%</div>
                  <div className={`text-[10px] font-mono flex items-center justify-end gap-0.5 ${up ? 'text-samurai-red' : 'text-samurai-green'}`}>
                    {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                    {up ? '+' : ''}{q.regularMarketChange.toFixed(2)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
