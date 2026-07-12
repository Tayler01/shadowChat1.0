import {
  Accessibility,
  Eye,
  Gauge,
  Hand,
  Layers3,
  Monitor,
  Play,
  RotateCcw,
  Sparkles,
  Type,
  Volume2,
  Waves,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { useComfortPreferences } from '../../hooks/useComfortPreferences'
import type {
  ComfortAutoplay,
  ComfortContrastPreference,
  ComfortDensity,
  ComfortMotionPreference,
  ComfortPresetId,
  ComfortTextScale,
  ComfortTouchTarget,
  ComfortTransparencyPreference,
} from '../../lib/comfortPreferences'

const presetCards: Array<{
  id: Exclude<ComfortPresetId, 'custom'>
  label: string
  description: string
  icon: typeof Monitor
}> = [
  {
    id: 'follow-device',
    label: 'Follow device',
    description: 'Use your phone or computer settings for motion, contrast, and transparency.',
    icon: Monitor,
  },
  {
    id: 'calm',
    label: 'Calm',
    description: 'Solid surfaces, no decorative motion, play-on-request media, and quieter feedback.',
    icon: Waves,
  },
  {
    id: 'high-visibility',
    label: 'High visibility',
    description: 'Stronger contrast, larger text and targets, with solid surfaces.',
    icon: Eye,
  },
  {
    id: 'large-touch',
    label: 'Large & easy to tap',
    description: 'Roomier layout, 48px shared controls, and larger text for phone comfort.',
    icon: Hand,
  },
]

const selectClassName = 'mt-2 min-h-12 w-full rounded-[var(--radius-sm)] border border-[var(--border-panel)] bg-[var(--bg-input)] px-3 text-base text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--border-glow)]'

type ChoiceProps<T extends string | number> = {
  id: string
  label: string
  description: string
  icon: typeof Gauge
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}

function SettingsChoice<T extends string | number>({
  id,
  label,
  description,
  icon: Icon,
  value,
  options,
  onChange,
}: ChoiceProps<T>) {
  return (
    <label htmlFor={id} className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] p-4">
      <span className="flex items-start gap-3">
        <span className="mt-0.5 rounded-[var(--radius-xs)] border border-[var(--border-subtle)] bg-[var(--theme-accent-soft)] p-2 text-[var(--text-gold)]">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span>
          <span className="block font-medium text-[var(--text-primary)]">{label}</span>
          <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">{description}</span>
        </span>
      </span>
      <select
        id={id}
        aria-label={label}
        className={selectClassName}
        value={value}
        onChange={event => {
          const option = options.find(candidate => String(candidate.value) === event.target.value)
          if (option) onChange(option.value)
        }}
      >
        {options.map(option => (
          <option key={String(option.value)} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

function ComfortToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center justify-between gap-4 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] p-4 text-left transition-colors hover:border-[var(--border-glow)]"
    >
      <span>
        <span className="block font-medium text-[var(--text-primary)]">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">{description}</span>
      </span>
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
          checked
            ? 'border-[var(--border-glow)] bg-[var(--theme-accent-soft)]'
            : 'border-[var(--border-panel)] bg-[var(--bg-input)]'
        }`}
      >
        <span className={`absolute top-1 h-[18px] w-[18px] rounded-full transition-transform ${
          checked
            ? 'translate-x-[25px] bg-[var(--theme-accent-readable)]'
            : 'translate-x-1 bg-[var(--text-muted)]'
        }`} />
      </span>
    </button>
  )
}

export function AccessibilityComfortPanel() {
  const {
    preferences,
    effectivePreferences,
    applyPreset,
    updatePreferences,
    resetPreferences,
  } = useComfortPreferences()

  const activePresetLabel = preferences.preset === 'custom'
    ? 'Custom profile'
    : presetCards.find(profile => profile.id === preferences.preset)?.label ?? 'Custom profile'

  return (
    <div className="space-y-5" data-testid="accessibility-comfort-panel">
      <section className="glass-panel rounded-[var(--radius-lg)] p-4 sm:p-5" aria-labelledby="comfort-profile-heading">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="rounded-[var(--radius-md)] border border-[var(--border-glow)] bg-[var(--theme-accent-soft)] p-3 text-[var(--text-gold)]">
              <Accessibility className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="comfort-profile-heading" className="text-lg font-semibold text-[var(--text-primary)]">Comfort Profiles</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
                Make ShadowChat calmer, clearer, or easier to tap. These choices stay on this device and work before sign-in.
              </p>
            </div>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={resetPreferences} className="shrink-0">
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Reset
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2" role="group" aria-label="Comfort profile presets">
          {presetCards.map(profile => {
            const Icon = profile.icon
            const selected = preferences.preset === profile.id
            return (
              <button
                key={profile.id}
                type="button"
                aria-pressed={selected}
                onClick={() => applyPreset(profile.id)}
                className={`min-h-28 rounded-[var(--radius-md)] border p-4 text-left transition-[background-color,border-color,box-shadow,transform] ${
                  selected
                    ? 'border-[var(--border-glow)] bg-[var(--theme-accent-soft)] shadow-[var(--shadow-accent-soft)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] hover:-translate-y-0.5 hover:border-[var(--border-panel)]'
                }`}
              >
                <span className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
                  <Icon className="h-4 w-4 text-[var(--text-gold)]" aria-hidden="true" />
                  {profile.label}
                </span>
                <span className="mt-2 block text-xs leading-5 text-[var(--text-muted)]">{profile.description}</span>
              </button>
            )
          })}
        </div>
        <p className="sr-only" aria-live="polite">Active comfort profile: {activePresetLabel}</p>
      </section>

      <section className="glass-panel rounded-[var(--radius-lg)] p-4 sm:p-5" aria-labelledby="comfort-preview-heading">
        <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr] lg:items-stretch">
          <div>
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-[var(--text-gold)]" aria-hidden="true" />
              <h2 id="comfort-preview-heading" className="text-lg font-semibold text-[var(--text-primary)]">Live preview</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              Changes apply instantly. Reloading keeps this device exactly where you left it.
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] p-3">
                <dt className="text-[var(--text-muted)]">Motion</dt>
                <dd className="mt-1 capitalize text-[var(--text-primary)]">{effectivePreferences.motion}</dd>
              </div>
              <div className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] p-3">
                <dt className="text-[var(--text-muted)]">Surface</dt>
                <dd className="mt-1 capitalize text-[var(--text-primary)]">{effectivePreferences.transparency}</dd>
              </div>
              <div className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] p-3">
                <dt className="text-[var(--text-muted)]">Text</dt>
                <dd className="mt-1 text-[var(--text-primary)]">{effectivePreferences.textScale}%</dd>
              </div>
              <div className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] p-3">
                <dt className="text-[var(--text-muted)]">Media</dt>
                <dd className="mt-1 text-[var(--text-primary)]">{effectivePreferences.autoplay === 'never' ? 'Play on request' : 'Muted autoplay'}</dd>
              </div>
            </dl>
          </div>

          <div className="theme-sent-bubble flex min-h-52 flex-col justify-between rounded-[var(--radius-lg)] border border-[var(--border-panel)] p-4 shadow-[var(--shadow-panel)]">
            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-[var(--text-primary)]">Shado</p>
                <span className="rounded-full border border-[var(--border-subtle)] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">preview</span>
              </div>
              <p className="mt-3 leading-6 text-[var(--text-secondary)]">
                Your messages stay clear, comfortable, and unmistakably ShadowChat.
              </p>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-[var(--comfort-space-2)]">
              <Button type="button" size="sm">Primary action</Button>
              <button type="button" className="min-h-[var(--comfort-control-min-size)] rounded-[var(--radius-sm)] border border-[var(--border-panel)] px-3 text-sm text-[var(--text-secondary)]">
                Secondary
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="glass-panel rounded-[var(--radius-lg)] p-4 sm:p-5" aria-labelledby="comfort-controls-heading">
        <div className="flex items-center gap-3">
          <Gauge className="h-5 w-5 text-[var(--text-gold)]" aria-hidden="true" />
          <div>
            <h2 id="comfort-controls-heading" className="text-lg font-semibold text-[var(--text-primary)]">Fine tune</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Adjust one part without changing the rest of your profile.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <SettingsChoice<ComfortMotionPreference>
            id="comfort-motion"
            label="Motion"
            description="Reduce or remove decorative animation and smooth scrolling."
            icon={Waves}
            value={preferences.motion}
            options={[
              { value: 'system', label: 'Follow device' },
              { value: 'full', label: 'Standard motion' },
              { value: 'reduced', label: 'Reduced motion' },
              { value: 'none', label: 'No decorative motion' },
            ]}
            onChange={motion => updatePreferences({ motion })}
          />
          <SettingsChoice<ComfortTransparencyPreference>
            id="comfort-transparency"
            label="Surfaces"
            description="Keep premium glass or use solid, lighter-weight panels."
            icon={Layers3}
            value={preferences.transparency}
            options={[
              { value: 'system', label: 'Follow device' },
              { value: 'glass', label: 'Glass surfaces' },
              { value: 'solid', label: 'Solid surfaces' },
            ]}
            onChange={transparency => updatePreferences({ transparency })}
          />
          <SettingsChoice<ComfortContrastPreference>
            id="comfort-contrast"
            label="Contrast"
            description="Strengthen text, borders, selected states, and focus rings."
            icon={Eye}
            value={preferences.contrast}
            options={[
              { value: 'system', label: 'Follow device' },
              { value: 'standard', label: 'Standard contrast' },
              { value: 'high', label: 'High contrast' },
            ]}
            onChange={contrast => updatePreferences({ contrast })}
          />
          <SettingsChoice<ComfortTextScale>
            id="comfort-text-scale"
            label="Text size"
            description="Scale app text while keeping browser pinch zoom available."
            icon={Type}
            value={preferences.textScale}
            options={[
              { value: 100, label: 'Standard · 100%' },
              { value: 115, label: 'Large · 115%' },
              { value: 130, label: 'Largest · 130%' },
            ]}
            onChange={textScale => updatePreferences({ textScale })}
          />
          <SettingsChoice<ComfortDensity>
            id="comfort-density"
            label="Message spacing"
            description="Change breathing room without shrinking minimum touch targets."
            icon={Gauge}
            value={preferences.density}
            options={[
              { value: 'compact', label: 'Compact' },
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'spacious', label: 'Spacious' },
            ]}
            onChange={density => updatePreferences({ density })}
          />
          <SettingsChoice<ComfortTouchTarget>
            id="comfort-touch-target"
            label="Control size"
            description="Large mode gives shared controls a minimum 48px target."
            icon={Hand}
            value={preferences.touchTarget}
            options={[
              { value: 'standard', label: 'Standard' },
              { value: 'large', label: 'Large · 48px' },
            ]}
            onChange={touchTarget => updatePreferences({ touchTarget })}
          />
          <SettingsChoice<ComfortAutoplay>
            id="comfort-autoplay"
            label="Media playback"
            description="Choose muted previews or require a deliberate tap to play."
            icon={Play}
            value={preferences.autoplay}
            options={[
              { value: 'muted', label: 'Muted autoplay' },
              { value: 'never', label: 'Play on request' },
            ]}
            onChange={autoplay => updatePreferences({ autoplay })}
          />
        </div>
      </section>

      <section className="glass-panel rounded-[var(--radius-lg)] p-4 sm:p-5" aria-labelledby="comfort-sensory-heading">
        <div className="flex items-center gap-3">
          <Volume2 className="h-5 w-5 text-[var(--text-gold)]" aria-hidden="true" />
          <div>
            <h2 id="comfort-sensory-heading" className="text-lg font-semibold text-[var(--text-primary)]">Sensory feedback</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">One policy for app feedback, celebrations, and device vibration.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <ComfortToggle
            label="Interface sounds"
            description="Message and reaction feedback across the app."
            checked={preferences.uiSounds}
            onChange={uiSounds => updatePreferences({ uiSounds })}
          />
          <ComfortToggle
            label="Celebration sounds"
            description="Dedicated Hype bells and celebration tones."
            checked={preferences.celebrationSounds}
            onChange={celebrationSounds => updatePreferences({ celebrationSounds })}
          />
          <ComfortToggle
            label="Haptics"
            description="Allow supported devices to vibrate for special feedback."
            checked={preferences.haptics}
            onChange={haptics => updatePreferences({ haptics })}
          />
        </div>
      </section>
    </div>
  )
}
