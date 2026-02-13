# NSIT - Networked Speculation Intelligence Tool

A real-time financial command center built with React, featuring interactive widgets for global equities, commodities, forex, crypto markets, prediction markets, macroeconomic data, AI-powered analysis, and breaking news.

## Widgets

| Widget | Source | Description |
|--------|--------|-------------|
| **Global Indices** | Yahoo Finance v8 | S&P 500, Dow, NASDAQ, Russell 2000, FTSE, DAX, CAC 40, Nikkei, Shanghai, Hang Seng, Sensex |
| **Commodities & Metals** | Yahoo Finance v8 | Gold, Silver, Platinum, Palladium, Copper (COMEX), WTI/Brent Crude, Natural Gas, GSR |
| **Forex & Bonds** | Yahoo Finance v8 | DXY, EUR/USD, GBP/USD, USD/JPY, USD/CNY + US Treasury yield curve (3M, 5Y, 10Y, 30Y) |
| **Ticker Tape** | CoinGecko | Scrolling top-20 crypto prices with 24h change |
| **Crypto Overview** | CoinGecko Global | Total market cap, volume, BTC/ETH dominance |
| **Fear & Greed Gauge** | alternative.me | Animated SVG gauge with sentiment classification |
| **Crypto Heatmap** | CoinGecko Markets | Treemap of top 50 coins by market cap & 24h change |
| **Prediction Markets** | Polymarket Gamma API | Live prediction market events with odds visualization |
| **Macro Dashboard** | FRED (fallback data) | Fed Funds Rate, CPI, Unemployment, Yield Curve |
| **AI Briefing** | Local analysis + Ollama | Market sentiment analysis with optional LLM deep dive |
| **Breaking News** | RSS via rss2json | 6 sources: CoinDesk, CoinTelegraph, MarketWatch, BBC, NYT, Reuters |

## Tech Stack

- **Framework:** React 18 + TypeScript
- **Build:** Vite 6
- **Styling:** Tailwind CSS (samurai dark theme)
- **Layout:** react-grid-layout (drag/resize/save)
- **Charts:** Recharts + D3
- **Icons:** Lucide React
- **Hosting:** Render (Static Site)

## Development

```bash
npm install
npm run dev        # Start dev server on port 5180
npm run build      # TypeScript check + Vite build
npm run build:quick # Vite build only (skip tsc)
```

## API Proxy

All external API calls route through `/api/*` proxy paths, handled by:
- **Dev:** Vite server proxy (`vite.config.ts`)
- **Prod:** Render static site rewrite rules

| Proxy Path | Target |
|------------|--------|
| `/api/coingecko/*` | `https://api.coingecko.com/*` |
| `/api/polymarket/*` | `https://gamma-api.polymarket.com/*` |
| `/api/fng/*` | `https://api.alternative.me/*` |
| `/api/rss/*` | `https://api.rss2json.com/*` |
| `/api/yahoo/*` | `https://query2.finance.yahoo.com/*` |

CoinGecko calls are rate-limited via a staggered fetch queue (2s gap) in `src/lib/api.ts`.

## RMG Integration

NSIT is embedded in the [RMG](https://roninmedia.studio) platform via iframe at the `/nsit` route. It receives auth tokens via `postMessage` from the parent frame.

## Project Structure

```
src/
├── lib/
│   ├── api.ts              # Proxy URL helpers + CoinGecko rate limiter
│   ├── yahooFinance.ts     # Yahoo Finance v8 chart fetcher + cache
│   ├── ollamaProxy.ts      # Ollama bridge via RMG extension
│   ├── ldgrBridge.ts       # LDGR API key decryption
│   └── supabase.ts         # Supabase client
├── components/
│   ├── GlobalEquities.tsx   # Global stock indices
│   ├── CommoditiesMetals.tsx # Metals, energy, GSR
│   ├── ForexBonds.tsx       # Forex pairs + yield curve
│   ├── TickerTape.tsx       # Scrolling crypto ticker
│   ├── MarketOverview.tsx   # Global crypto stats
│   ├── FearGreedGauge.tsx   # SVG sentiment gauge
│   ├── CryptoHeatmap.tsx    # Market cap treemap
│   ├── PolymarketFeed.tsx   # Prediction markets
│   ├── MacroDashboard.tsx   # FRED macro indicators
│   ├── AiBriefing.tsx       # AI market analysis
│   ├── NewsFeed.tsx         # RSS news aggregator
│   ├── SettingsPanel.tsx    # Ollama model selector
│   └── WidgetPanel.tsx      # Reusable widget container
├── App.tsx                  # Main layout + grid
├── main.tsx                 # Entry point
└── index.css                # Tailwind + theme styles
```

## Deployment

Auto-deploys from `master` branch via Render.

## License

Part of the RMG (Ronin Media Group) ecosystem.
