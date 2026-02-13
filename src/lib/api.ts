const isDev = import.meta.env.DEV

export const API = {
  coingecko: (path: string) =>
    isDev ? `/api/coingecko${path}` : `https://api.coingecko.com${path}`,
  polymarket: (path: string) =>
    isDev ? `/api/polymarket${path}` : `https://gamma-api.polymarket.com${path}`,
  fng: (path: string) =>
    isDev ? `/api/fng${path}` : `https://api.alternative.me${path}`,
}

// Stagger fetches to avoid CoinGecko rate limits (max ~10 req/min on free tier)
const queue: (() => Promise<void>)[] = []
let processing = false

async function processQueue() {
  if (processing) return
  processing = true
  while (queue.length > 0) {
    const next = queue.shift()
    if (next) {
      await next()
      // 2s gap between CoinGecko calls
      await new Promise(r => setTimeout(r, 2000))
    }
  }
  processing = false
}

export function fetchCoinGecko(path: string, options?: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    queue.push(async () => {
      try {
        const res = await fetch(API.coingecko(path), options)
        resolve(res)
      } catch (err) {
        reject(err)
      }
    })
    processQueue()
  })
}
