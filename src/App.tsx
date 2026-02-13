import { useState, useEffect, useCallback, useMemo } from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout'
import type { Layouts, Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import StockTickerTape from './components/StockTickerTape'
import TickerTape from './components/TickerTape'
import FearGreedGauge from './components/FearGreedGauge'
import CryptoHeatmap from './components/CryptoHeatmap'
import WidgetPanel from './components/WidgetPanel'
import MarketOverview from './components/MarketOverview'
import AiBriefing from './components/AiBriefing'
import AiPredictions from './components/AiPredictions'
import TopMovers from './components/TopMovers'
import PolymarketFeed from './components/PolymarketFeed'
import MacroDashboard from './components/MacroDashboard'
import EconomicCalendar from './components/EconomicCalendar'
import CandlestickChart from './components/CandlestickChart'
import Watchlist from './components/Watchlist'
import PriceAlerts from './components/PriceAlerts'
import SectorPerformance from './components/SectorPerformance'
import CurrencyStrength from './components/CurrencyStrength'
import PortfolioTracker from './components/PortfolioTracker'
import MarketSessions from './components/MarketSessions'
import NewsFeed from './components/NewsFeed'
import GlobalEquities from './components/GlobalEquities'
import CommoditiesMetals from './components/CommoditiesMetals'
import ForexBonds from './components/ForexBonds'
import SettingsPanel from './components/SettingsPanel'
import type { AiSettings } from './components/SettingsPanel'
import { ScanEye, Zap } from 'lucide-react'
import { setAuthToken } from './lib/ldgrBridge'
import { loadSavedLayouts, saveLayouts, loadVisibility, saveVisibility } from './lib/widgetRegistry'

const ResponsiveGridLayout = WidthProvider(Responsive)

const DEFAULT_LAYOUTS = {
  lg: [
    { i: 'global-equities', x: 0, y: 0, w: 4, h: 5, minW: 3, minH: 4 },
    { i: 'commodities', x: 4, y: 0, w: 4, h: 5, minW: 3, minH: 4 },
    { i: 'forex-bonds', x: 8, y: 0, w: 4, h: 5, minW: 3, minH: 4 },
    { i: 'market-overview', x: 0, y: 5, w: 4, h: 4, minW: 3, minH: 3 },
    { i: 'fear-greed', x: 4, y: 5, w: 2, h: 4, minW: 2, minH: 3 },
    { i: 'ai-briefing', x: 6, y: 5, w: 6, h: 4, minW: 3, minH: 3 },
    { i: 'news', x: 0, y: 9, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'polymarket', x: 4, y: 9, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'macro', x: 8, y: 9, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'econ-calendar', x: 0, y: 15, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'top-movers', x: 4, y: 15, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'ai-predictions', x: 8, y: 15, w: 4, h: 7, minW: 4, minH: 5 },
    { i: 'candlestick', x: 0, y: 22, w: 8, h: 7, minW: 4, minH: 5 },
    { i: 'crypto-heatmap', x: 8, y: 22, w: 4, h: 7, minW: 4, minH: 4 },
    { i: 'watchlist', x: 0, y: 29, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'price-alerts', x: 4, y: 29, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'sector-performance', x: 8, y: 29, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'currency-strength', x: 0, y: 35, w: 4, h: 5, minW: 3, minH: 4 },
    { i: 'portfolio', x: 4, y: 35, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'market-sessions', x: 8, y: 35, w: 4, h: 6, minW: 3, minH: 4 },
  ],
  md: [
    { i: 'global-equities', x: 0, y: 0, w: 4, h: 5, minW: 3, minH: 4 },
    { i: 'commodities', x: 4, y: 0, w: 4, h: 5, minW: 3, minH: 4 },
    { i: 'forex-bonds', x: 0, y: 5, w: 4, h: 5, minW: 3, minH: 4 },
    { i: 'market-overview', x: 4, y: 5, w: 4, h: 4, minW: 3, minH: 3 },
    { i: 'fear-greed', x: 0, y: 10, w: 3, h: 4, minW: 2, minH: 3 },
    { i: 'ai-briefing', x: 3, y: 10, w: 5, h: 4, minW: 3, minH: 3 },
    { i: 'news', x: 0, y: 14, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'polymarket', x: 4, y: 14, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'macro', x: 0, y: 20, w: 8, h: 6, minW: 3, minH: 4 },
    { i: 'econ-calendar', x: 0, y: 26, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'top-movers', x: 4, y: 26, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'ai-predictions', x: 0, y: 32, w: 8, h: 7, minW: 4, minH: 5 },
    { i: 'candlestick', x: 0, y: 39, w: 8, h: 7, minW: 4, minH: 5 },
    { i: 'crypto-heatmap', x: 0, y: 46, w: 8, h: 5, minW: 4, minH: 4 },
    { i: 'watchlist', x: 0, y: 51, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'price-alerts', x: 4, y: 51, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'sector-performance', x: 0, y: 57, w: 8, h: 5, minW: 3, minH: 4 },
    { i: 'currency-strength', x: 0, y: 62, w: 4, h: 5, minW: 3, minH: 4 },
    { i: 'portfolio', x: 4, y: 62, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'market-sessions', x: 0, y: 68, w: 8, h: 5, minW: 3, minH: 4 },
  ],
  sm: [
    { i: 'global-equities', x: 0, y: 0, w: 6, h: 5, minW: 3, minH: 4 },
    { i: 'commodities', x: 0, y: 5, w: 6, h: 5, minW: 3, minH: 4 },
    { i: 'forex-bonds', x: 0, y: 10, w: 6, h: 5, minW: 3, minH: 4 },
    { i: 'market-overview', x: 0, y: 15, w: 6, h: 4, minW: 3, minH: 3 },
    { i: 'fear-greed', x: 0, y: 19, w: 6, h: 4, minW: 2, minH: 3 },
    { i: 'ai-briefing', x: 0, y: 23, w: 6, h: 4, minW: 3, minH: 3 },
    { i: 'news', x: 0, y: 27, w: 6, h: 6, minW: 3, minH: 4 },
    { i: 'polymarket', x: 0, y: 33, w: 6, h: 6, minW: 3, minH: 4 },
    { i: 'macro', x: 0, y: 39, w: 6, h: 5, minW: 3, minH: 4 },
    { i: 'econ-calendar', x: 0, y: 44, w: 6, h: 6, minW: 3, minH: 4 },
    { i: 'top-movers', x: 0, y: 50, w: 6, h: 6, minW: 3, minH: 4 },
    { i: 'ai-predictions', x: 0, y: 56, w: 6, h: 7, minW: 3, minH: 5 },
    { i: 'candlestick', x: 0, y: 63, w: 6, h: 7, minW: 3, minH: 5 },
    { i: 'crypto-heatmap', x: 0, y: 70, w: 6, h: 5, minW: 3, minH: 4 },
    { i: 'watchlist', x: 0, y: 75, w: 6, h: 6, minW: 3, minH: 4 },
    { i: 'price-alerts', x: 0, y: 81, w: 6, h: 6, minW: 3, minH: 4 },
    { i: 'sector-performance', x: 0, y: 87, w: 6, h: 5, minW: 3, minH: 4 },
    { i: 'currency-strength', x: 0, y: 92, w: 6, h: 5, minW: 3, minH: 4 },
    { i: 'portfolio', x: 0, y: 97, w: 6, h: 6, minW: 3, minH: 4 },
    { i: 'market-sessions', x: 0, y: 103, w: 6, h: 5, minW: 3, minH: 4 },
  ],
}

export default function App() {
  const [layouts, setLayouts] = useState<Layouts>(() => {
    const saved = loadSavedLayouts()
    return (saved as Layouts) || DEFAULT_LAYOUTS
  })
  const [isLive, setIsLive] = useState(true)
  const [visibility, setVisibility] = useState<Record<string, boolean>>(loadVisibility)
  const [aiSettings, setAiSettings] = useState<AiSettings>({
    provider: localStorage.getItem('nsit-ai-provider') || 'ollama',
    model: localStorage.getItem('nsit-ai-model') || '',
    apiKey: '',
  })

  // Listen for RMG auth messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'RMG_AUTH_TOKEN') {
        // Store auth token and initialize LDGR bridge
        try {
          const parsed = JSON.parse(event.data.authToken)
          if (parsed.access_token) {
            sessionStorage.setItem('nsit_auth_token', parsed.access_token)
          }
        } catch {
          // ignore parse errors
        }
        setAuthToken(event.data.authToken)
      }
      if (event.data?.type === 'RMG_TOGGLE_SETTINGS') {
        // Settings panel listens for this message directly
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const handleLayoutChange = useCallback((_layout: Layout[], allLayouts: Layouts) => {
    setLayouts(allLayouts)
    saveLayouts(allLayouts as Record<string, any[]>)
  }, [])

  const handleVisibilityChange = useCallback((vis: Record<string, boolean>) => {
    setVisibility(vis)
    saveVisibility(vis)
  }, [])

  // Filter layouts to only include visible widgets
  const filteredLayouts = useMemo(() => {
    const result: Record<string, Layout[]> = {}
    for (const [bp, items] of Object.entries(layouts)) {
      result[bp] = (items as Layout[]).filter(item => visibility[item.i] !== false)
    }
    return result as Layouts
  }, [layouts, visibility])

  const isVisible = (id: string) => visibility[id] !== false

  return (
    <div className="h-screen flex flex-col bg-samurai-black overflow-hidden">
      {/* Header Bar */}
      <header className="flex-shrink-0 h-10 bg-samurai-black-lighter border-b border-samurai-grey-dark flex items-center px-4 gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white tracking-wider flex items-center">NS<ScanEye className="w-4 h-4 text-samurai-red inline-block mx-[1px]" />T</span>
          <span className="text-[10px] text-samurai-steel font-mono hidden sm:inline">Networked Speculation Intelligence Tool</span>
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

      {/* Ticker Tapes */}
      <StockTickerTape />
      <TickerTape />

      {/* Main Dashboard Grid */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-4">
        <ResponsiveGridLayout
          className="layout"
          layouts={filteredLayouts}
          breakpoints={{ lg: 1200, md: 900, sm: 0 }}
          cols={{ lg: 12, md: 8, sm: 6 }}
          rowHeight={60}
          onLayoutChange={handleLayoutChange}
          draggableHandle=".widget-header"
          compactType="vertical"
          margin={[8, 8]}
        >
          {isVisible('global-equities') && <div key="global-equities">
            <WidgetPanel title="Global Indices" icon="trending-up" live>
              <GlobalEquities />
            </WidgetPanel>
          </div>}
          {isVisible('commodities') && <div key="commodities">
            <WidgetPanel title="Commodities & Metals" icon="gem" live>
              <CommoditiesMetals />
            </WidgetPanel>
          </div>}
          {isVisible('forex-bonds') && <div key="forex-bonds">
            <WidgetPanel title="Forex & Bonds" icon="dollar" live>
              <ForexBonds />
            </WidgetPanel>
          </div>}
          {isVisible('market-overview') && <div key="market-overview">
            <WidgetPanel title="Crypto Overview" icon="trending-up">
              <MarketOverview />
            </WidgetPanel>
          </div>}
          {isVisible('fear-greed') && <div key="fear-greed">
            <WidgetPanel title="Fear & Greed" icon="gauge">
              <FearGreedGauge />
            </WidgetPanel>
          </div>}
          {isVisible('ai-briefing') && <div key="ai-briefing">
            <WidgetPanel title="AI Briefing" icon="brain" live>
              <AiBriefing selectedModel={aiSettings.model} />
            </WidgetPanel>
          </div>}
          {isVisible('news') && <div key="news">
            <WidgetPanel title="Breaking News" icon="newspaper" live>
              <NewsFeed />
            </WidgetPanel>
          </div>}
          {isVisible('polymarket') && <div key="polymarket">
            <WidgetPanel title="Prediction Markets" icon="target" live>
              <PolymarketFeed />
            </WidgetPanel>
          </div>}
          {isVisible('macro') && <div key="macro">
            <WidgetPanel title="Macro Dashboard" icon="chart">
              <MacroDashboard />
            </WidgetPanel>
          </div>}
          {isVisible('econ-calendar') && <div key="econ-calendar">
            <WidgetPanel title="Economic Calendar" icon="calendar">
              <EconomicCalendar />
            </WidgetPanel>
          </div>}
          {isVisible('top-movers') && <div key="top-movers">
            <WidgetPanel title="Top Movers" icon="flame" live>
              <TopMovers />
            </WidgetPanel>
          </div>}
          {isVisible('ai-predictions') && <div key="ai-predictions">
            <WidgetPanel title="AI Predictions" icon="crosshair">
              <AiPredictions selectedModel={aiSettings.model} />
            </WidgetPanel>
          </div>}
          {isVisible('candlestick') && <div key="candlestick">
            <WidgetPanel title="Charts" icon="candlestick" live>
              <CandlestickChart />
            </WidgetPanel>
          </div>}
          {isVisible('crypto-heatmap') && <div key="crypto-heatmap">
            <WidgetPanel title="Crypto Heatmap" icon="grid">
              <CryptoHeatmap />
            </WidgetPanel>
          </div>}
          {isVisible('watchlist') && <div key="watchlist">
            <WidgetPanel title="Watchlist" icon="star" live>
              <Watchlist />
            </WidgetPanel>
          </div>}
          {isVisible('price-alerts') && <div key="price-alerts">
            <WidgetPanel title="Price Alerts" icon="bell" live>
              <PriceAlerts />
            </WidgetPanel>
          </div>}
          {isVisible('sector-performance') && <div key="sector-performance">
            <WidgetPanel title="Sector Performance" icon="layers" live>
              <SectorPerformance />
            </WidgetPanel>
          </div>}
          {isVisible('currency-strength') && <div key="currency-strength">
            <WidgetPanel title="Currency Strength" icon="banknote" live>
              <CurrencyStrength />
            </WidgetPanel>
          </div>}
          {isVisible('portfolio') && <div key="portfolio">
            <WidgetPanel title="Portfolio" icon="pie-chart" live>
              <PortfolioTracker />
            </WidgetPanel>
          </div>}
          {isVisible('market-sessions') && <div key="market-sessions">
            <WidgetPanel title="Market Sessions" icon="clock" live>
              <MarketSessions />
            </WidgetPanel>
          </div>}
        </ResponsiveGridLayout>
      </main>

      {/* Settings Panel (toggled via RMG footer button) */}
      <SettingsPanel
        onSettingsChange={setAiSettings}
        widgetVisibility={visibility}
        onVisibilityChange={handleVisibilityChange}
      />
    </div>
  )
}
