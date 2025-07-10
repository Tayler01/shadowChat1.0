import { useCallback } from 'react'
import Sentiment from 'sentiment'

export type Tone = 'positive' | 'neutral' | 'negative'

const analyzer = new Sentiment()

export function useToneAnalysis() {
  return useCallback((text: string): { score: number; tone: Tone } => {
    const { score } = analyzer.analyze(text)
    let tone: Tone = 'neutral'
    if (score > 1) tone = 'positive'
    else if (score < -1) tone = 'negative'
    return { score, tone }
  }, [])
}
