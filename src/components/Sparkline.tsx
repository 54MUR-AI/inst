interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  className?: string
  positive?: boolean // force color, otherwise auto-detect from first vs last
}

export default function Sparkline({ data, width = 60, height = 20, className = '', positive }: SparklineProps) {
  if (!data || data.length < 2) return null

  const isUp = positive ?? data[data.length - 1] >= data[0]
  const color = isUp ? '#22c55e' : '#E63946' // green or samurai-red

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 2) - 1
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  // Fill area under the line
  const fillPoints = `0,${height} ${points} ${width},${height}`

  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        points={fillPoints}
        fill={`${color}15`}
        stroke="none"
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
