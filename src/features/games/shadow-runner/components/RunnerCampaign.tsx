import React from 'react'
import { ArrowLeft, BookOpen, Check, Coins, Crown, List, Lock, Map, Play, Sword } from 'lucide-react'
import { SHADOW_RUNNER_ASSETS } from '../assets/manifest'
import { SHADOW_RUNNER_STORY } from '../game/campaignStory'
import { getShadowRunnerDiscoveredMoments } from '../game/campaignMoments'
import { getShadowRunnerLevelConfig, getShadowRunnerLevelEnemies, SHADOW_RUNNER_CAMPAIGN_LEVELS, type ShadowRunnerCampaignLevel, type ShadowRunnerPlayableLevelId } from '../game/levels'
import type { ShadowRunnerProgressSnapshot } from '../progress'
import { RunnerDialog } from './RunnerDialog'
import { getRunnerChapterState } from '../game/campaignNavigation'

const acts = [
  { title: 'The road still opens', label: 'Act I', first: 1, last: 3 },
  { title: 'The poisoned message', label: 'Act II', first: 4, last: 7 },
  { title: 'Deliver at dawn', label: 'Act III', first: 8, last: 10 },
]

export function RunnerCampaign({ progress, onBack, onPlayLevel }: {
  progress: ShadowRunnerProgressSnapshot
  onBack: () => void
  onPlayLevel: (id: ShadowRunnerPlayableLevelId) => void
}) {
  const [view, setView] = React.useState<'routes' | 'map'>('routes')
  const [selected, setSelected] = React.useState<ShadowRunnerCampaignLevel | null>(null)
  const [journal, setJournal] = React.useState(false)
  const state = selected ? getRunnerChapterState(progress.completedLevels, selected) : null
  const config = selected?.playableLevelId ? getShadowRunnerLevelConfig(selected.playableLevelId) : null
  const story = selected?.playableLevelId ? SHADOW_RUNNER_STORY[selected.playableLevelId] : null
  const record = selected?.playableLevelId ? progress.progress.levels[selected.playableLevelId] : undefined
  const modalOpen = Boolean(selected || journal)
  const chaptersCleared = SHADOW_RUNNER_CAMPAIGN_LEVELS.filter(level => progress.completedLevels.includes(level.id)).length
  const discoveredMoments = getShadowRunnerDiscoveredMoments(progress.progress.discoveredStoryIds)

  return (
    <div className="runner-campaign">
      <div className="runner-campaign-body" aria-hidden={modalOpen || undefined}>
        <header className="runner-page-header">
          <button type="button" className="runner-icon-command" title="Back to Shadow Runner menu" aria-label="Back to Shadow Runner menu" onClick={onBack}><ArrowLeft size={20} /></button>
          <div className="runner-page-title"><p>Shadow Runner</p><h1>The night route</h1></div>
          <span className="runner-campaign-count">{chaptersCleared}/10 <span>chapters</span></span>
          <button type="button" className="runner-icon-command" title="Courier journal" aria-label="Courier journal" onClick={() => setJournal(true)}><BookOpen size={20} /></button>
        </header>
        <div className="runner-campaign-toolbar">
          <div role="tablist" aria-label="Campaign view" className="runner-tabs" onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            const nextView = event.key === 'Home' ? 'routes' : event.key === 'End' ? 'map' : view === 'routes' ? 'map' : 'routes'
            setView(nextView)
            event.currentTarget.querySelector<HTMLButtonElement>(`#runner-${nextView}-tab`)?.focus()
          }}>
            <button type="button" id="runner-routes-tab" role="tab" tabIndex={view === 'routes' ? 0 : -1} aria-selected={view === 'routes'} aria-controls="runner-routes-panel" onClick={() => setView('routes')}><List size={17} />Routes</button>
            <button type="button" id="runner-map-tab" role="tab" tabIndex={view === 'map' ? 0 : -1} aria-selected={view === 'map'} aria-controls="runner-map-panel" onClick={() => setView('map')}><Map size={17} />Map</button>
          </div>
          <button type="button" className="runner-command secondary" onClick={() => onPlayLevel('tutorial')}><Play size={16} />Tutorial</button>
        </div>
        {view === 'routes' ? (
          <div className="runner-chapters" role="tabpanel" id="runner-routes-panel" aria-labelledby="runner-routes-tab">
            {acts.map(act => (
              <section key={act.first} className="runner-act">
                <h2><span>{act.label}</span>{act.title}</h2>
                <div className="runner-chapter-grid">{SHADOW_RUNNER_CAMPAIGN_LEVELS.filter(level => level.levelNumber >= act.first && level.levelNumber <= act.last).map(level => {
                  const chapter = getRunnerChapterState(progress.completedLevels, level)
                  const saved = level.playableLevelId ? progress.progress.levels[level.playableLevelId] : undefined
                  const status = saved?.perfectRouteAchieved ? 'Perfect route' : saved?.fullClearAchieved ? 'Full clear' : chapter.completed ? 'Cleared' : chapter.playable ? 'Ready' : 'Locked'
                  return (
                    <button key={level.id} type="button" className="runner-chapter" data-locked={!chapter.unlocked}
                      aria-label={`${level.title} details, ${status}`} onClick={() => setSelected(level)}>
                      <img src={level.thumbnail} alt="" width={128} height={72} loading="lazy" />
                      <span className="runner-chapter-copy"><span className="runner-chapter-number">{String(level.levelNumber).padStart(2, '0')} <span>{level.difficultyLabel}</span></span>
                        <strong>{level.title}</strong>
                        <span className="runner-chapter-status">{saved?.perfectRouteAchieved ? <Crown size={14} /> : chapter.completed ? <Check size={14} /> : !chapter.unlocked ? <Lock size={14} /> : <Play size={14} />}{status}{saved?.bestRun && <span>{saved.bestRun.score.toLocaleString()} best</span>}</span>
                      </span>
                    </button>
                  )
                })}</div>
              </section>
            ))}
          </div>
        ) : (
          <div className="runner-atlas-scroll" role="tabpanel" id="runner-map-panel" aria-labelledby="runner-map-tab" tabIndex={0}>
            <div className="runner-atlas">
              <img src={SHADOW_RUNNER_ASSETS.home.campaignMap} alt="Illustrated districts along the courier road" />
              {SHADOW_RUNNER_CAMPAIGN_LEVELS.map(level => {
                const chapter = getRunnerChapterState(progress.completedLevels, level)
                return <button key={level.id} type="button" className="runner-map-node" data-unlocked={chapter.unlocked}
                  style={{ left: `${level.mapPosition.left}%`, top: `${level.mapPosition.top}%` }} title={level.title}
                  aria-label={`${level.title} details, ${chapter.completed ? 'Cleared' : chapter.unlocked ? 'Ready' : 'Locked'}`} onClick={() => setSelected(level)}>
                  <b>{level.levelNumber}</b>{!chapter.unlocked ? <Lock size={12} /> : chapter.completed ? <Check size={14} /> : null}
                </button>
              })}
            </div>
          </div>
        )}
      </div>
      {selected && state && config && story && (
        <RunnerDialog title={selected.title} eyebrow={`Chapter ${selected.levelNumber} / ${selected.difficultyLabel}`} onClose={() => setSelected(null)} image={config.backgroundAsset}>
          <p className="runner-delivery">{story.delivery}</p>
          <p>{story.briefing}</p>
          <dl className="runner-results-grid">
            <div><dt><Coins size={14} /> Coins</dt><dd>{config.coins.length}</dd></div>
            <div><dt><Sword size={14} /> Enemies</dt><dd>{getShadowRunnerLevelEnemies(config).length}</dd></div>
            {record?.bestRun && <div><dt>Best run</dt><dd>{record.bestRun.score.toLocaleString()}</dd></div>}
            {record?.serverBest?.score != null && !record.bestRun && <div><dt>Account best</dt><dd>{record.serverBest.score.toLocaleString()}</dd></div>}
          </dl>
          {record?.perfectRouteAchieved && <p className="runner-delivery">Perfect route recorded</p>}
          {!state.unlocked && <p className="runner-delivery">Clear Chapter {selected.levelNumber - 1} to unlock</p>}
          <div className="runner-dialog-actions"><button type="button" className="runner-command" disabled={!state.playable}
            onClick={() => { if (state.playable && selected.playableLevelId) onPlayLevel(selected.playableLevelId) }}>
            {state.playable ? <Play size={18} /> : <Lock size={18} />}{state.completed ? 'Replay' : state.playable ? 'Start' : 'Locked'}</button>
            <button type="button" className="runner-command secondary" onClick={() => setSelected(null)}><ArrowLeft size={18} />Return</button>
          </div>
        </RunnerDialog>
      )}
      {journal && <RunnerDialog title="Courier journal" eyebrow="The message moves" onClose={() => setJournal(false)}>
        {discoveredMoments.length > 0 && <p className="runner-note">Field notes / This device</p>}
        {progress.completedLevels.length === 0 && discoveredMoments.length === 0 && <p className="runner-note">No field notes or deliveries recorded.</p>}
        {(['tutorial', ...SHADOW_RUNNER_CAMPAIGN_LEVELS.map(level => level.playableLevelId!)] as ShadowRunnerPlayableLevelId[]).map(id => {
          const moments = discoveredMoments.filter(moment => moment.levelId === id)
          const completed = progress.completedLevels.includes(id)
          if (!completed && moments.length === 0) return null
          return <section className="runner-journal-entry" key={id}>
            <h3>{getShadowRunnerLevelConfig(id).title}</h3>
            {moments.map(moment => <div key={moment.id}><h4 className="runner-delivery">{moment.title}</h4><p>{moment.body}</p></div>)}
            {completed && <><h4 className="runner-delivery">Delivery recorded</h4><p>{SHADOW_RUNNER_STORY[id].dispatch}</p></>}
          </section>
        })}
      </RunnerDialog>}
    </div>
  )
}
