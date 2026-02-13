/**
 * Ollama Detection Service for NSIT
 * Detects Ollama installation and RMG Bridge Extension status.
 * TypeScript port of SCRP's ollamaDetection.js
 */

export interface OllamaStatus {
  running: boolean
  models: string[]
  count: number
}

export interface SetupStatus {
  ollama: OllamaStatus
  extension: boolean
  ready: boolean
}

class OllamaDetectionService {
  private detectionTimeout = 2000

  async detectOllama(): Promise<OllamaStatus> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('message', handler)
        resolve({ running: false, models: [], count: 0 })
      }, this.detectionTimeout)

      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'RMG_OLLAMA_MODELS' &&
            event.data?.source === 'rmg-ollama-bridge') {
          clearTimeout(timeout)
          window.removeEventListener('message', handler)

          if (event.data.data?.success && event.data.data?.models) {
            resolve({
              running: true,
              models: event.data.data.models,
              count: event.data.data.count || event.data.data.models.length,
            })
          } else {
            resolve({ running: false, models: [], count: 0 })
          }
        }
      }

      window.addEventListener('message', handler)
      window.postMessage({ type: 'RMG_REQUEST_OLLAMA_MODELS' }, '*')
    })
  }

  async detectExtension(): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('message', handler)
        resolve(false)
      }, this.detectionTimeout)

      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'RMG_OLLAMA_MODELS' &&
            event.data?.source === 'rmg-ollama-bridge') {
          clearTimeout(timeout)
          window.removeEventListener('message', handler)
          resolve(true)
        }
      }

      window.addEventListener('message', handler)
      window.postMessage({ type: 'RMG_REQUEST_OLLAMA_MODELS' }, '*')
    })
  }

  async getSetupStatus(): Promise<SetupStatus> {
    const [ollama, extension] = await Promise.all([
      this.detectOllama(),
      this.detectExtension(),
    ])

    return {
      ollama,
      extension,
      ready: ollama.running && extension,
    }
  }

  downloadExtension(): void {
    window.open('https://github.com/54MUR-AI/rmg-ollama-bridge/releases', '_blank')
  }

  downloadOllama(): void {
    window.open('https://ollama.ai/download', '_blank')
  }

  openInstallGuide(): void {
    window.open('https://github.com/54MUR-AI/rmg-ollama-bridge/blob/main/INSTALL.md', '_blank')
  }
}

export default OllamaDetectionService
