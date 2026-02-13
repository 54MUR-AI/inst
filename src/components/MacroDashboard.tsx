import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import { fetchFredData, type FredSeriesData } from '../lib/fred'

interface DisplaySeries {
  label: string
  seriesId: string
  data: { date: string; value: number }[]
  latestValue: string
  unit: string
  change?: string
}

const FALLBACK_DATA: DisplaySeries[] = [
  {
    label: 'Fed Funds Rate', seriesId: 'DFF', unit: '%', latestValue: '4.33', change: '-0.50',
    data: [
      { date: '2024-01', value: 5.33 }, { date: '2024-03', value: 5.33 },
      { date: '2024-06', value: 5.33 }, { date: '2024-09', value: 4.83 },
      { date: '2024-12', value: 4.33 }, { date: '2025-03', value: 4.33 },
      { date: '2025-06', value: 4.08 }, { date: '2025-09', value: 3.83 },
      { date: '2025-12', value: 3.58 }, { date: '2026-01', value: 3.33 },
    ],
  },
  {
    label: 'CPI (All Urban)', seriesId: 'CPIAUCSL', unit: 'Index', latestValue: '317.5', change: '+0.3',
    data: [
      { date: '2024-01', value: 308.4 }, { date: '2024-03', value: 310.1 },
      { date: '2024-06', value: 312.3 }, { date: '2024-09', value: 314.1 },
      { date: '2024-12', value: 315.6 }, { date: '2025-03', value: 316.2 },
      { date: '2025-06', value: 316.8 }, { date: '2025-09', value: 317.1 },
      { date: '2025-12', value: 317.3 }, { date: '2026-01', value: 317.5 },
    ],
  },
  {
    label: 'Unemployment Rate', seriesId: 'UNRATE', unit: '%', latestValue: '4.1', change: '+0.1',
    data: [
      { date: '2024-01', value: 3.7 }, { date: '2024-03', value: 3.8 },
      { date: '2024-06', value: 4.1 }, { date: '2024-09', value: 4.2 },
      { date: '2024-12', value: 4.2 }, { date: '2025-03', value: 4.0 },
      { date: '2025-06', value: 4.0 }, { date: '2025-09', value: 4.1 },
      { date: '2025-12', value: 4.0 }, { date: '2026-01', value: 4.1 },
    ],
  },
  {
    label: '10Y-2Y Spread', seriesId: 'T10Y2Y', unit: '%', latestValue: '0.29', change: '+0.45',
    data: [
      { date: '2024-01', value: -0.35 }, { date: '2024-03', value: -0.40 },
      { date: '2024-06', value: -0.30 }, { date: '2024-09', value: -0.05 },
      { date: '2024-12', value: 0.15 }, { date: '2025-03', value: 0.20 },
      { date: '2025-06', value: 0.22 }, { date: '2025-09', value: 0.25 },
      { date: '2025-12', value: 0.27 }, { date: '2026-01', value: 0.29 },
    ],
  },
]

function fredToDisplay(fred: FredSeriesData): DisplaySeries {
  const fmt = (v: number) => Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) : v.toFixed(2)
  const dir = fred.change >= 0 ? '+' : ''
  return {
    label: fred.label,
    seriesId: fred.seriesId,
    unit: fred.unit,
    latestValue: fmt(fred.latestValue),
    change: `${dir}${fred.change.toFixed(2)}`,
    data: fred.observations.map(o => ({ date: o.date, value: o.value })),
  }
}

export default function MacroDashboard() {
  const [series, setSeries] = useState<DisplaySeries[]>([])
  const [loading, setLoading] = useState(true)
  const [isLive, setIsLive] = useState(false)
  const [selectedSeries, setSelectedSeries] = useState<string>('DFF')

  useEffect(() => {
    const load = async () => {
      // Try real FRED data first (requires FRED key in LDGR)
      try {
        const fredData = await fetchFredData()
        if (fredData && fredData.length > 0) {
          setSeries(fredData.map(fredToDisplay))
          setIsLive(true)
          setLoading(false)
          return
        }
      } catch (err) {
        console.warn('[Macro] FRED fetch failed, using fallback:', err)
      }
      // Fallback to placeholder data
      setSeries(FALLBACK_DATA)
      setIsLive(false)
      setLoading(false)
    }
    load()
    // Refresh every 10 minutes if live
    const interval = setInterval(load, 600_000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-xs text-samurai-steel animate-pulse font-mono">Loading macro data...</div>
      </div>
    )
  }

  const selected = series.find(s => s.seriesId === selectedSeries)

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Indicator cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {series.map(s => {
          const isSelected = s.seriesId === selectedSeries
          const isNegativeChange = s.change?.startsWith('-')
          return (
            <button
              key={s.seriesId}
              onClick={() => setSelectedSeries(s.seriesId)}
              className={`text-left p-2 rounded-md border transition-all ${
                isSelected
                  ? 'border-samurai-red bg-samurai-red/10'
                  : 'border-samurai-grey-dark/50 bg-samurai-black hover:border-samurai-grey-dark'
              }`}
            >
              <div className="text-[8px] text-samurai-steel font-mono uppercase tracking-wider truncate">{s.label}</div>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-sm font-bold text-white font-mono">{s.latestValue}</span>
                <span className="text-[8px] text-samurai-steel font-mono">{s.unit}</span>
              </div>
              {s.change && (
                <span className={`text-[9px] font-mono font-bold ${isNegativeChange ? 'text-samurai-red' : 'text-samurai-green'}`}>
                  {s.change}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Chart */}
      {selected && (
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            {selected.seriesId === 'T10Y2Y' ? (
              <AreaChart data={selected.data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="spreadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E63946" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#E63946" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: '#8a8a8a', fontFamily: 'monospace' }}
                  axisLine={{ stroke: '#2d2d2d' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: '#8a8a8a', fontFamily: 'monospace' }}
                  axisLine={{ stroke: '#2d2d2d' }}
                  tickLine={false}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a1a',
                    border: '1px solid #2d2d2d',
                    borderRadius: '6px',
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    color: '#fff',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#E63946"
                  fill="url(#spreadGrad)"
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            ) : (
              <LineChart data={selected.data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: '#8a8a8a', fontFamily: 'monospace' }}
                  axisLine={{ stroke: '#2d2d2d' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: '#8a8a8a', fontFamily: 'monospace' }}
                  axisLine={{ stroke: '#2d2d2d' }}
                  tickLine={false}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a1a',
                    border: '1px solid #2d2d2d',
                    borderRadius: '6px',
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    color: '#fff',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#00BCD4"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#00BCD4', stroke: '#0a0a0a', strokeWidth: 1 }}
                  activeDot={{ r: 5, fill: '#E63946' }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {/* FRED attribution */}
      <div className="text-[8px] text-samurai-steel/50 text-center font-mono flex items-center justify-center gap-1.5">
        {isLive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
        {isLive
          ? 'Live data from FRED API via LDGR key'
          : 'Placeholder data · Add FRED API key in LDGR for live data'}
      </div>
    </div>
  )
}
