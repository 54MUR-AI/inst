import { useState, useEffect, useCallback } from 'react'
import { Ship, Cpu, Fuel, Wheat, Scale, Truck, ExternalLink, RefreshCw } from 'lucide-react'
import { fetchSupplyChainNews, type SupplyChainEvent } from '../../lib/logisticsApi'

const CATEGORY_CONFIG: Record<SupplyChainEvent['category'], { icon: typeof Ship; color: string; label: string }> = {
  shipping: { icon: Ship, color: '#06b6d4', label: 'SHIP' },
  semiconductor: { icon: Cpu, color: '#8b5cf6', label: 'CHIP' },
  energy: { icon: Fuel, color: '#f97316', label: 'ENERGY' },
  food: { icon: Wheat, color: '#22c55e', label: 'FOOD' },
  trade: { icon: Scale, color: '#eab308', label: 'TRADE' },
  logistics: { icon: Truck, color: '#6b7280', label: 'LOGIS' },
}

export default function SupplyChainNewsFeed() {
  const [news, setNews] = useState<SupplyChainEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<SupplyChainEvent['category'] | 'all'>('all')

  const refresh = useCallback(async () => {
    setLoading(true)
    const data = await fetchSupplyChainNews()
    setNews(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 600_000)
    return () => clearInterval(iv)
  }, [refresh])

  const filtered = filter === 'all' ? news : news.filter(e => e.category === filter)

  const stats = {
    shipping: news.filter(e => e.category === 'shipping').length,
    semiconductor: news.filter(e => e.category === 'semiconductor').length,
    energy: news.filter(e => e.category === 'energy').length,
    food: news.filter(e => e.category === 'food').length,
    trade: news.filter(e => e.category === 'trade').length,
  }

  return (
    <div className="h-full flex flex-col text-[10px] font-mono">
      {/* Stats bar */}
      <div className="flex items-center gap-2 px-2 py-1 border-b border-samurai-grey-dark/50 flex-wrap">
        <span className="text-cyan-500">{stats.shipping} SHIP</span>
        <span className="text-purple-500">{stats.semiconductor} CHIP</span>
        <span className="text-orange-500">{stats.energy} ENERGY</span>
        <span className="text-green-500">{stats.food} FOOD</span>
        <span className="text-yellow-500">{stats.trade} TRADE</span>
        <div className="flex-1" />
        <button onClick={refresh} className="p-0.5 hover:bg-samurai-grey-dark rounded" title="Refresh">
          <RefreshCw className={`w-3 h-3 text-samurai-steel ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-samurai-grey-dark/50 overflow-x-auto">
        {(['all', 'shipping', 'semiconductor', 'energy', 'food', 'trade', 'logistics'] as const).map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-2 py-1 text-[8px] uppercase whitespace-nowrap transition-colors ${
              filter === t ? 'text-samurai-red border-b border-samurai-red' : 'text-samurai-steel hover:text-white'
            }`}
          >
            {t === 'all' ? 'ALL' : t === 'semiconductor' ? 'CHIPS' : t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-3 text-samurai-steel text-center">{loading ? 'Loading...' : 'No supply chain news'}</div>
        ) : (
          filtered.map(e => {
            const cfg = CATEGORY_CONFIG[e.category]
            const Icon = cfg.icon
            return (
              <a
                key={e.id}
                href={e.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 px-2 py-1.5 border-b border-samurai-grey-dark/30 hover:bg-samurai-grey-dark/20 transition-colors"
              >
                <Icon className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: cfg.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-white/90 leading-tight line-clamp-2">{e.title}</div>
                  <div className="flex items-center gap-2 mt-0.5 text-samurai-steel">
                    <span style={{ color: cfg.color }}>{cfg.label}</span>
                    <span>{e.domain}</span>
                    {e.sourcecountry && <span>{e.sourcecountry}</span>}
                  </div>
                </div>
                <ExternalLink className="w-2.5 h-2.5 text-samurai-steel flex-shrink-0 mt-1" />
              </a>
            )
          })
        )}
      </div>

      <div className="px-2 py-0.5 border-t border-samurai-grey-dark/50 text-samurai-steel text-center text-[8px]">
        Source: GDELT &bull; 7-day window
      </div>
    </div>
  )
}
