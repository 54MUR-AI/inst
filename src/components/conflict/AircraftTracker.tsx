import { useState, useEffect, useCallback } from 'react'
import { Plane, RefreshCw, Filter, Route } from 'lucide-react'
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
  const [countryFilter, setCountryFilter] = useState<string>('all')
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

  // Get unique countries for filter dropdown
  const countries = [...new Set(aircraft.map(a => a.originCountry))].sort()

  const filtered = countryFilter === 'all' ? sorted : sorted.filter(a => a.originCountry === countryFilter)

  return (
    <div className="flex flex-col h-full">
      {/* Controls — matches VesselTracker layout */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-samurai-grey-dark/30">
        <button
          onClick={() => setMilOnly(!milOnly)}
          className={`text-[8px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
            milOnly ? 'border-red-500/50 text-red-400 bg-red-500/10' : 'border-samurai-grey-dark/50 text-samurai-steel'
          }`}
        >
          <Filter className="w-2.5 h-2.5 inline mr-0.5" />
          {milOnly ? 'MIL' : 'ALL'}
        </button>

        <select
          value={countryFilter}
          onChange={e => setCountryFilter(e.target.value)}
          className="text-[8px] font-mono bg-samurai-black border border-samurai-grey-dark/50 text-samurai-steel rounded px-1 py-0.5 max-w-[80px]"
        >
          <option value="all">All Countries</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {(['alt', 'speed', 'country'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            className={`text-[7px] font-mono px-1 py-0.5 rounded ${
              sortBy === s ? 'text-cyan-400 bg-cyan-500/10' : 'text-samurai-steel/60'
            }`}
          >
            {s === 'alt' ? 'ALT' : s === 'speed' ? 'SPEED' : 'COUNTRY'}
          </button>
        ))}

        <button
          onClick={() => { setLoading(true); refresh() }}
          disabled={loading}
          className="ml-auto text-samurai-steel hover:text-white"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-3 px-2 py-1 text-[8px] font-mono text-samurai-steel/70 border-b border-samurai-grey-dark/20">
        <span>{filtered.length} aircraft</span>
        <span>{filtered.filter(a => (a.baroAltitude || 0) > 10000).length} high alt</span>
        <span>{filtered.filter(a => a.onGround).length} on ground</span>
      </div>

      {/* Aircraft list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading && aircraft.length === 0 ? (
          <div className="flex items-center justify-center h-full text-samurai-steel">
            <Plane className="w-4 h-4 animate-pulse mr-2" />
            <span className="text-[10px] font-mono">Scanning airspace...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-8">
            <Plane className="w-6 h-6 text-cyan-500/20" />
            <p className="text-[10px] text-samurai-steel">No aircraft detected</p>
            <p className="text-[8px] text-samurai-steel/50">OpenSky may be rate-limited</p>
          </div>
        ) : (
          filtered.slice(0, 50).map(a => {
            const isExpanded = expandedIcao === a.icao24
            return (
              <div
                key={a.icao24}
                className="border-b border-samurai-grey-dark/10"
              >
                <button
                  onClick={() => handleExpand(a.icao24)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-white/[0.02] transition-colors"
                >
                  {/* Icon */}
                  <div className="flex-shrink-0">
                    <Plane className="w-3 h-3 text-cyan-400" style={{ transform: `rotate(${a.trueTrack || 0}deg)` }} />
                  </div>

                  {/* Name + details */}
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-mono text-white truncate font-medium">
                        {a.callsign || a.icao24}
                      </span>
                      {a.squawk && (
                        <span className="text-[7px] font-mono text-samurai-steel/50 flex-shrink-0">
                          {a.squawk}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[7px] font-mono text-samurai-steel/60">
                      <span className="text-cyan-400/70">{a.originCountry}</span>
                      <span>{a.onGround ? 'Ground' : fmtAlt(a.baroAltitude)}</span>
                    </div>
                  </div>

                  {/* Speed + heading */}
                  <div className="flex-shrink-0 text-right">
                    <div className={`text-[9px] font-mono font-medium ${(a.velocity || 0) > 0 ? 'text-cyan-400' : 'text-samurai-steel/40'}`}>
                      {fmtSpeed(a.velocity)}
                    </div>
                    <div className="text-[7px] font-mono text-samurai-steel/50">
                      {a.trueTrack != null ? `${Math.round(a.trueTrack)}°` : '—'}
                    </div>
                  </div>
                </button>

                {/* Expanded detail panel */}
                {isExpanded && (
                  <div className="px-2 pb-2 border-t border-samurai-grey-dark/20 space-y-1.5">
                    <div className="flex items-center gap-3 pt-1.5 text-[8px] font-mono text-samurai-steel/60">
                      <span>ICAO: {a.icao24}</span>
                      {a.squawk && <span>SQK: {a.squawk}</span>}
                      <span>CAT: {a.category}</span>
                    </div>

                    <div className="flex items-center gap-1 text-[8px] font-mono">
                      <Route className="w-3 h-3 text-cyan-400/60" />
                      {trackLoading ? (
                        <span className="text-samurai-steel animate-pulse">Loading track...</span>
                      ) : (
                        <span className="text-cyan-400/60">Track drawn on map (if available)</span>
                      )}
                    </div>

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
        {filtered.length > 50 && (
          <div className="text-center text-[8px] font-mono text-samurai-steel/40 py-2">
            Showing 50 of {filtered.length} aircraft
          </div>
        )}
      </div>
    </div>
  )
}
