import { useState, useEffect } from 'react'
// lucide icons available if needed later

interface DoomsdayClock {
  minutes: number
  seconds: number
  year: number
  description: string
}

// Bulletin of the Atomic Scientists — Doomsday Clock
// Updated manually (they publish annually in January)
const CURRENT_CLOCK: DoomsdayClock = {
  minutes: 1,
  seconds: 29,
  year: 2025,
  description: 'Closest to midnight in history. Nuclear risk, climate change, and disruptive technologies continue to pose existential threats.',
}

// DEFCON-like threat indicators (curated from public sources)
const THREAT_INDICATORS = [
  { label: 'US DEFCON', value: '3', color: '#f59e0b', desc: 'Increased readiness' },
  { label: 'NATO Alert', value: 'ELEVATED', color: '#f97316', desc: 'Enhanced vigilance' },
  { label: 'Nuclear States', value: '9', color: '#ef4444', desc: 'Active nuclear arsenals' },
  { label: 'Active Tests', value: '0', color: '#10b981', desc: 'Nuclear tests this year' },
]

export default function NuclearThreatLevel() {
  const [clock] = useState(CURRENT_CLOCK)
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    const iv = setInterval(() => setPulse(p => !p), 1000)
    return () => clearInterval(iv)
  }, [])

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-samurai-steel font-mono">DOOMSDAY CLOCK · {clock.year}</span>
        <div className="flex items-center gap-1">
          <div className={`w-1.5 h-1.5 rounded-full ${pulse ? 'bg-red-500' : 'bg-red-500/30'}`} />
          <span className="text-[8px] text-red-400 font-mono font-bold">
            {clock.minutes}m {clock.seconds}s TO MIDNIGHT
          </span>
        </div>
      </div>

      {/* Clock visualization */}
      <div className="flex items-center justify-center py-2">
        <div className="relative w-24 h-24">
          {/* Clock face */}
          <svg viewBox="0 0 100 100" className="w-full h-full">
            {/* Outer ring */}
            <circle cx="50" cy="50" r="48" fill="none" stroke="#2d2d2d" strokeWidth="2" />
            {/* Danger zone (last 5 minutes) */}
            <path
              d="M 50 2 A 48 48 0 0 1 97.5 45"
              fill="none"
              stroke="#ef444440"
              strokeWidth="4"
            />
            {/* Tick marks */}
            {Array.from({ length: 12 }).map((_, i) => {
              const angle = (i * 30 - 90) * Math.PI / 180
              const x1 = 50 + 44 * Math.cos(angle)
              const y1 = 50 + 44 * Math.sin(angle)
              const x2 = 50 + 48 * Math.cos(angle)
              const y2 = 50 + 48 * Math.sin(angle)
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#666" strokeWidth={i === 0 ? 3 : 1} />
            })}
            {/* 12 label */}
            <text x="50" y="18" textAnchor="middle" fill="#ef4444" fontSize="8" fontFamily="monospace" fontWeight="bold">12</text>
            {/* Minute hand */}
            <line
              x1="50" y1="50"
              x2={50 + 35 * Math.sin((360 - (clock.minutes / 60) * 360 + (clock.seconds / 3600) * 360) * Math.PI / 180)}
              y2={50 - 35 * Math.cos((360 - (clock.minutes / 60) * 360 + (clock.seconds / 3600) * 360) * Math.PI / 180)}
              stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round"
            />
            {/* Center dot */}
            <circle cx="50" cy="50" r="3" fill="#ef4444" />
          </svg>
        </div>
      </div>

      {/* Description */}
      <div className="text-[9px] text-white/70 leading-relaxed text-center px-2">
        {clock.description}
      </div>

      {/* Threat indicators */}
      <div className="grid grid-cols-2 gap-1">
        {THREAT_INDICATORS.map(ind => (
          <div key={ind.label} className="bg-samurai-black rounded-md border border-samurai-grey-dark/30 px-2 py-1.5">
            <div className="text-[7px] text-samurai-steel font-mono uppercase">{ind.label}</div>
            <div className="text-[11px] font-bold font-mono" style={{ color: ind.color }}>{ind.value}</div>
            <div className="text-[7px] text-samurai-steel/50">{ind.desc}</div>
          </div>
        ))}
      </div>

      <div className="text-[7px] text-samurai-steel/40 text-center font-mono mt-auto">
        Bulletin of the Atomic Scientists · Public threat indicators
      </div>
    </div>
  )
}
