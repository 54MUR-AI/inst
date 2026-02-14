import { useState, useEffect, useCallback } from 'react'
import { ShieldAlert, RefreshCw, Brain } from 'lucide-react'
import { fetchConflictEvents, fetchConflictNews, fetchLatestCVEs, fetchCyberNews } from '../../lib/conflictApi'
import { saveAiCache, loadAiCache } from '../../lib/aiCache'
import ollamaProxy from '../../lib/ollamaProxy'

interface ThreatBriefing {
  summary: string
  hotZones: string[]
  threatLevel: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' | 'CRITICAL'
  generatedAt: string
}

const CACHE_KEY = 'conflict-threat'

function buildPrompt(
  eventCount: number, fatalityCount: number, topCountries: string[],
  headlines: string[], cyberHeadlines: string[], criticalCves: number
): string {
  return `You are a military and cyber intelligence analyst. Based on the following conflict and cyber threat data, provide a concise threat assessment briefing.

KINETIC DATA:
- ${eventCount} conflict events recorded globally
- ${fatalityCount} total fatalities
- Most affected countries: ${topCountries.join(', ')}
- Recent conflict headlines: ${headlines.slice(0, 5).join(' | ')}

CYBER DATA:
- ${criticalCves} critical CVEs (CVSS ≥ 9.0) in the last 48h
- Recent cyber headlines: ${cyberHeadlines.slice(0, 5).join(' | ')}

Respond in this EXACT JSON format (no markdown, no code blocks):
{
  "summary": "2-3 sentence executive summary covering BOTH kinetic conflict and cyber threat landscape",
  "hotZones": ["zone1", "zone2", "zone3", "zone4", "zone5"],
  "threatLevel": "LOW|MODERATE|ELEVATED|HIGH|CRITICAL"
}

Be factual and concise. Hot zones should be specific regions/countries. Factor cyber threats into the overall threat level.`
}

const THREAT_COLORS: Record<string, string> = {
  LOW: '#10b981',
  MODERATE: '#f59e0b',
  ELEVATED: '#f97316',
  HIGH: '#ef4444',
  CRITICAL: '#dc2626',
}

export default function ThreatAssessment() {
  const [briefing, setBriefing] = useState<ThreatBriefing | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const generate = useCallback(async (force = false) => {
    setLoading(true)
    setError(null)

    // Check cache first
    if (!force) {
      try {
        const cached = await loadAiCache<ThreatBriefing>(CACHE_KEY)
        if (cached?.content) {
          setBriefing(cached.content)
          setLoading(false)
          return
        }
      } catch { /* no cache */ }
    }

    try {
      // Gather kinetic + cyber data
      const [events, news, cyberNews, cves] = await Promise.all([
        fetchConflictEvents({ limit: 500 }),
        fetchConflictNews(),
        fetchCyberNews(),
        fetchLatestCVEs(30),
      ])

      const fatalityCount = events.reduce((s, e) => s + e.fatalities, 0)
      const countryMap = new Map<string, number>()
      events.forEach(e => countryMap.set(e.country, (countryMap.get(e.country) || 0) + 1))
      const topCountries = Array.from(countryMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([c, n]) => `${c} (${n})`)

      const headlines = news.slice(0, 10).map(a => a.title)
      const cyberHeadlines = cyberNews.slice(0, 10).map(a => a.title)
      const criticalCves = cves.filter(c => (c.cvss ?? 0) >= 9).length

      const prompt = buildPrompt(events.length, fatalityCount, topCountries, headlines, cyberHeadlines, criticalCves)

      // Use Ollama via RMG Bridge extension (works in iframe context)
      const aiModel = localStorage.getItem('nsit-ai-model') || 'llama3.2'

      let responseText = ''

      if (ollamaProxy.isAvailable) {
        const result = await ollamaProxy.generate(aiModel, prompt) as any
        responseText = result?.response || ''
      } else {
        throw new Error('Ollama bridge not available — install RMG extension')
      }

      // Parse JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Invalid AI response')

      const parsed = JSON.parse(jsonMatch[0]) as ThreatBriefing
      parsed.generatedAt = new Date().toISOString()

      setBriefing(parsed)
      saveAiCache(CACHE_KEY, parsed).catch(() => {})
    } catch (err) {
      console.warn('[Threat] Assessment failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate')
      // Show a static fallback
      if (!briefing) {
        setBriefing({
          summary: 'Threat assessment requires AI (Ollama). Connect Ollama and refresh to generate a live briefing based on current conflict data.',
          hotZones: ['Configure AI in Settings'],
          threatLevel: 'MODERATE',
          generatedAt: new Date().toISOString(),
        })
      }
    }
    setLoading(false)
  }, [briefing])

  useEffect(() => {
    generate()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const threatColor = briefing ? THREAT_COLORS[briefing.threatLevel] || '#f59e0b' : '#666'

  return (
    <div className="h-full flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-samurai-steel font-mono">THREAT ASSESSMENT</span>
          {briefing && (
            <span
              className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded"
              style={{ color: threatColor, background: `${threatColor}20` }}
            >
              {briefing.threatLevel}
            </span>
          )}
        </div>
        <button
          onClick={() => generate(true)}
          disabled={loading}
          className="p-1 rounded hover:bg-samurai-grey-dark transition-colors"
          title="Regenerate"
        >
          <RefreshCw className={`w-3 h-3 text-samurai-steel ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-0.5">
        {loading && !briefing ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Brain className="w-6 h-6 text-samurai-red/30 mx-auto mb-2 animate-pulse" />
              <span className="text-[10px] text-samurai-steel font-mono">Analyzing conflict data...</span>
            </div>
          </div>
        ) : briefing ? (
          <div className="space-y-2">
            {/* Threat level bar */}
            <div className="flex items-center gap-1">
              {['LOW', 'MODERATE', 'ELEVATED', 'HIGH', 'CRITICAL'].map(level => (
                <div
                  key={level}
                  className="flex-1 h-2 rounded-full transition-all"
                  style={{
                    background: briefing.threatLevel === level
                      ? THREAT_COLORS[level]
                      : `${THREAT_COLORS[level]}20`,
                    opacity: briefing.threatLevel === level ? 1 : 0.3,
                  }}
                />
              ))}
            </div>

            {/* Summary */}
            <div className="text-[10px] text-white/90 leading-relaxed">
              {briefing.summary}
            </div>

            {/* Hot zones */}
            <div>
              <div className="text-[8px] text-samurai-steel font-mono uppercase tracking-wider mb-1">HOT ZONES</div>
              <div className="flex flex-wrap gap-1">
                {briefing.hotZones.map((zone, i) => (
                  <span
                    key={i}
                    className="text-[8px] font-mono px-1.5 py-0.5 rounded border"
                    style={{ color: threatColor, borderColor: `${threatColor}40`, background: `${threatColor}10` }}
                  >
                    {zone}
                  </span>
                ))}
              </div>
            </div>

            {error && (
              <div className="text-[8px] text-yellow-400/70 font-mono">{error}</div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <ShieldAlert className="w-6 h-6 text-samurai-red/20" />
            <p className="text-[10px] text-samurai-steel">Assessment unavailable</p>
          </div>
        )}
      </div>

      <div className="text-[7px] text-samurai-steel/40 text-center font-mono">
        {briefing?.generatedAt
          ? `Generated ${new Date(briefing.generatedAt).toLocaleTimeString()}`
          : 'AI-powered · ACLED + GDELT data'
        }
      </div>
    </div>
  )
}
