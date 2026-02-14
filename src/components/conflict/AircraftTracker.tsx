import { useState, useEffect, useCallback } from 'react'
import { Plane, RefreshCw, Filter } from 'lucide-react'
import { fetchLiveAircraft, fetchMilitaryAircraft, type Aircraft } from '../../lib/conflictApi'

export default function AircraftTracker() {
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [loading, setLoading] = useState(true)
  const [milOnly, setMilOnly] = useState(true)
  const [sortBy, setSortBy] = useState<'alt' | 'speed' | 'country'>('alt')

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
    const iv = setInterval(refresh, 15_000)
    return () => clearInterval(iv)
  }, [refresh])

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
          sorted.slice(0, 50).map(a => (
            <div key={a.icao24} className="bg-samurai-black rounded-md border border-samurai-grey-dark/30 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Plane className="w-3 h-3 text-cyan-400 flex-shrink-0" style={{ transform: `rotate(${a.trueTrack || 0}deg)` }} />
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-white font-mono truncate">
                      {a.callsign || a.icao24}
                    </div>
                    <div className="text-[8px] text-samurai-steel truncate">{a.originCountry}</div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[10px] font-mono text-cyan-400">{fmtAlt(a.baroAltitude)}</div>
                  <div className="text-[8px] font-mono text-samurai-steel">{fmtSpeed(a.velocity)}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="text-[7px] text-samurai-steel/40 text-center font-mono">
        OpenSky Network · Updates every 15s
      </div>
    </div>
  )
}
