import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { fetchCoinGecko } from '../lib/api'

interface MarketStat {
  label: string
  value: string
  change?: number
  prefix?: string
}

export default function MarketOverview() {
  const [stats, setStats] = useState<MarketStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchGlobal = async () => {
      try {
        const res = await fetchCoinGecko('/api/v3/global')
        if (!res.ok) throw new Error('CoinGecko global API error')
        const json = await res.json()
        const d = json.data
        setStats([
          {
            label: 'Total Market Cap',
            value: `$${(d.total_market_cap.usd / 1e12).toFixed(2)}T`,
            change: d.market_cap_change_percentage_24h_usd,
          },
          {
            label: '24h Volume',
            value: `$${(d.total_volume.usd / 1e9).toFixed(1)}B`,
          },
          {
            label: 'BTC Dominance',
            value: `${d.market_cap_percentage.btc.toFixed(1)}%`,
          },
          {
            label: 'ETH Dominance',
            value: `${d.market_cap_percentage.eth.toFixed(1)}%`,
          },
          {
            label: 'Active Cryptos',
            value: d.active_cryptocurrencies.toLocaleString(),
          },
          {
            label: 'Markets',
            value: d.markets.toLocaleString(),
          },
        ])
      } catch {
        // No fallback — show empty state
      }
      setLoading(false)
    }

    fetchGlobal()
    const interval = setInterval(fetchGlobal, 120000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-xs text-samurai-steel animate-pulse font-mono">Loading market data...</div>
      </div>
    )
  }

  if (stats.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-xs text-samurai-steel font-mono">Unable to load crypto market data</div>
      </div>
    )
  }

  return (
    <div className="h-full grid grid-cols-2 gap-2">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-samurai-black rounded-lg p-2.5 border border-samurai-grey-dark/50 flex flex-col justify-between"
        >
          <span className="text-[9px] text-samurai-steel font-mono uppercase tracking-wider">{stat.label}</span>
          <div className="flex items-end gap-1.5 mt-1">
            <span className="text-sm font-bold text-white font-mono">{stat.value}</span>
            {stat.change !== undefined && (
              <span className={`flex items-center gap-0.5 text-[10px] font-mono ${stat.change >= 0 ? 'text-samurai-green' : 'text-samurai-red'}`}>
                {stat.change >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                {stat.change >= 0 ? '+' : ''}{stat.change.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
