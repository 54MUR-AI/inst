import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, Clock, Users } from 'lucide-react'

interface PolymarketEvent {
  id: string
  title: string
  slug: string
  markets: PolymarketMarket[]
  volume: number
  liquidity: number
  endDate: string
  active: boolean
}

interface PolymarketMarket {
  id: string
  question: string
  outcomePrices: string // JSON string like "[\"0.65\",\"0.35\"]"
  outcomes: string // JSON string like "[\"Yes\",\"No\"]"
  volume: number
  liquidity: number
}

interface ParsedEvent {
  id: string
  title: string
  yesPrice: number
  noPrice: number
  volume: string
  endDate: string
  category: string
}

export default function PolymarketFeed() {
  const [events, setEvents] = useState<ParsedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'politics' | 'crypto' | 'sports' | 'tech'>('all')

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const res = await fetch(
          'https://gamma-api.polymarket.com/events?order=id&ascending=false&closed=false&limit=20'
        )
        if (!res.ok) throw new Error('Polymarket API error')
        const data: PolymarketEvent[] = await res.json()

        const parsed: ParsedEvent[] = data
          .filter(e => e.markets && e.markets.length > 0)
          .map(event => {
            const market = event.markets[0]
            let yesPrice = 0.5
            let noPrice = 0.5

            try {
              if (market.outcomePrices) {
                const prices = JSON.parse(market.outcomePrices)
                yesPrice = parseFloat(prices[0]) || 0.5
                noPrice = parseFloat(prices[1]) || 0.5
              }
            } catch {
              // keep defaults
            }

            const vol = event.volume || market.volume || 0
            const volumeStr = vol >= 1e6
              ? `$${(vol / 1e6).toFixed(1)}M`
              : vol >= 1e3
              ? `$${(vol / 1e3).toFixed(0)}K`
              : `$${vol.toFixed(0)}`

            // Simple category detection from title
            const titleLower = event.title.toLowerCase()
            let category = 'other'
            if (titleLower.includes('bitcoin') || titleLower.includes('crypto') || titleLower.includes('ethereum') || titleLower.includes('btc') || titleLower.includes('eth')) {
              category = 'crypto'
            } else if (titleLower.includes('trump') || titleLower.includes('biden') || titleLower.includes('election') || titleLower.includes('president') || titleLower.includes('congress') || titleLower.includes('senate')) {
              category = 'politics'
            } else if (titleLower.includes('nfl') || titleLower.includes('nba') || titleLower.includes('super bowl') || titleLower.includes('world cup') || titleLower.includes('ufc')) {
              category = 'sports'
            } else if (titleLower.includes('ai') || titleLower.includes('apple') || titleLower.includes('google') || titleLower.includes('tesla') || titleLower.includes('openai')) {
              category = 'tech'
            }

            return {
              id: event.id,
              title: event.title,
              yesPrice,
              noPrice,
              volume: volumeStr,
              endDate: event.endDate ? new Date(event.endDate).toLocaleDateString() : 'TBD',
              category,
            }
          })

        setEvents(parsed)
      } catch {
        // Fallback data
        setEvents([
          { id: '1', title: 'Will Bitcoin reach $150K by end of 2026?', yesPrice: 0.42, noPrice: 0.58, volume: '$12.4M', endDate: '12/31/2026', category: 'crypto' },
          { id: '2', title: 'Will the Fed cut rates in March 2026?', yesPrice: 0.68, noPrice: 0.32, volume: '$8.7M', endDate: '3/31/2026', category: 'politics' },
          { id: '3', title: 'Will OpenAI release GPT-5 by June 2026?', yesPrice: 0.55, noPrice: 0.45, volume: '$3.2M', endDate: '6/30/2026', category: 'tech' },
          { id: '4', title: 'Will Ethereum flip Bitcoin market cap?', yesPrice: 0.08, noPrice: 0.92, volume: '$5.1M', endDate: '12/31/2026', category: 'crypto' },
          { id: '5', title: 'Will there be a US recession in 2026?', yesPrice: 0.31, noPrice: 0.69, volume: '$15.8M', endDate: '12/31/2026', category: 'politics' },
          { id: '6', title: 'Super Bowl 2027 winner: Chiefs?', yesPrice: 0.18, noPrice: 0.82, volume: '$2.1M', endDate: '2/7/2027', category: 'sports' },
        ])
      }
      setLoading(false)
    }

    fetchEvents()
    const interval = setInterval(fetchEvents, 60000) // 1 min
    return () => clearInterval(interval)
  }, [])

  const filteredEvents = filter === 'all'
    ? events
    : events.filter(e => e.category === filter)

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'crypto': return 'text-samurai-amber bg-samurai-amber/10'
      case 'politics': return 'text-samurai-cyan bg-samurai-cyan/10'
      case 'sports': return 'text-samurai-green bg-samurai-green/10'
      case 'tech': return 'text-purple-400 bg-purple-400/10'
      default: return 'text-samurai-steel bg-samurai-grey-dark'
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-xs text-samurai-steel animate-pulse font-mono">Loading prediction markets...</div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {(['all', 'politics', 'crypto', 'sports', 'tech'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase transition-all ${
              filter === f
                ? 'bg-samurai-red text-white'
                : 'bg-samurai-grey-dark text-samurai-steel hover:text-white'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Events list */}
      <div className="flex-1 overflow-y-auto space-y-1.5">
        {filteredEvents.length === 0 ? (
          <div className="text-xs text-samurai-steel text-center py-4 font-mono">No events in this category</div>
        ) : (
          filteredEvents.map(event => (
            <div
              key={event.id}
              className="bg-samurai-black rounded-md p-2.5 border border-samurai-grey-dark/30 hover:border-samurai-grey-dark transition-all cursor-pointer"
            >
              {/* Title + category */}
              <div className="flex items-start gap-2 mb-2">
                <span className="text-[10px] font-semibold text-white leading-tight flex-1 line-clamp-2">
                  {event.title}
                </span>
                <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded ${getCategoryColor(event.category)}`}>
                  {event.category.toUpperCase()}
                </span>
              </div>

              {/* Odds bar */}
              <div className="flex items-center gap-2 mb-1.5">
                <div className="flex-1 h-4 bg-samurai-grey-dark rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-samurai-green flex items-center justify-center transition-all duration-500"
                    style={{ width: `${event.yesPrice * 100}%` }}
                  >
                    {event.yesPrice >= 0.15 && (
                      <span className="text-[8px] font-mono font-bold text-white">
                        YES {(event.yesPrice * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <div
                    className="h-full bg-samurai-red flex items-center justify-center transition-all duration-500"
                    style={{ width: `${event.noPrice * 100}%` }}
                  >
                    {event.noPrice >= 0.15 && (
                      <span className="text-[8px] font-mono font-bold text-white">
                        NO {(event.noPrice * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Meta */}
              <div className="flex items-center gap-3 text-[9px] text-samurai-steel font-mono">
                <span className="flex items-center gap-0.5">
                  <Users className="w-2.5 h-2.5" />
                  {event.volume}
                </span>
                <span className="flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  {event.endDate}
                </span>
                <span className="ml-auto flex items-center gap-0.5">
                  {event.yesPrice >= 0.5 ? (
                    <TrendingUp className="w-2.5 h-2.5 text-samurai-green" />
                  ) : (
                    <TrendingDown className="w-2.5 h-2.5 text-samurai-red" />
                  )}
                  <span className={event.yesPrice >= 0.5 ? 'text-samurai-green' : 'text-samurai-red'}>
                    {(event.yesPrice * 100).toFixed(0)}¢
                  </span>
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
