import { useState, useCallback } from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout'
import type { Layouts, Layout } from 'react-grid-layout'
import WidgetPanel from '../WidgetPanel'
import ChokepointMap from './ChokepointMap'
import ChokepointMonitor from './ChokepointMonitor'
import SupplyChainNewsFeed from './SupplyChainNewsFeed'
import ShippingStocks from './ShippingStocks'
import SemiconductorTracker from './SemiconductorTracker'
import FoodEnergyIndex from './FoodEnergyIndex'

const ResponsiveGridLayout = WidthProvider(Responsive)

const LOGISTICS_LAYOUTS: Layouts = {
  lg: [
    { i: 'chokepoint-map', x: 0, y: 0, w: 8, h: 7, minW: 6, minH: 5 },
    { i: 'chokepoint-monitor', x: 8, y: 0, w: 4, h: 7, minW: 3, minH: 5 },
    { i: 'supply-chain-news', x: 0, y: 7, w: 4, h: 7, minW: 3, minH: 5 },
    { i: 'shipping-stocks', x: 4, y: 7, w: 4, h: 7, minW: 3, minH: 5 },
    { i: 'semiconductor-tracker', x: 8, y: 7, w: 4, h: 7, minW: 3, minH: 5 },
    { i: 'food-energy', x: 0, y: 14, w: 4, h: 7, minW: 3, minH: 5 },
  ],
  md: [
    { i: 'chokepoint-map', x: 0, y: 0, w: 8, h: 6, minW: 5, minH: 5 },
    { i: 'chokepoint-monitor', x: 0, y: 6, w: 4, h: 6, minW: 3, minH: 5 },
    { i: 'supply-chain-news', x: 4, y: 6, w: 4, h: 6, minW: 3, minH: 5 },
    { i: 'shipping-stocks', x: 0, y: 12, w: 4, h: 6, minW: 3, minH: 5 },
    { i: 'semiconductor-tracker', x: 4, y: 12, w: 4, h: 6, minW: 3, minH: 5 },
    { i: 'food-energy', x: 0, y: 18, w: 4, h: 6, minW: 3, minH: 5 },
  ],
  sm: [
    { i: 'chokepoint-map', x: 0, y: 0, w: 6, h: 5, minW: 4, minH: 4 },
    { i: 'chokepoint-monitor', x: 0, y: 5, w: 6, h: 6, minW: 3, minH: 5 },
    { i: 'supply-chain-news', x: 0, y: 11, w: 6, h: 6, minW: 3, minH: 5 },
    { i: 'shipping-stocks', x: 0, y: 17, w: 6, h: 6, minW: 3, minH: 5 },
    { i: 'semiconductor-tracker', x: 0, y: 23, w: 6, h: 6, minW: 3, minH: 5 },
    { i: 'food-energy', x: 0, y: 29, w: 6, h: 6, minW: 3, minH: 5 },
  ],
}

const LAYOUT_STORAGE_KEY = 'nsit-logistics-layouts'
const LAYOUT_VERSION = 1

function loadLogisticsLayouts(): Layouts | null {
  try {
    const ver = localStorage.getItem(LAYOUT_STORAGE_KEY + '-ver')
    if (ver !== String(LAYOUT_VERSION)) return null
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* corrupt */ }
  return null
}

function saveLogisticsLayouts(layouts: Layouts) {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layouts))
    localStorage.setItem(LAYOUT_STORAGE_KEY + '-ver', String(LAYOUT_VERSION))
  } catch { /* quota */ }
}

export default function LogisticsDashboard() {
  const [layouts, setLayouts] = useState<Layouts>(() => loadLogisticsLayouts() || LOGISTICS_LAYOUTS)

  const handleLayoutChange = useCallback((_layout: Layout[], allLayouts: Layouts) => {
    setLayouts(allLayouts)
    saveLogisticsLayouts(allLayouts)
  }, [])

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-4">
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
        <div key="chokepoint-map">
          <WidgetPanel title="Global Shipping Chokepoints" icon="globe" live>
            <ChokepointMap />
          </WidgetPanel>
        </div>
        <div key="chokepoint-monitor">
          <WidgetPanel title="Chokepoint Status" icon="alert-triangle" live>
            <ChokepointMonitor />
          </WidgetPanel>
        </div>
        <div key="supply-chain-news">
          <WidgetPanel title="Supply Chain Intel" icon="newspaper" live>
            <SupplyChainNewsFeed />
          </WidgetPanel>
        </div>
        <div key="shipping-stocks">
          <WidgetPanel title="Shipping & Logistics" icon="ship" live>
            <ShippingStocks />
          </WidgetPanel>
        </div>
        <div key="semiconductor-tracker">
          <WidgetPanel title="Semiconductor Supply" icon="cpu" live>
            <SemiconductorTracker />
          </WidgetPanel>
        </div>
        <div key="food-energy">
          <WidgetPanel title="Food & Energy Security" icon="wheat" live>
            <FoodEnergyIndex />
          </WidgetPanel>
        </div>
      </ResponsiveGridLayout>
    </div>
  )
}
