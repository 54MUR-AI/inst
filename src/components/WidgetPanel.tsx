import { ReactNode } from 'react'
import { TrendingUp, Gauge, Brain, Grid3X3, GripVertical, Target, BarChart3, Newspaper, Gem, DollarSign } from 'lucide-react'

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
}

interface WidgetPanelProps {
  title: string
  icon?: string
  live?: boolean
  children: ReactNode
}

export default function WidgetPanel({ title, icon, live, children }: WidgetPanelProps) {
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
    </div>
  )
}
