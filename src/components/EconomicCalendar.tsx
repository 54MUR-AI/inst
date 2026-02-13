import { useState, useEffect } from 'react'
import { Calendar, Clock, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { fetchFredObservationNear, FRED_CALENDAR_SERIES, hasFredKey } from '../lib/fred'

interface EconEvent {
  date: string        // ISO date
  time: string        // e.g. "2:00 PM ET"
  title: string
  category: 'fomc' | 'cpi' | 'jobs' | 'gdp' | 'earnings' | 'other'
  impact: 'high' | 'medium' | 'low'
  previous?: string
  forecast?: string
  actual?: string
}

// Static calendar of known major economic events for 2025-2026
// These are well-known scheduled dates that don't change
const ECONOMIC_EVENTS: EconEvent[] = [
  // FOMC Meetings 2025-2026 (Fed announces at 2:00 PM ET on second day)
  { date: '2025-01-29', time: '2:00 PM ET', title: 'FOMC Rate Decision', category: 'fomc', impact: 'high' },
  { date: '2025-03-19', time: '2:00 PM ET', title: 'FOMC Rate Decision', category: 'fomc', impact: 'high' },
  { date: '2025-05-07', time: '2:00 PM ET', title: 'FOMC Rate Decision', category: 'fomc', impact: 'high' },
  { date: '2025-06-18', time: '2:00 PM ET', title: 'FOMC Rate Decision', category: 'fomc', impact: 'high' },
  { date: '2025-07-30', time: '2:00 PM ET', title: 'FOMC Rate Decision', category: 'fomc', impact: 'high' },
  { date: '2025-09-17', time: '2:00 PM ET', title: 'FOMC Rate Decision', category: 'fomc', impact: 'high' },
  { date: '2025-10-29', time: '2:00 PM ET', title: 'FOMC Rate Decision', category: 'fomc', impact: 'high' },
  { date: '2025-12-17', time: '2:00 PM ET', title: 'FOMC Rate Decision', category: 'fomc', impact: 'high' },
  { date: '2026-01-28', time: '2:00 PM ET', title: 'FOMC Rate Decision', category: 'fomc', impact: 'high' },
  { date: '2026-03-18', time: '2:00 PM ET', title: 'FOMC Rate Decision', category: 'fomc', impact: 'high' },
  { date: '2026-04-29', time: '2:00 PM ET', title: 'FOMC Rate Decision', category: 'fomc', impact: 'high' },
  { date: '2026-06-17', time: '2:00 PM ET', title: 'FOMC Rate Decision', category: 'fomc', impact: 'high' },
  { date: '2026-07-29', time: '2:00 PM ET', title: 'FOMC Rate Decision', category: 'fomc', impact: 'high' },
  { date: '2026-09-16', time: '2:00 PM ET', title: 'FOMC Rate Decision', category: 'fomc', impact: 'high' },
  { date: '2026-11-04', time: '2:00 PM ET', title: 'FOMC Rate Decision', category: 'fomc', impact: 'high' },
  { date: '2026-12-16', time: '2:00 PM ET', title: 'FOMC Rate Decision', category: 'fomc', impact: 'high' },

  // CPI Releases 2025-2026 (8:30 AM ET)
  { date: '2025-01-15', time: '8:30 AM ET', title: 'CPI Report (Dec)', category: 'cpi', impact: 'high' },
  { date: '2025-02-12', time: '8:30 AM ET', title: 'CPI Report (Jan)', category: 'cpi', impact: 'high' },
  { date: '2025-03-12', time: '8:30 AM ET', title: 'CPI Report (Feb)', category: 'cpi', impact: 'high' },
  { date: '2025-04-10', time: '8:30 AM ET', title: 'CPI Report (Mar)', category: 'cpi', impact: 'high' },
  { date: '2025-05-13', time: '8:30 AM ET', title: 'CPI Report (Apr)', category: 'cpi', impact: 'high' },
  { date: '2025-06-11', time: '8:30 AM ET', title: 'CPI Report (May)', category: 'cpi', impact: 'high' },
  { date: '2025-07-15', time: '8:30 AM ET', title: 'CPI Report (Jun)', category: 'cpi', impact: 'high' },
  { date: '2025-08-12', time: '8:30 AM ET', title: 'CPI Report (Jul)', category: 'cpi', impact: 'high' },
  { date: '2025-09-10', time: '8:30 AM ET', title: 'CPI Report (Aug)', category: 'cpi', impact: 'high' },
  { date: '2025-10-14', time: '8:30 AM ET', title: 'CPI Report (Sep)', category: 'cpi', impact: 'high' },
  { date: '2025-11-12', time: '8:30 AM ET', title: 'CPI Report (Oct)', category: 'cpi', impact: 'high' },
  { date: '2025-12-10', time: '8:30 AM ET', title: 'CPI Report (Nov)', category: 'cpi', impact: 'high' },
  { date: '2026-01-14', time: '8:30 AM ET', title: 'CPI Report (Dec)', category: 'cpi', impact: 'high' },
  { date: '2026-02-11', time: '8:30 AM ET', title: 'CPI Report (Jan)', category: 'cpi', impact: 'high' },
  { date: '2026-03-11', time: '8:30 AM ET', title: 'CPI Report (Feb)', category: 'cpi', impact: 'high' },
  { date: '2026-04-14', time: '8:30 AM ET', title: 'CPI Report (Mar)', category: 'cpi', impact: 'high' },
  { date: '2026-05-12', time: '8:30 AM ET', title: 'CPI Report (Apr)', category: 'cpi', impact: 'high' },
  { date: '2026-06-10', time: '8:30 AM ET', title: 'CPI Report (May)', category: 'cpi', impact: 'high' },
  { date: '2026-07-14', time: '8:30 AM ET', title: 'CPI Report (Jun)', category: 'cpi', impact: 'high' },
  { date: '2026-08-12', time: '8:30 AM ET', title: 'CPI Report (Jul)', category: 'cpi', impact: 'high' },
  { date: '2026-09-15', time: '8:30 AM ET', title: 'CPI Report (Aug)', category: 'cpi', impact: 'high' },
  { date: '2026-10-13', time: '8:30 AM ET', title: 'CPI Report (Sep)', category: 'cpi', impact: 'high' },
  { date: '2026-11-12', time: '8:30 AM ET', title: 'CPI Report (Oct)', category: 'cpi', impact: 'high' },
  { date: '2026-12-10', time: '8:30 AM ET', title: 'CPI Report (Nov)', category: 'cpi', impact: 'high' },

  // Non-Farm Payrolls 2025-2026 (first Friday of month, 8:30 AM ET)
  { date: '2025-01-10', time: '8:30 AM ET', title: 'Non-Farm Payrolls (Dec)', category: 'jobs', impact: 'high' },
  { date: '2025-02-07', time: '8:30 AM ET', title: 'Non-Farm Payrolls (Jan)', category: 'jobs', impact: 'high' },
  { date: '2025-03-07', time: '8:30 AM ET', title: 'Non-Farm Payrolls (Feb)', category: 'jobs', impact: 'high' },
  { date: '2025-04-04', time: '8:30 AM ET', title: 'Non-Farm Payrolls (Mar)', category: 'jobs', impact: 'high' },
  { date: '2025-05-02', time: '8:30 AM ET', title: 'Non-Farm Payrolls (Apr)', category: 'jobs', impact: 'high' },
  { date: '2025-06-06', time: '8:30 AM ET', title: 'Non-Farm Payrolls (May)', category: 'jobs', impact: 'high' },
  { date: '2025-07-03', time: '8:30 AM ET', title: 'Non-Farm Payrolls (Jun)', category: 'jobs', impact: 'high' },
  { date: '2025-08-01', time: '8:30 AM ET', title: 'Non-Farm Payrolls (Jul)', category: 'jobs', impact: 'high' },
  { date: '2025-09-05', time: '8:30 AM ET', title: 'Non-Farm Payrolls (Aug)', category: 'jobs', impact: 'high' },
  { date: '2025-10-03', time: '8:30 AM ET', title: 'Non-Farm Payrolls (Sep)', category: 'jobs', impact: 'high' },
  { date: '2025-11-07', time: '8:30 AM ET', title: 'Non-Farm Payrolls (Oct)', category: 'jobs', impact: 'high' },
  { date: '2025-12-05', time: '8:30 AM ET', title: 'Non-Farm Payrolls (Nov)', category: 'jobs', impact: 'high' },
  { date: '2026-01-09', time: '8:30 AM ET', title: 'Non-Farm Payrolls (Dec)', category: 'jobs', impact: 'high' },
  { date: '2026-02-06', time: '8:30 AM ET', title: 'Non-Farm Payrolls (Jan)', category: 'jobs', impact: 'high' },
  { date: '2026-03-06', time: '8:30 AM ET', title: 'Non-Farm Payrolls (Feb)', category: 'jobs', impact: 'high' },
  { date: '2026-04-03', time: '8:30 AM ET', title: 'Non-Farm Payrolls (Mar)', category: 'jobs', impact: 'high' },
  { date: '2026-05-01', time: '8:30 AM ET', title: 'Non-Farm Payrolls (Apr)', category: 'jobs', impact: 'high' },
  { date: '2026-06-05', time: '8:30 AM ET', title: 'Non-Farm Payrolls (May)', category: 'jobs', impact: 'high' },
  { date: '2026-07-02', time: '8:30 AM ET', title: 'Non-Farm Payrolls (Jun)', category: 'jobs', impact: 'high' },
  { date: '2026-08-07', time: '8:30 AM ET', title: 'Non-Farm Payrolls (Jul)', category: 'jobs', impact: 'high' },
  { date: '2026-09-04', time: '8:30 AM ET', title: 'Non-Farm Payrolls (Aug)', category: 'jobs', impact: 'high' },
  { date: '2026-10-02', time: '8:30 AM ET', title: 'Non-Farm Payrolls (Sep)', category: 'jobs', impact: 'high' },
  { date: '2026-11-06', time: '8:30 AM ET', title: 'Non-Farm Payrolls (Oct)', category: 'jobs', impact: 'high' },
  { date: '2026-12-04', time: '8:30 AM ET', title: 'Non-Farm Payrolls (Nov)', category: 'jobs', impact: 'high' },

  // GDP Releases 2025-2026 (advance estimate, 8:30 AM ET)
  { date: '2025-01-30', time: '8:30 AM ET', title: 'GDP Q4 2024 (Advance)', category: 'gdp', impact: 'high' },
  { date: '2025-04-30', time: '8:30 AM ET', title: 'GDP Q1 2025 (Advance)', category: 'gdp', impact: 'high' },
  { date: '2025-07-30', time: '8:30 AM ET', title: 'GDP Q2 2025 (Advance)', category: 'gdp', impact: 'high' },
  { date: '2025-10-29', time: '8:30 AM ET', title: 'GDP Q3 2025 (Advance)', category: 'gdp', impact: 'high' },
  { date: '2026-01-29', time: '8:30 AM ET', title: 'GDP Q4 2025 (Advance)', category: 'gdp', impact: 'high' },
  { date: '2026-04-29', time: '8:30 AM ET', title: 'GDP Q1 2026 (Advance)', category: 'gdp', impact: 'high' },
  { date: '2026-07-29', time: '8:30 AM ET', title: 'GDP Q2 2026 (Advance)', category: 'gdp', impact: 'high' },
  { date: '2026-10-28', time: '8:30 AM ET', title: 'GDP Q3 2026 (Advance)', category: 'gdp', impact: 'high' },

  // Major Earnings Seasons (approximate start dates)
  { date: '2025-01-14', time: 'Pre-Market', title: 'Q4 Earnings Season Begins', category: 'earnings', impact: 'medium' },
  { date: '2025-04-14', time: 'Pre-Market', title: 'Q1 Earnings Season Begins', category: 'earnings', impact: 'medium' },
  { date: '2025-07-14', time: 'Pre-Market', title: 'Q2 Earnings Season Begins', category: 'earnings', impact: 'medium' },
  { date: '2025-10-13', time: 'Pre-Market', title: 'Q3 Earnings Season Begins', category: 'earnings', impact: 'medium' },
  { date: '2026-01-13', time: 'Pre-Market', title: 'Q4 Earnings Season Begins', category: 'earnings', impact: 'medium' },
  { date: '2026-04-13', time: 'Pre-Market', title: 'Q1 Earnings Season Begins', category: 'earnings', impact: 'medium' },
  { date: '2026-07-13', time: 'Pre-Market', title: 'Q2 Earnings Season Begins', category: 'earnings', impact: 'medium' },
  { date: '2026-10-12', time: 'Pre-Market', title: 'Q3 Earnings Season Begins', category: 'earnings', impact: 'medium' },

  // Other notable events
  { date: '2025-04-15', time: 'All Day', title: 'Tax Day (US)', category: 'other', impact: 'low' },
  { date: '2025-11-27', time: 'All Day', title: 'Thanksgiving (Markets Closed)', category: 'other', impact: 'low' },
  { date: '2025-12-25', time: 'All Day', title: 'Christmas (Markets Closed)', category: 'other', impact: 'low' },
  { date: '2026-04-15', time: 'All Day', title: 'Tax Day (US)', category: 'other', impact: 'low' },
  { date: '2026-11-26', time: 'All Day', title: 'Thanksgiving (Markets Closed)', category: 'other', impact: 'low' },
  { date: '2026-12-25', time: 'All Day', title: 'Christmas (Markets Closed)', category: 'other', impact: 'low' },
]

type FilterCategory = 'all' | EconEvent['category']

const CATEGORY_CONFIG: Record<EconEvent['category'], { label: string; color: string; bg: string }> = {
  fomc: { label: 'FOMC', color: 'text-amber-400', bg: 'bg-amber-500/15' },
  cpi: { label: 'CPI', color: 'text-rose-400', bg: 'bg-rose-500/15' },
  jobs: { label: 'JOBS', color: 'text-blue-400', bg: 'bg-blue-500/15' },
  gdp: { label: 'GDP', color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  earnings: { label: 'EARN', color: 'text-purple-400', bg: 'bg-purple-500/15' },
  other: { label: 'OTHER', color: 'text-samurai-steel', bg: 'bg-samurai-grey-dark/40' },
}

const IMPACT_CONFIG: Record<EconEvent['impact'], { icon: typeof AlertTriangle; color: string }> = {
  high: { icon: AlertTriangle, color: 'text-red-400' },
  medium: { icon: TrendingUp, color: 'text-amber-400' },
  low: { icon: Minus, color: 'text-samurai-steel' },
}

function daysUntil(dateStr: string): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T00:00:00')
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function getCountdownText(days: number): { text: string; urgent: boolean } {
  if (days < 0) return { text: `${Math.abs(days)}d ago`, urgent: false }
  if (days === 0) return { text: 'TODAY', urgent: true }
  if (days === 1) return { text: 'TOMORROW', urgent: true }
  if (days <= 7) return { text: `${days}d`, urgent: true }
  return { text: `${days}d`, urgent: false }
}

export default function EconomicCalendar() {
  const [filter, setFilter] = useState<FilterCategory>('all')
  const [events, setEvents] = useState<(EconEvent & { daysAway: number })[]>([])
  const [fredValues, setFredValues] = useState<Map<string, string>>(new Map())
  const [hasFred, setHasFred] = useState(false)

  useEffect(() => {
    // Get events from 7 days ago to 90 days ahead
    const pastCutoff = -7
    const futureCutoff = 90

    const upcoming = ECONOMIC_EVENTS
      .map(e => ({ ...e, daysAway: daysUntil(e.date) }))
      .filter(e => e.daysAway >= pastCutoff && e.daysAway <= futureCutoff)
      .sort((a, b) => a.daysAway - b.daysAway)

    setEvents(upcoming)

    // Fetch FRED actual values for past events (if key available)
    const fetchActuals = async () => {
      const keyAvailable = await hasFredKey()
      setHasFred(keyAvailable)
      if (!keyAvailable) return

      const pastEvents = upcoming.filter(
        e => e.daysAway < 0 && FRED_CALENDAR_SERIES[e.category]
      )
      if (pastEvents.length === 0) return

      const vals = new Map<string, string>()
      // Batch fetch — limit to 6 to avoid rate limits
      const toFetch = pastEvents.slice(0, 6)
      await Promise.allSettled(
        toFetch.map(async (e) => {
          const cfg = FRED_CALENDAR_SERIES[e.category]
          const obs = await fetchFredObservationNear(cfg.seriesId, e.date)
          if (obs) {
            vals.set(`${e.category}-${e.date}`, cfg.format(obs.value))
          }
        })
      )
      setFredValues(vals)
    }
    fetchActuals()
  }, [])

  const filtered = filter === 'all' ? events : events.filter(e => e.category === filter)

  // Group by relative time
  const today = filtered.filter(e => e.daysAway === 0)
  const thisWeek = filtered.filter(e => e.daysAway > 0 && e.daysAway <= 7)
  const later = filtered.filter(e => e.daysAway > 7)
  const past = filtered.filter(e => e.daysAway < 0)

  const EventRow = ({ event }: { event: EconEvent & { daysAway: number } }) => {
    const cat = CATEGORY_CONFIG[event.category]
    const imp = IMPACT_CONFIG[event.impact]
    const countdown = getCountdownText(event.daysAway)
    const ImpactIcon = imp.icon

    return (
      <div className={`flex items-center gap-2 py-1.5 px-2 rounded-md transition-colors ${
        event.daysAway === 0 ? 'bg-samurai-red/10 border border-samurai-red/30' :
        event.daysAway < 0 ? 'opacity-50' : 'hover:bg-samurai-grey-dark/30'
      }`}>
        {/* Countdown */}
        <div className={`w-14 text-right flex-shrink-0 ${
          countdown.urgent ? 'text-samurai-red font-bold' : 'text-samurai-steel'
        }`}>
          <span className="text-[10px] font-mono">{countdown.text}</span>
        </div>

        {/* Category badge */}
        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${cat.bg} ${cat.color} flex-shrink-0`}>
          {cat.label}
        </span>

        {/* Event info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-white font-medium truncate">{event.title}</span>
            {fredValues.get(`${event.category}-${event.date}`) && (
              <span className="text-[9px] font-mono font-bold text-emerald-400 flex-shrink-0">
                {fredValues.get(`${event.category}-${event.date}`)}
              </span>
            )}
          </div>
          <div className="text-[9px] text-samurai-steel font-mono">
            {formatDate(event.date)} · {event.time}
          </div>
        </div>

        {/* Impact indicator */}
        <ImpactIcon className={`w-3 h-3 flex-shrink-0 ${imp.color}`} />
      </div>
    )
  }

  const SectionHeader = ({ label, count }: { label: string; count: number }) => (
    count > 0 ? (
      <div className="flex items-center gap-2 pt-2 pb-1 px-1">
        <span className="text-[9px] font-bold text-samurai-steel uppercase tracking-widest">{label}</span>
        <span className="text-[8px] text-samurai-steel/60 font-mono">({count})</span>
        <div className="flex-1 border-t border-samurai-grey-dark/30" />
      </div>
    ) : null
  )

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {(['all', 'fomc', 'cpi', 'jobs', 'gdp', 'earnings'] as FilterCategory[]).map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`text-[9px] font-bold px-2 py-1 rounded transition-colors ${
              filter === cat
                ? 'bg-samurai-red/20 text-samurai-red'
                : 'bg-samurai-grey-dark/30 text-samurai-steel hover:text-white'
            }`}
          >
            {cat === 'all' ? 'ALL' : CATEGORY_CONFIG[cat as EconEvent['category']].label}
          </button>
        ))}
      </div>

      {/* Events list */}
      <div className="flex-1 overflow-y-auto space-y-0.5">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Calendar className="w-8 h-8 text-samurai-steel/30 mx-auto mb-2" />
              <p className="text-[10px] text-samurai-steel">No events in this category</p>
            </div>
          </div>
        ) : (
          <>
            {today.length > 0 && (
              <>
                <SectionHeader label="Today" count={today.length} />
                {today.map((e, i) => <EventRow key={`today-${i}`} event={e} />)}
              </>
            )}
            {thisWeek.length > 0 && (
              <>
                <SectionHeader label="This Week" count={thisWeek.length} />
                {thisWeek.map((e, i) => <EventRow key={`week-${i}`} event={e} />)}
              </>
            )}
            {later.length > 0 && (
              <>
                <SectionHeader label="Upcoming" count={later.length} />
                {later.map((e, i) => <EventRow key={`later-${i}`} event={e} />)}
              </>
            )}
            {past.length > 0 && (
              <>
                <SectionHeader label="Recent" count={past.length} />
                {past.map((e, i) => <EventRow key={`past-${i}`} event={e} />)}
              </>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-samurai-grey-dark/30">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-samurai-steel/50" />
          <span className="text-[8px] text-samurai-steel/50 font-mono">
            {filtered.filter(e => e.daysAway >= 0).length} upcoming{hasFred ? ' · FRED' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-0.5">
            <AlertTriangle className="w-2.5 h-2.5 text-red-400/60" />
            <span className="text-[7px] text-samurai-steel/50">High</span>
          </span>
          <span className="flex items-center gap-0.5">
            <TrendingUp className="w-2.5 h-2.5 text-amber-400/60" />
            <span className="text-[7px] text-samurai-steel/50">Med</span>
          </span>
          <span className="flex items-center gap-0.5">
            <TrendingDown className="w-2.5 h-2.5 text-samurai-steel/40" />
            <span className="text-[7px] text-samurai-steel/50">Low</span>
          </span>
        </div>
      </div>
    </div>
  )
}
