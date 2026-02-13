import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, BarChart3 } from 'lucide-react'
import { fetchQuotes, fetchSparklines, POPULAR_STOCKS } from '../lib/yahooFinance'
import { getSharedMarkets } from '../lib/api'
import Sparkline from './Sparkline'

interface Mover {
  symbol: string
  name: string
  price: number
  changePct: number
  volume: string
  market: 'Stock' | 'Crypto'
  spark?: number[]
}

type Tab = 'gainers' | 'losers' | 'volume'

export default function TopMovers() {
  const [movers, setMovers] = useState<Mover[]>([])
  const [sparks, setSparks] = useState<Map<string, number[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('gainers')

  useEffect(() => {
    const load = async () => {
      const [stockQuotes, cryptoData] = await Promise.allSettled([
        fetchQuotes(POPULAR_STOCKS.map(s => s.symbol)),
        getSharedMarkets(),
      ])

      const all: Mover[] = []

      // Stocks
      if (stockQuotes.status === 'fulfilled') {
        const q = stockQuotes.value
        POPULAR_STOCKS.forEach(s => {
          const sq = q.get(s.symbol)
          if (!sq) return
          const vol = sq.regularMarketVolume
          all.push({
            symbol: s.symbol, name: s.name, price: sq.regularMarketPrice,
            changePct: sq.regularMarketChangePercent,
            volume: vol > 1e6 ? `${(vol / 1e6).toFixed(1)}M` : `${(vol / 1e3).toFixed(0)}K`,
            market: 'Stock',
          })
        })
      }

      // Crypto
      if (cryptoData.status === 'fulfilled' && cryptoData.value.length) {
        cryptoData.value.slice(0, 25).forEach((c: any) => {
          const vol = c.total_volume || 0
          all.push({
            symbol: c.symbol.toUpperCase(), name: c.name, price: c.current_price,
            changePct: c.price_change_percentage_24h || 0,
            volume: vol > 1e9 ? `$${(vol / 1e9).toFixed(1)}B` : vol > 1e6 ? `$${(vol / 1e6).toFixed(0)}M` : `$${(vol / 1e3).toFixed(0)}K`,
            market: 'Crypto',
          })
        })
      }

      setMovers(all)
      setLoading(false)
    }

    load()
    // Fetch sparklines for stocks
    fetchSparklines(POPULAR_STOCKS.map(s => s.symbol)).then(setSparks)
    const interval = setInterval(load, 120_000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-xs text-samurai-steel animate-pulse font-mono">Scanning markets...</div>
      </div>
    )
  }

  const sorted = [...movers].sort((a, b) => {
    if (tab === 'gainers') return b.changePct - a.changePct
    if (tab === 'losers') return a.changePct - b.changePct
    // volume: parse numeric value for sorting
    const parseVol = (v: string) => {
      const n = parseFloat(v.replace(/[$,]/g, ''))
      if (v.includes('B')) return n * 1e9
      if (v.includes('M')) return n * 1e6
      if (v.includes('K')) return n * 1e3
      return n
    }
    return parseVol(b.volume) - parseVol(a.volume)
  }).slice(0, 12)

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Tab bar */}
      <div className="flex gap-1">
        {([
          { key: 'gainers' as Tab, label: 'GAINERS', icon: <TrendingUp className="w-2.5 h-2.5" /> },
          { key: 'losers' as Tab, label: 'LOSERS', icon: <TrendingDown className="w-2.5 h-2.5" /> },
          { key: 'volume' as Tab, label: 'VOLUME', icon: <BarChart3 className="w-2.5 h-2.5" /> },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1 text-[9px] font-mono px-2 py-0.5 rounded transition-colors ${
              tab === t.key ? 'bg-samurai-red text-white' : 'text-samurai-steel hover:text-white'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-samurai-steel font-mono border-b border-samurai-grey-dark/30">
              <th className="text-left py-1 px-1">Asset</th>
              <th className="text-center py-1 px-1 hidden sm:table-cell">5D</th>
              <th className="text-right py-1 px-1">Price</th>
              <th className="text-right py-1 px-1">Chg%</th>
              <th className="text-right py-1 px-1 hidden sm:table-cell">Vol</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m, i) => {
              const up = m.changePct >= 0
              return (
                <tr key={`${m.symbol}-${i}`} className="border-b border-samurai-grey-dark/10 hover:bg-samurai-grey-dark/20">
                  <td className="py-1.5 px-1">
                    <div className="flex items-center gap-1">
                      <span className={`text-[7px] font-mono px-1 rounded ${
                        m.market === 'Crypto' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'
                      }`}>{m.market === 'Crypto' ? 'C' : 'S'}</span>
                      <span className="text-white font-medium">{m.symbol}</span>
                      <span className="text-samurai-steel text-[8px] hidden sm:inline truncate max-w-[60px]">{m.name}</span>
                    </div>
                  </td>
                  <td className="py-1.5 px-1 hidden sm:table-cell">
                    <Sparkline data={sparks.get(m.symbol) || []} width={40} height={14} positive={up} />
                  </td>
                  <td className="text-right py-1.5 px-1 font-mono text-white">
                    {m.price < 1 ? m.price.toFixed(4) : m.price < 100 ? m.price.toFixed(2) : m.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className={`text-right py-1.5 px-1 font-mono font-bold ${up ? 'text-samurai-green' : 'text-samurai-red'}`}>
                    <div className="flex items-center justify-end gap-0.5">
                      {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                      {up ? '+' : ''}{m.changePct.toFixed(2)}%
                    </div>
                  </td>
                  <td className="text-right py-1.5 px-1 font-mono text-samurai-steel hidden sm:table-cell">
                    {m.volume}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="text-[7px] text-samurai-steel/40 text-center font-mono">
        {movers.length} assets · {movers.filter(m => m.market === 'Stock').length} stocks · {movers.filter(m => m.market === 'Crypto').length} crypto
      </div>
    </div>
  )
}
