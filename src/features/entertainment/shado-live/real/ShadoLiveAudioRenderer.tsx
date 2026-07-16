import type { ShadoLiveRoomController } from './useShadoLiveRoom'

export function ShadoLiveAudioRenderer({
  bindAudioContainer,
}: Pick<ShadoLiveRoomController, 'bindAudioContainer'>) {
  return (
    <div
      ref={bindAudioContainer}
      className="sr-only"
      aria-hidden="true"
      data-testid="shado-live-audio-renderer"
    />
  )
}
