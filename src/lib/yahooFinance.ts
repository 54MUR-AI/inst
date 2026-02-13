/**
 * Yahoo Finance quote fetcher
 * Uses the v8 quote endpoint — free, no API key needed.
 * Batches multiple symbols into a single request.
 */

import { API } from './api'

export interface YahooQuote {
  symbol: string
  shortName: string
  regularMarketPrice: number
  regularMarketChange: number
  regularMarketChangePercent: number
  regularMarketPreviousClose: number
  regularMarketOpen: number
  regularMarketDayHigh: number
  regularMarketDayLow: number
  regularMarketVolume: number
  currency: string
  marketState: string // PRE, REGULAR, POST, CLOSED
  quoteType: string   // EQUITY, INDEX, CURRENCY, FUTURE, MUTUALFUND
}

let cache: { data: Map<string, YahooQuote>; ts: number } = { data: new Map(), ts: 0 }
const CACHE_TTL = 60_000 // 1 minute

export async function fetchQuotes(symbols: string[]): Promise<Map<string, YahooQuote>> {
  const now = Date.now()

  // Return cache if fresh and has all requested symbols
  if (now - cache.ts < CACHE_TTL && symbols.every(s => cache.data.has(s))) {
    return cache.data
  }

  try {
    const url = API.yahoo(`/v7/finance/quote?symbols=${symbols.join(',')}&fields=shortName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketPreviousClose,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,regularMarketVolume,currency,marketState,quoteType`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Yahoo ${res.status}`)
    const json = await res.json()

    const quotes = new Map<string, YahooQuote>()
    for (const q of json.quoteResponse?.result || []) {
      quotes.set(q.symbol, {
        symbol: q.symbol,
        shortName: q.shortName || q.symbol,
        regularMarketPrice: q.regularMarketPrice ?? 0,
        regularMarketChange: q.regularMarketChange ?? 0,
        regularMarketChangePercent: q.regularMarketChangePercent ?? 0,
        regularMarketPreviousClose: q.regularMarketPreviousClose ?? 0,
        regularMarketOpen: q.regularMarketOpen ?? 0,
        regularMarketDayHigh: q.regularMarketDayHigh ?? 0,
        regularMarketDayLow: q.regularMarketDayLow ?? 0,
        regularMarketVolume: q.regularMarketVolume ?? 0,
        currency: q.currency || 'USD',
        marketState: q.marketState || 'CLOSED',
        quoteType: q.quoteType || 'EQUITY',
      })
    }

    // Merge into cache
    for (const [k, v] of quotes) cache.data.set(k, v)
    cache.ts = now

    return cache.data
  } catch (err) {
    console.warn('[Yahoo Finance] Fetch failed:', err)
    return cache.data // return stale cache on error
  }
}

// ── Symbol groups ──

export const INDICES = [
  { symbol: '^GSPC', name: 'S&P 500', flag: '🇺🇸' },
  { symbol: '^DJI', name: 'Dow Jones', flag: '🇺🇸' },
  { symbol: '^IXIC', name: 'NASDAQ', flag: '🇺🇸' },
  { symbol: '^RUT', name: 'Russell 2000', flag: '🇺🇸' },
  { symbol: '^FTSE', name: 'FTSE 100', flag: '🇬🇧' },
  { symbol: '^GDAXI', name: 'DAX', flag: '🇩🇪' },
  { symbol: '^FCHI', name: 'CAC 40', flag: '🇫🇷' },
  { symbol: '^N225', name: 'Nikkei 225', flag: '🇯🇵' },
  { symbol: '000001.SS', name: 'Shanghai', flag: '🇨🇳' },
  { symbol: '^HSI', name: 'Hang Seng', flag: '🇭🇰' },
  { symbol: '^BSESN', name: 'BSE Sensex', flag: '🇮🇳' },
]

export const METALS = [
  { symbol: 'GC=F', name: 'Gold', unit: '/oz' },
  { symbol: 'SI=F', name: 'Silver', unit: '/oz' },
  { symbol: 'PL=F', name: 'Platinum', unit: '/oz' },
  { symbol: 'PA=F', name: 'Palladium', unit: '/oz' },
  { symbol: 'HG=F', name: 'Copper', unit: '/lb' },
]

export const ENERGY = [
  { symbol: 'CL=F', name: 'WTI Crude', unit: '/bbl' },
  { symbol: 'BZ=F', name: 'Brent Crude', unit: '/bbl' },
  { symbol: 'NG=F', name: 'Natural Gas', unit: '/MMBtu' },
]

export const FOREX = [
  { symbol: 'DX-Y.NYB', name: 'DXY (USD Index)', flag: '💵' },
  { symbol: 'EURUSD=X', name: 'EUR/USD', flag: '🇪🇺' },
  { symbol: 'GBPUSD=X', name: 'GBP/USD', flag: '🇬🇧' },
  { symbol: 'USDJPY=X', name: 'USD/JPY', flag: '🇯🇵' },
  { symbol: 'USDCNY=X', name: 'USD/CNY', flag: '🇨🇳' },
  { symbol: 'USDCHF=X', name: 'USD/CHF', flag: '🇨🇭' },
  { symbol: 'AUDUSD=X', name: 'AUD/USD', flag: '🇦🇺' },
  { symbol: 'USDCAD=X', name: 'USD/CAD', flag: '🇨🇦' },
]

export const BONDS = [
  { symbol: '^IRX', name: '3-Month', tenor: '3M' },
  { symbol: '^FVX', name: '5-Year', tenor: '5Y' },
  { symbol: '^TNX', name: '10-Year', tenor: '10Y' },
  { symbol: '^TYX', name: '30-Year', tenor: '30Y' },
]

// Gold/Silver Ratio helper
export function calcGSR(quotes: Map<string, YahooQuote>): number | null {
  const gold = quotes.get('GC=F')
  const silver = quotes.get('SI=F')
  if (!gold || !silver || silver.regularMarketPrice === 0) return null
  return gold.regularMarketPrice / silver.regularMarketPrice
}
