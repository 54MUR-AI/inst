import { useState, useEffect } from 'react'
import { Settings, X, Cpu } from 'lucide-react'
import ollamaProxy from '../lib/ollamaProxy'

export interface AiSettings {
  model: string
}

interface SettingsPanelProps {
  onSettingsChange: (settings: AiSettings) => void
}

const STORAGE_KEY = 'nsit-ai-model'

export default function SettingsPanel({ onSettingsChange }: SettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [model, setModel] = useState(() => localStorage.getItem(STORAGE_KEY) || '')
  const [ollamaConnected, setOllamaConnected] = useState(ollamaProxy.isAvailable)
  const [models, setModels] = useState<string[]>(ollamaProxy.availableModels)

  // Listen for bridge status changes
  useEffect(() => {
    const unsub = ollamaProxy.onStatusChange(() => {
      setOllamaConnected(ollamaProxy.isAvailable)
      setModels(ollamaProxy.availableModels)
      // Auto-select first model if none selected
      if (!model && ollamaProxy.availableModels.length > 0) {
        setModel(ollamaProxy.availableModels[0])
      }
    })
    return unsub
  }, [model])

  // Listen for RMG_TOGGLE_SETTINGS from parent
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'RMG_TOGGLE_SETTINGS') {
        setIsOpen(prev => !prev)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const handleApply = () => {
    const selectedModel = model || (models.length > 0 ? models[0] : '')
    if (selectedModel) {
      localStorage.setItem(STORAGE_KEY, selectedModel)
      onSettingsChange({ model: selectedModel })
    }
    setIsOpen(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-samurai-grey-darker border-2 border-samurai-red rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-samurai-red" />
            NSIT Settings
          </h2>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 text-white hover:text-samurai-red transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Ollama Status */}
        <div className="mb-6 p-3 rounded-lg bg-samurai-black border border-samurai-grey-dark/30">
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-4 h-4 text-samurai-red" />
            <span className="text-sm font-bold text-white">Ollama (Local AI)</span>
            <span className={`ml-auto text-[10px] font-mono px-2 py-0.5 rounded ${
              ollamaConnected
                ? 'bg-samurai-green/20 text-samurai-green'
                : 'bg-samurai-steel/20 text-samurai-steel'
            }`}>
              {ollamaConnected ? `CONNECTED · ${models.length} models` : 'NOT DETECTED'}
            </span>
          </div>
          <p className="text-[10px] text-samurai-steel">
            {ollamaConnected
              ? 'Ollama detected via RMG Bridge Extension. Select a model for AI Briefing deep analysis.'
              : 'Install the RMG Ollama Bridge extension and run Ollama locally to enable AI-powered analysis.'}
          </p>
        </div>

        {/* Model Selection */}
        {ollamaConnected && models.length > 0 && (
          <div className="mb-6">
            <label className="block text-white font-bold mb-2 text-sm uppercase tracking-wider">
              AI Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-4 py-3 bg-samurai-black-lighter border-2 border-samurai-grey-dark text-white rounded-xl focus:outline-none focus:border-samurai-red text-sm"
            >
              <option value="">Choose a model...</option>
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <p className="text-[9px] text-samurai-steel mt-1 font-mono">
              Used by AI Briefing for deep market analysis
            </p>
          </div>
        )}

        {/* Apply Button */}
        <button
          onClick={handleApply}
          disabled={!ollamaConnected}
          className="w-full px-6 py-3 bg-gradient-to-r from-samurai-red to-samurai-red-dark text-white rounded-xl font-bold hover:from-samurai-red-dark hover:to-samurai-red-darker transition-all shadow-lg shadow-samurai-red/30 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Apply Settings
        </button>
      </div>
    </div>
  )
}
