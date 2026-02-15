import { useState, useEffect, useCallback } from 'react'
import { TowerControl, RefreshCw, PlaneTakeoff, PlaneLanding, ChevronDown, ChevronUp } from 'lucide-react'
import {
  fetchAllMilitaryAirbaseActivity, MILITARY_AIRBASES,
  type AirportActivity, type FlightRecord,
} from '../../lib/conflictApi'

export default function AirbaseMonitor() {
  const [activities, setActivities] = useState<AirportActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedIcao, setExpandedIcao] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await fetchAllMilitaryAirbaseActivity(24)
      setActivities(data)
    } catch { /* handled in api */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 600_000) // 10 min — nightly batch data doesn't change often
    return () => clearInterval(iv)
  }, [refresh])

  const fmtTime = (unix: number) => {
    if (!unix) return '—'
    return new Date(unix * 1000).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  const FlightRow = ({ f, type }: { f: FlightRecord; type: 'arr' | 'dep' }) => (
    <div className="flex items-center gap-1.5 text-[7px] font-mono py-0.5">
      {type === 'arr' ? (
        <PlaneLanding className="w-2.5 h-2.5 text-green-400/60 flex-shrink-0" />
      ) : (
        <PlaneTakeoff className="w-2.5 h-2.5 text-orange-400/60 flex-shrink-0" />
      )}
      <span className="text-white/80 w-[55px] truncate">{f.callsign || f.icao24}</span>
      <span className="text-samurai-steel/50">
        {type === 'arr' ? `from ${f.estDepartureAirport || '????'}` : `to ${f.estArrivalAirport || '????'}`}
      </span>
      <span className="text-samurai-steel/30 ml-auto flex-shrink-0">{fmtTime(type === 'arr' ? f.lastSeen : f.firstSeen)}</span>
    </div>
  )

  if (loading && activities.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-samurai-steel">
        <TowerControl className="w-4 h-4 animate-pulse mr-2" />
        <span className="text-[10px] font-mono">Loading airbase activity...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-samurai-grey-dark/30">
        <span className="text-[9px] text-samurai-steel font-mono">
          {MILITARY_AIRBASES.length} BASES · 24H ACTIVITY
        </span>
        <button
          onClick={() => { setLoading(true); refresh() }}
          disabled={loading}
          className="p-1 rounded hover:bg-samurai-grey-dark transition-colors"
        >
          <RefreshCw className={`w-3 h-3 text-samurai-steel ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Airbase list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {activities.length === 0 ? (
          <div className="text-center text-samurai-steel/50 text-[10px] font-mono py-8">
            No activity data available<br />
            <span className="text-[8px]">(requires authenticated OpenSky access)</span>
          </div>
        ) : (
          activities.map(a => {
            const isExpanded = expandedIcao === a.airport.icao
            const hasActivity = a.totalMovements > 0

            return (
              <div key={a.airport.icao} className={`border-b border-samurai-grey-dark/10 ${hasActivity ? '' : 'opacity-40'}`}>
                <button
                  onClick={() => setExpandedIcao(isExpanded ? null : a.airport.icao)}
                  className="w-full px-2 py-1.5 flex items-center justify-between gap-2 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <TowerControl className={`w-3 h-3 flex-shrink-0 ${hasActivity ? 'text-cyan-400' : 'text-samurai-steel/30'}`} />
                    <div className="min-w-0 text-left">
                      <div className="text-[9px] font-mono text-white truncate font-medium">
                        {a.airport.name}
                      </div>
                      <div className="text-[7px] text-samurai-steel/60 font-mono">
                        {a.airport.icao} · {a.airport.country}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="flex items-center gap-1.5 text-[8px] font-mono">
                      <span className="text-green-400/70 flex items-center gap-0.5">
                        <PlaneLanding className="w-2.5 h-2.5" />{a.arrivals.length}
                      </span>
                      <span className="text-orange-400/70 flex items-center gap-0.5">
                        <PlaneTakeoff className="w-2.5 h-2.5" />{a.departures.length}
                      </span>
                    </div>
                    {hasActivity && (
                      isExpanded ? <ChevronUp className="w-3 h-3 text-samurai-steel" /> : <ChevronDown className="w-3 h-3 text-samurai-steel/40" />
                    )}
                  </div>
                </button>

                {/* Expanded flight list */}
                {isExpanded && hasActivity && (
                  <div className="px-2 pb-2 border-t border-samurai-grey-dark/20">
                    {a.arrivals.length > 0 && (
                      <div className="mt-1">
                        <div className="text-[7px] font-mono text-green-400/50 mb-0.5">ARRIVALS ({a.arrivals.length})</div>
                        <div className="max-h-[60px] overflow-y-auto">
                          {a.arrivals.slice(0, 8).map((f, i) => <FlightRow key={`a-${i}`} f={f} type="arr" />)}
                        </div>
                      </div>
                    )}
                    {a.departures.length > 0 && (
                      <div className="mt-1">
                        <div className="text-[7px] font-mono text-orange-400/50 mb-0.5">DEPARTURES ({a.departures.length})</div>
                        <div className="max-h-[60px] overflow-y-auto">
                          {a.departures.slice(0, 8).map((f, i) => <FlightRow key={`d-${i}`} f={f} type="dep" />)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <div className="text-[7px] text-samurai-steel/40 text-center font-mono px-2 py-1 border-t border-samurai-grey-dark/20">
        OpenSky · Nightly batch data · Sorted by activity
      </div>
    </div>
  )
}
