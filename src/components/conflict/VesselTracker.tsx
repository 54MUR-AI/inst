import { useState, useEffect } from 'react'
import { Ship, Filter, Anchor, Navigation } from 'lucide-react'
import { type Vessel } from '../../lib/conflictApi'

const TYPE_COLORS: Record<string, string> = {
  'Military Ops': '#ef4444',
  'Law Enforcement': '#f97316',
  'SAR': '#eab308',
  'Tanker': '#8b5cf6',
  'Cargo': '#06b6d4',
  'Passenger': '#22c55e',
  'Fishing': '#64748b',
  'Tug': '#a78bfa',
  'High Speed Craft': '#ec4899',
}

function typeColor(typeName: string): string {
  return TYPE_COLORS[typeName] || '#94a3b8'
}

interface VesselTrackerProps {
  vessels: Vessel[]
  onFilteredChange?: (filtered: Vessel[]) => void
}

export default function VesselTracker({ vessels: allVessels, onFilteredChange }: VesselTrackerProps) {
  const [milOnly, setMilOnly] = useState(false)
  const [sortBy, setSortBy] = useState<'speed' | 'type' | 'flag'>('speed')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const loading = allVessels.length === 0

  // Apply mil-only filter first
  const baseVessels = milOnly
    ? allVessels.filter(v => {
        const MILITARY_TYPES = new Set([35, 50, 51, 52, 53, 54, 55])
        return MILITARY_TYPES.has(v.shipType) || MILITARY_TYPES.has(Math.floor(v.shipType / 10) * 10)
          || /navy|coast guard|patrol|military|warship/i.test(v.name)
      })
    : allVessels

  // Get unique ship types for filter dropdown
  const shipTypes = [...new Set(baseVessels.map(v => v.shipTypeName))].sort()

  const filtered = typeFilter === 'all' ? baseVessels : baseVessels.filter(v => v.shipTypeName === typeFilter)

  // Notify parent of filtered vessels for map sync
  useEffect(() => {
    onFilteredChange?.(filtered)
  }, [filtered.length, milOnly, typeFilter])

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'speed') return (b.sog || 0) - (a.sog || 0)
    if (sortBy === 'type') return a.shipTypeName.localeCompare(b.shipTypeName)
    return a.flag.localeCompare(b.flag)
  })

  const fmtSpeed = (kts: number) => kts > 0 ? `${kts.toFixed(1)} kts` : 'Stationary'
  const fmtHeading = (deg: number) => {
    if (deg < 0 || deg > 360) return '—'
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    return dirs[Math.round(deg / 45) % 8]
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-samurai-steel">
        <Ship className="w-4 h-4 animate-pulse mr-2" />
        <span className="text-[10px] font-mono">Loading AIS data...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-samurai-grey-dark/30">
        <button
          onClick={() => setMilOnly(!milOnly)}
          className={`text-[8px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
            milOnly ? 'border-red-500/50 text-red-400 bg-red-500/10' : 'border-samurai-grey-dark/50 text-samurai-steel'
          }`}
        >
          <Filter className="w-2.5 h-2.5 inline mr-0.5" />
          {milOnly ? 'MIL/GOV' : 'ALL'}
        </button>

        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="text-[8px] font-mono bg-samurai-black border border-samurai-grey-dark/50 text-samurai-steel rounded px-1 py-0.5 max-w-[80px]"
        >
          <option value="all">All Types</option>
          {shipTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {(['speed', 'type', 'flag'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            className={`text-[7px] font-mono px-1 py-0.5 rounded ${
              sortBy === s ? 'text-cyan-400 bg-cyan-500/10' : 'text-samurai-steel/60'
            }`}
          >
            {s.toUpperCase()}
          </button>
        ))}

      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-3 px-2 py-1 text-[8px] font-mono text-samurai-steel/70 border-b border-samurai-grey-dark/20">
        <span>{sorted.length} vessels</span>
        <span>{sorted.filter(v => v.sog > 0.5).length} moving</span>
        <span>{sorted.filter(v => v.navStatus === 1 || v.navStatus === 5).length} anchored/moored</span>
      </div>

      {/* Vessel list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {sorted.length === 0 ? (
          <div className="text-center text-samurai-steel/50 text-[10px] font-mono py-8">
            No vessels found
          </div>
        ) : (
          sorted.slice(0, 100).map(v => (
            <div
              key={v.mmsi}
              className="flex items-center gap-2 px-2 py-1.5 border-b border-samurai-grey-dark/10 hover:bg-white/[0.02] transition-colors"
            >
              {/* Ship icon with type color */}
              <div className="flex-shrink-0">
                {v.navStatus === 1 || v.navStatus === 5 ? (
                  <Anchor className="w-3 h-3" style={{ color: typeColor(v.shipTypeName) }} />
                ) : v.sog > 0.5 ? (
                  <Navigation className="w-3 h-3" style={{ color: typeColor(v.shipTypeName), transform: `rotate(${v.heading}deg)` }} />
                ) : (
                  <Ship className="w-3 h-3" style={{ color: typeColor(v.shipTypeName) }} />
                )}
              </div>

              {/* Name + details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-mono text-white truncate font-medium">
                    {v.flag} {v.name}
                  </span>
                  {v.callSign && (
                    <span className="text-[7px] font-mono text-samurai-steel/50 flex-shrink-0">
                      {v.callSign}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[7px] font-mono text-samurai-steel/60">
                  <span style={{ color: typeColor(v.shipTypeName) }}>{v.shipTypeName}</span>
                  <span>{v.navStatusName}</span>
                  {v.destination && <span className="truncate max-w-[60px]">→ {v.destination}</span>}
                </div>
              </div>

              {/* Speed + heading */}
              <div className="flex-shrink-0 text-right">
                <div className={`text-[9px] font-mono font-medium ${v.sog > 0.5 ? 'text-cyan-400' : 'text-samurai-steel/40'}`}>
                  {fmtSpeed(v.sog)}
                </div>
                <div className="text-[7px] font-mono text-samurai-steel/50">
                  {v.sog > 0.5 ? `${fmtHeading(v.cog)} ${Math.round(v.cog)}°` : '—'}
                </div>
              </div>
            </div>
          ))
        )}
        {sorted.length > 100 && (
          <div className="text-center text-[8px] font-mono text-samurai-steel/40 py-2">
            Showing 100 of {sorted.length} vessels
          </div>
        )}
      </div>
    </div>
  )
}
