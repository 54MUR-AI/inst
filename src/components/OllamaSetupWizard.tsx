import { useState, useEffect } from 'react'
import { CheckCircle, Circle, Download, ExternalLink, RefreshCw, Loader2 } from 'lucide-react'
import OllamaDetectionService from '../lib/ollamaDetection'
import type { SetupStatus } from '../lib/ollamaDetection'

interface Props {
  onComplete: (models: string[]) => void
  onCancel: () => void
}

function SetupStep({ number, title, status, icon, children }: {
  number: number; title: string; status: 'complete'|'pending'|'disabled'; icon: string; children: React.ReactNode
}) {
  const sIcon = status === 'complete' ? <CheckCircle className="w-5 h-5 text-green-400" />
    : status === 'disabled' ? <Circle className="w-5 h-5 text-white/20" />
    : <Circle className="w-5 h-5 text-samurai-red" />
  const border = status === 'complete' ? 'border-green-400/30 bg-green-400/5'
    : status === 'disabled' ? 'border-white/10 bg-white/5 opacity-50'
    : 'border-samurai-red/30 bg-samurai-red/5'
  return (
    <div className={`mb-4 p-4 rounded-lg border ${border} transition-all`}>
      <div className="flex items-start gap-3 mb-3">
        <div className="flex items-center gap-2"><span className="text-2xl">{icon}</span>{sIcon}</div>
        <h3 className="text-white font-bold">Step {number}: {title}</h3>
      </div>
      <div className="ml-11">{children}</div>
    </div>
  )
}

export default function OllamaSetupWizard({ onComplete, onCancel }: Props) {
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const det = new OllamaDetectionService()

  const checkStatus = async () => {
    setChecking(true)
    const r = await det.getSetupStatus()
    setStatus(r); setLoading(false); setChecking(false)
    if (r.ready) onComplete(r.ollama.models)
  }

  useEffect(() => { checkStatus() }, [])

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="w-8 h-8 text-samurai-red animate-spin" /></div>
  if (!status) return null

  return (
    <div className="bg-[#1a2332] rounded-xl border border-samurai-red/30 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">🗡️ Ollama Setup</h2>
        <button onClick={checkStatus} disabled={checking} className="p-2 hover:bg-white/10 rounded-lg disabled:opacity-50">
          <RefreshCw className={`w-5 h-5 text-white ${checking ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <p className="text-white/70 mb-6">Follow these steps to set up local Ollama integration with RMG.</p>

      <SetupStep number={1} title="Ollama Runtime" status={status.ollama.running ? 'complete' : 'pending'} icon="🤖">
        {!status.ollama.running ? (
          <div className="space-y-3">
            <p className="text-white/70 text-sm">Ollama is not running. Install it to run AI models locally.</p>
            <div className="flex gap-2">
              <button onClick={() => det.downloadOllama()} className="flex items-center gap-2 px-4 py-2 bg-samurai-red hover:bg-samurai-red-dark text-white rounded-lg"><Download size={16} />Download Ollama</button>
              <button onClick={checkStatus} className="px-4 py-2 border border-white/20 hover:bg-white/10 text-white rounded-lg">I installed it</button>
            </div>
          </div>
        ) : (
          <div className="text-sm">
            <p className="text-green-400 font-medium mb-1">✅ Ollama is running</p>
            <p className="text-white/70">Detected {status.ollama.count} model{status.ollama.count !== 1 ? 's' : ''}</p>
            {status.ollama.models.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {status.ollama.models.slice(0, 5).map(m => <span key={m} className="px-2 py-1 bg-white/10 text-white/70 text-xs rounded">{m}</span>)}
                {status.ollama.models.length > 5 && <span className="px-2 py-1 text-white/50 text-xs">+{status.ollama.models.length - 5} more</span>}
              </div>
            )}
          </div>
        )}
      </SetupStep>

      <SetupStep number={2} title="Configure Ollama CORS" status={status.ollama.running ? 'pending' : 'disabled'} icon="🔐">
        <div className="space-y-3">
          <p className="text-white/70 text-sm">Allow the browser extension to communicate with your local Ollama.</p>
          <div className="bg-black/30 rounded-lg p-3 border border-white/10">
            <p className="text-white/50 text-xs mb-2 font-mono">Run in PowerShell (as Administrator):</p>
            <div className="bg-black/50 rounded p-2 mb-2"><code className="text-green-400 text-xs font-mono">Stop-Process -Name "ollama" -Force -ErrorAction SilentlyContinue</code></div>
            <div className="bg-black/50 rounded p-2 mb-2"><code className="text-green-400 text-xs font-mono break-all">[System.Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS', '*', 'User')</code></div>
            <div className="bg-black/50 rounded p-2"><code className="text-green-400 text-xs font-mono">ollama serve</code></div>
          </div>
          <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <span className="text-yellow-400 text-lg">⚠️</span>
            <p className="text-yellow-400/90 text-xs">Restart Ollama after running these commands.</p>
          </div>
        </div>
      </SetupStep>

      <SetupStep number={3} title="RMG Bridge Extension" status={status.extension ? 'complete' : status.ollama.running ? 'pending' : 'disabled'} icon="🔌">
        {!status.extension ? (
          <div className="space-y-3">
            <p className="text-white/70 text-sm">The browser extension allows RMG to detect your local Ollama models.</p>
            <div className="flex gap-2">
              <button onClick={() => det.downloadExtension()} disabled={!status.ollama.running} className="flex items-center gap-2 px-4 py-2 bg-samurai-red text-white rounded-lg hover:bg-samurai-red-dark disabled:opacity-50"><Download className="w-4 h-4" />Download Extension</button>
              <button onClick={() => det.openInstallGuide()} className="flex items-center gap-2 px-4 py-2 border border-white/20 text-white rounded-lg hover:bg-white/10"><ExternalLink className="w-4 h-4" />Install Guide</button>
            </div>
            <button onClick={checkStatus} className="text-sm text-samurai-red hover:text-samurai-red-dark">I installed it →</button>
          </div>
        ) : <p className="text-green-400 font-medium text-sm">✅ Extension is active and detecting models</p>}
      </SetupStep>

      <div className="mt-6 flex gap-3">
        {status.ready && (
          <div className="flex-1 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
            <p className="text-green-400 font-medium mb-3">✅ Setup Complete!</p>
            <p className="text-white/70 text-sm mb-4">Your local Ollama integration is ready.</p>
            <button onClick={() => onComplete(status.ollama.models)} className="w-full px-4 py-2 bg-samurai-red text-white rounded-lg hover:bg-samurai-red-dark font-medium">Start Using Ollama</button>
          </div>
        )}
        <button onClick={onCancel} className="flex-1 px-6 py-3 border border-white/20 text-white rounded-lg hover:bg-white/10">Cancel</button>
      </div>
    </div>
  )
}
