import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { CHOKEPOINTS } from '../../lib/logisticsApi'

const STATUS_COLORS: Record<string, string> = {
  normal: '#22c55e',
  disrupted: '#f97316',
  critical: '#ef4444',
}

const DARK_STYLE = {
  version: 8 as const,
  name: 'NSIT Dark',
  sources: {
    'carto-dark': {
      type: 'raster' as const,
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    },
  },
  layers: [
    {
      id: 'carto-dark-layer',
      type: 'raster' as const,
      source: 'carto-dark',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
}

export default function ChokepointMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE as any,
      center: [50, 20],
      zoom: 2,
      minZoom: 1.5,
      maxZoom: 10,
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true }), 'top-right')

    map.on('load', () => setMapReady(true))
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Add chokepoint markers
  useEffect(() => {
    if (!mapRef.current || !mapReady) return

    CHOKEPOINTS.forEach(cp => {
      const color = STATUS_COLORS[cp.status] || '#6b7280'
      const size = cp.status === 'critical' ? 20 : cp.status === 'disrupted' ? 16 : 12

      const el = document.createElement('div')
      el.style.cssText = `width:${size}px;height:${size}px;position:relative;cursor:pointer;`

      // Pulsing ring for disrupted/critical
      if (cp.status !== 'normal') {
        el.innerHTML = `
          <div style="position:absolute;inset:0;border-radius:50%;border:2px solid ${color};animation:pulse 2s infinite;opacity:0.6;"></div>
          <div style="position:absolute;inset:3px;background:${color};border-radius:50%;"></div>
        `
      } else {
        el.innerHTML = `<div style="width:100%;height:100%;background:${color}80;border:1.5px solid ${color};border-radius:50%;"></div>`
      }

      const popup = new maplibregl.Popup({ offset: 14, closeButton: false, className: 'nsit-popup' })
        .setHTML(`
          <div style="font-family:monospace;font-size:10px;color:#fff;background:#1a1a1a;padding:8px 10px;border:1px solid #333;border-radius:4px;max-width:260px;">
            <div style="font-weight:bold;color:${color};font-size:11px;">${cp.name}</div>
            <div style="margin-top:4px;color:#ccc;">${cp.description}</div>
            <div style="margin-top:4px;display:flex;gap:12px;">
              <span style="color:#888;">${cp.dailyTraffic}</span>
              <span style="color:#06b6d4;">${cp.percentGlobalTrade}% global trade</span>
            </div>
          </div>
        `)

      new maplibregl.Marker({ element: el })
        .setLngLat([cp.lng, cp.lat])
        .setPopup(popup)
        .addTo(mapRef.current!)
    })
  }, [mapReady])

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full rounded-md overflow-hidden" style={{ minHeight: 250 }} />
      {/* Legend */}
      <div className="absolute bottom-2 left-2 bg-samurai-black/80 backdrop-blur-sm rounded px-2 py-1 flex items-center gap-3 text-[8px] font-mono">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Normal</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> Disrupted</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Critical</span>
      </div>
    </div>
  )
}
