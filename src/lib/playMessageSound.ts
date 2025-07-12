import { MessageSound } from '../hooks/useSoundEffects'

const audioCache: Record<MessageSound, HTMLAudioElement> = {
  beep1: new Audio(
    'https://example.com/assets/beep1.mp3'
  ),
  beep2: new Audio(
    'https://example.com/assets/beep2.mp3'
  ),
}

export function playMessageSound(sound: MessageSound) {
  const audio = audioCache[sound] || audioCache.beep1
  try {
    audio.currentTime = 0
    void audio.play()
  } catch {
    // ignore playback errors
  }
}
