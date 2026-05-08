import { useCallback, useEffect } from 'react'

export type Tone = 'positive' | 'neutral' | 'negative'

type ToneAnalyzer = {
  analyze: (text: string) => { score: number }
}

let analyzer: ToneAnalyzer | null = null
let analyzerPromise: Promise<ToneAnalyzer | null> | null = null

const positiveWords = /\b(love|great|good|awesome|excellent|amazing|happy|nice|thanks|thank you|perfect)\b/i
const negativeWords = /\b(hate|bad|awful|terrible|angry|sad|broken|bug|sucks|worst)\b/i

const getFallbackScore = (text: string) => {
  let score = 0
  if (positiveWords.test(text)) score += 2
  if (negativeWords.test(text)) score -= 2
  return score
}

const loadAnalyzer = async () => {
  if (analyzer) return analyzer
  if (!analyzerPromise) {
    analyzerPromise = import('sentiment')
      .then(mod => {
        const Sentiment = mod.default
        analyzer = new Sentiment()
        return analyzer
      })
      .catch(() => null)
      .finally(() => {
        analyzerPromise = null
      })
  }

  return analyzerPromise
}

export function useToneAnalysis(load = true) {
  useEffect(() => {
    if (!load || analyzer) return
    void loadAnalyzer()
  }, [load])

  return useCallback((text: string): { score: number; tone: Tone } => {
    const score = analyzer?.analyze(text).score ?? getFallbackScore(text)
    let tone: Tone = 'neutral'
    if (score > 1) tone = 'positive'
    else if (score < -1) tone = 'negative'
    return { score, tone }
  }, [])
}
