import { useState, useEffect, useCallback } from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout'
import type { Layouts, Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import TickerTape from './components/TickerTape'
import FearGreedGauge from './components/FearGreedGauge'
import CryptoHeatmap from './components/CryptoHeatmap'
import WidgetPanel from './components/WidgetPanel'
import MarketOverview from './components/MarketOverview'
import AiBriefing from './components/AiBriefing'
import PolymarketFeed from './components/PolymarketFeed'
import MacroDashboard from './components/MacroDashboard'
import NewsFeed from './components/NewsFeed'
import { Activity, Zap } from 'lucide-react'

const ResponsiveGridLayout = WidthProvider(Responsive)

const DEFAULT_LAYOUTS = {
  lg: [
    { i: 'market-overview', x: 0, y: 0, w: 4, h: 4, minW: 3, minH: 3 },
    { i: 'fear-greed', x: 4, y: 0, w: 2, h: 4, minW: 2, minH: 3 },
    { i: 'ai-briefing', x: 6, y: 0, w: 6, h: 4, minW: 3, minH: 3 },
    { i: 'news', x: 0, y: 4, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'polymarket', x: 4, y: 4, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'macro', x: 8, y: 4, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'crypto-heatmap', x: 0, y: 10, w: 12, h: 5, minW: 4, minH: 4 },
  ],
  md: [
    { i: 'market-overview', x: 0, y: 0, w: 5, h: 4, minW: 3, minH: 3 },
    { i: 'fear-greed', x: 5, y: 0, w: 3, h: 4, minW: 2, minH: 3 },
    { i: 'ai-briefing', x: 0, y: 4, w: 8, h: 4, minW: 3, minH: 3 },
    { i: 'news', x: 0, y: 8, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'polymarket', x: 4, y: 8, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'macro', x: 0, y: 14, w: 8, h: 6, minW: 3, minH: 4 },
    { i: 'crypto-heatmap', x: 0, y: 20, w: 8, h: 5, minW: 4, minH: 4 },
  ],
  sm: [
    { i: 'market-overview', x: 0, y: 0, w: 6, h: 4, minW: 3, minH: 3 },
    { i: 'fear-greed', x: 0, y: 4, w: 6, h: 4, minW: 2, minH: 3 },
    { i: 'ai-briefing', x: 0, y: 8, w: 6, h: 4, minW: 3, minH: 3 },
    { i: 'news', x: 0, y: 12, w: 6, h: 6, minW: 3, minH: 4 },
    { i: 'polymarket', x: 0, y: 18, w: 6, h: 6, minW: 3, minH: 4 },
    { i: 'macro', x: 0, y: 24, w: 6, h: 5, minW: 3, minH: 4 },
    { i: 'crypto-heatmap', x: 0, y: 29, w: 6, h: 5, minW: 3, minH: 4 },
  ],
}

export default function App() {
  const [layouts, setLayouts] = useState<Layouts>(DEFAULT_LAYOUTS)
  const [isLive, setIsLive] = useState(true)

  // Listen for RMG auth messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'RMG_AUTH_TOKEN') {
        // Store auth token for API calls
        try {
          const parsed = JSON.parse(event.data.authToken)
          if (parsed.access_token) {
            sessionStorage.setItem('inst_auth_token', parsed.access_token)
          }
        } catch {
          // ignore parse errors
        }
      }
      if (event.data?.type === 'RMG_TOGGLE_SETTINGS') {
        // TODO: open settings panel
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const handleLayoutChange = useCallback((_layout: Layout[], allLayouts: Layouts) => {
    setLayouts(allLayouts)
    // TODO: persist to Supabase
  }, [])

  return (
    <div className="h-screen flex flex-col bg-samurai-black overflow-hidden">
      {/* Header Bar */}
      <header className="flex-shrink-0 h-10 bg-samurai-black-lighter border-b border-samurai-grey-dark flex items-center px-4 gap-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-samurai-red" />
          <span className="text-sm font-bold text-white tracking-wider">INST</span>
          <span className="text-[10px] text-samurai-steel font-mono hidden sm:inline">Intelligent Navigation & Strategic Telemetry</span>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setIsLive(!isLive)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono transition-all ${
            isLive ? 'text-samurai-green bg-samurai-green/10' : 'text-samurai-steel bg-samurai-grey-dark'
          }`}
        >
          {isLive && <div className="live-dot" style={{ width: 6, height: 6 }} />}
          <Zap className="w-3 h-3" />
          {isLive ? 'LIVE' : 'PAUSED'}
        </button>
      </header>

      {/* Ticker Tape */}
      <TickerTape />

      {/* Main Dashboard Grid */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-4">
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
          <div key="market-overview">
            <WidgetPanel title="Market Overview" icon="trending-up">
              <MarketOverview />
            </WidgetPanel>
          </div>
          <div key="fear-greed">
            <WidgetPanel title="Fear & Greed" icon="gauge">
              <FearGreedGauge />
            </WidgetPanel>
          </div>
          <div key="ai-briefing">
            <WidgetPanel title="AI Briefing" icon="brain" live>
              <AiBriefing />
            </WidgetPanel>
          </div>
          <div key="news">
            <WidgetPanel title="Breaking News" icon="newspaper" live>
              <NewsFeed />
            </WidgetPanel>
          </div>
          <div key="polymarket">
            <WidgetPanel title="Prediction Markets" icon="target" live>
              <PolymarketFeed />
            </WidgetPanel>
          </div>
          <div key="macro">
            <WidgetPanel title="Macro Dashboard" icon="chart">
              <MacroDashboard />
            </WidgetPanel>
          </div>
          <div key="crypto-heatmap">
            <WidgetPanel title="Crypto Heatmap" icon="grid">
              <CryptoHeatmap />
            </WidgetPanel>
          </div>
        </ResponsiveGridLayout>
      </main>
    </div>
  )
}
