import { useState, useEffect, useCallback } from 'react'
import { Crosshair, RefreshCw, TrendingUp, TrendingDown, Loader2 } from 'lucide-react'
import ollamaProxy from '../lib/ollamaProxy'
import { scrapeMultiple, checkHealth } from '../lib/scrpBridge'
import {
  gatherPredictionData, buildPredictionContext, parsePredictions,
  PREDICTION_PROMPT, type Prediction, type PredictionSet, type PredictionSnapshot
} from '../lib/predictionEngine'

interface AiPredictionsProps { selectedModel?: string }

export default function AiPredictions({ selectedModel }: AiPredictionsProps) {
  const [predictions, setPredictions] = useState<PredictionSet | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ollamaAvailable, setOllamaAvailable] = useState(ollamaProxy.isAvailable)
  const [snapshot, setSnapshot] = useState<PredictionSnapshot | null>(null)

  useEffect(() => {
    const unsub = ollamaProxy.onStatusChange(() => setOllamaAvailable(ollamaProxy.isAvailable))
    ollamaProxy.requestModels()
    gatherPredictionData().then(s => setSnapshot(s)).catch(() => {})
    return unsub
  }, [])

  const generate = useCallback(async () => {
    if (!ollamaProxy.isAvailable) { setError('Ollama not connected. Enable the RMG Bridge extension.'); return }
    setLoading(true); setError(null)
    try {
      const snap = snapshot || await gatherPredictionData()
      setSnapshot(snap)
      let context = buildPredictionContext(snap)
      try {
        if (await checkHealth() && snap.headlines.length > 0) {
          const urls = snap.headlines.slice(0, 3).map(h => h.link).filter(Boolean)
          if (urls.length) {
            const scraped = await scrapeMultiple(urls, { summarize: false })
            const texts: string[] = []
            scraped.forEach((r, url) => { if (r.success && r.content?.content) texts.push(`ARTICLE: ${r.content.title || url}\n${r.content.content.slice(0, 1000)}`) })
            if (texts.length) context += '\n\nDEEP ARTICLES:\n' + texts.join('\n---\n')
          }
        }
      } catch {}
      const model = selectedModel || ollamaProxy.availableModels[0] || 'llama3:latest'
      const result = await ollamaProxy.chat(model, [
        { role: 'system', content: PREDICTION_PROMPT },
        { role: 'user', content: `Analyze and generate predictions:\n\n${context}` },
      ])
      const response = (result as any)?.message?.content || ''
      if (!response) throw new Error('Empty response from Ollama')
      const parsed = parsePredictions(response)
      if (!parsed) throw new Error('Could not parse predictions. Try again.')
      setPredictions(parsed)
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed') }
    setLoading(false)
  }, [snapshot, selectedModel])

  const confBarColor = (c: number) => c >= 75 ? 'bg-emerald-500' : c >= 55 ? 'bg-amber-500' : 'bg-red-500'
  const confTxtColor = (c: number) => c >= 75 ? 'text-emerald-400' : c >= 55 ? 'text-amber-400' : 'text-red-400'

  const Card = ({ p, idx }: { p: Prediction; idx: number }) => (
    <div className="bg-samurai-black rounded-lg border border-samurai-grey-dark/40 p-2.5 space-y-1.5">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-mono text-samurai-steel bg-samurai-grey-dark/60 px-1 rounded">#{idx + 1}</span>
          {p.direction === 'LONG'
            ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            : <TrendingDown className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
          <span className="text-[11px] font-bold text-white truncate">{p.asset}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[8px] text-samurai-steel font-mono">{p.market}</span>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
            p.direction === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
          }`}>{p.direction}</span>
        </div>
      </div>
      {/* Price grid */}
      <div className="grid grid-cols-3 gap-1.5">
        <div className="bg-samurai-grey-darker/60 rounded px-1.5 py-1 text-center">
          <div className="text-[7px] text-samurai-steel uppercase tracking-widest">Entry</div>
          <div className="text-[10px] text-white font-mono font-bold">{p.entry}</div>
        </div>
        <div className="bg-samurai-grey-darker/60 rounded px-1.5 py-1 text-center">
          <div className="text-[7px] text-emerald-400/80 uppercase tracking-widest">Target</div>
          <div className="text-[10px] text-emerald-400 font-mono font-bold">{p.exitTarget}</div>
        </div>
        <div className="bg-samurai-grey-darker/60 rounded px-1.5 py-1 text-center">
          <div className="text-[7px] text-red-400/80 uppercase tracking-widest">Stop</div>
          <div className="text-[10px] text-red-400 font-mono font-bold">{p.stopLoss}</div>
        </div>
      </div>
      {/* Confidence + timeframe */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-samurai-grey-dark rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${confBarColor(p.confidence)}`} style={{ width: `${p.confidence}%` }} />
        </div>
        <span className={`text-[9px] font-bold font-mono ${confTxtColor(p.confidence)}`}>{p.confidence}%</span>
        <span className="text-[8px] text-samurai-steel font-mono">{p.timeframe}</span>
      </div>
      {/* Rationale */}
      <p className="text-[9px] text-samurai-steel-light leading-relaxed">{p.rationale}</p>
    </div>
  )

  // ── Waiting for Ollama ──
  if (!ollamaAvailable && !predictions) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-4">
        <Crosshair className="w-8 h-8 text-samurai-red/30" />
        <p className="text-xs text-samurai-steel">Connect <span className="text-samurai-red font-bold">Ollama</span> via the RMG Bridge to generate AI predictions.</p>
        <p className="text-[9px] text-samurai-steel/60">Market data pre-loaded and ready.</p>
      </div>
    )
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 text-samurai-red animate-spin" />
        <p className="text-[10px] text-samurai-steel font-mono animate-pulse">Analyzing all markets...</p>
        <p className="text-[8px] text-samurai-steel/50">Ollama is generating predictions</p>
      </div>
    )
  }

  // ── No predictions yet ──
  if (!predictions) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] text-samurai-steel font-mono">
            OLLAMA · {selectedModel || ollamaProxy.availableModels[0] || 'ready'}
          </span>
          <button onClick={generate} className="flex items-center gap-1 px-2 py-1 bg-samurai-red/20 hover:bg-samurai-red/30 text-samurai-red text-[10px] font-bold rounded transition-colors">
            <Crosshair className="w-3 h-3" /> Generate Predictions
          </button>
        </div>
        {error && <div className="text-[10px] text-red-400 bg-red-500/10 rounded p-2 mb-2">{error}</div>}
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
          <Crosshair className="w-6 h-6 text-samurai-red/20" />
          <p className="text-[10px] text-samurai-steel">Click above to generate AI-powered trade predictions</p>
          <p className="text-[8px] text-samurai-steel/50">Analyzes equities, crypto, commodities, forex & bonds</p>
        </div>
      </div>
    )
  }

  // ── Predictions loaded ──
  return (
    <div className="h-full flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-samurai-steel font-mono">
          Generated {predictions.generatedAt}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={generate} disabled={loading} title="Regenerate predictions"
            className="p-1 rounded hover:bg-samurai-grey-dark transition-colors">
            <RefreshCw className={`w-3 h-3 text-samurai-steel ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <div className="text-[10px] text-red-400 bg-red-500/10 rounded p-2">{error}</div>}

      {/* Market Bias Banner */}
      <div className="bg-samurai-grey-darker/80 rounded-lg border border-samurai-grey-dark/40 px-3 py-2">
        <div className="text-[8px] text-samurai-red font-bold uppercase tracking-widest mb-0.5">Market Bias</div>
        <p className="text-[10px] text-samurai-steel-light leading-relaxed">{predictions.marketBias}</p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {/* Best Buys Section */}
        {predictions.bestBuys.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <TrendingUp className="w-3 h-3 text-emerald-400" />
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Best Buys</span>
              <div className="flex-1 h-px bg-emerald-500/20" />
            </div>
            <div className="space-y-2">
              {predictions.bestBuys.map((p, i) => <Card key={`buy-${i}`} p={p} idx={i} />)}
            </div>
          </div>
        )}

        {/* Best Contracts Section */}
        {predictions.bestContracts.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Crosshair className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Stop/Loss Contracts</span>
              <div className="flex-1 h-px bg-amber-500/20" />
            </div>
            <div className="space-y-2">
              {predictions.bestContracts.map((p, i) => <Card key={`con-${i}`} p={p} idx={i} />)}
            </div>
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div className="text-[7px] text-samurai-steel/40 text-center font-mono pt-1 border-t border-samurai-grey-dark/30">
        AI-generated predictions from live data. Not financial advice. Always DYOR.
      </div>
    </div>
  )
}
