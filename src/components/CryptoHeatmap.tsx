import { useState, useEffect } from 'react'
import { fetchCoinGecko } from '../lib/api'

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
        const res = await fetchCoinGecko(
          '/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h'
        )
        if (!res.ok) throw new Error('CoinGecko API error')
        const data: CoinData[] = (await res.json()).map((c: CoinData) => ({
          ...c,
          price_change_percentage_24h: c.price_change_percentage_24h ?? 0,
        }))
        setCoins(data)
      } catch {
        // Fallback data
        setCoins([
          { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', market_cap: 1900000000000, current_price: 97234, price_change_percentage_24h: 2.1 },
          { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', market_cap: 420000000000, current_price: 3456, price_change_percentage_24h: -1.3 },
          { id: 'solana', symbol: 'SOL', name: 'Solana', market_cap: 95000000000, current_price: 198, price_change_percentage_24h: 6.7 },
          { id: 'ripple', symbol: 'XRP', name: 'XRP', market_cap: 130000000000, current_price: 2.34, price_change_percentage_24h: 2.2 },
          { id: 'cardano', symbol: 'ADA', name: 'Cardano', market_cap: 32000000000, current_price: 0.89, price_change_percentage_24h: -2.1 },
          { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin', market_cap: 47000000000, current_price: 0.32, price_change_percentage_24h: 3.1 },
          { id: 'avalanche', symbol: 'AVAX', name: 'Avalanche', market_cap: 16000000000, current_price: 38.9, price_change_percentage_24h: 5.7 },
          { id: 'polkadot', symbol: 'DOT', name: 'Polkadot', market_cap: 10000000000, current_price: 7.23, price_change_percentage_24h: -2.0 },
          { id: 'chainlink', symbol: 'LINK', name: 'Chainlink', market_cap: 12000000000, current_price: 19.5, price_change_percentage_24h: 4.2 },
          { id: 'polygon', symbol: 'MATIC', name: 'Polygon', market_cap: 8000000000, current_price: 0.85, price_change_percentage_24h: -0.5 },
        ])
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
