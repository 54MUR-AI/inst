import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Aircraft, ConflictEvent, Hotspot, CyberEvent, Vessel, AircraftTrack } from '../../lib/conflictApi'

// Approximate country centroids for cyber event map markers
const COUNTRY_COORDS: Record<string, [number, number]> = {
  'United States': [-98, 38], 'United Kingdom': [-1.5, 53], 'China': [104, 35],
  'Russia': [60, 60], 'India': [78, 22], 'Germany': [10, 51], 'France': [2, 47],
  'Japan': [138, 36], 'South Korea': [128, 36], 'North Korea': [127, 40],
  'Iran': [53, 32], 'Israel': [35, 31], 'Ukraine': [32, 49], 'Brazil': [-51, -10],
  'Australia': [134, -25], 'Canada': [-106, 56], 'Turkey': [35, 39],
  'Saudi Arabia': [45, 24], 'Pakistan': [69, 30], 'Taiwan': [121, 24],
  'Netherlands': [5, 52], 'Singapore': [104, 1.3], 'Italy': [12, 42],
  'Spain': [-4, 40], 'Poland': [20, 52], 'Mexico': [-102, 23],
  'Indonesia': [118, -2], 'Nigeria': [8, 10], 'South Africa': [25, -29],
  'Egypt': [30, 27], 'Sweden': [15, 62], 'Switzerland': [8, 47],
  'Norway': [10, 62], 'Finland': [26, 64], 'Romania': [25, 46],
  'Czech Republic': [15, 50], 'Vietnam': [108, 16], 'Thailand': [101, 15],
  'Philippines': [122, 13], 'Malaysia': [110, 4], 'Colombia': [-74, 4],
  'Argentina': [-64, -34], 'Chile': [-71, -35], 'Kenya': [38, 0],
  'Ethiopia': [40, 9], 'Bangladesh': [90, 24], 'Myanmar': [96, 20],
}

function countryToCoords(country: string): [number, number] | null {
  if (!country) return null
  // Try exact match first
  if (COUNTRY_COORDS[country]) return COUNTRY_COORDS[country]
  // Try partial match
  const lower = country.toLowerCase()
  for (const [k, v] of Object.entries(COUNTRY_COORDS)) {
    if (k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase())) return v
  }
  return null
}

const CYBER_CATEGORY_COLORS: Record<string, string> = {
  ransomware: '#a855f7',
  apt: '#9333ea',
  ddos: '#7c3aed',
  breach: '#c084fc',
  vulnerability: '#8b5cf6',
  cyber: '#a78bfa',
}

interface ConflictMapProps {
  aircraft: Aircraft[]
  events: ConflictEvent[]
  hotspots: Hotspot[]
  cyberEvents?: CyberEvent[]
  vessels?: Vessel[]
  activeTrack?: AircraftTrack | null
  layers: {
    aircraft: boolean
    events: boolean
    hotspots: boolean
    cyber?: boolean
    vessels?: boolean
  }
  onBoundsChange?: (bounds: { lamin: number; lomin: number; lamax: number; lomax: number }) => void
  onLayerToggle?: (key: string) => void
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

export default function ConflictMap({ aircraft, events, hotspots, cyberEvents = [], vessels = [], activeTrack, layers, onBoundsChange, onLayerToggle }: ConflictMapProps) {
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

  // Draw aircraft track polyline
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const SOURCE_ID = 'aircraft-track'
    const LAYER_ID = 'aircraft-track-line'
    const DOT_LAYER_ID = 'aircraft-track-dots'

    // Remove existing track layers/source
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID)
    if (map.getLayer(DOT_LAYER_ID)) map.removeLayer(DOT_LAYER_ID)
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)

    if (!activeTrack || activeTrack.path.length < 2) return

    const coords = activeTrack.path
      .filter(wp => wp.latitude != null && wp.longitude != null)
      .map(wp => [wp.longitude!, wp.latitude!] as [number, number])

    if (coords.length < 2) return

    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: coords },
      },
    })

    map.addLayer({
      id: LAYER_ID,
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': '#00bcd4',
        'line-width': 2.5,
        'line-opacity': 0.7,
        'line-dasharray': [2, 1],
      },
    })

    // Add dots at waypoints
    map.addSource(SOURCE_ID + '-pts', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: coords.map(c => ({
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'Point' as const, coordinates: c },
        })),
      },
    })

    map.addLayer({
      id: DOT_LAYER_ID,
      type: 'circle',
      source: SOURCE_ID + '-pts',
      paint: {
        'circle-radius': 3,
        'circle-color': '#00bcd4',
        'circle-opacity': 0.5,
      },
    })

    // Fit map to track bounds
    const lngs = coords.map(c => c[0])
    const lats = coords.map(c => c[1])
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 60, maxZoom: 10, duration: 800 }
    )

    return () => {
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID)
      if (map.getLayer(DOT_LAYER_ID)) map.removeLayer(DOT_LAYER_ID)
      if (map.getSource(SOURCE_ID + '-pts')) map.removeSource(SOURCE_ID + '-pts')
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
    }
  }, [activeTrack, mapReady])

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
        el.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="#00bcd4" stroke="none" style="transform:rotate(${a.trueTrack || 0}deg)"><path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>`
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

    // Cyber event markers
    if (layers.cyber && cyberEvents.length > 0) {
      // Group by country to avoid stacking
      const byCountry = new Map<string, CyberEvent[]>()
      cyberEvents.forEach(ce => {
        const key = ce.sourcecountry || 'Unknown'
        if (!byCountry.has(key)) byCountry.set(key, [])
        byCountry.get(key)!.push(ce)
      })

      byCountry.forEach((evts, country) => {
        const coords = countryToCoords(country)
        if (!coords) return

        // Offset slightly so they don't overlap with conflict events
        const lng = coords[0] + (Math.random() - 0.5) * 2
        const lat = coords[1] + (Math.random() - 0.5) * 2

        const topEvt = evts[0]
        const color = CYBER_CATEGORY_COLORS[topEvt.category] || '#06b6d4'
        const size = Math.min(8 + evts.length * 2, 20)

        const el = document.createElement('div')
        el.className = 'conflict-marker cyber-marker'
        el.innerHTML = `<div style="width:${size}px;height:${size}px;position:relative;"><div style="width:100%;height:100%;background:${color}40;border:1.5px solid ${color};border-radius:2px;transform:rotate(45deg);"></div><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:7px;color:${color};font-weight:bold;">${evts.length}</div></div>`
        el.title = `${evts.length} cyber event${evts.length > 1 ? 's' : ''} — ${country}`

        const popupHtml = evts.slice(0, 5).map(e => {
          const c = CYBER_CATEGORY_COLORS[e.category] || '#06b6d4'
          return `<div style="margin-bottom:3px;"><span style="color:${c};font-weight:bold;">[${e.category.toUpperCase()}]</span> ${e.title.slice(0, 80)}</div>`
        }).join('')

        const popup = new maplibregl.Popup({ offset: 12, closeButton: false, className: 'nsit-popup' })
          .setHTML(`
            <div style="font-family:monospace;font-size:9px;color:#fff;background:#1a1a1a;padding:6px 8px;border:1px solid #333;border-radius:4px;max-width:300px;">
              <div style="font-weight:bold;color:#06b6d4;margin-bottom:4px;">CYBER — ${country} (${evts.length})</div>
              ${popupHtml}
              ${evts.length > 5 ? `<div style="color:#666;">+${evts.length - 5} more</div>` : ''}
            </div>
          `)

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(mapRef.current!)
        newMarkers.push(marker)
      })
    }

    // Vessel markers
    if (layers.vessels && vessels.length > 0) {
      const VESSEL_TYPE_COLORS: Record<string, string> = {
        'Military Ops': '#ef4444', 'Law Enforcement': '#f97316', 'SAR': '#eab308',
        'Tanker': '#8b5cf6', 'Cargo': '#06b6d4', 'Passenger': '#22c55e',
        'Fishing': '#64748b', 'Tug': '#a78bfa',
      }

      vessels.forEach(v => {
        if (!v.latitude || !v.longitude) return
        const color = VESSEL_TYPE_COLORS[v.shipTypeName] || '#0ea5e9'
        const isMoving = v.sog > 0.5
        const size = isMoving ? 10 : 7

        const el = document.createElement('div')
        el.className = 'conflict-marker vessel-marker'
        // Ship-shaped SVG marker rotated to heading
        el.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" stroke="${color}" stroke-width="1.5" style="transform:rotate(${v.heading || 0}deg);opacity:${isMoving ? 0.9 : 0.5}"><path d="M12 2L8 12H4L8 22H16L20 12H16L12 2Z"/></svg>`
        el.title = `${v.flag} ${v.name} · ${v.shipTypeName} · ${v.sog > 0 ? v.sog.toFixed(1) + ' kts' : 'Stationary'}`

        const popup = new maplibregl.Popup({ offset: 10, closeButton: false, className: 'nsit-popup' })
          .setHTML(`
            <div style="font-family:monospace;font-size:10px;color:#fff;background:#1a1a1a;padding:6px 8px;border:1px solid #333;border-radius:4px;max-width:220px;">
              <div style="font-weight:bold;color:${color};">${v.flag} ${v.name}</div>
              <div style="color:#888;">${v.shipTypeName}</div>
              <div>Speed: ${v.sog > 0 ? v.sog.toFixed(1) + ' kts' : 'Stationary'}</div>
              <div>Heading: ${v.heading >= 0 ? Math.round(v.heading) + '°' : '—'}</div>
              <div>Status: ${v.navStatusName}</div>
              ${v.destination ? `<div>Dest: ${v.destination}</div>` : ''}
              ${v.callSign ? `<div style="color:#666;">Call: ${v.callSign}</div>` : ''}
              <div style="color:#666;">MMSI: ${v.mmsi}</div>
            </div>
          `)

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([v.longitude, v.latitude])
          .setPopup(popup)
          .addTo(mapRef.current!)
        newMarkers.push(marker)
      })
    }

    markersRef.current = newMarkers
  }, [aircraft, events, hotspots, cyberEvents, vessels, layers, mapReady, clearMarkers])

  const LAYER_DEFS = [
    { key: 'events', label: 'Events', color: '#e63946' },
    { key: 'hotspots', label: 'Hotspots', color: '#f97316' },
    { key: 'cyber', label: 'Cyber', color: '#8b5cf6' },
    { key: 'aircraft', label: 'Aircraft', color: '#00bcd4' },
    { key: 'vessels', label: 'Ships', color: '#0ea5e9' },
  ]

  return (
    <div className="relative w-full h-full rounded-md overflow-hidden" style={{ minHeight: 300 }}>
      <div ref={containerRef} className="w-full h-full" />
      {onLayerToggle && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm rounded-full px-3 py-1.5 border border-white/10">
          {LAYER_DEFS.map(l => (
            <button
              key={l.key}
              onClick={() => onLayerToggle(l.key)}
              className={`text-[8px] font-mono px-2 py-0.5 rounded-full border transition-all ${
                (layers as any)[l.key]
                  ? 'border-current bg-current/10'
                  : 'border-white/10 opacity-30'
              }`}
              style={{ color: l.color }}
            >
              {l.label} {(layers as any)[l.key] ? '●' : '○'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
