import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, X, RefreshCw, TrendingUp, TrendingDown, PieChart } from 'lucide-react'
import { fetchQuotes } from '../lib/yahooFinance'
import type { YahooQuote } from '../lib/yahooFinance'

// ── Types ──

interface Holding {
  id: string
  symbol: string
  quantity: number
  costBasis: number // per-share cost
}

interface HoldingWithQuote extends Holding {
  quote: YahooQuote | null
  currentValue: number
  costValue: number
  pnl: number
  pnlPct: number
  weight: number // % of total portfolio
}

// ── Persistence ──

const STORAGE_KEY = 'nsit-portfolio'
const REFRESH_INTERVAL = 60_000

function loadHoldings(): Holding[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* corrupt */ }
  return []
}

function saveHoldings(holdings: Holding[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings))
}

// ── Allocation colors ──
const COLORS = [
  '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#6366f1',
  '#14b8a6', '#e11d48', '#0ea5e9', '#a855f7', '#d946ef',
]

// ── Component ──

export default function PortfolioTracker() {
  const [holdings, setHoldings] = useState<Holding[]>(loadHoldings)
  const [quotes, setQuotes] = useState<Map<string, YahooQuote>>(new Map())
  const [loading, setLoading] = useState(false)
  const [addMode, setAddMode] = useState(false)
  const [symbol, setSymbol] = useState('')
  const [quantity, setQuantity] = useState('')
  const [costBasis, setCostBasis] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchAll = useCallback(async () => {
    if (holdings.length === 0) return
    setLoading(true)
    try {
      const data = await fetchQuotes(holdings.map(h => h.symbol))
      setQuotes(new Map(data))
    } catch { /* ignore */ }
    setLoading(false)
  }, [holdings])

  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchAll, REFRESH_INTERVAL)
    return () => clearInterval(iv)
  }, [fetchAll])

  useEffect(() => {
    if (addMode && inputRef.current) inputRef.current.focus()
  }, [addMode])

  // Build enriched holdings
  const enriched: HoldingWithQuote[] = holdings.map(h => {
    const q = quotes.get(h.symbol) || null
    const price = q?.regularMarketPrice ?? 0
    const currentValue = price * h.quantity
    const costValue = h.costBasis * h.quantity
    const pnl = currentValue - costValue
    const pnlPct = costValue > 0 ? (pnl / costValue) * 100 : 0
    return { ...h, quote: q, currentValue, costValue, pnl, pnlPct, weight: 0 }
  })

  const totalValue = enriched.reduce((s, h) => s + h.currentValue, 0)
  const totalCost = enriched.reduce((s, h) => s + h.costValue, 0)
  const totalPnl = totalValue - totalCost
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0

  enriched.forEach(h => { h.weight = totalValue > 0 ? (h.currentValue / totalValue) * 100 : 0 })
  enriched.sort((a, b) => b.currentValue - a.currentValue)

  const addHolding = (e: React.FormEvent) => {
    e.preventDefault()
    const sym = symbol.trim().toUpperCase()
    const qty = parseFloat(quantity)
    const cost = parseFloat(costBasis)
    if (!sym || isNaN(qty) || qty <= 0 || isNaN(cost) || cost <= 0) return

    const newHolding: Holding = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      symbol: sym,
      quantity: qty,
      costBasis: cost,
    }
    const next = [...holdings, newHolding]
    setHoldings(next)
    saveHoldings(next)
    setSymbol('')
    setQuantity('')
    setCostBasis('')
    setAddMode(false)
  }

  const removeHolding = (id: string) => {
    const next = holdings.filter(h => h.id !== id)
    setHoldings(next)
    saveHoldings(next)
  }

  const fmt = (n: number) => {
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
    if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
    return `$${n.toFixed(2)}`
  }

  return (
    <div className="h-full flex flex-col gap-1.5">
      {/* Header with totals */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-samurai-steel font-mono">{holdings.length} HOLDINGS</span>
          {totalValue > 0 && (
            <>
              <span className="text-[10px] font-mono font-bold text-white">{fmt(totalValue)}</span>
              <span className={`text-[9px] font-mono font-bold ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {totalPnl >= 0 ? '+' : ''}{fmt(totalPnl)} ({totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(2)}%)
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setAddMode(!addMode)}
            className={`p-1 rounded transition-colors ${addMode ? 'bg-samurai-red/20 text-samurai-red' : 'hover:bg-samurai-grey-dark text-samurai-steel'}`}>
            <Plus className="w-3 h-3" />
          </button>
          <button onClick={fetchAll} disabled={loading}
            className="p-1 rounded hover:bg-samurai-grey-dark transition-colors">
            <RefreshCw className={`w-3 h-3 text-samurai-steel ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Add holding form */}
      {addMode && (
        <form onSubmit={addHolding} className="space-y-1.5 bg-samurai-grey-dark/20 rounded-lg p-2 border border-samurai-grey-dark/40">
          <div className="flex items-center gap-1">
            <input ref={inputRef} type="text" value={symbol} onChange={e => setSymbol(e.target.value)}
              placeholder="Symbol" className="flex-1 text-[10px] font-mono bg-samurai-grey-dark/50 border border-samurai-grey-dark/60 rounded px-2 py-1.5 text-white placeholder-samurai-steel/40 focus:outline-none focus:border-samurai-red/50" />
            <button type="button" onClick={() => { setAddMode(false); setSymbol(''); setQuantity(''); setCostBasis('') }}
              className="p-1 text-samurai-steel hover:text-white"><X className="w-3 h-3" /></button>
          </div>
          <div className="flex items-center gap-1">
            <input type="number" step="any" value={quantity} onChange={e => setQuantity(e.target.value)}
              placeholder="Qty" className="flex-1 text-[10px] font-mono bg-samurai-grey-dark/50 border border-samurai-grey-dark/60 rounded px-2 py-1.5 text-white placeholder-samurai-steel/40 focus:outline-none focus:border-samurai-red/50" />
            <span className="text-[9px] text-samurai-steel">@</span>
            <input type="number" step="any" value={costBasis} onChange={e => setCostBasis(e.target.value)}
              placeholder="Cost/share" className="flex-1 text-[10px] font-mono bg-samurai-grey-dark/50 border border-samurai-grey-dark/60 rounded px-2 py-1.5 text-white placeholder-samurai-steel/40 focus:outline-none focus:border-samurai-red/50" />
            <button type="submit"
              className="text-[9px] font-bold px-3 py-1.5 bg-samurai-red/20 text-samurai-red rounded hover:bg-samurai-red/30 transition-colors">Add</button>
          </div>
        </form>
      )}

      {/* Allocation bar */}
      {enriched.length > 0 && totalValue > 0 && (
        <div className="flex items-center gap-1.5">
          <PieChart className="w-3 h-3 text-samurai-steel flex-shrink-0" />
          <div className="flex-1 h-2.5 rounded-full overflow-hidden flex bg-samurai-grey-dark/30">
            {enriched.map((h, i) => (
              <div
                key={h.id}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ width: `${h.weight}%`, backgroundColor: COLORS[i % COLORS.length] }}
                title={`${h.symbol} ${h.weight.toFixed(1)}%`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Holdings list */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
        {holdings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <PieChart className="w-6 h-6 text-samurai-red/20" />
            <p className="text-[10px] text-samurai-steel">Add holdings to track your portfolio</p>
            <p className="text-[8px] text-samurai-steel/50">Click + to add your first position</p>
          </div>
        ) : (
          enriched.map((h, i) => {
            const isUp = h.pnl >= 0
            const dayUp = h.quote ? h.quote.regularMarketChangePercent >= 0 : true
            return (
              <div key={h.id} className="bg-samurai-black rounded-md border border-samurai-grey-dark/30 px-2 py-1.5 group">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    {isUp
                      ? <TrendingUp className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                      : <TrendingDown className="w-3 h-3 text-red-400 flex-shrink-0" />
                    }
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-white font-mono truncate">{h.symbol}</div>
                      <div className="text-[7px] text-samurai-steel font-mono">
                        {h.quantity} × ${h.costBasis.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-right">
                      <div className="text-[10px] font-mono font-bold text-white">{fmt(h.currentValue)}</div>
                      <div className="flex items-center gap-1 justify-end">
                        <span className={`text-[8px] font-mono font-bold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isUp ? '+' : ''}{fmt(h.pnl)}
                        </span>
                        <span className={`text-[7px] font-mono ${isUp ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                          ({isUp ? '+' : ''}{h.pnlPct.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                    <button onClick={() => removeHolding(h.id)}
                      className="p-0.5 text-samurai-steel/0 group-hover:text-samurai-steel/50 hover:!text-red-400 transition-colors">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
                {/* Day change + weight */}
                {h.quote && (
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className={`text-[7px] font-mono ${dayUp ? 'text-emerald-400/60' : 'text-red-400/60'}`}>
                      Today {dayUp ? '+' : ''}{h.quote.regularMarketChangePercent.toFixed(2)}%
                    </span>
                    <span className="text-[7px] text-samurai-steel/50 font-mono">
                      ${h.quote.regularMarketPrice.toFixed(2)}
                    </span>
                    <span className="text-[7px] text-samurai-steel/40 font-mono ml-auto">
                      {h.weight.toFixed(1)}% of portfolio
                    </span>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Footer */}
      <div className="text-[7px] text-samurai-steel/40 text-center font-mono">
        Click + to add positions · Hover to remove · Auto-refreshes every 60s
      </div>
    </div>
  )
}
