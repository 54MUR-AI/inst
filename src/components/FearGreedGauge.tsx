import { useState, useEffect } from 'react'

interface FearGreedData {
  value: number
  classification: string
  timestamp: string
}

export default function FearGreedGauge() {
  const [data, setData] = useState<FearGreedData | null>(null)

  useEffect(() => {
    const fetchFearGreed = async () => {
      try {
        const res = await fetch('https://api.alternative.me/fng/?limit=1')
        if (!res.ok) throw new Error('FNG API error')
        const json = await res.json()
        const entry = json.data[0]
        setData({
          value: parseInt(entry.value),
          classification: entry.value_classification,
          timestamp: new Date(parseInt(entry.timestamp) * 1000).toLocaleDateString(),
        })
      } catch {
        setData({ value: 45, classification: 'Fear', timestamp: new Date().toLocaleDateString() })
      }
    }
    fetchFearGreed()
    const interval = setInterval(fetchFearGreed, 300000) // 5 min
    return () => clearInterval(interval)
  }, [])

  if (!data) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-xs text-samurai-steel animate-pulse font-mono">Loading gauge...</div>
      </div>
    )
  }

  const angle = (data.value / 100) * 180 - 90 // -90 to 90 degrees
  const getColor = (val: number) => {
    if (val <= 25) return '#E63946' // Extreme Fear - red
    if (val <= 45) return '#FFA000' // Fear - amber
    if (val <= 55) return '#FFD700' // Neutral - gold
    if (val <= 75) return '#00C853' // Greed - green
    return '#00BCD4' // Extreme Greed - cyan
  }
  const color = getColor(data.value)

  return (
    <div className="h-full flex flex-col items-center justify-center gap-2">
      {/* SVG Gauge */}
      <div className="relative w-full max-w-[180px] aspect-square">
        <svg viewBox="0 0 200 120" className="w-full">
          {/* Background arc */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="#2d2d2d"
            strokeWidth="12"
            strokeLinecap="round"
          />
          {/* Colored segments */}
          <path d="M 20 100 A 80 80 0 0 1 56 38" fill="none" stroke="#E63946" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
          <path d="M 56 38 A 80 80 0 0 1 100 20" fill="none" stroke="#FFA000" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
          <path d="M 100 20 A 80 80 0 0 1 144 38" fill="none" stroke="#FFD700" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
          <path d="M 144 38 A 80 80 0 0 1 180 100" fill="none" stroke="#00C853" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
          {/* Needle */}
          <g transform={`rotate(${angle}, 100, 100)`}>
            <line x1="100" y1="100" x2="100" y2="30" stroke={color} strokeWidth="3" strokeLinecap="round" />
            <circle cx="100" cy="100" r="6" fill={color} />
            <circle cx="100" cy="100" r="3" fill="#0a0a0a" />
          </g>
        </svg>
        {/* Value overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <span className="text-2xl font-black font-mono" style={{ color }}>{data.value}</span>
        </div>
      </div>
      {/* Label */}
      <div className="text-center">
        <div className="text-sm font-bold tracking-wider" style={{ color }}>{data.classification.toUpperCase()}</div>
        <div className="text-[10px] text-samurai-steel font-mono mt-0.5">{data.timestamp}</div>
      </div>
      {/* Scale labels */}
      <div className="flex justify-between w-full px-2">
        <span className="text-[9px] text-samurai-red font-mono">EXTREME FEAR</span>
        <span className="text-[9px] text-samurai-cyan font-mono">EXTREME GREED</span>
      </div>
    </div>
  )
}
