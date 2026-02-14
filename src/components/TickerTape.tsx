import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { getSharedMarkets } from '../lib/api'

interface TickerItem {
  symbol: string
  price: string
  change: number
  changePercent: number
}

export default function TickerTape() {
  const [tickers, setTickers] = useState<TickerItem[]>([])

  useEffect(() => {
    // Fetch top crypto tickers from CoinGecko
    const fetchTickers = async () => {
      try {
        const data = await getSharedMarkets()
        if (!data.length) throw new Error('No data')
        const items: TickerItem[] = data.slice(0, 20).map((coin: { symbol: string; current_price: number; price_change_24h: number; price_change_percentage_24h: number }) => ({
          symbol: coin.symbol.toUpperCase(),
          price: coin.current_price >= 1
            ? coin.current_price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
            : '$' + coin.current_price.toPrecision(4),
          change: coin.price_change_24h,
          changePercent: coin.price_change_percentage_24h,
        }))
        setTickers(items)
      } catch {
        // No fallback — tape hides itself when empty
      }
    }

    fetchTickers()
    const interval = setInterval(fetchTickers, 60000) // Refresh every 60s
    return () => clearInterval(interval)
  }, [])

  if (tickers.length === 0) return null

  // Duplicate for seamless loop
  const doubled = [...tickers, ...tickers]

  return (
    <div className="flex-shrink-0 h-7 bg-samurai-black border-b border-samurai-grey-dark/50 ticker-container">
      <div className="inline-flex items-center h-full animate-ticker gap-6 px-4">
        {doubled.map((t, i) => (
          <div key={`${t.symbol}-${i}`} className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-[10px] font-bold text-samurai-steel-light font-mono">{t.symbol}</span>
            <span className="text-[10px] font-mono text-white">{t.price}</span>
            <span className={`flex items-center gap-0.5 text-[10px] font-mono ${t.changePercent >= 0 ? 'text-samurai-green' : 'text-samurai-red'}`}>
              {t.changePercent >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
              {t.changePercent >= 0 ? '+' : ''}{t.changePercent.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
