import { ArrowLeft, Map, Play, Settings } from 'lucide-react'
import { SHADOW_RUNNER_ASSETS } from '../assets/manifest'
import { getShadowRunnerLevelConfig, type ShadowRunnerPlayableLevelId } from '../game/levels'
import { getRunnerContinueLevel } from '../game/campaignNavigation'

export function RunnerTitle({ completedLevels, heroFrame, onPlay, onMap, onOptions, onExit }: {
  completedLevels: readonly string[]
  heroFrame: number
  onPlay: (id: ShadowRunnerPlayableLevelId) => void
  onMap: () => void
  onOptions: () => void
  onExit?: () => void
}) {
  const next = getRunnerContinueLevel(completedLevels)
  const continuing = completedLevels.length > 0
  return (
    <div className="runner-title">
      <img className="runner-title-scene" src={SHADOW_RUNNER_ASSETS.rebuild.eastGateMoonriseBackground} alt="" draggable={false} />
      <button type="button" className="runner-icon-command runner-title-exit" aria-label="Exit Shadow Runner" title="Exit Shadow Runner" onClick={onExit}><ArrowLeft size={20} /></button>
      <div className="runner-title-content">
        <p className="runner-eyebrow">The message moves</p>
        <h1>Shadow Runner</h1>
        <p className="runner-title-chapter">{continuing ? getShadowRunnerLevelConfig(next).title : 'One courier. A city waiting for dawn.'}</p>
        <div className="runner-title-actions">
          <button type="button" className="runner-command" aria-label={continuing ? 'Continue journey' : 'Start Tutorial'} onClick={() => onPlay(next)}><Play size={20} />{continuing ? 'Continue journey' : 'Start Tutorial'}</button>
          <button type="button" className="runner-command secondary" onClick={onMap}><Map size={20} />Select Level</button>
          {continuing && <button type="button" className="runner-command secondary" onClick={() => onPlay('tutorial')}><Play size={18} />Start Tutorial</button>}
          <button type="button" className="runner-command secondary" onClick={onOptions}><Settings size={20} />Options</button>
        </div>
      </div>
      <div className="runner-title-courier" aria-hidden="true" style={{ backgroundImage: `url(${SHADOW_RUNNER_ASSETS.hero.menuIdleCapeStrip})`, backgroundPosition: `${heroFrame / 7 * 100}% 0%` }} />
    </div>
  )
}
