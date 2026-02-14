import { useState, useEffect } from 'react'
import { getSharedMarkets } from '../lib/api'

interface CoinData {
  id: string
  symbol: string
  name: string
  market_cap: number
  current_price: number
  price_change_percentage_24h: number
}

export default function CryptoHeatmap() {
  const [coins, setCoins] = useState<CoinData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchCoins = async () => {
      try {
        const raw = await getSharedMarkets()
        if (!raw.length) throw new Error('No data')
        const data: CoinData[] = raw.map((c: any) => ({
          id: c.id, symbol: c.symbol, name: c.name,
          market_cap: c.market_cap, current_price: c.current_price,
          price_change_percentage_24h: c.price_change_percentage_24h ?? 0,
        }))
        setCoins(data)
      } catch {
        // No fallback — empty state will show
      }
      setLoading(false)
    }

    fetchCoins()
    const interval = setInterval(fetchCoins, 120000) // 2 min
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-xs text-samurai-steel animate-pulse font-mono">Loading market data...</div>
      </div>
    )
  }

  if (coins.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-xs text-samurai-steel font-mono">Unable to load crypto heatmap data</div>
      </div>
    )
  }

  // Calculate treemap layout
  const totalMarketCap = coins.reduce((sum, c) => sum + c.market_cap, 0)

  const getColor = (change: number) => {
    if (change >= 5) return 'rgba(0, 200, 83, 0.8)'
    if (change >= 2) return 'rgba(0, 200, 83, 0.5)'
    if (change >= 0) return 'rgba(0, 200, 83, 0.25)'
    if (change >= -2) return 'rgba(230, 57, 70, 0.25)'
    if (change >= -5) return 'rgba(230, 57, 70, 0.5)'
    return 'rgba(230, 57, 70, 0.8)'
  }

  const getTextColor = (change: number) => {
    if (change >= 0) return '#00C853'
    return '#E63946'
  }

  return (
    <div className="h-full flex flex-wrap gap-1 content-start">
      {coins.map((coin) => {
        const weight = coin.market_cap / totalMarketCap
        // Min 4% width, max 100%
        const widthPercent = Math.max(4, Math.min(100, weight * 100 * 3))
        const isLarge = widthPercent > 15

        return (
          <div
            key={coin.id}
            className="heatmap-cell rounded-md flex flex-col items-center justify-center cursor-pointer border border-transparent hover:border-white/20 transition-all"
            style={{
              width: `calc(${widthPercent}% - 4px)`,
              minWidth: '60px',
              height: isLarge ? '80px' : '60px',
              backgroundColor: getColor(coin.price_change_percentage_24h ?? 0),
            }}
            title={`${coin.name} (${coin.symbol.toUpperCase()})
Price: $${coin.current_price.toLocaleString()}
24h: ${(coin.price_change_percentage_24h ?? 0) >= 0 ? '+' : ''}${(coin.price_change_percentage_24h ?? 0).toFixed(2)}%
Mkt Cap: $${(coin.market_cap / 1e9).toFixed(1)}B`}
          >
            <span className={`font-bold font-mono ${isLarge ? 'text-sm' : 'text-[10px]'} text-white`}>
              {coin.symbol.toUpperCase()}
            </span>
            <span
              className={`font-mono font-bold ${isLarge ? 'text-xs' : 'text-[9px]'}`}
              style={{ color: getTextColor(coin.price_change_percentage_24h ?? 0) }}
            >
              {(coin.price_change_percentage_24h ?? 0) >= 0 ? '+' : ''}
              {(coin.price_change_percentage_24h ?? 0).toFixed(1)}%
            </span>
            {isLarge && (
              <span className="text-[9px] text-white/60 font-mono">
                ${coin.current_price >= 1 ? coin.current_price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : coin.current_price.toPrecision(3)}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
