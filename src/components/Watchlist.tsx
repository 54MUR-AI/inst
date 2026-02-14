import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, X, Search, TrendingUp, TrendingDown, Star, RefreshCw } from 'lucide-react'
import { fetchQuotes } from '../lib/yahooFinance'
import type { YahooQuote } from '../lib/yahooFinance'

const STORAGE_KEY = 'nsit-watchlist'
const REFRESH_INTERVAL = 60_000 // 60s

const DEFAULT_SYMBOLS = ['AAPL', 'NVDA', 'TSLA', 'BTC-USD', 'ETH-USD', 'GC=F', '^GSPC']

function loadWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch { /* corrupt */ }
  return DEFAULT_SYMBOLS
}

function saveWatchlist(symbols: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols))
  } catch (err) {
    console.warn('[Watchlist] Failed to save:', err)
  }
}

export default function Watchlist() {
  const [symbols, setSymbols] = useState<string[]>(loadWatchlist)
  const [quotes, setQuotes] = useState<Map<string, YahooQuote>>(new Map())
  const [loading, setLoading] = useState(true)
  const [addMode, setAddMode] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchAll = useCallback(async () => {
    if (symbols.length === 0) { setLoading(false); return }
    try {
      const data = await fetchQuotes(symbols)
      setQuotes(new Map(data))
    } catch { /* ignore */ }
    setLoading(false)
  }, [symbols])

  // Initial fetch + interval
  useEffect(() => {
    setLoading(true)
    fetchAll()
    const iv = setInterval(fetchAll, REFRESH_INTERVAL)
    return () => clearInterval(iv)
  }, [fetchAll])

  // Focus input when add mode opens
  useEffect(() => {
    if (addMode && inputRef.current) inputRef.current.focus()
  }, [addMode])

  const addSymbol = (sym: string) => {
    const upper = sym.trim().toUpperCase()
    if (!upper || symbols.includes(upper)) return
    const next = [...symbols, upper]
    setSymbols(next)
    saveWatchlist(next)
    setSearchInput('')
    setAddMode(false)
  }

  const removeSymbol = (sym: string) => {
    const next = symbols.filter(s => s !== sym)
    setSymbols(next)
    saveWatchlist(next)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchInput.trim()) addSymbol(searchInput)
  }

  const formatPrice = (q: YahooQuote) => {
    const p = q.regularMarketPrice
    if (p >= 10000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 })
    if (p >= 1) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return p.toPrecision(4)
  }

  const formatVolume = (v: number) => {
    if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
    if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`
    return v.toString()
  }

  return (
    <div className="h-full flex flex-col gap-1.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-samurai-steel font-mono">
          {symbols.length} SYMBOLS · LIVE
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setAddMode(!addMode)}
            className={`p-1 rounded transition-colors ${addMode ? 'bg-samurai-red/20 text-samurai-red' : 'hover:bg-samurai-grey-dark text-samurai-steel'}`}
            title="Add symbol"
          >
            <Plus className="w-3 h-3" />
          </button>
          <button
            onClick={() => { setLoading(true); fetchAll() }}
            disabled={loading}
            className="p-1 rounded hover:bg-samurai-grey-dark transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-3 h-3 text-samurai-steel ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Add symbol input */}
      {addMode && (
        <form onSubmit={handleSubmit} className="flex items-center gap-1">
          <div className="flex-1 relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-samurai-steel/50" />
            <input
              ref={inputRef}
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="AAPL, BTC-USD, GC=F..."
              className="w-full text-[10px] font-mono bg-samurai-grey-dark/50 border border-samurai-grey-dark/60 rounded pl-6 pr-2 py-1.5 text-white placeholder-samurai-steel/40 focus:outline-none focus:border-samurai-red/50"
            />
          </div>
          <button
            type="submit"
            className="text-[9px] font-bold px-2 py-1.5 bg-samurai-red/20 text-samurai-red rounded hover:bg-samurai-red/30 transition-colors"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => { setAddMode(false); setSearchInput('') }}
            className="p-1 text-samurai-steel hover:text-white"
          >
            <X className="w-3 h-3" />
          </button>
        </form>
      )}

      {/* Quick-add suggestions */}
      {addMode && (
        <div className="flex gap-1 flex-wrap">
          {['MSFT', 'AMZN', 'GOOGL', 'META', 'SOL-USD', 'CL=F', '^DJI', 'EURUSD=X']
            .filter(s => !symbols.includes(s))
            .slice(0, 6)
            .map(s => (
              <button
                key={s}
                onClick={() => addSymbol(s)}
                className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-samurai-grey-dark/30 text-samurai-steel hover:text-white hover:bg-samurai-grey-dark/60 transition-colors"
              >
                +{s}
              </button>
            ))}
        </div>
      )}

      {/* Watchlist items */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
        {loading && symbols.length > 0 && quotes.size === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[10px] text-samurai-steel animate-pulse font-mono">Loading quotes...</span>
          </div>
        ) : symbols.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Star className="w-6 h-6 text-samurai-red/20" />
            <p className="text-[10px] text-samurai-steel">Add symbols to your watchlist</p>
          </div>
        ) : (
          symbols.map(sym => {
            const q = quotes.get(sym)
            if (!q) return (
              <div key={sym} className="flex items-center justify-between bg-samurai-black rounded-md border border-samurai-grey-dark/30 px-2 py-1.5">
                <span className="text-[10px] font-mono text-samurai-steel">{sym}</span>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-samurai-steel/50 animate-pulse">loading...</span>
                  <button onClick={() => removeSymbol(sym)} className="p-0.5 text-samurai-steel/30 hover:text-red-400 transition-colors">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            )

            const isUp = q.regularMarketChangePercent >= 0
            return (
              <div key={sym} className="bg-samurai-black rounded-md border border-samurai-grey-dark/30 px-2 py-1.5 group">
                <div className="flex items-center justify-between gap-2">
                  {/* Left: symbol + name */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isUp
                      ? <TrendingUp className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                      : <TrendingDown className="w-3 h-3 text-red-400 flex-shrink-0" />
                    }
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-white font-mono truncate">{sym}</div>
                      <div className="text-[8px] text-samurai-steel truncate">{q.shortName}</div>
                    </div>
                  </div>

                  {/* Right: price + change + remove */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-right">
                      <div className="text-[10px] font-mono font-bold text-white">{formatPrice(q)}</div>
                      <div className={`text-[8px] font-mono font-bold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isUp ? '+' : ''}{q.regularMarketChangePercent.toFixed(2)}%
                      </div>
                    </div>
                    <button
                      onClick={() => removeSymbol(sym)}
                      className="p-0.5 text-samurai-steel/0 group-hover:text-samurai-steel/50 hover:!text-red-400 transition-colors"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>

                {/* Detail row */}
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[7px] text-samurai-steel font-mono">O {q.regularMarketOpen > 0 ? formatPrice({ ...q, regularMarketPrice: q.regularMarketOpen }) : '—'}</span>
                  <span className="text-[7px] text-samurai-steel font-mono">H {formatPrice({ ...q, regularMarketPrice: q.regularMarketDayHigh })}</span>
                  <span className="text-[7px] text-samurai-steel font-mono">L {formatPrice({ ...q, regularMarketPrice: q.regularMarketDayLow })}</span>
                  {q.regularMarketVolume > 0 && (
                    <span className="text-[7px] text-samurai-steel font-mono">Vol {formatVolume(q.regularMarketVolume)}</span>
                  )}
                  <span className={`text-[7px] font-mono ml-auto ${q.marketState === 'REGULAR' ? 'text-emerald-400' : 'text-samurai-steel/50'}`}>
                    {q.marketState === 'REGULAR' ? 'OPEN' : q.marketState === 'PRE' ? 'PRE' : q.marketState === 'POST' ? 'POST' : 'CLOSED'}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Footer */}
      <div className="text-[7px] text-samurai-steel/40 text-center font-mono">
        Click + to add · Hover to remove · Auto-refreshes every 60s
      </div>
    </div>
  )
}
