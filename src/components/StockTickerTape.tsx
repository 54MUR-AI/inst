import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { fetchQuotes, INDICES, METALS, ENERGY, FOREX } from '../lib/yahooFinance'
import type { YahooQuote } from '../lib/yahooFinance'

interface TickerItem {
  symbol: string
  label: string
  price: string
  changePercent: number
  category: 'index' | 'metal' | 'energy' | 'forex'
}

interface TickerDef {
  symbol: string
  label: string
  category: 'index' | 'metal' | 'energy' | 'forex'
}

const TICKER_DEFS: TickerDef[] = [
  ...INDICES.map(i => ({ symbol: i.symbol, label: i.name, category: 'index' as const })),
  ...METALS.slice(0, 3).map(m => ({ symbol: m.symbol, label: m.name, category: 'metal' as const })),
  ...ENERGY.slice(0, 2).map(e => ({ symbol: e.symbol, label: e.name, category: 'energy' as const })),
  ...FOREX.slice(0, 4).map(f => ({ symbol: f.symbol, label: f.name, category: 'forex' as const })),
]

function formatPrice(q: YahooQuote, category: string): string {
  if (category === 'forex' && !q.symbol.includes('DX-Y')) {
    return q.regularMarketPrice.toFixed(4)
  }
  if (q.regularMarketPrice >= 1000) {
    return q.regularMarketPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })
  }
  return q.regularMarketPrice.toFixed(2)
}

function getCategoryColor(category: string): string {
  switch (category) {
    case 'index': return 'text-samurai-steel-light'
    case 'metal': return 'text-yellow-400/80'
    case 'energy': return 'text-orange-400/80'
    case 'forex': return 'text-cyan-400/80'
    default: return 'text-samurai-steel-light'
  }
}

export default function StockTickerTape() {
  const [tickers, setTickers] = useState<TickerItem[]>([])

  useEffect(() => {
    const fetchTickers = async () => {
      try {
        const allSymbols = TICKER_DEFS.map(t => t.symbol)
        const quotes = await fetchQuotes(allSymbols)

        const items: TickerItem[] = TICKER_DEFS.map(t => {
          const q = quotes.get(t.symbol)
          if (!q) return null
          return {
            symbol: t.symbol,
            label: t.label,
            price: formatPrice(q, t.category),
            changePercent: q.regularMarketChangePercent,
            category: t.category,
          }
        }).filter(Boolean) as TickerItem[]

        if (items.length > 0) setTickers(items)
      } catch {
        // Keep existing data on error
      }
    }

    fetchTickers()
    const interval = setInterval(fetchTickers, 90000) // 90s refresh (matches Yahoo cache TTL)
    return () => clearInterval(interval)
  }, [])

  if (tickers.length === 0) return null

  const doubled = [...tickers, ...tickers]

  return (
    <div className="flex-shrink-0 h-7 bg-samurai-black-lighter border-b border-samurai-grey-dark/50 ticker-container">
      <div className="inline-flex items-center h-full animate-ticker-slow gap-6 px-4">
        {doubled.map((t, i) => (
          <div key={`${t.symbol}-${i}`} className="flex items-center gap-1.5 whitespace-nowrap">
            <span className={`text-[10px] font-bold font-mono ${getCategoryColor(t.category)}`}>{t.label}</span>
            <span className="text-[10px] font-mono text-white">{t.price}</span>
            <span className={`flex items-center gap-0.5 text-[10px] font-mono ${t.changePercent >= 0 ? 'text-samurai-green' : 'text-samurai-red'}`}>
              {t.changePercent >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
              {t.changePercent >= 0 ? '+' : ''}{t.changePercent.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
