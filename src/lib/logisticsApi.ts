/**
 * Logistics & Supply Chain API layer
 * Uses GDELT (via scrp-api proxy) for supply chain news,
 * Yahoo Finance for shipping/logistics stocks & commodity prices,
 * and static data for shipping route disruptions.
 */

const SCRP_API = 'https://scrp-api.onrender.com'

// ── Supply Chain News (GDELT) ──

export interface SupplyChainEvent {
  id: string
  title: string
  url: string
  domain: string
  category: 'shipping' | 'semiconductor' | 'energy' | 'food' | 'trade' | 'logistics'
  sourcecountry: string
  dateadded: string
  tone: number
}

let scNewsCache: { data: SupplyChainEvent[]; ts: number } | null = null
let scNewsFailed = false
let scNewsFailedAt = 0
const SC_NEWS_CACHE_TTL = 600_000
const SC_NEWS_RETRY_BACKOFF = 120_000

export async function fetchSupplyChainNews(): Promise<SupplyChainEvent[]> {
  if (scNewsCache && Date.now() - scNewsCache.ts < SC_NEWS_CACHE_TTL) {
    return scNewsCache.data
  }
  if (scNewsFailed && Date.now() - scNewsFailedAt < SC_NEWS_RETRY_BACKOFF) {
    return scNewsCache?.data || []
  }

  try {
    const params = new URLSearchParams({
      query: '"supply chain" OR "shipping disruption" OR "semiconductor shortage" OR "port congestion" OR "freight rates" OR "trade war" OR "food security" OR "energy crisis" OR "rare earth" OR "chip shortage"',
      mode: 'ArtList',
      maxrecords: '40',
      format: 'json',
      timespan: '7d',
      sort: 'DateDesc',
    })

    const res = await fetch(`${SCRP_API}/gdelt?${params}`, { signal: AbortSignal.timeout(30000) })
    if (!res.ok) {
      scNewsFailed = true
      scNewsFailedAt = Date.now()
      return scNewsCache?.data || []
    }

    const text = await res.text()
    if (!text.startsWith('{') && !text.startsWith('[')) {
      scNewsFailed = true
      scNewsFailedAt = Date.now()
      return scNewsCache?.data || []
    }

    const json = JSON.parse(text)
    const articles: SupplyChainEvent[] = (json.articles || []).map((a: any, i: number) => {
      const title = (a.title || '').toLowerCase()
      let category: SupplyChainEvent['category'] = 'logistics'
      if (title.match(/ship|port|freight|container|maritime|canal|vessel/)) category = 'shipping'
      else if (title.match(/semiconductor|chip|wafer|fab|tsmc|intel|nvidia/)) category = 'semiconductor'
      else if (title.match(/oil|gas|energy|opec|pipeline|refiner|lng|coal/)) category = 'energy'
      else if (title.match(/food|grain|wheat|rice|famine|fertilizer|crop/)) category = 'food'
      else if (title.match(/tariff|trade war|sanction|embargo|export ban|import/)) category = 'trade'

      return {
        id: `sc-${i}-${Date.now()}`,
        title: a.title || '',
        url: a.url || '',
        domain: a.domain || '',
        category,
        sourcecountry: a.sourcecountry || '',
        dateadded: a.seendate || '',
        tone: parseFloat(a.tone?.split(',')[0]) || 0,
      }
    })

    scNewsFailed = false
    scNewsCache = { data: articles, ts: Date.now() }
    return articles
  } catch (err) {
    console.warn('[Logistics] Supply chain news fetch failed:', err)
    scNewsFailed = true
    scNewsFailedAt = Date.now()
    return scNewsCache?.data || []
  }
}

// ── Shipping & Logistics Tickers ──

export const SHIPPING_TICKERS = [
  { symbol: 'ZIM', name: 'ZIM Shipping', sector: 'Container' },
  { symbol: 'MATX', name: 'Matson', sector: 'Container' },
  { symbol: 'DAC', name: 'Danaos', sector: 'Container' },
  { symbol: 'GOGL', name: 'Golden Ocean', sector: 'Dry Bulk' },
  { symbol: 'SBLK', name: 'Star Bulk', sector: 'Dry Bulk' },
  { symbol: 'FRO', name: 'Frontline', sector: 'Tanker' },
  { symbol: 'STNG', name: 'Scorpio Tankers', sector: 'Tanker' },
  { symbol: 'UPS', name: 'UPS', sector: 'Logistics' },
  { symbol: 'FDX', name: 'FedEx', sector: 'Logistics' },
  { symbol: 'XPO', name: 'XPO Logistics', sector: 'Logistics' },
]

export const SEMICONDUCTOR_TICKERS = [
  { symbol: 'TSM', name: 'TSMC', region: 'Taiwan' },
  { symbol: 'ASML', name: 'ASML', region: 'Netherlands' },
  { symbol: 'NVDA', name: 'NVIDIA', region: 'US' },
  { symbol: 'AMD', name: 'AMD', region: 'US' },
  { symbol: 'INTC', name: 'Intel', region: 'US' },
  { symbol: 'AVGO', name: 'Broadcom', region: 'US' },
  { symbol: 'MU', name: 'Micron', region: 'US' },
  { symbol: 'QCOM', name: 'Qualcomm', region: 'US' },
]

export const FOOD_COMMODITY_SYMBOLS = [
  { symbol: 'ZW=F', name: 'Wheat', unit: '/bu' },
  { symbol: 'ZC=F', name: 'Corn', unit: '/bu' },
  { symbol: 'ZS=F', name: 'Soybeans', unit: '/bu' },
  { symbol: 'KC=F', name: 'Coffee', unit: '/lb' },
  { symbol: 'SB=F', name: 'Sugar', unit: '/lb' },
  { symbol: 'CC=F', name: 'Cocoa', unit: '/ton' },
]

// ── Global Shipping Chokepoints ──

export interface Chokepoint {
  name: string
  lat: number
  lng: number
  status: 'normal' | 'disrupted' | 'critical'
  description: string
  dailyTraffic: string
  percentGlobalTrade: number
}

// Static data — could be enriched with live AIS data later
export const CHOKEPOINTS: Chokepoint[] = [
  { name: 'Suez Canal', lat: 30.58, lng: 32.27, status: 'disrupted', description: 'Houthi attacks disrupting Red Sea shipping; rerouting via Cape of Good Hope', dailyTraffic: '~50 vessels/day', percentGlobalTrade: 12 },
  { name: 'Strait of Hormuz', lat: 26.57, lng: 56.25, status: 'normal', description: 'Critical oil transit point; ~21M bbl/day', dailyTraffic: '~80 vessels/day', percentGlobalTrade: 21 },
  { name: 'Strait of Malacca', lat: 2.5, lng: 101.5, status: 'normal', description: 'Key Asia-Europe route; 25% of global trade', dailyTraffic: '~200 vessels/day', percentGlobalTrade: 25 },
  { name: 'Panama Canal', lat: 9.08, lng: -79.68, status: 'disrupted', description: 'Drought reducing daily transits; longer wait times', dailyTraffic: '~35 vessels/day', percentGlobalTrade: 5 },
  { name: 'Bab el-Mandeb', lat: 12.58, lng: 43.33, status: 'critical', description: 'Houthi missile/drone attacks; many vessels rerouting', dailyTraffic: '~30 vessels/day', percentGlobalTrade: 9 },
  { name: 'Taiwan Strait', lat: 24.0, lng: 119.5, status: 'normal', description: 'Critical semiconductor supply route; geopolitical tensions', dailyTraffic: '~240 vessels/day', percentGlobalTrade: 8 },
  { name: 'Strait of Gibraltar', lat: 35.96, lng: -5.35, status: 'normal', description: 'Mediterranean-Atlantic gateway', dailyTraffic: '~300 vessels/day', percentGlobalTrade: 6 },
  { name: 'Cape of Good Hope', lat: -34.35, lng: 18.47, status: 'normal', description: 'Alternative to Suez; increased traffic due to Red Sea diversions', dailyTraffic: '~100 vessels/day', percentGlobalTrade: 4 },
]
