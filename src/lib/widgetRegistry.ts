/**
 * Central registry of all NSIT dashboard widgets.
 * Used by App.tsx for rendering and SettingsPanel for visibility toggles.
 */

export interface WidgetDef {
  id: string
  label: string
  icon: string
  defaultVisible: boolean
}

export const WIDGETS: WidgetDef[] = [
  { id: 'global-equities', label: 'Global Indices', icon: 'trending-up', defaultVisible: true },
  { id: 'commodities', label: 'Commodities & Metals', icon: 'gem', defaultVisible: true },
  { id: 'forex-bonds', label: 'Forex & Bonds', icon: 'dollar', defaultVisible: true },
  { id: 'market-overview', label: 'Crypto Overview', icon: 'trending-up', defaultVisible: true },
  { id: 'fear-greed', label: 'Fear & Greed', icon: 'gauge', defaultVisible: true },
  { id: 'ai-briefing', label: 'AI Briefing', icon: 'brain', defaultVisible: true },
  { id: 'news', label: 'Breaking News', icon: 'newspaper', defaultVisible: true },
  { id: 'polymarket', label: 'Prediction Markets', icon: 'target', defaultVisible: true },
  { id: 'macro', label: 'Macro Dashboard', icon: 'chart', defaultVisible: true },
  { id: 'econ-calendar', label: 'Economic Calendar', icon: 'calendar', defaultVisible: true },
  { id: 'top-movers', label: 'Top Movers', icon: 'flame', defaultVisible: true },
  { id: 'ai-predictions', label: 'AI Predictions', icon: 'crosshair', defaultVisible: true },
  { id: 'candlestick', label: 'Charts', icon: 'candlestick', defaultVisible: true },
  { id: 'crypto-heatmap', label: 'Crypto Heatmap', icon: 'grid', defaultVisible: true },
]

const STORAGE_LAYOUTS = 'nsit-layouts'
const STORAGE_VISIBILITY = 'nsit-widget-visibility'

// ── Layout persistence ──

export function loadSavedLayouts(): Record<string, any[]> | null {
  try {
    const raw = localStorage.getItem(STORAGE_LAYOUTS)
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
    localStorage.setItem(STORAGE_LAYOUTS, JSON.stringify(layouts))
  } catch { /* quota exceeded */ }
}

export function clearSavedLayouts() {
  localStorage.removeItem(STORAGE_LAYOUTS)
}

// ── Widget visibility ──

export function loadVisibility(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_VISIBILITY)
    if (raw) return JSON.parse(raw)
  } catch { /* corrupt */ }
  // Default: all visible
  const defaults: Record<string, boolean> = {}
  WIDGETS.forEach(w => { defaults[w.id] = w.defaultVisible })
  return defaults
}

export function saveVisibility(vis: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_VISIBILITY, JSON.stringify(vis))
  } catch { /* quota exceeded */ }
}
