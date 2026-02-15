/**
 * Central registry of all NSIT dashboard widgets.
 * Used by App.tsx for rendering and SettingsPanel for visibility toggles.
 */

export type WidgetTab = 'economy' | 'conflict' | 'logistics'

export interface WidgetDef {
  id: string
  label: string
  icon: string
  tab: WidgetTab
  defaultVisible: boolean
}

export const WIDGETS: WidgetDef[] = [
  // ── Economy ──
  { id: 'global-equities', label: 'Global Indices', icon: 'trending-up', tab: 'economy', defaultVisible: true },
  { id: 'commodities', label: 'Commodities & Metals', icon: 'gem', tab: 'economy', defaultVisible: true },
  { id: 'forex-bonds', label: 'Forex & Bonds', icon: 'dollar', tab: 'economy', defaultVisible: true },
  { id: 'market-overview', label: 'Crypto Overview', icon: 'trending-up', tab: 'economy', defaultVisible: true },
  { id: 'fear-greed', label: 'Fear & Greed', icon: 'gauge', tab: 'economy', defaultVisible: true },
  { id: 'ai-briefing', label: 'AI Briefing', icon: 'brain', tab: 'economy', defaultVisible: true },
  { id: 'news', label: 'Breaking News', icon: 'newspaper', tab: 'economy', defaultVisible: true },
  { id: 'polymarket', label: 'Prediction Markets', icon: 'target', tab: 'economy', defaultVisible: true },
  { id: 'macro', label: 'Macro Dashboard', icon: 'chart', tab: 'economy', defaultVisible: true },
  { id: 'econ-calendar', label: 'Economic Calendar', icon: 'calendar', tab: 'economy', defaultVisible: true },
  { id: 'top-movers', label: 'Top Movers', icon: 'flame', tab: 'economy', defaultVisible: true },
  { id: 'ai-predictions', label: 'AI Predictions', icon: 'crosshair', tab: 'economy', defaultVisible: true },
  { id: 'candlestick', label: 'Charts', icon: 'candlestick', tab: 'economy', defaultVisible: true },
  { id: 'crypto-heatmap', label: 'Crypto Heatmap', icon: 'grid', tab: 'economy', defaultVisible: true },
  { id: 'watchlist', label: 'Watchlist', icon: 'star', tab: 'economy', defaultVisible: true },
  { id: 'price-alerts', label: 'Price Alerts', icon: 'bell', tab: 'economy', defaultVisible: true },
  { id: 'sector-performance', label: 'Sector Performance', icon: 'layers', tab: 'economy', defaultVisible: true },
  { id: 'currency-strength', label: 'Currency Strength', icon: 'banknote', tab: 'economy', defaultVisible: true },
  { id: 'portfolio', label: 'Portfolio Tracker', icon: 'pie-chart', tab: 'economy', defaultVisible: true },
  { id: 'market-sessions', label: 'Market Sessions', icon: 'clock', tab: 'economy', defaultVisible: true },
  // ── Conflict ──
  { id: 'conflict-map', label: 'Global Conflict Map', icon: 'globe', tab: 'conflict', defaultVisible: true },
  { id: 'threat-assessment', label: 'Threat Assessment', icon: 'shield', tab: 'conflict', defaultVisible: true },
  { id: 'aircraft-tracker', label: 'Aircraft Tracker', icon: 'plane', tab: 'conflict', defaultVisible: true },
  { id: 'vessel-tracker', label: 'Vessel Tracker', icon: 'ship', tab: 'conflict', defaultVisible: true },
  { id: 'conflict-events', label: 'Conflict Events', icon: 'crosshair', tab: 'conflict', defaultVisible: true },
  { id: 'conflict-news', label: 'Conflict Intel', icon: 'newspaper', tab: 'conflict', defaultVisible: true },
  { id: 'cyber-threats', label: 'Cyber Threats', icon: 'shield', tab: 'conflict', defaultVisible: true },
  { id: 'hotspot-detection', label: 'Hotspot Detection', icon: 'flame', tab: 'conflict', defaultVisible: true },
  { id: 'defense-stocks', label: 'Defense Sector', icon: 'shield', tab: 'conflict', defaultVisible: true },
  { id: 'nuclear-threat', label: 'Nuclear Threat Level', icon: 'alert-triangle', tab: 'conflict', defaultVisible: true },
  { id: 'airbase-monitor', label: 'Airbase Monitor', icon: 'tower-control', tab: 'conflict', defaultVisible: true },
  { id: 'gis-overlays', label: 'GIS Overlays', icon: 'layers', tab: 'conflict', defaultVisible: true },
  // ── Logistics ──
  { id: 'chokepoint-map', label: 'Shipping Chokepoints', icon: 'globe', tab: 'logistics', defaultVisible: true },
  { id: 'chokepoint-monitor', label: 'Chokepoint Status', icon: 'alert-triangle', tab: 'logistics', defaultVisible: true },
  { id: 'supply-chain-news', label: 'Supply Chain Intel', icon: 'newspaper', tab: 'logistics', defaultVisible: true },
  { id: 'shipping-stocks', label: 'Shipping & Logistics', icon: 'ship', tab: 'logistics', defaultVisible: true },
  { id: 'semiconductor-tracker', label: 'Semiconductor Supply', icon: 'cpu', tab: 'logistics', defaultVisible: true },
  { id: 'food-energy', label: 'Food & Energy Security', icon: 'wheat', tab: 'logistics', defaultVisible: true },
]

// Device class based on screen width — gives different storage per device type
function getDeviceClass(): string {
  const w = typeof window !== 'undefined' ? window.screen.width : 1920
  if (w <= 768) return 'mobile'
  if (w <= 1200) return 'tablet'
  return 'desktop'
}

function layoutKey() { return `nsit-layouts-${getDeviceClass()}` }
function visibilityKey() { return `nsit-widget-visibility-${getDeviceClass()}` }

// ── Layout persistence ──

export function loadSavedLayouts(): Record<string, any[]> | null {
  try {
    const raw = localStorage.getItem(layoutKey())
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Basic validation: must have at least one breakpoint with an array
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.lg || parsed.md || parsed.sm)) {
      return parsed
    }
  } catch { /* corrupt data */ }
  return null
}

export function saveLayouts(layouts: Record<string, any[]>) {
  try {
    localStorage.setItem(layoutKey(), JSON.stringify(layouts))
  } catch { /* quota exceeded */ }
}

export function clearSavedLayouts() {
  localStorage.removeItem(layoutKey())
}

// ── Widget visibility ──

export function loadVisibility(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(visibilityKey())
    if (raw) return JSON.parse(raw)
  } catch { /* corrupt */ }
  // Default: all visible
  const defaults: Record<string, boolean> = {}
  WIDGETS.forEach(w => { defaults[w.id] = w.defaultVisible })
  return defaults
}

export function saveVisibility(vis: Record<string, boolean>) {
  try {
    localStorage.setItem(visibilityKey(), JSON.stringify(vis))
  } catch { /* quota exceeded */ }
}
