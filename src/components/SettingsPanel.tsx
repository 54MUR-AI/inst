import { useState, useEffect, useCallback } from 'react'
import { Settings, X, Key, RefreshCw, ExternalLink, LayoutGrid, RotateCcw, Eye, EyeOff } from 'lucide-react'
import ollamaProxy from '../lib/ollamaProxy'
import OllamaSetupWizard from './OllamaSetupWizard'
import { getSupabase } from '../lib/supabase'
import { decryptApiKey } from '../lib/ldgrBridge'

import { WIDGETS, clearSavedLayouts } from '../lib/widgetRegistry'

export interface AiSettings { provider: string; model: string; apiKey: string }
interface SettingsPanelProps {
  onSettingsChange: (s: AiSettings) => void
  widgetVisibility: Record<string, boolean>
  onVisibilityChange: (vis: Record<string, boolean>) => void
}

const AI_PROVIDERS: Record<string, { name: string; models: string[]; requiresKey: boolean }> = {
  ollama:      { name: 'Ollama (Local)',  models: ['llama3:latest','mistral:latest','llama2:latest'], requiresKey: false },
  openai:      { name: 'OpenAI',          models: ['gpt-4-turbo-preview','gpt-4','gpt-3.5-turbo'],   requiresKey: true },
  anthropic:   { name: 'Anthropic',       models: ['claude-3-opus-20240229','claude-3-sonnet-20240229','claude-3-haiku-20240307'], requiresKey: true },
  xai:         { name: 'xAI (Grok)',      models: ['grok-beta','grok-vision-beta'], requiresKey: true },
  huggingface: { name: 'HuggingFace',     models: ['facebook/bart-large-cnn','google/pegasus-xsum'], requiresKey: true },
}

const STORAGE_PROVIDER = 'nsit-ai-provider'
const STORAGE_MODEL    = 'nsit-ai-model'
const STORAGE_KEY_ID   = 'nsit-ai-key-id'

function getAuthToken(): string | null {
  for (const k of ['sb-meqfiyuaxgwbstcdmjgz-auth-token','supabase.auth.token','sb-auth-token']) {
    const d = localStorage.getItem(k)
    if (d) { try { const p = JSON.parse(d); if (p.access_token) return p.access_token; if (p.token) return p.token } catch { /* skip */ } }
  }
  return sessionStorage.getItem('nsit_auth_token') || null
}

function getUserEmail(): string | null {
  for (const k of ['sb-meqfiyuaxgwbstcdmjgz-auth-token','supabase.auth.token']) {
    const d = localStorage.getItem(k)
    if (d) { try { const p = JSON.parse(d); const e = p.user?.email || p.email; if (e) return e } catch { /* skip */ } }
  }
  return null
}

export default function SettingsPanel({ onSettingsChange, widgetVisibility, onVisibilityChange }: SettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [provider, setProvider] = useState(() => localStorage.getItem(STORAGE_PROVIDER) || 'ollama')
  const [availableProviders, setAvailableProviders] = useState<string[]>(['ollama'])
  const [providersLoading, setProvidersLoading] = useState(false)
  const [model, setModel] = useState(() => localStorage.getItem(STORAGE_MODEL) || '')
  const [dynamicModels, setDynamicModels] = useState<Record<string, string[]>>({})
  const [apiKey, setApiKey] = useState('')
  const [keys, setKeys] = useState<Array<{ id: string; key_name: string; description?: string; encrypted_key: string }>>([])
  const [selectedKeyId, setSelectedKeyId] = useState(() => localStorage.getItem(STORAGE_KEY_ID) || '')
  const [showWizard, setShowWizard] = useState(false)

  // Listen for RMG_TOGGLE_SETTINGS
  useEffect(() => {
    const h = (e: MessageEvent) => { if (e.data?.type === 'RMG_TOGGLE_SETTINGS') setIsOpen(p => !p) }
    window.addEventListener('message', h)
    return () => window.removeEventListener('message', h)
  }, [])

  // Load providers from LDGR
  const loadProviders = useCallback(async () => {
    setProvidersLoading(true)
    try {
      const token = getAuthToken()
      if (!token) { setAvailableProviders(['ollama']); return }
      const sb = getSupabase(token)
      const { data } = await sb.from('api_keys').select('service_name').eq('is_active', true)
      const provs = [...new Set((data || []).map((k: { service_name: string }) => k.service_name))].filter(p => AI_PROVIDERS[p])
      if (!provs.includes('ollama')) provs.push('ollama')
      setAvailableProviders(provs)
    } catch { setAvailableProviders(['ollama']) }
    finally { setProvidersLoading(false) }
  }, [])

  // Load keys for a cloud provider
  const loadKeysForProvider = useCallback(async (prov: string) => {
    if (!AI_PROVIDERS[prov]?.requiresKey) { setKeys([]); return }
    try {
      const token = getAuthToken()
      if (!token) return
      const sb = getSupabase(token)
      const { data } = await sb.from('api_keys').select('id,key_name,description,encrypted_key')
        .eq('service_name', prov).eq('is_active', true).order('created_at', { ascending: false })
      setKeys(data || [])
      if (data?.length) {
        const pick = (selectedKeyId ? data.find((k: { id: string }) => k.id === selectedKeyId) : null) || data[0]
        await doSelectKey(pick.id, pick.encrypted_key)
      }
    } catch (err) { console.warn('[NSIT] load keys failed:', err) }
  }, [selectedKeyId])

  // Decrypt and select a key
  const doSelectKey = async (keyId: string, encKey: string) => {
    setSelectedKeyId(keyId)
    const email = getUserEmail()
    if (!email) return
    try { setApiKey(await decryptApiKey(encKey, email)) } catch { /* skip */ }
  }

  // On panel open
  useEffect(() => {
    if (!isOpen) return
    loadProviders()
    if (provider === 'ollama') setShowWizard(true)
    // Sync Ollama models from proxy
    if (ollamaProxy.availableModels.length > 0) {
      setDynamicModels(prev => ({ ...prev, ollama: ollamaProxy.availableModels }))
    }
    const unsub = ollamaProxy.onStatusChange(() => {
      if (ollamaProxy.availableModels.length > 0) {
        setDynamicModels(prev => ({ ...prev, ollama: ollamaProxy.availableModels }))
      }
    })
    return unsub
  }, [isOpen])

  // On provider change
  useEffect(() => {
    if (!isOpen) return
    if (provider === 'ollama') { setShowWizard(true) }
    else { setShowWizard(false); loadKeysForProvider(provider) }
  }, [provider])

  const handleProviderChange = (p: string) => {
    setProvider(p); setModel(''); setApiKey(''); setSelectedKeyId(''); setKeys([])
  }

  const getModels = () => dynamicModels[provider] || AI_PROVIDERS[provider]?.models || []

  const handleApply = () => {
    if (!provider) return
    if (AI_PROVIDERS[provider]?.requiresKey && !apiKey) { alert('Please select an API key'); return }
    const m = model || (getModels()[0] ?? '')
    localStorage.setItem(STORAGE_PROVIDER, provider)
    localStorage.setItem(STORAGE_MODEL, m)
    if (selectedKeyId) localStorage.setItem(STORAGE_KEY_ID, selectedKeyId)
    onSettingsChange({ provider, model: m, apiKey })
    setIsOpen(false)
  }

  if (!isOpen) return null

  const models = getModels()
  const needsKey = AI_PROVIDERS[provider]?.requiresKey
  const showModelSelect = provider && (needsKey ? !!apiKey : true)

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-samurai-grey-darker border-2 border-samurai-red rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-black text-white flex items-center gap-2">
              <Settings className="w-6 h-6 text-samurai-red" />AI Settings
            </h2>
            <p className="text-xs text-white/50 mt-1">Configure AI provider for NSIT analysis</p>
          </div>
          <button onClick={() => setIsOpen(false)} className="p-2 text-white hover:text-samurai-red transition-colors" aria-label="Close"><X size={24} /></button>
        </div>

        {/* Provider Selector */}
        <div className="mb-6">
          <label className="block text-white font-bold mb-3 uppercase text-sm">AI Provider</label>
          {providersLoading ? (
            <div className="flex items-center gap-2 text-white/70">
              <RefreshCw className="w-4 h-4 animate-spin" /><span className="text-sm">Loading providers...</span>
            </div>
          ) : (
            <select value={provider} onChange={(e) => handleProviderChange(e.target.value)}
              className="w-full px-4 py-3 bg-samurai-black-lighter border-2 border-samurai-grey-dark text-white rounded-xl focus:outline-none focus:border-samurai-red">
              {availableProviders.map(p => <option key={p} value={p}>{AI_PROVIDERS[p]?.name || p}</option>)}
            </select>
          )}
        </div>

        {/* Ollama info (when wizard dismissed) */}
        {provider === 'ollama' && !showWizard && (
          <div className="mb-6 p-4 bg-samurai-grey-dark/50 border border-samurai-grey rounded-lg">
            <p className="text-white text-sm">🖥️ Using local Ollama models — no API key required</p>
          </div>
        )}

        {/* Ollama Setup Wizard */}
        {provider === 'ollama' && showWizard && (
          <div className="mb-6">
            <OllamaSetupWizard
              onComplete={(m) => {
                setShowWizard(false)
                if (m.length > 0) {
                  setDynamicModels(prev => ({ ...prev, ollama: m }))
                  if (!model) setModel(m[0])
                }
              }}
              onCancel={() => setShowWizard(false)}
            />
          </div>
        )}

        {/* API Key Selector (cloud providers) */}
        {needsKey && (
          <div className="mb-6">
            {keys.length > 0 ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-white font-bold uppercase text-sm">Select API Key</label>
                  <button onClick={() => loadKeysForProvider(provider)} className="p-1.5 text-white/70 hover:text-white" title="Refresh keys"><RefreshCw size={16} /></button>
                </div>
                <select value={selectedKeyId}
                  onChange={async (e) => { const k = keys.find(x => x.id === e.target.value); if (k) await doSelectKey(k.id, k.encrypted_key) }}
                  className="w-full px-4 py-3 bg-samurai-black-lighter border-2 border-samurai-grey-dark text-white rounded-xl focus:outline-none focus:border-samurai-red">
                  {keys.map(k => <option key={k.id} value={k.id}>{k.key_name}{k.description ? ` — ${k.description}` : ''}</option>)}
                </select>
              </div>
            ) : (
              <div className="p-4 bg-samurai-grey-dark/50 border border-samurai-grey rounded-lg">
                <p className="text-white text-sm mb-3">🔐 No API keys found for {AI_PROVIDERS[provider]?.name}</p>
                <a href="/#/ldgr" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm px-3 py-1.5 bg-samurai-red text-white rounded font-bold hover:bg-samurai-red-dark">
                  <ExternalLink size={14} />Add Keys in LDGR
                </a>
              </div>
            )}
            <div className="flex items-center gap-2 text-white/60 text-xs mt-3">
              <Key size={12} /><span>Keys are securely stored and encrypted in LDGR</span>
            </div>
            <a href="/#/ldgr" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-samurai-red hover:text-samurai-red-dark mt-2">
              <ExternalLink size={14} />Manage keys in LDGR
            </a>
          </div>
        )}

        {/* Model Selection */}
        {showModelSelect && models.length > 0 && (
          <div className="mb-6">
            <label className="block text-white font-bold mb-3 uppercase">
              Select Model
              {provider === 'ollama' && dynamicModels[provider] && (
                <span className="ml-2 text-xs text-samurai-red font-normal">({dynamicModels[provider].length} installed)</span>
              )}
            </label>
            <select value={model} onChange={(e) => setModel(e.target.value)}
              className="w-full px-4 py-3 bg-samurai-black-lighter border-2 border-samurai-grey-dark text-white rounded-xl focus:outline-none focus:border-samurai-red">
              <option value="">Choose a model...</option>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        )}

        {/* ── Dashboard Widgets ── */}
        <div className="mb-6 border-t border-samurai-grey-dark pt-6">
          <div className="flex items-center justify-between mb-4">
            <label className="text-white font-bold uppercase text-sm flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-samurai-red" />Dashboard Widgets
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const all: Record<string, boolean> = {}
                  WIDGETS.forEach(w => { all[w.id] = true })
                  onVisibilityChange(all)
                }}
                className="text-[9px] font-bold px-2 py-1 rounded bg-samurai-grey-dark/50 text-samurai-steel hover:text-white transition-colors"
              >Show All</button>
              <button
                onClick={() => {
                  clearSavedLayouts()
                  window.location.reload()
                }}
                className="flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded bg-samurai-grey-dark/50 text-samurai-steel hover:text-white transition-colors"
                title="Reset widget positions to default"
              ><RotateCcw className="w-3 h-3" />Reset Layout</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {WIDGETS.map(w => {
              const visible = widgetVisibility[w.id] !== false
              return (
                <button
                  key={w.id}
                  onClick={() => onVisibilityChange({ ...widgetVisibility, [w.id]: !visible })}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-left ${
                    visible
                      ? 'border-samurai-red/30 bg-samurai-red/10 text-white'
                      : 'border-samurai-grey-dark bg-samurai-grey-dark/20 text-samurai-steel'
                  }`}
                >
                  {visible
                    ? <Eye className="w-3.5 h-3.5 text-samurai-red flex-shrink-0" />
                    : <EyeOff className="w-3.5 h-3.5 text-samurai-steel/50 flex-shrink-0" />
                  }
                  <span className="text-xs font-medium truncate">{w.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Apply Button */}
        <button onClick={handleApply}
          className="w-full px-6 py-4 bg-gradient-to-r from-samurai-red to-samurai-red-dark text-white rounded-xl font-bold hover:from-samurai-red-dark hover:to-samurai-red-darker transition-all shadow-lg shadow-samurai-red/30">
          Apply Settings
        </button>

        <p className="text-center text-white/60 text-sm mt-4">🔐 Keys are securely encrypted and stored in LDGR</p>
      </div>
    </div>
  )
}
