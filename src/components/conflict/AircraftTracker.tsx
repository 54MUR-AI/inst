import { useState, useEffect, useCallback } from 'react'
import { Plane, RefreshCw, Filter, Route, ChevronDown, ChevronUp } from 'lucide-react'
import {
  fetchLiveAircraft, fetchMilitaryAircraft, fetchAircraftTrack, fetchFlightsByAircraft,
  type Aircraft, type AircraftTrack, type FlightRecord,
} from '../../lib/conflictApi'

interface AircraftTrackerProps {
  onTrackSelect?: (track: AircraftTrack | null) => void
}

export default function AircraftTracker({ onTrackSelect }: AircraftTrackerProps) {
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [loading, setLoading] = useState(true)
  const [milOnly, setMilOnly] = useState(true)
  const [sortBy, setSortBy] = useState<'alt' | 'speed' | 'country'>('alt')
  const [expandedIcao, setExpandedIcao] = useState<string | null>(null)
  const [trackLoading, setTrackLoading] = useState(false)
  const [flights, setFlights] = useState<FlightRecord[]>([])
  const [flightsLoading, setFlightsLoading] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const data = milOnly ? await fetchMilitaryAircraft() : await fetchLiveAircraft()
      setAircraft(data)
    } catch { /* handled in api */ }
    setLoading(false)
  }, [milOnly])

  useEffect(() => {
    setLoading(true)
    refresh()
    const iv = setInterval(refresh, 60_000)
    return () => clearInterval(iv)
  }, [refresh])

  const handleExpand = useCallback(async (icao24: string) => {
    if (expandedIcao === icao24) {
      setExpandedIcao(null)
      onTrackSelect?.(null)
      return
    }

    setExpandedIcao(icao24)
    setFlights([])

    // Fetch track for map display
    setTrackLoading(true)
    try {
      const track = await fetchAircraftTrack(icao24)
      onTrackSelect?.(track)
    } catch { /* */ }
    setTrackLoading(false)

    // Fetch flight history
    setFlightsLoading(true)
    try {
      const fl = await fetchFlightsByAircraft(icao24)
      setFlights(fl)
    } catch { /* */ }
    setFlightsLoading(false)
  }, [expandedIcao, onTrackSelect])

  const sorted = [...aircraft].sort((a, b) => {
    if (sortBy === 'alt') return (b.baroAltitude || 0) - (a.baroAltitude || 0)
    if (sortBy === 'speed') return (b.velocity || 0) - (a.velocity || 0)
    return a.originCountry.localeCompare(b.originCountry)
  })

  const fmtAlt = (m: number | null) => {
    if (m == null) return 'GND'
    const ft = Math.round(m * 3.281)
    return ft >= 10000 ? `${(ft / 1000).toFixed(1)}k ft` : `${ft} ft`
  }

  const fmtSpeed = (ms: number | null) => {
    if (ms == null) return '—'
    return `${Math.round(ms * 1.944)} kts`
  }

  const fmtTime = (unix: number) => {
    if (!unix) return '—'
    return new Date(unix * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="h-full flex flex-col gap-1.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-samurai-steel font-mono">
          {aircraft.length} AIRCRAFT · {milOnly ? 'MIL' : 'ALL'} · LIVE
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMilOnly(!milOnly)}
            className={`p-1 rounded text-[8px] font-mono transition-colors ${milOnly ? 'bg-cyan-500/20 text-cyan-400' : 'bg-samurai-grey-dark text-samurai-steel'}`}
            title="Toggle military filter"
          >
            <Filter className="w-3 h-3" />
          </button>
          <button
            onClick={() => { setLoading(true); refresh() }}
            disabled={loading}
            className="p-1 rounded hover:bg-samurai-grey-dark transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-3 h-3 text-samurai-steel ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Sort tabs */}
      <div className="flex gap-1">
        {(['alt', 'speed', 'country'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            className={`text-[8px] font-mono px-2 py-0.5 rounded transition-colors ${
              sortBy === s ? 'bg-cyan-500/20 text-cyan-400' : 'text-samurai-steel hover:text-white'
            }`}
          >
            {s === 'alt' ? 'ALTITUDE' : s === 'speed' ? 'SPEED' : 'COUNTRY'}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
        {loading && aircraft.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[10px] text-samurai-steel animate-pulse font-mono">Scanning airspace...</span>
          </div>
        ) : aircraft.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Plane className="w-6 h-6 text-cyan-500/20" />
            <p className="text-[10px] text-samurai-steel">No aircraft detected</p>
            <p className="text-[8px] text-samurai-steel/50">OpenSky may be rate-limited</p>
          </div>
        ) : (
          sorted.slice(0, 50).map(a => {
            const isExpanded = expandedIcao === a.icao24
            return (
              <div key={a.icao24} className={`bg-samurai-black rounded-md border transition-colors ${isExpanded ? 'border-cyan-500/40' : 'border-samurai-grey-dark/30'}`}>
                <button
                  onClick={() => handleExpand(a.icao24)}
                  className="w-full px-2 py-1.5 flex items-center justify-between gap-2 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Plane className="w-3 h-3 text-cyan-400 flex-shrink-0" style={{ transform: `rotate(${a.trueTrack || 0}deg)` }} />
                    <div className="min-w-0 text-left">
                      <div className="text-[10px] font-bold text-white font-mono truncate">
                        {a.callsign || a.icao24}
                      </div>
                      <div className="text-[8px] text-samurai-steel truncate">{a.originCountry}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-right">
                      <div className="text-[10px] font-mono text-cyan-400">{fmtAlt(a.baroAltitude)}</div>
                      <div className="text-[8px] font-mono text-samurai-steel">{fmtSpeed(a.velocity)}</div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-3 h-3 text-samurai-steel" /> : <ChevronDown className="w-3 h-3 text-samurai-steel/40" />}
                  </div>
                </button>

                {/* Expanded detail panel */}
                {isExpanded && (
                  <div className="px-2 pb-2 border-t border-samurai-grey-dark/20 space-y-1.5">
                    {/* ICAO + squawk */}
                    <div className="flex items-center gap-3 pt-1.5 text-[8px] font-mono text-samurai-steel/60">
                      <span>ICAO: {a.icao24}</span>
                      {a.squawk && <span>SQK: {a.squawk}</span>}
                      <span>CAT: {a.category}</span>
                    </div>

                    {/* Track status */}
                    <div className="flex items-center gap-1 text-[8px] font-mono">
                      <Route className="w-3 h-3 text-cyan-400/60" />
                      {trackLoading ? (
                        <span className="text-samurai-steel animate-pulse">Loading track...</span>
                      ) : (
                        <span className="text-cyan-400/60">Track drawn on map (if available)</span>
                      )}
                    </div>

                    {/* Flight history */}
                    <div className="text-[8px] font-mono">
                      <div className="text-samurai-steel/70 mb-0.5">Recent Flights (48h):</div>
                      {flightsLoading ? (
                        <div className="text-samurai-steel/40 animate-pulse">Loading history...</div>
                      ) : flights.length === 0 ? (
                        <div className="text-samurai-steel/40">No flight records (batch-processed nightly)</div>
                      ) : (
                        <div className="space-y-0.5 max-h-[80px] overflow-y-auto">
                          {flights.slice(0, 5).map((f, i) => (
                            <div key={i} className="flex items-center gap-1 text-[7px]">
                              <span className="text-cyan-400/80">{f.estDepartureAirport || '????'}</span>
                              <span className="text-samurai-steel/40">→</span>
                              <span className="text-cyan-400/80">{f.estArrivalAirport || '????'}</span>
                              <span className="text-samurai-steel/30 ml-auto">{fmtTime(f.firstSeen)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <div className="text-[7px] text-samurai-steel/40 text-center font-mono">
        OpenSky Network · Click aircraft for track + history
      </div>
    </div>
  )
}
