import { useState, useRef } from 'react'
import { Layers, Upload, Eye, EyeOff, Trash2, MapPin } from 'lucide-react'

export interface GisLayer {
  id: string
  name: string
  type: 'geojson' | 'kml'
  data: any
  visible: boolean
  color: string
}

interface GisOverlayManagerProps {
  layers: GisLayer[]
  onLayersChange: (layers: GisLayer[]) => void
}

const LAYER_COLORS = ['#e63946', '#00bcd4', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316']

function parseKML(text: string): any {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/xml')
    const placemarks = doc.querySelectorAll('Placemark')
    const features: any[] = []

    placemarks.forEach(pm => {
      const name = pm.querySelector('name')?.textContent || 'Unnamed'
      const desc = pm.querySelector('description')?.textContent || ''

      // Point
      const point = pm.querySelector('Point coordinates')
      if (point) {
        const [lon, lat] = (point.textContent || '').trim().split(',').map(Number)
        if (!isNaN(lon) && !isNaN(lat)) {
          features.push({
            type: 'Feature',
            properties: { name, description: desc },
            geometry: { type: 'Point', coordinates: [lon, lat] },
          })
        }
      }

      // LineString
      const line = pm.querySelector('LineString coordinates')
      if (line) {
        const coords = (line.textContent || '').trim().split(/\s+/).map(c => {
          const [lon, lat] = c.split(',').map(Number)
          return [lon, lat]
        }).filter(c => !isNaN(c[0]) && !isNaN(c[1]))
        if (coords.length > 1) {
          features.push({
            type: 'Feature',
            properties: { name, description: desc },
            geometry: { type: 'LineString', coordinates: coords },
          })
        }
      }

      // Polygon
      const poly = pm.querySelector('Polygon outerBoundaryIs LinearRing coordinates')
      if (poly) {
        const coords = (poly.textContent || '').trim().split(/\s+/).map(c => {
          const [lon, lat] = c.split(',').map(Number)
          return [lon, lat]
        }).filter(c => !isNaN(c[0]) && !isNaN(c[1]))
        if (coords.length > 2) {
          features.push({
            type: 'Feature',
            properties: { name, description: desc },
            geometry: { type: 'Polygon', coordinates: [coords] },
          })
        }
      }
    })

    return { type: 'FeatureCollection', features }
  } catch {
    return null
  }
}

export default function GisOverlayManager({ layers, onLayersChange }: GisOverlayManagerProps) {
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    const text = await file.text()
    const name = file.name.replace(/\.(geojson|kml|json)$/i, '')
    let data: any = null
    let type: 'geojson' | 'kml' = 'geojson'

    if (file.name.endsWith('.kml')) {
      data = parseKML(text)
      type = 'kml'
    } else {
      try { data = JSON.parse(text) } catch { /* invalid */ }
    }

    if (!data) {
      alert('Could not parse file. Supported formats: GeoJSON, KML')
      return
    }

    const newLayer: GisLayer = {
      id: `gis-${Date.now()}`,
      name,
      type,
      data,
      visible: true,
      color: LAYER_COLORS[layers.length % LAYER_COLORS.length],
    }

    onLayersChange([...layers, newLayer])
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const toggleVisibility = (id: string) => {
    onLayersChange(layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l))
  }

  const removeLayer = (id: string) => {
    onLayersChange(layers.filter(l => l.id !== id))
  }

  const featureCount = (layer: GisLayer): number => {
    if (layer.data?.features) return layer.data.features.length
    return 0
  }

  return (
    <div className="h-full flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-samurai-steel font-mono">
          {layers.length} LAYERS · {layers.filter(l => l.visible).length} VISIBLE
        </span>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`flex items-center justify-center gap-2 p-3 rounded-md border-2 border-dashed cursor-pointer transition-colors ${
          dragOver
            ? 'border-samurai-red bg-samurai-red/10'
            : 'border-samurai-grey-dark/50 hover:border-samurai-grey-dark'
        }`}
      >
        <Upload className="w-4 h-4 text-samurai-steel" />
        <span className="text-[9px] text-samurai-steel font-mono">
          Drop GeoJSON / KML or click to upload
        </span>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".geojson,.json,.kml"
        onChange={handleFileInput}
        className="hidden"
      />

      {/* Layer list */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
        {layers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Layers className="w-6 h-6 text-samurai-red/20" />
            <p className="text-[10px] text-samurai-steel">No overlays loaded</p>
            <p className="text-[8px] text-samurai-steel/50">Import GeoJSON or KML files</p>
          </div>
        ) : (
          layers.map(layer => (
            <div key={layer.id} className="bg-samurai-black rounded-md border border-samurai-grey-dark/30 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: layer.color }} />
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-white font-mono truncate">{layer.name}</div>
                    <div className="text-[8px] text-samurai-steel font-mono">
                      {layer.type.toUpperCase()} · {featureCount(layer)} features
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => toggleVisibility(layer.id)}
                    className="p-0.5 text-samurai-steel hover:text-white transition-colors"
                    title={layer.visible ? 'Hide' : 'Show'}
                  >
                    {layer.visible
                      ? <Eye className="w-3 h-3" />
                      : <EyeOff className="w-3 h-3 opacity-50" />
                    }
                  </button>
                  <button
                    onClick={() => removeLayer(layer.id)}
                    className="p-0.5 text-samurai-steel/30 hover:text-red-400 transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="text-[7px] text-samurai-steel/40 text-center font-mono flex items-center justify-center gap-1">
        <MapPin className="w-2.5 h-2.5" />
        Supports GeoJSON & KML overlays
      </div>
    </div>
  )
}
