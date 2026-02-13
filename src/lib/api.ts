// Proxy paths work in both dev (Vite proxy) and prod (Netlify _redirects)
export const API = {
  coingecko: (path: string) => `/api/coingecko${path}`,
  polymarket: (path: string) => `/api/polymarket${path}`,
  fng: (path: string) => `/api/fng${path}`,
  rss: (path: string) => `/api/rss${path}`,
  yahoo: (path: string) => `/api/yahoo${path}`,
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
