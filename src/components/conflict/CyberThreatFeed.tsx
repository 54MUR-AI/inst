import { useState, useEffect, useCallback } from 'react'
import { Shield, Bug, Skull, Wifi, Lock, ExternalLink, RefreshCw } from 'lucide-react'
import { fetchLatestCVEs, fetchCyberNews, type CveEntry, type CyberEvent } from '../../lib/conflictApi'

const CATEGORY_CONFIG: Record<CyberEvent['category'], { icon: typeof Shield; color: string; label: string }> = {
  ransomware: { icon: Skull, color: '#e63946', label: 'RANSOM' },
  apt: { icon: Shield, color: '#f97316', label: 'APT' },
  ddos: { icon: Wifi, color: '#eab308', label: 'DDoS' },
  breach: { icon: Lock, color: '#ef4444', label: 'BREACH' },
  vulnerability: { icon: Bug, color: '#8b5cf6', label: 'VULN' },
  cyber: { icon: Shield, color: '#6b7280', label: 'CYBER' },
}

function cvssColor(score: number | null): string {
  if (score === null) return '#6b7280'
  if (score >= 9) return '#ef4444'
  if (score >= 7) return '#f97316'
  if (score >= 4) return '#eab308'
  return '#22c55e'
}

export default function CyberThreatFeed() {
  const [tab, setTab] = useState<'news' | 'cve'>('news')
  const [cyberNews, setCyberNews] = useState<CyberEvent[]>([])
  const [cves, setCves] = useState<CveEntry[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [news, vulns] = await Promise.allSettled([fetchCyberNews(), fetchLatestCVEs(20)])
    if (news.status === 'fulfilled') setCyberNews(news.value)
    if (vulns.status === 'fulfilled') setCves(vulns.value)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 600_000) // 10 min
    return () => clearInterval(iv)
  }, [refresh])

  const stats = {
    ransomware: cyberNews.filter(e => e.category === 'ransomware').length,
    apt: cyberNews.filter(e => e.category === 'apt').length,
    breach: cyberNews.filter(e => e.category === 'breach').length,
    critical: cves.filter(c => (c.cvss ?? 0) >= 9).length,
  }

  return (
    <div className="h-full flex flex-col text-[10px] font-mono">
      {/* Stats bar */}
      <div className="flex items-center gap-2 px-2 py-1 border-b border-samurai-grey-dark/50">
        <span className="text-red-500">{stats.ransomware} RANSOM</span>
        <span className="text-orange-500">{stats.apt} APT</span>
        <span className="text-red-400">{stats.breach} BREACH</span>
        <span className="text-purple-500">{stats.critical} CRIT CVE</span>
        <div className="flex-1" />
        <button onClick={refresh} className="p-0.5 hover:bg-samurai-grey-dark rounded" title="Refresh">
          <RefreshCw className={`w-3 h-3 text-samurai-steel ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex border-b border-samurai-grey-dark/50">
        {(['news', 'cve'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1 text-center uppercase transition-colors ${
              tab === t ? 'text-samurai-red border-b border-samurai-red' : 'text-samurai-steel hover:text-white'
            }`}
          >
            {t === 'news' ? 'Cyber Intel' : 'CVE Feed'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'news' ? (
          cyberNews.length === 0 ? (
            <div className="p-3 text-samurai-steel text-center">{loading ? 'Loading...' : 'No cyber intel available'}</div>
          ) : (
            cyberNews.map(e => {
              const cfg = CATEGORY_CONFIG[e.category]
              const Icon = cfg.icon
              return (
                <a
                  key={e.id}
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 px-2 py-1.5 border-b border-samurai-grey-dark/30 hover:bg-samurai-grey-dark/20 transition-colors"
                >
                  <Icon className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: cfg.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-white/90 leading-tight line-clamp-2">{e.title}</div>
                    <div className="flex items-center gap-2 mt-0.5 text-samurai-steel">
                      <span style={{ color: cfg.color }}>{cfg.label}</span>
                      <span>{e.domain}</span>
                      {e.sourcecountry && <span>{e.sourcecountry}</span>}
                    </div>
                  </div>
                  <ExternalLink className="w-2.5 h-2.5 text-samurai-steel flex-shrink-0 mt-1" />
                </a>
              )
            })
          )
        ) : (
          cves.length === 0 ? (
            <div className="p-3 text-samurai-steel text-center">{loading ? 'Loading...' : 'No CVEs available'}</div>
          ) : (
            cves.map(c => (
              <div key={c.id} className="px-2 py-1.5 border-b border-samurai-grey-dark/30">
                <div className="flex items-center gap-2">
                  <span className="text-samurai-red font-bold">{c.id}</span>
                  {c.cvss !== null && (
                    <span
                      className="px-1 rounded text-[9px] font-bold"
                      style={{ color: cvssColor(c.cvss), backgroundColor: `${cvssColor(c.cvss)}20` }}
                    >
                      CVSS {c.cvss.toFixed(1)}
                    </span>
                  )}
                </div>
                <div className="text-white/80 leading-tight line-clamp-2 mt-0.5">{c.summary}</div>
                <div className="text-samurai-steel mt-0.5">
                  {c.published && new Date(c.published).toLocaleDateString()}
                </div>
              </div>
            ))
          )
        )}
      </div>

      <div className="px-2 py-0.5 border-t border-samurai-grey-dark/50 text-samurai-steel text-center text-[8px]">
        CVE: CIRCL &bull; Intel: GDELT
      </div>
    </div>
  )
}
