/**
 * Centralized data pipeline status tracking.
 * Widgets subscribe to status updates to show loading, rate-limit, and error states.
 */

export type PipelineState = 'idle' | 'loading' | 'ok' | 'rate-limited' | 'error' | 'stale'

export interface PipelineInfo {
  state: PipelineState
  message: string
  lastOk: number       // timestamp of last successful fetch
  usingLdgrKey: boolean // whether an LDGR API key is being used
}

const pipelines = new Map<string, PipelineInfo>()
const listeners = new Set<() => void>()

function defaults(): PipelineInfo {
  return { state: 'idle', message: '', lastOk: 0, usingLdgrKey: false }
}

export function getPipeline(name: string): PipelineInfo {
  return pipelines.get(name) || defaults()
}

export function getAllPipelines(): Map<string, PipelineInfo> {
  return new Map(pipelines)
}

export function setPipelineState(
  name: string,
  state: PipelineState,
  message?: string,
  usingLdgrKey?: boolean
) {
  const prev = pipelines.get(name) || defaults()
  const info: PipelineInfo = {
    ...prev,
    state,
    message: message ?? prev.message,
    usingLdgrKey: usingLdgrKey ?? prev.usingLdgrKey,
  }
  if (state === 'ok') info.lastOk = Date.now()
  pipelines.set(name, info)
  listeners.forEach(fn => fn())
}

export function onPipelineChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Human-readable flavor text for each pipeline */
export const PIPELINE_LABELS: Record<string, { name: string; free: string; premium: string }> = {
  opensky:    { name: 'OpenSky Network',   free: 'Anonymous · limited credits',      premium: 'OAuth2 · 4,000 credits/day' },
  coingecko:  { name: 'CoinGecko',         free: 'Free tier · 10-30 req/min',        premium: 'Pro API · 500 req/min' },
  yahoo:      { name: 'Yahoo Finance',     free: 'Public endpoint · rate limited',    premium: 'RapidAPI · higher limits' },
  fred:       { name: 'FRED',              free: 'No key · data unavailable',         premium: 'API key · 120 req/min' },
  firms:      { name: 'NASA FIRMS',        free: 'Demo key · limited',               premium: 'Earthdata key · full access' },
  ais:        { name: 'Digitraffic AIS',  free: 'Public · Baltic/Nordic focus',     premium: 'AIS-Hub · global coverage' },
  acled:      { name: 'ACLED',             free: 'Via GDELT proxy',                   premium: 'Direct API · full dataset' },
  gdelt:      { name: 'GDELT',             free: 'Public · no key needed',            premium: 'Public · no key needed' },
  cve:        { name: 'CIRCL CVE',         free: 'Public · no key needed',            premium: 'Public · no key needed' },
  polymarket: { name: 'Polymarket',        free: 'Public · no key needed',            premium: 'Public · no key needed' },
  fng:        { name: 'Fear & Greed',      free: 'Public · no key needed',            premium: 'Public · no key needed' },
}

/** Get a status line for a pipeline (for widget footers) */
export function getPipelineStatusText(name: string): string {
  const info = getPipeline(name)
  const label = PIPELINE_LABELS[name]

  switch (info.state) {
    case 'loading':
      return `Fetching ${label?.name || name}...`
    case 'rate-limited': {
      const ago = info.lastOk ? Math.round((Date.now() - info.lastOk) / 60_000) : 0
      return `Rate limited · showing ${ago}m old data`
    }
    case 'error':
      return info.message || `${label?.name || name} error`
    case 'stale': {
      const staleAgo = info.lastOk ? Math.round((Date.now() - info.lastOk) / 60_000) : 0
      return `Stale data (${staleAgo}m) · retrying...`
    }
    case 'ok':
      return info.usingLdgrKey
        ? `${label?.premium || 'Premium'}`
        : `${label?.free || 'Free tier'}`
    default:
      return label?.free || ''
  }
}
