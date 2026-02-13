/**
 * Ollama Proxy Service for NSIT
 * Communicates with local Ollama through the RMG Bridge Extension.
 * Same protocol as SCRP's ollamaProxy.js.
 */

interface OllamaResponse {
  success: boolean
  data?: unknown
  error?: string
}

interface OllamaModelsData {
  success: boolean
  models: string[]
  count: number
}

class OllamaProxyService {
  private requestId = 0
  private models: string[] = []
  private bridgeDetected = false
  private listeners: Array<() => void> = []

  constructor() {
    // Listen for bridge model injections
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.data?.type === 'RMG_OLLAMA_MODELS' && event.data?.source === 'rmg-ollama-bridge') {
        const data = event.data.data as OllamaModelsData
        if (data?.success && data?.models?.length > 0) {
          this.models = data.models
          this.bridgeDetected = true
          this.listeners.forEach(fn => fn())
        }
      }
    })
  }

  /** Subscribe to bridge status changes */
  onStatusChange(fn: () => void): () => void {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn)
    }
  }

  get isAvailable(): boolean {
    return this.bridgeDetected && this.models.length > 0
  }

  get availableModels(): string[] {
    return this.models
  }

  /** Request a model refresh from the extension */
  requestModels(): void {
    window.postMessage({ type: 'RMG_REQUEST_OLLAMA_MODELS' }, '*')
  }

  /** Send a request to Ollama through the extension */
  async request(endpoint: string, body: unknown, method = 'POST'): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const requestId = `nsit_ollama_${++this.requestId}_${Date.now()}`

      const responseHandler = (event: MessageEvent) => {
        if (event.data?.type === 'RMG_OLLAMA_API_RESPONSE' &&
            event.data?.requestId === requestId &&
            event.data?.source === 'rmg-ollama-bridge') {
          window.removeEventListener('message', responseHandler)
          clearTimeout(timeout)

          const res = event.data as OllamaResponse & { requestId: string }
          if (res.success) {
            resolve(res.data)
          } else {
            reject(new Error(res.error || 'Ollama request failed'))
          }
        }
      }

      const timeout = setTimeout(() => {
        window.removeEventListener('message', responseHandler)
        reject(new Error('Ollama request timeout (5m)'))
      }, 300000)

      window.addEventListener('message', responseHandler)

      window.postMessage({
        type: 'RMG_OLLAMA_API_REQUEST',
        requestId,
        endpoint,
        method,
        body,
      }, '*')
    })
  }

  /** Generate text completion */
  async generate(model: string, prompt: string, options: Record<string, unknown> = {}): Promise<unknown> {
    return this.request('/api/generate', { model, prompt, stream: false, ...options })
  }

  /** Chat completion */
  async chat(model: string, messages: Array<{ role: string; content: string }>, options: Record<string, unknown> = {}): Promise<unknown> {
    return this.request('/api/chat', { model, messages, stream: false, ...options })
  }
}

const ollamaProxy = new OllamaProxyService()
export default ollamaProxy
