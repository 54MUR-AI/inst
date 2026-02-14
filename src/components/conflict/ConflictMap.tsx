import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Aircraft, ConflictEvent, Hotspot } from '../../lib/conflictApi'

interface ConflictMapProps {
  aircraft: Aircraft[]
  events: ConflictEvent[]
  hotspots: Hotspot[]
  layers: {
    aircraft: boolean
    events: boolean
    hotspots: boolean
  }
  onBoundsChange?: (bounds: { lamin: number; lomin: number; lamax: number; lomax: number }) => void
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

export default function ConflictMap({ aircraft, events, hotspots, layers, onBoundsChange }: ConflictMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const [mapReady, setMapReady] = useState(false)

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE as any,
      center: [30, 25],
      zoom: 2.5,
      minZoom: 1.5,
      maxZoom: 16,
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true }), 'top-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')

    map.on('load', () => {
      setMapReady(true)
    })

    map.on('moveend', () => {
      if (onBoundsChange) {
        const b = map.getBounds()
        onBoundsChange({
          lamin: b.getSouth(),
          lomin: b.getWest(),
          lamax: b.getNorth(),
          lomax: b.getEast(),
        })
      }
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Clear all markers
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
  }, [])

  // Update markers when data changes
  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    clearMarkers()
    const newMarkers: maplibregl.Marker[] = []

    // Aircraft markers
    if (layers.aircraft) {
      aircraft.forEach(a => {
        if (a.latitude == null || a.longitude == null) return
        const el = document.createElement('div')
        el.className = 'conflict-marker aircraft-marker'
        el.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00bcd4" stroke-width="2" style="transform:rotate(${a.trueTrack || 0}deg)"><path d="M12 2L8 10H2L6 14L4 22L12 18L20 22L18 14L22 10H16L12 2Z"/></svg>`
        el.title = `${a.callsign || a.icao24} · ${a.originCountry} · ${a.baroAltitude ? Math.round(a.baroAltitude) + 'm' : 'GND'}`

        const popup = new maplibregl.Popup({ offset: 12, closeButton: false, className: 'nsit-popup' })
          .setHTML(`
            <div style="font-family:monospace;font-size:10px;color:#fff;background:#1a1a1a;padding:6px 8px;border:1px solid #333;border-radius:4px;">
              <div style="font-weight:bold;color:#00bcd4;">${a.callsign || a.icao24}</div>
              <div>${a.originCountry}</div>
              <div>Alt: ${a.baroAltitude ? Math.round(a.baroAltitude).toLocaleString() + 'm' : 'GND'}</div>
              <div>Spd: ${a.velocity ? Math.round(a.velocity) + ' m/s' : '—'}</div>
              <div style="color:#666;">ICAO: ${a.icao24}</div>
            </div>
          `)

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([a.longitude, a.latitude])
          .setPopup(popup)
          .addTo(mapRef.current!)
        newMarkers.push(marker)
      })
    }

    // Conflict event markers
    if (layers.events) {
      events.forEach(e => {
        if (isNaN(e.latitude) || isNaN(e.longitude)) return
        const el = document.createElement('div')
        const color = e.fatalities > 0 ? '#ef4444' : e.eventType === 'Protests' ? '#f59e0b' : '#e63946'
        const size = Math.min(6 + e.fatalities * 0.5, 16)
        el.className = 'conflict-marker event-marker'
        el.style.cssText = `width:${size}px;height:${size}px;background:${color};border-radius:50%;border:1px solid rgba(255,255,255,0.3);opacity:0.8;cursor:pointer;`
        el.title = `${e.eventType}: ${e.location}, ${e.country}`

        const popup = new maplibregl.Popup({ offset: 10, closeButton: false, className: 'nsit-popup' })
          .setHTML(`
            <div style="font-family:monospace;font-size:10px;color:#fff;background:#1a1a1a;padding:6px 8px;border:1px solid #333;border-radius:4px;max-width:250px;">
              <div style="font-weight:bold;color:${color};">${e.eventType}</div>
              <div>${e.subEventType}</div>
              <div style="margin-top:3px;">${e.location}, ${e.country}</div>
              <div>${e.eventDate}</div>
              ${e.fatalities > 0 ? `<div style="color:#ef4444;">Fatalities: ${e.fatalities}</div>` : ''}
              <div style="margin-top:3px;color:#888;">${e.actor1}${e.actor2 ? ' vs ' + e.actor2 : ''}</div>
              ${e.notes ? `<div style="margin-top:3px;color:#666;font-size:9px;max-height:60px;overflow:hidden;">${e.notes.slice(0, 200)}</div>` : ''}
            </div>
          `)

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([e.longitude, e.latitude])
          .setPopup(popup)
          .addTo(mapRef.current!)
        newMarkers.push(marker)
      })
    }

    // Hotspot markers
    if (layers.hotspots) {
      hotspots.forEach(h => {
        const el = document.createElement('div')
        const intensity = Math.min(h.frp / 50, 1)
        const size = 4 + intensity * 8
        el.className = 'conflict-marker hotspot-marker'
        el.style.cssText = `width:${size}px;height:${size}px;background:radial-gradient(circle,#ff6b00,#ff000080);border-radius:50%;opacity:${0.4 + intensity * 0.5};cursor:pointer;`
        el.title = `Fire: FRP ${h.frp.toFixed(1)} MW`

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([h.longitude, h.latitude])
          .addTo(mapRef.current!)
        newMarkers.push(marker)
      })
    }

    markersRef.current = newMarkers
  }, [aircraft, events, hotspots, layers, mapReady, clearMarkers])

  return (
    <div ref={containerRef} className="w-full h-full rounded-md overflow-hidden" style={{ minHeight: 300 }} />
  )
}
