import { useState, useEffect, useRef, useCallback } from 'react'
import { createChart, ColorType, CandlestickSeries, HistogramSeries } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, CandlestickData, HistogramData, Time } from 'lightweight-charts'
import { fetchOHLC } from '../lib/yahooFinance'
import type { OHLCBar } from '../lib/yahooFinance'
import { Search } from 'lucide-react'

// Preset symbols for quick selection
const PRESETS = [
  { label: 'S&P 500', symbol: '^GSPC' },
  { label: 'NASDAQ', symbol: '^IXIC' },
  { label: 'Gold', symbol: 'GC=F' },
  { label: 'BTC-USD', symbol: 'BTC-USD' },
  { label: 'ETH-USD', symbol: 'ETH-USD' },
  { label: 'AAPL', symbol: 'AAPL' },
  { label: 'NVDA', symbol: 'NVDA' },
  { label: 'TSLA', symbol: 'TSLA' },
  { label: 'Crude Oil', symbol: 'CL=F' },
  { label: 'EUR/USD', symbol: 'EURUSD=X' },
]

const RANGES = [
  { label: '1W', range: '5d', interval: '15m' },
  { label: '1M', range: '1mo', interval: '1h' },
  { label: '3M', range: '3mo', interval: '1d' },
  { label: '6M', range: '6mo', interval: '1d' },
  { label: '1Y', range: '1y', interval: '1d' },
  { label: '5Y', range: '5y', interval: '1wk' },
]

function barsToCandles(bars: OHLCBar[]): CandlestickData<Time>[] {
  return bars.map(b => ({
    time: b.time as Time,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }))
}

function barsToVolume(bars: OHLCBar[]): HistogramData<Time>[] {
  return bars.map(b => ({
    time: b.time as Time,
    value: b.volume,
    color: b.close >= b.open ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
  }))
}

export default function CandlestickChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)

  const [symbol, setSymbol] = useState('^GSPC')
  const [rangeIdx, setRangeIdx] = useState(3) // default 6M
  const [loading, setLoading] = useState(true)
  const [lastPrice, setLastPrice] = useState<{ price: number; change: number; changePct: number } | null>(null)
  const [customSymbol, setCustomSymbol] = useState('')

  // Create chart once
  useEffect(() => {
    if (!chartContainerRef.current) return

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#6b7280',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(107, 114, 128, 0.1)' },
        horzLines: { color: 'rgba(107, 114, 128, 0.1)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(220, 38, 38, 0.4)', width: 1, style: 2 },
        horzLine: { color: 'rgba(220, 38, 38, 0.4)', width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: 'rgba(107, 114, 128, 0.2)',
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: {
        borderColor: 'rgba(107, 114, 128, 0.2)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    })

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    })

    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    volumeSeriesRef.current = volumeSeries

    // Resize observer
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      chart.applyOptions({ width, height })
    })
    ro.observe(chartContainerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      volumeSeriesRef.current = null
    }
  }, [])

  // Load data when symbol or range changes
  const loadData = useCallback(async () => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return
    setLoading(true)

    const r = RANGES[rangeIdx]
    const bars = await fetchOHLC(symbol, r.interval, r.range)

    if (bars.length > 0) {
      const candles = barsToCandles(bars)
      const volumes = barsToVolume(bars)

      candleSeriesRef.current.setData(candles)
      volumeSeriesRef.current.setData(volumes)
      chartRef.current?.timeScale().fitContent()

      // Calculate price info
      const last = bars[bars.length - 1]
      const first = bars[0]
      const change = last.close - first.open
      const changePct = first.open !== 0 ? (change / first.open) * 100 : 0
      setLastPrice({ price: last.close, change, changePct })
    }

    setLoading(false)
  }, [symbol, rangeIdx])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (customSymbol.trim()) {
      setSymbol(customSymbol.trim().toUpperCase())
      setCustomSymbol('')
    }
  }

  const currentPreset = PRESETS.find(p => p.symbol === symbol)
  const displayName = currentPreset?.label || symbol

  return (
    <div className="h-full flex flex-col gap-1.5">
      {/* Header: symbol info + custom search */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[12px] font-bold text-white truncate">{displayName}</span>
          {lastPrice && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[11px] font-mono text-white font-bold">
                {lastPrice.price >= 1 ? lastPrice.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : lastPrice.price.toPrecision(4)}
              </span>
              <span className={`text-[9px] font-mono font-bold ${lastPrice.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {lastPrice.change >= 0 ? '+' : ''}{lastPrice.changePct.toFixed(2)}%
              </span>
            </div>
          )}
        </div>
        <form onSubmit={handleCustomSubmit} className="flex items-center gap-1">
          <input
            type="text"
            value={customSymbol}
            onChange={e => setCustomSymbol(e.target.value)}
            placeholder="Symbol..."
            className="w-16 text-[9px] font-mono bg-samurai-grey-dark/50 border border-samurai-grey-dark/60 rounded px-1.5 py-0.5 text-white placeholder-samurai-steel/50 focus:outline-none focus:border-samurai-red/50"
          />
          <button type="submit" className="p-0.5 text-samurai-steel hover:text-white">
            <Search className="w-3 h-3" />
          </button>
        </form>
      </div>

      {/* Preset symbols */}
      <div className="flex gap-1 flex-wrap">
        {PRESETS.map(p => (
          <button
            key={p.symbol}
            onClick={() => setSymbol(p.symbol)}
            className={`text-[8px] font-bold px-1.5 py-0.5 rounded transition-colors ${
              symbol === p.symbol
                ? 'bg-samurai-red/20 text-samurai-red'
                : 'bg-samurai-grey-dark/30 text-samurai-steel hover:text-white'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Range selector */}
      <div className="flex gap-1">
        {RANGES.map((r, i) => (
          <button
            key={r.label}
            onClick={() => setRangeIdx(i)}
            className={`text-[8px] font-bold px-2 py-0.5 rounded transition-colors ${
              rangeIdx === i
                ? 'bg-samurai-red/20 text-samurai-red'
                : 'bg-samurai-grey-dark/30 text-samurai-steel hover:text-white'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="flex-1 relative min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <span className="text-[10px] text-samurai-steel animate-pulse font-mono">Loading chart...</span>
          </div>
        )}
        <div ref={chartContainerRef} className="w-full h-full" />
      </div>
    </div>
  )
}
