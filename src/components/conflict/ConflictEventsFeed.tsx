import { useState, useEffect, useCallback } from 'react'
import { Crosshair, RefreshCw, Skull, Users, Flame, AlertTriangle } from 'lucide-react'
import { fetchConflictEvents, type ConflictEvent } from '../../lib/conflictApi'

const EVENT_ICONS: Record<string, typeof Crosshair> = {
  'Battles': Crosshair,
  'Violence against civilians': Skull,
  'Protests': Users,
  'Riots': Flame,
  'Explosions/Remote violence': AlertTriangle,
  'Strategic developments': AlertTriangle,
}

const EVENT_COLORS: Record<string, string> = {
  'Battles': '#ef4444',
  'Violence against civilians': '#dc2626',
  'Protests': '#f59e0b',
  'Riots': '#f97316',
  'Explosions/Remote violence': '#e63946',
  'Strategic developments': '#8b5cf6',
}

export default function ConflictEventsFeed() {
  const [events, setEvents] = useState<ConflictEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  const refresh = useCallback(async () => {
    try {
      const data = await fetchConflictEvents({ limit: 200 })
      setEvents(data)
    } catch { /* handled */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 300_000) // 5 min
    return () => clearInterval(iv)
  }, [refresh])

  const eventTypes = ['all', ...new Set(events.map(e => e.eventType))]
  const filtered = filter === 'all' ? events : events.filter(e => e.eventType === filter)
  const totalFatalities = events.reduce((sum, e) => sum + e.fatalities, 0)

  return (
    <div className="h-full flex flex-col gap-1.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-samurai-steel font-mono">
          {events.length} EVENTS · {totalFatalities} FATALITIES · 30D
        </span>
        <button
          onClick={() => { setLoading(true); refresh() }}
          disabled={loading}
          className="p-1 rounded hover:bg-samurai-grey-dark transition-colors"
        >
          <RefreshCw className={`w-3 h-3 text-samurai-steel ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {eventTypes.slice(0, 6).map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`text-[7px] font-mono px-1.5 py-0.5 rounded transition-colors ${
              filter === t
                ? 'bg-samurai-red/20 text-samurai-red'
                : 'text-samurai-steel hover:text-white'
            }`}
          >
            {t === 'all' ? 'ALL' : t.toUpperCase().slice(0, 12)}
          </button>
        ))}
      </div>

      {/* Events list */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
        {loading && events.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[10px] text-samurai-steel animate-pulse font-mono">Loading conflict data...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Crosshair className="w-6 h-6 text-samurai-red/20" />
            <p className="text-[10px] text-samurai-steel">No events found</p>
          </div>
        ) : (
          filtered.slice(0, 50).map(e => {
            const Icon = EVENT_ICONS[e.eventType] || AlertTriangle
            const color = EVENT_COLORS[e.eventType] || '#e63946'
            return (
              <div key={e.id} className="bg-samurai-black rounded-md border border-samurai-grey-dark/30 px-2 py-1.5">
                <div className="flex items-start gap-1.5">
                  <Icon className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9px] font-bold font-mono truncate" style={{ color }}>
                        {e.subEventType || e.eventType}
                      </span>
                      <span className="text-[7px] text-samurai-steel font-mono flex-shrink-0">{e.eventDate}</span>
                    </div>
                    <div className="text-[9px] text-white truncate">{e.location}, {e.country}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[8px] text-samurai-steel font-mono truncate">{e.actor1}</span>
                      {e.actor2 && <span className="text-[7px] text-samurai-steel/50">vs</span>}
                      {e.actor2 && <span className="text-[8px] text-samurai-steel font-mono truncate">{e.actor2}</span>}
                    </div>
                    {e.fatalities > 0 && (
                      <span className="text-[8px] text-red-400 font-mono font-bold">{e.fatalities} fatalities</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="text-[7px] text-samurai-steel/40 text-center font-mono">
        ACLED · Last 30 days
      </div>
    </div>
  )
}
