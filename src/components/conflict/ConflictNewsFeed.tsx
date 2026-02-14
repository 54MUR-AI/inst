import { useState, useEffect, useCallback } from 'react'
import { Newspaper, RefreshCw, ExternalLink } from 'lucide-react'
import { fetchConflictNews, type GdeltEvent } from '../../lib/conflictApi'

export default function ConflictNewsFeed() {
  const [articles, setArticles] = useState<GdeltEvent[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await fetchConflictNews()
      setArticles(data)
    } catch { /* handled */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 300_000)
    return () => clearInterval(iv)
  }, [refresh])

  const toneColor = (tone: number) => {
    if (tone < -5) return 'text-red-400'
    if (tone < -2) return 'text-orange-400'
    if (tone < 0) return 'text-yellow-400'
    return 'text-samurai-steel'
  }

  const timeAgo = (dateStr: string) => {
    if (!dateStr) return ''
    try {
      const y = dateStr.slice(0, 4)
      const m = dateStr.slice(4, 6)
      const d = dateStr.slice(6, 8)
      const h = dateStr.slice(8, 10)
      const min = dateStr.slice(10, 12)
      const date = new Date(`${y}-${m}-${d}T${h}:${min}:00Z`)
      const diff = Date.now() - date.getTime()
      const hours = Math.floor(diff / 3600000)
      if (hours < 1) return `${Math.floor(diff / 60000)}m ago`
      if (hours < 24) return `${hours}h ago`
      return `${Math.floor(hours / 24)}d ago`
    } catch { return '' }
  }

  return (
    <div className="h-full flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-samurai-steel font-mono">
          {articles.length} ARTICLES · 24H
        </span>
        <button
          onClick={() => { setLoading(true); refresh() }}
          disabled={loading}
          className="p-1 rounded hover:bg-samurai-grey-dark transition-colors"
        >
          <RefreshCw className={`w-3 h-3 text-samurai-steel ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
        {loading && articles.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[10px] text-samurai-steel animate-pulse font-mono">Scanning GDELT...</span>
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Newspaper className="w-6 h-6 text-samurai-red/20" />
            <p className="text-[10px] text-samurai-steel">No conflict news found</p>
          </div>
        ) : (
          articles.map((a, i) => (
            <a
              key={i}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-samurai-black rounded-md border border-samurai-grey-dark/30 px-2 py-1.5 hover:border-samurai-red/30 transition-colors group"
            >
              <div className="flex items-start gap-1.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] text-white group-hover:text-samurai-red transition-colors line-clamp-2 leading-tight">
                    {a.title}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[7px] text-samurai-steel font-mono">{a.domain}</span>
                    <span className={`text-[7px] font-mono font-bold ${toneColor(a.tone)}`}>
                      {a.tone > 0 ? '+' : ''}{a.tone.toFixed(1)}
                    </span>
                    <span className="text-[7px] text-samurai-steel/50 font-mono">{timeAgo(a.dateadded)}</span>
                  </div>
                </div>
                <ExternalLink className="w-2.5 h-2.5 text-samurai-steel/30 group-hover:text-samurai-red flex-shrink-0 mt-0.5" />
              </div>
            </a>
          ))
        )}
      </div>

      <div className="text-[7px] text-samurai-steel/40 text-center font-mono">
        GDELT Project · Conflict keywords · 24h window
      </div>
    </div>
  )
}
