import { useState, useEffect, useCallback } from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout'
import type { Layouts, Layout } from 'react-grid-layout'
import WidgetPanel from '../WidgetPanel'
import ConflictMap from './ConflictMap'
import AircraftTracker from './AircraftTracker'
import ConflictEventsFeed from './ConflictEventsFeed'
import ConflictNewsFeed from './ConflictNewsFeed'
import DefenseStocks from './DefenseStocks'
import HotspotDetection from './HotspotDetection'
import GisOverlayManager from './GisOverlayManager'
import ThreatAssessment from './ThreatAssessment'
import NuclearThreatLevel from './NuclearThreatLevel'
import CyberThreatFeed from './CyberThreatFeed'
import type { GisLayer } from './GisOverlayManager'
import type { Aircraft, ConflictEvent, Hotspot, CyberEvent } from '../../lib/conflictApi'
import { fetchMilitaryAircraft, fetchConflictEvents, fetchHotspots, fetchCyberNews } from '../../lib/conflictApi'

const ResponsiveGridLayout = WidthProvider(Responsive)

const CONFLICT_LAYOUTS: Layouts = {
  lg: [
    { i: 'conflict-map', x: 0, y: 0, w: 8, h: 8, minW: 6, minH: 6 },
    { i: 'threat-assessment', x: 8, y: 0, w: 4, h: 8, minW: 3, minH: 5 },
    { i: 'aircraft-tracker', x: 0, y: 8, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'conflict-events', x: 4, y: 8, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'conflict-news', x: 8, y: 8, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'cyber-threats', x: 0, y: 14, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'hotspot-detection', x: 4, y: 14, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'defense-stocks', x: 8, y: 14, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'nuclear-threat', x: 0, y: 20, w: 4, h: 8, minW: 3, minH: 6 },
    { i: 'gis-overlays', x: 4, y: 20, w: 4, h: 6, minW: 3, minH: 4 },
  ],
  md: [
    { i: 'conflict-map', x: 0, y: 0, w: 8, h: 7, minW: 5, minH: 5 },
    { i: 'threat-assessment', x: 0, y: 7, w: 4, h: 6, minW: 3, minH: 5 },
    { i: 'aircraft-tracker', x: 4, y: 7, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'conflict-events', x: 0, y: 13, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'conflict-news', x: 4, y: 13, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'cyber-threats', x: 0, y: 19, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'hotspot-detection', x: 4, y: 19, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'defense-stocks', x: 0, y: 25, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'nuclear-threat', x: 4, y: 25, w: 4, h: 8, minW: 3, minH: 6 },
    { i: 'gis-overlays', x: 0, y: 33, w: 4, h: 6, minW: 3, minH: 4 },
  ],
  sm: [
    { i: 'conflict-map', x: 0, y: 0, w: 6, h: 6, minW: 4, minH: 5 },
    { i: 'threat-assessment', x: 0, y: 6, w: 6, h: 6, minW: 3, minH: 5 },
    { i: 'aircraft-tracker', x: 0, y: 12, w: 6, h: 6, minW: 3, minH: 4 },
    { i: 'conflict-events', x: 0, y: 18, w: 6, h: 6, minW: 3, minH: 4 },
    { i: 'conflict-news', x: 0, y: 24, w: 6, h: 6, minW: 3, minH: 4 },
    { i: 'cyber-threats', x: 0, y: 30, w: 6, h: 6, minW: 3, minH: 4 },
    { i: 'hotspot-detection', x: 0, y: 36, w: 6, h: 6, minW: 3, minH: 4 },
    { i: 'defense-stocks', x: 0, y: 42, w: 6, h: 6, minW: 3, minH: 4 },
    { i: 'nuclear-threat', x: 0, y: 48, w: 6, h: 8, minW: 3, minH: 6 },
    { i: 'gis-overlays', x: 0, y: 56, w: 6, h: 6, minW: 3, minH: 4 },
  ],
}

const LAYOUT_STORAGE_KEY = 'nsit-conflict-layouts'
const LAYOUT_VERSION = 2 // bump when adding/removing widgets to force layout reset

function loadConflictLayouts(): Layouts | null {
  try {
    const ver = localStorage.getItem(LAYOUT_STORAGE_KEY + '-ver')
    if (ver !== String(LAYOUT_VERSION)) return null // version mismatch → use defaults
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* corrupt */ }
  return null
}

function saveConflictLayouts(layouts: Layouts) {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layouts))
    localStorage.setItem(LAYOUT_STORAGE_KEY + '-ver', String(LAYOUT_VERSION))
  } catch { /* quota */ }
}

export default function ConflictDashboard() {
  const [layouts, setLayouts] = useState<Layouts>(() => loadConflictLayouts() || CONFLICT_LAYOUTS)
  const [gisLayers, setGisLayers] = useState<GisLayer[]>([])

  // Shared data for the map
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [events, setEvents] = useState<ConflictEvent[]>([])
  const [hotspots, setHotspots] = useState<Hotspot[]>([])
  const [cyberEvents, setCyberEvents] = useState<CyberEvent[]>([])
  const [mapLayers, setMapLayers] = useState({ aircraft: true, events: true, hotspots: true, cyber: true })

  // Fetch data for the map
  const refreshMapData = useCallback(async () => {
    const [ac, ev, hs, cy] = await Promise.allSettled([
      fetchMilitaryAircraft(),
      fetchConflictEvents({ limit: 200 }),
      fetchHotspots(),
      fetchCyberNews(),
    ])
    if (ac.status === 'fulfilled') setAircraft(ac.value)
    if (ev.status === 'fulfilled') setEvents(ev.value)
    if (hs.status === 'fulfilled') setHotspots(hs.value)
    if (cy.status === 'fulfilled') setCyberEvents(cy.value)
  }, [])

  useEffect(() => {
    refreshMapData()
    const iv = setInterval(refreshMapData, 120_000) // 2 min — caches handle freshness
    return () => clearInterval(iv)
  }, [refreshMapData])

  const handleLayoutChange = useCallback((_layout: Layout[], allLayouts: Layouts) => {
    setLayouts(allLayouts)
    saveConflictLayouts(allLayouts)
  }, [])

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-4">
      {/* Map layer toggles */}
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-[8px] text-samurai-steel font-mono uppercase tracking-wider">MAP LAYERS:</span>
        {([
          { key: 'aircraft' as const, label: 'Aircraft', color: '#00bcd4' },
          { key: 'events' as const, label: 'Events', color: '#e63946' },
          { key: 'hotspots' as const, label: 'Hotspots', color: '#f97316' },
          { key: 'cyber' as const, label: 'Cyber', color: '#8b5cf6' },
        ]).map(l => (
          <button
            key={l.key}
            onClick={() => setMapLayers(prev => ({ ...prev, [l.key]: !prev[l.key] }))}
            className={`text-[8px] font-mono px-2 py-0.5 rounded border transition-colors ${
              mapLayers[l.key]
                ? 'border-current'
                : 'border-samurai-grey-dark/50 opacity-40'
            }`}
            style={{ color: l.color }}
          >
            {l.label} {mapLayers[l.key] ? '●' : '○'}
          </button>
        ))}
      </div>

      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 900, sm: 0 }}
        cols={{ lg: 12, md: 8, sm: 6 }}
        rowHeight={60}
        onLayoutChange={handleLayoutChange}
        draggableHandle=".widget-header"
        compactType="vertical"
        margin={[8, 8]}
      >
        <div key="conflict-map">
          <WidgetPanel title="Global Conflict Map" icon="globe" live>
            <ConflictMap
              aircraft={aircraft}
              events={events}
              hotspots={hotspots}
              cyberEvents={cyberEvents}
              layers={mapLayers}
            />
          </WidgetPanel>
        </div>
        <div key="threat-assessment">
          <WidgetPanel title="Threat Assessment" icon="shield" live>
            <ThreatAssessment />
          </WidgetPanel>
        </div>
        <div key="aircraft-tracker">
          <WidgetPanel title="Aircraft Tracker" icon="plane" live>
            <AircraftTracker />
          </WidgetPanel>
        </div>
        <div key="conflict-events">
          <WidgetPanel title="Conflict Events" icon="crosshair" live>
            <ConflictEventsFeed />
          </WidgetPanel>
        </div>
        <div key="conflict-news">
          <WidgetPanel title="Conflict Intel" icon="newspaper" live>
            <ConflictNewsFeed />
          </WidgetPanel>
        </div>
        <div key="hotspot-detection">
          <WidgetPanel title="Hotspot Detection" icon="flame" live>
            <HotspotDetection />
          </WidgetPanel>
        </div>
        <div key="defense-stocks">
          <WidgetPanel title="Defense Sector" icon="shield" live>
            <DefenseStocks />
          </WidgetPanel>
        </div>
        <div key="nuclear-threat">
          <WidgetPanel title="Nuclear Threat Level" icon="alert-triangle">
            <NuclearThreatLevel />
          </WidgetPanel>
        </div>
        <div key="cyber-threats">
          <WidgetPanel title="Cyber Threats" icon="shield" live>
            <CyberThreatFeed />
          </WidgetPanel>
        </div>
        <div key="gis-overlays">
          <WidgetPanel title="GIS Overlays" icon="layers">
            <GisOverlayManager layers={gisLayers} onLayersChange={setGisLayers} />
          </WidgetPanel>
        </div>
      </ResponsiveGridLayout>
    </div>
  )
}
