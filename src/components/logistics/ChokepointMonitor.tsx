import { CHOKEPOINTS, type Chokepoint } from '../../lib/logisticsApi'
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react'

const STATUS_CONFIG: Record<Chokepoint['status'], { icon: typeof CheckCircle; color: string; label: string }> = {
  normal: { icon: CheckCircle, color: '#22c55e', label: 'NORMAL' },
  disrupted: { icon: AlertTriangle, color: '#f97316', label: 'DISRUPTED' },
  critical: { icon: XCircle, color: '#ef4444', label: 'CRITICAL' },
}

export default function ChokepointMonitor() {
  const disrupted = CHOKEPOINTS.filter(c => c.status !== 'normal').length
  const totalTrade = CHOKEPOINTS.reduce((s, c) => s + c.percentGlobalTrade, 0)

  return (
    <div className="h-full flex flex-col text-[10px] font-mono">
      {/* Summary bar */}
      <div className="flex items-center gap-3 px-2 py-1.5 border-b border-samurai-grey-dark/50">
        <span className="text-white/80">
          <span className="text-samurai-red font-bold">{disrupted}</span>/{CHOKEPOINTS.length} chokepoints disrupted
        </span>
        <span className="text-samurai-steel">
          Monitoring {totalTrade}% of global trade
        </span>
      </div>

      {/* Chokepoint list */}
      <div className="flex-1 overflow-y-auto">
        {CHOKEPOINTS.map(cp => {
          const cfg = STATUS_CONFIG[cp.status]
          const Icon = cfg.icon
          return (
            <div
              key={cp.name}
              className="px-2 py-2 border-b border-samurai-grey-dark/30 hover:bg-samurai-grey-dark/10 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Icon className="w-3 h-3 flex-shrink-0" style={{ color: cfg.color }} />
                <span className="text-white font-bold flex-1">{cp.name}</span>
                <span
                  className="text-[8px] px-1.5 py-0.5 rounded font-bold"
                  style={{ color: cfg.color, background: `${cfg.color}20` }}
                >
                  {cfg.label}
                </span>
              </div>
              <div className="mt-1 text-samurai-steel leading-tight">{cp.description}</div>
              <div className="flex items-center gap-3 mt-1 text-[9px]">
                <span className="text-samurai-steel">{cp.dailyTraffic}</span>
                <span className="text-cyan-500">{cp.percentGlobalTrade}% global trade</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="px-2 py-0.5 border-t border-samurai-grey-dark/50 text-samurai-steel text-center text-[8px]">
        Static data &bull; AIS enrichment planned
      </div>
    </div>
  )
}
