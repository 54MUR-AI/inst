import { useState, useEffect, useCallback, useRef } from 'react'
import { Bell, BellRing, Plus, X, Search, Volume2, VolumeX } from 'lucide-react'
import { fetchQuotes } from '../lib/yahooFinance'

// ── Types ──

interface PriceAlert {
  id: string
  symbol: string
  targetPrice: number
  direction: 'above' | 'below'
  createdAt: string
  triggered: boolean
  triggeredAt?: string
}

// ── Persistence ──

const STORAGE_KEY = 'nsit-price-alerts'
const CHECK_INTERVAL = 30_000 // 30s

function loadAlerts(): PriceAlert[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* corrupt */ }
  return []
}

function saveAlerts(alerts: PriceAlert[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts))
  } catch (err) {
    console.warn('[PriceAlerts] Failed to save alerts:', err)
  }
}

// ── Browser notification ──

function sendNotification(alert: PriceAlert, currentPrice: number) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(`NSIT Price Alert: ${alert.symbol}`, {
      body: `${alert.symbol} is now $${currentPrice.toLocaleString()} — crossed ${alert.direction} $${alert.targetPrice.toLocaleString()}`,
      icon: '/favicon.ico',
    })
  }
  // Also play a beep
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.value = 0.1
    osc.start()
    osc.stop(ctx.currentTime + 0.15)
  } catch { /* audio not available */ }
}

// ── Component ──

export default function PriceAlerts() {
  const [alerts, setAlerts] = useState<PriceAlert[]>(loadAlerts)
  const [addMode, setAddMode] = useState(false)
  const [symbol, setSymbol] = useState('')
  const [targetPrice, setTargetPrice] = useState('')
  const [direction, setDirection] = useState<'above' | 'below'>('above')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [lastPrices, setLastPrices] = useState<Map<string, number>>(new Map())
  const inputRef = useRef<HTMLInputElement>(null)

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Focus input when add mode opens
  useEffect(() => {
    if (addMode && inputRef.current) inputRef.current.focus()
  }, [addMode])

  // Check alerts periodically
  const checkAlerts = useCallback(async () => {
    const activeAlerts = alerts.filter(a => !a.triggered)
    if (activeAlerts.length === 0) return

    const symbols = [...new Set(activeAlerts.map(a => a.symbol))]
    try {
      const quotes = await fetchQuotes(symbols)
      const priceMap = new Map<string, number>()
      let changed = false

      const updated = alerts.map(alert => {
        if (alert.triggered) return alert
        const q = quotes.get(alert.symbol)
        if (!q) return alert

        priceMap.set(alert.symbol, q.regularMarketPrice)
        const price = q.regularMarketPrice
        const shouldTrigger =
          (alert.direction === 'above' && price >= alert.targetPrice) ||
          (alert.direction === 'below' && price <= alert.targetPrice)

        if (shouldTrigger) {
          changed = true
          if (soundEnabled) sendNotification(alert, price)
          return { ...alert, triggered: true, triggeredAt: new Date().toISOString() }
        }
        return alert
      })

      setLastPrices(priceMap)
      if (changed) {
        setAlerts(updated)
        saveAlerts(updated)
      }
    } catch { /* ignore fetch errors */ }
  }, [alerts, soundEnabled])

  useEffect(() => {
    checkAlerts()
    const iv = setInterval(checkAlerts, CHECK_INTERVAL)
    return () => clearInterval(iv)
  }, [checkAlerts])

  const addAlert = (e: React.FormEvent) => {
    e.preventDefault()
    const sym = symbol.trim().toUpperCase()
    const price = parseFloat(targetPrice)
    if (!sym || isNaN(price) || price <= 0) return

    const newAlert: PriceAlert = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      symbol: sym,
      targetPrice: price,
      direction,
      createdAt: new Date().toISOString(),
      triggered: false,
    }

    const next = [newAlert, ...alerts]
    setAlerts(next)
    saveAlerts(next)
    setSymbol('')
    setTargetPrice('')
    setAddMode(false)
  }

  const removeAlert = (id: string) => {
    const next = alerts.filter(a => a.id !== id)
    setAlerts(next)
    saveAlerts(next)
  }

  const clearTriggered = () => {
    const next = alerts.filter(a => !a.triggered)
    setAlerts(next)
    saveAlerts(next)
  }

  const active = alerts.filter(a => !a.triggered)
  const triggered = alerts.filter(a => a.triggered)

  return (
    <div className="h-full flex flex-col gap-1.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-samurai-steel font-mono">
          {active.length} ACTIVE · {triggered.length} TRIGGERED
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-1 rounded transition-colors ${soundEnabled ? 'text-samurai-red' : 'text-samurai-steel/40'}`}
            title={soundEnabled ? 'Sound on' : 'Sound off'}
          >
            {soundEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
          </button>
          <button
            onClick={() => setAddMode(!addMode)}
            className={`p-1 rounded transition-colors ${addMode ? 'bg-samurai-red/20 text-samurai-red' : 'hover:bg-samurai-grey-dark text-samurai-steel'}`}
            title="Add alert"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Add alert form */}
      {addMode && (
        <form onSubmit={addAlert} className="space-y-1.5 bg-samurai-grey-dark/20 rounded-lg p-2 border border-samurai-grey-dark/40">
          <div className="flex items-center gap-1">
            <div className="flex-1 relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-samurai-steel/50" />
              <input
                ref={inputRef}
                type="text"
                value={symbol}
                onChange={e => setSymbol(e.target.value)}
                placeholder="Symbol (AAPL, BTC-USD...)"
                className="w-full text-[10px] font-mono bg-samurai-grey-dark/50 border border-samurai-grey-dark/60 rounded pl-6 pr-2 py-1.5 text-white placeholder-samurai-steel/40 focus:outline-none focus:border-samurai-red/50"
              />
            </div>
            <button type="button" onClick={() => { setAddMode(false); setSymbol(''); setTargetPrice('') }}
              className="p-1 text-samurai-steel hover:text-white">
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-samurai-steel">Alert when price goes</span>
            <button type="button" onClick={() => setDirection('above')}
              className={`text-[9px] font-bold px-2 py-0.5 rounded transition-colors ${
                direction === 'above' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-samurai-grey-dark/30 text-samurai-steel'
              }`}>
              Above
            </button>
            <button type="button" onClick={() => setDirection('below')}
              className={`text-[9px] font-bold px-2 py-0.5 rounded transition-colors ${
                direction === 'below' ? 'bg-red-500/20 text-red-400' : 'bg-samurai-grey-dark/30 text-samurai-steel'
              }`}>
              Below
            </button>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-samurai-steel font-mono">$</span>
            <input
              type="number"
              step="any"
              value={targetPrice}
              onChange={e => setTargetPrice(e.target.value)}
              placeholder="Target price"
              className="flex-1 text-[10px] font-mono bg-samurai-grey-dark/50 border border-samurai-grey-dark/60 rounded px-2 py-1.5 text-white placeholder-samurai-steel/40 focus:outline-none focus:border-samurai-red/50"
            />
            <button type="submit"
              className="text-[9px] font-bold px-3 py-1.5 bg-samurai-red/20 text-samurai-red rounded hover:bg-samurai-red/30 transition-colors">
              Set Alert
            </button>
          </div>
        </form>
      )}

      {/* Alert list */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Bell className="w-6 h-6 text-samurai-red/20" />
            <p className="text-[10px] text-samurai-steel">No price alerts set</p>
            <p className="text-[8px] text-samurai-steel/50">Click + to add your first alert</p>
          </div>
        ) : (
          <>
            {/* Active alerts */}
            {active.length > 0 && (
              <div>
                <div className="text-[8px] text-samurai-steel font-bold uppercase tracking-widest mb-1">Active</div>
                {active.map(alert => {
                  const currentPrice = lastPrices.get(alert.symbol)
                  const distance = currentPrice
                    ? ((alert.targetPrice - currentPrice) / currentPrice * 100)
                    : null

                  return (
                    <div key={alert.id} className="flex items-center justify-between bg-samurai-black rounded-md border border-samurai-grey-dark/30 px-2 py-1.5 mb-1 group">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Bell className="w-3 h-3 text-samurai-red flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-bold text-white font-mono">{alert.symbol}</span>
                            <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${
                              alert.direction === 'above' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                            }`}>
                              {alert.direction === 'above' ? '↑' : '↓'} ${alert.targetPrice.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {currentPrice && (
                              <span className="text-[8px] text-samurai-steel font-mono">
                                Now ${currentPrice.toLocaleString()}
                              </span>
                            )}
                            {distance !== null && (
                              <span className={`text-[7px] font-mono font-bold ${Math.abs(distance) < 2 ? 'text-amber-400' : 'text-samurai-steel/50'}`}>
                                ({distance >= 0 ? '+' : ''}{distance.toFixed(1)}%)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button onClick={() => removeAlert(alert.id)}
                        className="p-0.5 text-samurai-steel/0 group-hover:text-samurai-steel/50 hover:!text-red-400 transition-colors">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Triggered alerts */}
            {triggered.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[8px] text-samurai-steel font-bold uppercase tracking-widest">Triggered</span>
                  <button onClick={clearTriggered} className="text-[7px] text-samurai-steel hover:text-white transition-colors">
                    Clear all
                  </button>
                </div>
                {triggered.map(alert => (
                  <div key={alert.id} className="flex items-center justify-between bg-samurai-black/50 rounded-md border border-emerald-500/20 px-2 py-1.5 mb-1 group opacity-70">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <BellRing className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-bold text-white font-mono">{alert.symbol}</span>
                          <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${
                            alert.direction === 'above' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                          }`}>
                            {alert.direction === 'above' ? '↑' : '↓'} ${alert.targetPrice.toLocaleString()}
                          </span>
                        </div>
                        {alert.triggeredAt && (
                          <span className="text-[7px] text-emerald-400/60 font-mono">
                            Triggered {new Date(alert.triggeredAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => removeAlert(alert.id)}
                      className="p-0.5 text-samurai-steel/0 group-hover:text-samurai-steel/50 hover:!text-red-400 transition-colors">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="text-[7px] text-samurai-steel/40 text-center font-mono">
        Checks every 30s · Browser notifications {Notification.permission === 'granted' ? 'enabled' : 'disabled'}
      </div>
    </div>
  )
}
