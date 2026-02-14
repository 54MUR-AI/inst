import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react'
import { fetchQuotes, type YahooQuote } from '../../lib/yahooFinance'
import { SHIPPING_TICKERS } from '../../lib/logisticsApi'

export default function ShippingStocks() {
  const [quotes, setQuotes] = useState<Map<string, YahooQuote>>(new Map())
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const data = await fetchQuotes(SHIPPING_TICKERS.map(t => t.symbol))
    setQuotes(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 300_000) // 5 min
    return () => clearInterval(iv)
  }, [refresh])

  return (
    <div className="h-full flex flex-col text-[10px] font-mono">
      <div className="flex items-center justify-between px-2 py-1 border-b border-samurai-grey-dark/50">
        <span className="text-samurai-steel text-[8px] uppercase tracking-wider">Shipping & Logistics Equities</span>
        <button onClick={refresh} className="p-0.5 hover:bg-samurai-grey-dark rounded">
          <RefreshCw className={`w-3 h-3 text-samurai-steel ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full">
          <thead>
            <tr className="text-[8px] text-samurai-steel uppercase border-b border-samurai-grey-dark/30">
              <th className="text-left px-2 py-1">Ticker</th>
              <th className="text-left px-1 py-1">Sector</th>
              <th className="text-right px-1 py-1">Price</th>
              <th className="text-right px-2 py-1">Chg%</th>
            </tr>
          </thead>
          <tbody>
            {SHIPPING_TICKERS.map(t => {
              const q = quotes.get(t.symbol)
              const pct = q?.regularMarketChangePercent ?? 0
              const color = pct > 0 ? '#22c55e' : pct < 0 ? '#ef4444' : '#6b7280'
              const Icon = pct >= 0 ? TrendingUp : TrendingDown
              return (
                <tr key={t.symbol} className="border-b border-samurai-grey-dark/20 hover:bg-samurai-grey-dark/10">
                  <td className="px-2 py-1">
                    <span className="text-white font-bold">{t.symbol}</span>
                    <span className="text-samurai-steel ml-1 text-[8px]">{t.name}</span>
                  </td>
                  <td className="px-1 py-1 text-samurai-steel text-[8px]">{t.sector}</td>
                  <td className="text-right px-1 py-1 text-white">
                    {q ? `$${q.regularMarketPrice.toFixed(2)}` : '—'}
                  </td>
                  <td className="text-right px-2 py-1">
                    {q ? (
                      <span className="flex items-center justify-end gap-0.5" style={{ color }}>
                        <Icon className="w-2.5 h-2.5" />
                        {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
