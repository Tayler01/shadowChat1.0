import { Coins, Heart, Pause, Sword } from 'lucide-react'
import type { ShadowRunnerHudState } from '../game/simulation'

export function RunnerHud({ hud, onPause, paused }: { hud: ShadowRunnerHudState; onPause: () => void; paused: boolean }) {
  const powers = [
    { name: 'Moonheart', active: hud.boostActive, ms: hud.boostRemainingMs, charges: hud.boostGuardCharges },
    { name: 'Shield', active: hud.shieldActive, ms: hud.shieldRemainingMs, charges: hud.shieldGuardCharges },
    { name: 'Chrono', active: hud.chronoActive, ms: hud.chronoRemainingMs },
    { name: 'Surge', active: hud.surgeActive, ms: hud.surgeRemainingMs, charges: hud.surgeGuardCharges },
    { name: 'Wraithlight', active: hud.wraithlightActive, ms: hud.wraithlightRemainingMs },
    { name: 'Mirror Ward', active: hud.mirrorWardActive, ms: hud.mirrorWardRemainingMs, charges: hud.mirrorWardCharges },
    { name: 'Gale Mantle', active: hud.galeMantleActive, ms: hud.galeMantleRemainingMs },
    { name: 'Sunsteel Edge', active: hud.sunsteelEdgeActive, ms: hud.sunsteelEdgeRemainingMs, charges: hud.sunsteelEdgeCharges },
    { name: 'Dawnfire Aegis', active: hud.dawnfireAegisActive, ms: hud.dawnfireAegisRemainingMs },
    { name: 'Aether Step', active: hud.aetherStepActive, ms: hud.aetherStepRemainingMs },
  ].filter(power => power.active)
  return (
    <div className="runner-hud">
      <div className="runner-status-strip">
        <div className="runner-vitality" aria-label={`Lives ${hud.lives} of ${hud.maxLives}, health ${hud.health} of ${hud.maxHealth}`}>
          <div className="runner-lives" aria-hidden="true">{Array.from({ length: hud.maxLives }, (_, i) => <Heart key={i} size={14} data-full={i < hud.lives} />)}</div>
          <div className="runner-health" role="meter" aria-label="Health" aria-valuemin={0} aria-valuemax={hud.maxHealth} aria-valuenow={hud.health}>
            <span style={{ width: `${Math.max(0, Math.min(100, hud.health / Math.max(1, hud.maxHealth) * 100))}%` }} />
            <b>{hud.health}/{hud.maxHealth}</b>
          </div>
        </div>
        <span className="runner-count" aria-label={`Coins collected ${hud.coins} of ${hud.totalCoins}`}><Coins size={18} aria-hidden="true" /><b>{hud.coins}<small>/{hud.totalCoins}</small></b></span>
        <span className="runner-count runner-enemy-count" aria-label={`Enemies defeated ${hud.enemiesDefeated} of ${hud.totalEnemies}`}><Sword size={17} aria-hidden="true" /><b>{hud.enemiesDefeated}<small>/{hud.totalEnemies}</small></b></span>
        <span className="runner-score" aria-label={`Score ${hud.score}`}><small>Score</small><b>{hud.score.toLocaleString()}</b></span>
      </div>
      <button type="button" className="runner-icon-command runner-pause" aria-label="Open pause menu" title="Pause" onClick={onPause} disabled={paused}><Pause size={20} aria-hidden="true" /></button>
      {(hud.totalObjectiveItems > 0 || hud.totalMoonShards > 0) && <div className="runner-objectives">
        {hud.totalObjectiveItems > 0 && <span aria-label={`${hud.objectiveLabel} ${hud.objectiveItems} of ${hud.totalObjectiveItems}`}>{hud.objectiveLabel} <b>{hud.objectiveItems}/{hud.totalObjectiveItems}</b></span>}
        {hud.totalMoonShards > 0 && <span aria-label={`Moon Shards ${hud.moonShards} of ${hud.totalMoonShards}`}>Moon Shards <b>{hud.moonShards}/{hud.totalMoonShards}</b></span>}
        {hud.totalMasteryItems > 0 && <span aria-label={`${hud.masteryLabel} ${hud.masteryItems} of ${hud.totalMasteryItems}`}>{hud.masteryLabel} <b>{hud.masteryItems}/{hud.totalMasteryItems}</b></span>}
      </div>}
      <div className="runner-powers">{powers.map(power => <span key={power.name} aria-label={`${power.name} ${Math.ceil(power.ms / 1000)} seconds remaining${power.charges !== undefined ? `, ${power.charges} charges` : ''}`}>
        <b>{power.name}</b> {Math.ceil(power.ms / 1000)}s{power.charges !== undefined && <small> · {power.charges}</small>}
      </span>)}</div>
    </div>
  )
}
