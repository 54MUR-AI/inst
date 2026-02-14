import { useState, useEffect, useCallback } from 'react'
import { Flame, RefreshCw, Satellite } from 'lucide-react'
import { fetchHotspots, type Hotspot } from '../../lib/conflictApi'

export default function HotspotDetection() {
  const [hotspots, setHotspots] = useState<Hotspot[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await fetchHotspots({ dayRange: 1 })
      setHotspots(data)
    } catch { /* handled */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 600_000) // 10 min
    return () => clearInterval(iv)
  }, [refresh])

  // Group by rough region (10° grid)
  const regionMap = new Map<string, { count: number; avgFrp: number; maxFrp: number; lat: number; lon: number }>()
  hotspots.forEach(h => {
    const key = `${Math.round(h.latitude / 5) * 5},${Math.round(h.longitude / 5) * 5}`
    const existing = regionMap.get(key)
    if (existing) {
      existing.count++
      existing.avgFrp = (existing.avgFrp * (existing.count - 1) + h.frp) / existing.count
      existing.maxFrp = Math.max(existing.maxFrp, h.frp)
    } else {
      regionMap.set(key, { count: 1, avgFrp: h.frp, maxFrp: h.frp, lat: h.latitude, lon: h.longitude })
    }
  })

  const regions = Array.from(regionMap.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30)

  const latToRegion = (lat: number, lon: number): string => {
    if (lat > 50) {
      if (lon < -30) return 'N. America'
      if (lon < 60) return 'Europe'
      return 'N. Asia'
    }
    if (lat > 20) {
      if (lon < -30) return 'C. America'
      if (lon < 60) return 'Middle East'
      return 'S. Asia'
    }
    if (lat > -10) {
      if (lon < -30) return 'S. America'
      if (lon < 60) return 'Africa'
      return 'SE Asia'
    }
    if (lon < -30) return 'S. America'
    if (lon < 60) return 'S. Africa'
    return 'Oceania'
  }

  return (
    <div className="h-full flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-samurai-steel font-mono">
          {hotspots.length.toLocaleString()} HOTSPOTS · 24H
        </span>
        <button
          onClick={() => { setLoading(true); refresh() }}
          disabled={loading}
          className="p-1 rounded hover:bg-samurai-grey-dark transition-colors"
        >
          <RefreshCw className={`w-3 h-3 text-samurai-steel ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-2 text-[8px] font-mono">
        <span className="text-orange-400">{hotspots.filter(h => h.frp > 50).length} HIGH</span>
        <span className="text-yellow-400">{hotspots.filter(h => h.frp > 10 && h.frp <= 50).length} MED</span>
        <span className="text-samurai-steel">{hotspots.filter(h => h.frp <= 10).length} LOW</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
        {loading && hotspots.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[10px] text-samurai-steel animate-pulse font-mono">Scanning thermal data...</span>
          </div>
        ) : regions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Satellite className="w-6 h-6 text-orange-500/20" />
            <p className="text-[10px] text-samurai-steel">No hotspots detected</p>
          </div>
        ) : (
          regions.map(r => {
            const intensity = Math.min(r.maxFrp / 100, 1)
            const region = latToRegion(r.lat, r.lon)
            return (
              <div key={r.key} className="bg-samurai-black rounded-md border border-samurai-grey-dark/30 px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Flame className="w-3 h-3 flex-shrink-0" style={{ color: `rgb(${Math.round(200 + intensity * 55)}, ${Math.round(100 - intensity * 60)}, 0)` }} />
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-white font-mono">{region}</div>
                      <div className="text-[8px] text-samurai-steel font-mono">
                        {r.lat.toFixed(1)}°, {r.lon.toFixed(1)}°
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[10px] font-mono font-bold text-orange-400">{r.count}</div>
                    <div className="text-[8px] font-mono text-samurai-steel">FRP {r.maxFrp.toFixed(0)}</div>
                  </div>
                </div>
                {/* Intensity bar */}
                <div className="mt-1 h-1 bg-samurai-grey-dark/30 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(r.count / 20 * 100, 100)}%`,
                      background: `linear-gradient(90deg, #f97316, #ef4444)`,
                    }}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="text-[7px] text-samurai-steel/40 text-center font-mono">
        NASA FIRMS · VIIRS · High-confidence only
      </div>
    </div>
  )
}
