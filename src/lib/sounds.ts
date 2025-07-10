import type { MessageSound } from '../hooks/useSoundEffects'

export function playMessageSound(sound: MessageSound) {
  const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext
  if (!AudioContext) return
  const ctx = new AudioContext()
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.value = sound === 'chime' ? 660 : 440
  gain.gain.value = 0.1
  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start()
  oscillator.stop(ctx.currentTime + 0.15)
}
