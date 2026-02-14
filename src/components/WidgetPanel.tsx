import { ReactNode, useState, useEffect } from 'react'
import { TrendingUp, Gauge, Brain, Grid3X3, GripVertical, Target, BarChart3, Newspaper, Gem, DollarSign, Crosshair, Flame, CalendarDays, CandlestickChart as CandlestickIcon, Star, Bell, Layers, Banknote, PieChart, Clock, Globe, Shield, Plane, AlertTriangle, Ship, Cpu, Wheat, Loader2 } from 'lucide-react'
import { getPipeline, onPipelineChange, getPipelineStatusText, type PipelineState } from '../lib/pipelineStatus'

const ICONS: Record<string, ReactNode> = {
  'trending-up': <TrendingUp className="w-3.5 h-3.5" />,
  'gauge': <Gauge className="w-3.5 h-3.5" />,
  'brain': <Brain className="w-3.5 h-3.5" />,
  'grid': <Grid3X3 className="w-3.5 h-3.5" />,
  'target': <Target className="w-3.5 h-3.5" />,
  'chart': <BarChart3 className="w-3.5 h-3.5" />,
  'newspaper': <Newspaper className="w-3.5 h-3.5" />,
  'gem': <Gem className="w-3.5 h-3.5" />,
  'dollar': <DollarSign className="w-3.5 h-3.5" />,
  'crosshair': <Crosshair className="w-3.5 h-3.5" />,
  'flame': <Flame className="w-3.5 h-3.5" />,
  'calendar': <CalendarDays className="w-3.5 h-3.5" />,
  'candlestick': <CandlestickIcon className="w-3.5 h-3.5" />,
  'star': <Star className="w-3.5 h-3.5" />,
  'bell': <Bell className="w-3.5 h-3.5" />,
  'layers': <Layers className="w-3.5 h-3.5" />,
  'banknote': <Banknote className="w-3.5 h-3.5" />,
  'pie-chart': <PieChart className="w-3.5 h-3.5" />,
  'clock': <Clock className="w-3.5 h-3.5" />,
  'globe': <Globe className="w-3.5 h-3.5" />,
  'shield': <Shield className="w-3.5 h-3.5" />,
  'plane': <Plane className="w-3.5 h-3.5" />,
  'alert-triangle': <AlertTriangle className="w-3.5 h-3.5" />,
  'ship': <Ship className="w-3.5 h-3.5" />,
  'cpu': <Cpu className="w-3.5 h-3.5" />,
  'wheat': <Wheat className="w-3.5 h-3.5" />,
}

interface WidgetPanelProps {
  title: string
  icon?: string
  live?: boolean
  pipeline?: string  // pipeline name for status indicator
  children: ReactNode
}

const STATE_COLORS: Record<PipelineState, string> = {
  idle: 'text-samurai-steel/50',
  loading: 'text-cyan-400',
  ok: 'text-samurai-steel/60',
  'rate-limited': 'text-amber-400',
  error: 'text-red-400',
  stale: 'text-amber-400/70',
}

function PipelineIndicator({ name }: { name: string }) {
  const [info, setInfo] = useState(() => getPipeline(name))

  useEffect(() => {
    const unsub = onPipelineChange(() => setInfo(getPipeline(name)))
    return unsub
  }, [name])

  const text = getPipelineStatusText(name)
  if (!text) return null

  const colorClass = STATE_COLORS[info.state] || 'text-samurai-steel/50'

  return (
    <div className={`flex items-center gap-1.5 px-2 py-0.5 border-t border-samurai-grey-dark/40 text-[8px] font-mono ${colorClass}`}>
      {info.state === 'loading' && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
      {info.state === 'rate-limited' && <AlertTriangle className="w-2.5 h-2.5" />}
      {info.usingLdgrKey && info.state === 'ok' && <Shield className="w-2.5 h-2.5 text-samurai-green/60" />}
      <span className="truncate">{text}</span>
    </div>
  )
}

export default function WidgetPanel({ title, icon, live, pipeline, children }: WidgetPanelProps) {
  return (
    <div className="widget-panel h-full flex flex-col">
      <div className="widget-header">
        <div className="flex items-center gap-2">
          <GripVertical className="w-3 h-3 text-samurai-steel/50" />
          {icon && <span className="text-samurai-red">{ICONS[icon]}</span>}
          <span className="text-xs font-bold text-samurai-steel-light tracking-wider uppercase">{title}</span>
          {live && (
            <div className="flex items-center gap-1 ml-2">
              <div className="live-dot" />
              <span className="text-[9px] font-mono text-samurai-green">LIVE</span>
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3">
        {children}
      </div>
      {pipeline && <PipelineIndicator name={pipeline} />}
    </div>
  )
}
