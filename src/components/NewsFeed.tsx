import { useState, useEffect, useCallback } from 'react'
import { Newspaper, ExternalLink, RefreshCw, Clock } from 'lucide-react'
import { API } from '../lib/api'

interface NewsItem {
  title: string
  link: string
  pubDate: string
  source: string
  category: 'crypto' | 'markets' | 'macro' | 'tech' | 'general'
}

const RSS_FEEDS = [
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk', category: 'crypto' as const },
  { url: 'https://cointelegraph.com/rss', source: 'CoinTelegraph', category: 'crypto' as const },
  { url: 'https://feeds.marketwatch.com/marketwatch/topstories/', source: 'MarketWatch', category: 'markets' as const },
  { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', source: 'BBC Business', category: 'macro' as const },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml', source: 'NYT Business', category: 'macro' as const },
  { url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', source: 'CNBC', category: 'markets' as const },
]

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function NewsFeed() {
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'crypto' | 'markets' | 'macro'>('all')

  const fetchNews = useCallback(async () => {
    setLoading(true)
    const allItems: NewsItem[] = []

    // Fetch feeds in parallel (rss2json converts RSS to JSON)
    const results = await Promise.allSettled(
      RSS_FEEDS.map(async (feed) => {
        try {
          const res = await fetch(
            API.rss(`/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`)
          )
          if (!res.ok) return []
          const json = await res.json()
          if (json.status !== 'ok' || !json.items) return []
          return json.items.slice(0, 5).map((item: { title: string; link: string; pubDate: string }) => ({
            title: item.title,
            link: item.link,
            pubDate: item.pubDate,
            source: feed.source,
            category: feed.category,
          }))
        } catch {
          return []
        }
      })
    )

    for (const result of results) {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        allItems.push(...result.value)
      }
    }

    // Sort by date (newest first)
    allItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())

    setNews(allItems)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchNews()
    const interval = setInterval(fetchNews, 300000) // 5 min
    return () => clearInterval(interval)
  }, [fetchNews])

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'crypto': return 'text-samurai-amber bg-samurai-amber/10'
      case 'markets': return 'text-samurai-green bg-samurai-green/10'
      case 'macro': return 'text-samurai-cyan bg-samurai-cyan/10'
      case 'tech': return 'text-purple-400 bg-purple-400/10'
      default: return 'text-samurai-steel bg-samurai-grey-dark'
    }
  }

  const getSourceColor = (source: string) => {
    if (source.includes('Coin')) return 'text-samurai-amber'
    if (source.includes('Reuters') || source.includes('Market')) return 'text-samurai-green'
    if (source.includes('BBC') || source.includes('NYT')) return 'text-samurai-cyan'
    return 'text-samurai-steel'
  }

  const filteredNews = filter === 'all'
    ? news
    : news.filter(n => n.category === filter)

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Header with filter + refresh */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 flex-wrap">
          {(['all', 'crypto', 'markets', 'macro'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase transition-all ${
                filter === f
                  ? 'bg-samurai-red text-white'
                  : 'bg-samurai-grey-dark text-samurai-steel hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <button
          onClick={fetchNews}
          disabled={loading}
          className="p-1 rounded hover:bg-samurai-grey-dark transition-colors"
          title="Refresh news"
        >
          <RefreshCw className={`w-3 h-3 text-samurai-steel ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* News list */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {loading && news.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-xs text-samurai-steel animate-pulse font-mono">Fetching headlines...</div>
          </div>
        ) : filteredNews.length === 0 ? (
          <div className="text-xs text-samurai-steel text-center py-4 font-mono">No news in this category</div>
        ) : (
          filteredNews.slice(0, 30).map((item, i) => (
            <a
              key={`${item.source}-${i}`}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-samurai-black rounded-md p-2 border border-samurai-grey-dark/20 hover:border-samurai-grey-dark transition-all group"
            >
              <div className="flex items-start gap-2">
                <Newspaper className="w-3 h-3 text-samurai-steel mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-white leading-tight line-clamp-2 group-hover:text-samurai-red transition-colors">
                    {item.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[8px] font-mono font-bold ${getSourceColor(item.source)}`}>
                      {item.source}
                    </span>
                    <span className={`text-[7px] font-mono font-bold px-1 py-0.5 rounded ${getCategoryColor(item.category)}`}>
                      {item.category.toUpperCase()}
                    </span>
                    <span className="text-[8px] text-samurai-steel font-mono flex items-center gap-0.5 ml-auto">
                      <Clock className="w-2 h-2" />
                      {timeAgo(item.pubDate)}
                    </span>
                  </div>
                </div>
                <ExternalLink className="w-2.5 h-2.5 text-samurai-steel/30 group-hover:text-samurai-red flex-shrink-0 mt-0.5 transition-colors" />
              </div>
            </a>
          ))
        )}
      </div>

      {/* Source count */}
      <div className="text-[8px] text-samurai-steel/50 text-center font-mono">
        {RSS_FEEDS.length} sources · {news.length} articles · Updates every 5 min
      </div>
    </div>
  )
}
