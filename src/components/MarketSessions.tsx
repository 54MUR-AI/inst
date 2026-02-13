import { useState, useEffect } from 'react'

// ── Exchange sessions (all times in UTC) ──

interface Session {
  name: string
  flag: string
  openHour: number   // UTC hour
  openMin: number
  closeHour: number  // UTC hour
  closeMin: number
  days: number[]     // 0=Sun, 1=Mon ... 6=Sat
  color: string
}

const SESSIONS: Session[] = [
  { name: 'Sydney', flag: '🇦🇺', openHour: 22, openMin: 0, closeHour: 7, closeMin: 0, days: [1,2,3,4,5], color: '#06b6d4' },
  { name: 'Tokyo', flag: '🇯🇵', openHour: 0, openMin: 0, closeHour: 6, closeMin: 0, days: [1,2,3,4,5], color: '#ef4444' },
  { name: 'Shanghai', flag: '🇨🇳', openHour: 1, openMin: 30, closeHour: 7, closeMin: 0, days: [1,2,3,4,5], color: '#f59e0b' },
  { name: 'Hong Kong', flag: '🇭🇰', openHour: 1, openMin: 30, closeHour: 8, closeMin: 0, days: [1,2,3,4,5], color: '#ec4899' },
  { name: 'Mumbai', flag: '🇮🇳', openHour: 3, openMin: 45, closeHour: 10, closeMin: 0, days: [1,2,3,4,5], color: '#f97316' },
  { name: 'London', flag: '🇬🇧', openHour: 8, openMin: 0, closeHour: 16, closeMin: 30, days: [1,2,3,4,5], color: '#3b82f6' },
  { name: 'Frankfurt', flag: '🇩🇪', openHour: 7, openMin: 0, closeHour: 15, closeMin: 30, days: [1,2,3,4,5], color: '#8b5cf6' },
  { name: 'New York', flag: '🇺🇸', openHour: 14, openMin: 30, closeHour: 21, closeMin: 0, days: [1,2,3,4,5], color: '#10b981' },
  { name: 'Crypto', flag: '₿', openHour: 0, openMin: 0, closeHour: 23, closeMin: 59, days: [0,1,2,3,4,5,6], color: '#eab308' },
]

function isOpen(session: Session, now: Date): boolean {
  const day = now.getUTCDay()
  if (!session.days.includes(day)) return false

  const mins = now.getUTCHours() * 60 + now.getUTCMinutes()
  const open = session.openHour * 60 + session.openMin
  const close = session.closeHour * 60 + session.closeMin

  // Handle overnight sessions (e.g., Sydney 22:00-07:00)
  if (open > close) {
    return mins >= open || mins < close
  }
  return mins >= open && mins < close
}

function getTimeUntil(session: Session, now: Date): { label: string; minutes: number } {
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes()
  const open = session.openHour * 60 + session.openMin
  const close = session.closeHour * 60 + session.closeMin

  if (isOpen(session, now)) {
    // Time until close
    let untilClose: number
    if (open > close) {
      untilClose = mins >= open ? (24 * 60 - mins + close) : (close - mins)
    } else {
      untilClose = close - mins
    }
    const h = Math.floor(untilClose / 60)
    const m = untilClose % 60
    return { label: `Closes in ${h}h ${m}m`, minutes: untilClose }
  } else {
    // Time until open
    let untilOpen: number
    if (mins < open) {
      untilOpen = open - mins
    } else {
      untilOpen = 24 * 60 - mins + open
    }
    // Check if next trading day
    const day = now.getUTCDay()
    const nextDay = (day + (untilOpen > 0 && mins < open ? 0 : 1)) % 7
    if (!session.days.includes(nextDay)) {
      // Skip to next valid day
      let daysAhead = 1
      while (!session.days.includes((day + daysAhead) % 7) && daysAhead < 7) daysAhead++
      untilOpen = (daysAhead - 1) * 24 * 60 + (open > mins ? open - mins : 24 * 60 - mins + open)
    }
    const h = Math.floor(untilOpen / 60)
    const m = untilOpen % 60
    return { label: h > 24 ? `Opens Mon` : `Opens in ${h}h ${m}m`, minutes: untilOpen }
  }
}

function formatUTC(hour: number, min: number): string {
  return `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`
}

export default function MarketSessions() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 30_000) // update every 30s
    return () => clearInterval(iv)
  }, [])

  const openCount = SESSIONS.filter(s => isOpen(s, now)).length

  // 24h timeline position
  const currentMins = now.getUTCHours() * 60 + now.getUTCMinutes()
  const timelinePos = (currentMins / (24 * 60)) * 100

  return (
    <div className="h-full flex flex-col gap-1.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-samurai-steel font-mono">
          {openCount} MARKETS OPEN · UTC {formatUTC(now.getUTCHours(), now.getUTCMinutes())}
        </span>
        <span className="text-[8px] text-samurai-steel/50 font-mono">
          {now.toLocaleDateString('en-US', { weekday: 'short' })} Local {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
        </span>
      </div>

      {/* 24h timeline bar */}
      <div className="relative h-3 bg-samurai-grey-dark/30 rounded-full overflow-hidden">
        {SESSIONS.filter(s => s.name !== 'Crypto').map(s => {
          const open = (s.openHour * 60 + s.openMin) / (24 * 60) * 100
          const close = (s.closeHour * 60 + s.closeMin) / (24 * 60) * 100
          const isActive = isOpen(s, now)

          if (s.openHour > s.closeHour) {
            // Overnight: draw two segments
            return (
              <div key={s.name}>
                <div className="absolute top-0 bottom-0 rounded-sm" style={{
                  left: `${open}%`, width: `${100 - open}%`,
                  backgroundColor: s.color, opacity: isActive ? 0.5 : 0.15,
                }} />
                <div className="absolute top-0 bottom-0 rounded-sm" style={{
                  left: '0%', width: `${close}%`,
                  backgroundColor: s.color, opacity: isActive ? 0.5 : 0.15,
                }} />
              </div>
            )
          }
          return (
            <div key={s.name} className="absolute top-0 bottom-0 rounded-sm" style={{
              left: `${open}%`, width: `${close - open}%`,
              backgroundColor: s.color, opacity: isActive ? 0.5 : 0.15,
            }} />
          )
        })}
        {/* Current time marker */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-white z-10" style={{ left: `${timelinePos}%` }} />
        {/* Hour markers */}
        {[0, 6, 12, 18].map(h => (
          <div key={h} className="absolute top-0 bottom-0 w-px bg-samurai-steel/20" style={{ left: `${(h / 24) * 100}%` }} />
        ))}
      </div>
      <div className="flex justify-between text-[6px] text-samurai-steel/30 font-mono -mt-0.5">
        <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto space-y-0.5">
        {SESSIONS.map(session => {
          const open = isOpen(session, now)
          const timing = getTimeUntil(session, now)

          return (
            <div key={session.name} className={`flex items-center gap-2 px-2 py-1 rounded-md transition-colors ${
              open ? 'bg-samurai-grey-dark/20' : ''
            }`}>
              {/* Status dot */}
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${open ? 'animate-pulse' : ''}`}
                style={{ backgroundColor: open ? session.color : 'rgba(107,114,128,0.3)' }} />

              {/* Flag + name */}
              <div className="flex items-center gap-1 w-24 flex-shrink-0">
                <span className="text-[10px]">{session.flag}</span>
                <span className={`text-[10px] font-bold ${open ? 'text-white' : 'text-samurai-steel/60'}`}>
                  {session.name}
                </span>
              </div>

              {/* Hours */}
              <span className="text-[8px] text-samurai-steel/50 font-mono w-16 flex-shrink-0">
                {session.name === 'Crypto' ? '24/7' : `${formatUTC(session.openHour, session.openMin)}-${formatUTC(session.closeHour, session.closeMin)}`}
              </span>

              {/* Status */}
              <span className={`text-[8px] font-bold flex-shrink-0 ${open ? 'text-emerald-400' : 'text-samurai-steel/40'}`}>
                {open ? 'OPEN' : 'CLOSED'}
              </span>

              {/* Countdown */}
              <span className={`text-[7px] font-mono ml-auto ${
                open && timing.minutes < 60 ? 'text-amber-400' : 'text-samurai-steel/40'
              }`}>
                {session.name === 'Crypto' ? 'Always' : timing.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="text-[7px] text-samurai-steel/40 text-center font-mono">
        All times UTC · Updates every 30s · Excludes holidays
      </div>
    </div>
  )
}
