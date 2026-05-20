import { Composition, Folder } from 'remotion'
import { CrimpShrimpPromo } from './shado-tv/CrimpShrimpPromo'

export const PROMO_FPS = 30
export const PROMO_WIDTH = 1920
export const PROMO_HEIGHT = 1080

export const RemotionRoot = () => (
  <Folder name="ShadoTV">
    <Composition
      id="CrimpShrimpTrailer"
      component={CrimpShrimpPromo}
      durationInFrames={PROMO_FPS * 40}
      fps={PROMO_FPS}
      width={PROMO_WIDTH}
      height={PROMO_HEIGHT}
      defaultProps={{
        variant: 'trailer',
      }}
    />
    <Composition
      id="CrimpShrimpLaunchFeaturette"
      component={CrimpShrimpPromo}
      durationInFrames={PROMO_FPS * 96}
      fps={PROMO_FPS}
      width={PROMO_WIDTH}
      height={PROMO_HEIGHT}
      defaultProps={{
        variant: 'featurette',
      }}
    />
  </Folder>
)
