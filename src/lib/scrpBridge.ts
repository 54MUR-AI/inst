/**
 * SCRP Bridge for NSIT
 * Calls the SCRP backend API to scrape and summarize news articles.
 * Used by AI Briefing for deeper article analysis.
 */

const SCRP_API = 'https://scrp-api.onrender.com'

export interface ScrapeResult {
  success: boolean
  content?: {
    url: string
    title: string
    content: string
    content_type: string
    author?: string
    publish_date?: string
  }
  summary?: {
    original_url: string
    title: string
    summary: string
    key_points: string[]
    content_type: string
    word_count: number
    model_used: string
  }
  error?: string
}

/**
 * Scrape and optionally summarize a URL via SCRP backend.
 * Can pass provider/model/apiKey for AI summarization.
 */
export async function scrapeUrl(
  url: string,
  options?: {
    summarize?: boolean
    provider?: string
    model?: string
    apiKey?: string
  }
): Promise<ScrapeResult> {
  try {
    const res = await fetch(`${SCRP_API}/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        summarize: options?.summarize ?? true,
        provider: options?.provider || undefined,
        model: options?.model || undefined,
        api_key: options?.apiKey || undefined,
      }),
    })

    if (!res.ok) {
      return { success: false, error: `SCRP API returned ${res.status}` }
    }

    return await res.json()
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}

/**
 * Batch scrape multiple URLs. Returns results keyed by URL.
 * Uses Promise.allSettled so one failure doesn't block others.
 */
export async function scrapeMultiple(
  urls: string[],
  options?: { summarize?: boolean; provider?: string; model?: string; apiKey?: string }
): Promise<Map<string, ScrapeResult>> {
  const results = await Promise.allSettled(
    urls.map(url => scrapeUrl(url, options))
  )

  const map = new Map<string, ScrapeResult>()
  for (let i = 0; i < urls.length; i++) {
    const r = results[i]
    map.set(urls[i], r.status === 'fulfilled' ? r.value : { success: false, error: 'Request failed' })
  }
  return map
}

/**
 * Check if SCRP API is reachable.
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${SCRP_API}/health`, { signal: AbortSignal.timeout(5000) })
    return res.ok
  } catch {
    return false
  }
}
