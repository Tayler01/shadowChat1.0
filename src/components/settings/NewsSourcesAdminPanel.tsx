import { useState } from 'react'
import { Newspaper, Plus, Power, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNewsAdmin } from '../../hooks/useNewsAdmin'
import { Button } from '../ui/Button'

const normalizeHandle = (value: string) =>
  value
    .trim()
    .replace(/^@+\s*/, '@')
    .trim()

const getHealthClass = (status: string) => {
  if (status === 'ok') {
    return 'theme-accent-chip border'
  }

  if (status === 'blocked') {
    return 'border-[rgba(224,164,62,0.28)] bg-[rgba(224,164,62,0.1)] text-amber-100'
  }

  if (status === 'pending') {
    return 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.035)] text-[var(--text-muted)]'
  }

  return 'border-[rgba(190,52,85,0.35)] bg-[rgba(87,14,28,0.18)] text-red-100'
}

const getMessageClass = (status: string) =>
  status === 'blocked' ? 'text-amber-100/85' : 'text-red-200/80'

export function NewsSourcesAdminPanel() {
  const [platform, setPlatform] = useState<'x' | 'truth'>('x')
  const [handle, setHandle] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [profileUrl, setProfileUrl] = useState('')
  const {
    isAdmin,
    sources,
    loading,
    saving,
    error,
    upsertSource,
    setSourceEnabled,
    deleteSource,
  } = useNewsAdmin({ enabled: true })

  const handleAdd = async () => {
    const normalizedHandle = normalizeHandle(handle)
    if (!normalizedHandle) return

    try {
      await upsertSource({
        platform,
        handle: normalizedHandle,
        displayName: displayName.trim() || undefined,
        profileUrl: profileUrl.trim() || undefined,
      })
      setHandle('')
      setDisplayName('')
      setProfileUrl('')
      toast.success('News source saved')
    } catch (sourceError) {
      toast.error(sourceError instanceof Error ? sourceError.message : 'Failed to save news source')
    }
  }

  const handleToggle = async (sourceId: string, enabled: boolean) => {
    try {
      await setSourceEnabled(sourceId, enabled)
      toast.success(enabled ? 'News source enabled' : 'News source paused')
    } catch (sourceError) {
      toast.error(sourceError instanceof Error ? sourceError.message : 'Failed to update news source')
    }
  }

  const handleDelete = async (sourceId: string, label: string) => {
    const confirmed = window.confirm(`Delete ${label} from the news tracker? Existing feed items will stay, but this account will no longer be tracked.`)
    if (!confirmed) return

    try {
      await deleteSource(sourceId)
      toast.success('News source deleted')
    } catch (sourceError) {
      toast.error(sourceError instanceof Error ? sourceError.message : 'Failed to delete news source')
    }
  }

  return (
    <div className="glass-panel rounded-[var(--radius-lg)] p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Newspaper className="h-5 w-5 text-[var(--text-muted)]" />
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">News Sources</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Tracked X and Truth accounts for the Today Board.</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[var(--text-muted)]">
          Loading source controls.
        </div>
      ) : !isAdmin ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-sm leading-6 text-[var(--text-muted)]">
          News source management is limited to admin-class accounts.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 lg:grid-cols-[8rem_1fr_1fr_1fr_auto] lg:items-end">
            <label>
              <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Platform</span>
              <select
                value={platform}
                onChange={event => setPlatform(event.target.value as 'x' | 'truth')}
                className="obsidian-input w-full rounded-[var(--radius-md)] px-3.5 py-3 text-sm"
              >
                <option value="x">X</option>
                <option value="truth">Truth</option>
              </select>
            </label>
            <label>
              <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Handle</span>
              <input
                value={handle}
                onChange={event => setHandle(event.target.value)}
                onBlur={() => setHandle(previous => normalizeHandle(previous))}
                placeholder="@account"
                className="obsidian-input w-full rounded-[var(--radius-md)] px-3.5 py-3 text-sm"
              />
            </label>
            <label>
              <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Display</span>
              <input
                value={displayName}
                onChange={event => setDisplayName(event.target.value)}
                placeholder="Optional"
                className="obsidian-input w-full rounded-[var(--radius-md)] px-3.5 py-3 text-sm"
              />
            </label>
            <label>
              <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Profile URL</span>
              <input
                value={profileUrl}
                onChange={event => setProfileUrl(event.target.value)}
                placeholder="Optional"
                className="obsidian-input w-full rounded-[var(--radius-md)] px-3.5 py-3 text-sm"
              />
            </label>
            <Button
              type="button"
              onClick={() => void handleAdd()}
              disabled={!normalizeHandle(handle) || saving}
              loading={saving}
              className="w-full justify-center lg:w-auto"
            >
              <Plus className="mr-2 h-4 w-4" />
              Save
            </Button>
          </div>

          {error && (
            <div className="rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.35)] bg-[rgba(87,14,28,0.18)] p-3 text-sm text-red-100">
              {error}
            </div>
          )}

          <div className="space-y-2">
            {sources.length === 0 ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[var(--text-muted)]">
                No sources configured.
              </div>
            ) : (
              sources.map(source => (
                <div
                  key={source.id}
                  className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 lg:grid-cols-[1fr_auto_auto_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[rgba(215,170,70,0.18)] bg-[rgba(215,170,70,0.08)] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--text-gold)]">
                        {source.platform === 'x' ? 'X' : 'Truth'}
                      </span>
                      <h3 className="truncate font-medium text-[var(--text-primary)]">
                        {source.display_name || source.handle}
                      </h3>
                      <span className="text-sm text-[var(--text-muted)]">@{source.normalized_handle || source.handle}</span>
                    </div>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                      <span className={`rounded-full border px-2 py-0.5 uppercase tracking-[0.12em] ${getHealthClass(source.health_status)}`}>
                        {source.health_status}
                      </span>
                      {source.last_success_at ? ` / last ok ${new Date(source.last_success_at).toLocaleString()}` : ''}
                    </p>
                    {source.last_error && (
                      <p className={`mt-1 line-clamp-2 text-xs ${getMessageClass(source.health_status)}`}>{source.last_error}</p>
                    )}
                  </div>
                  <span className={`w-fit rounded-full border px-3 py-1 text-xs uppercase tracking-[0.12em] ${
                    source.enabled
                      ? 'border-[rgba(215,170,70,0.22)] bg-[rgba(215,170,70,0.08)] text-[var(--text-gold)]'
                      : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-muted)]'
                  }`}>
                    {source.enabled ? 'Enabled' : 'Paused'}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleToggle(source.id, !source.enabled)}
                    disabled={saving}
                    className="w-full justify-center lg:w-auto"
                  >
                    <Power className="mr-2 h-4 w-4" />
                    {source.enabled ? 'Pause' : 'Enable'}
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => void handleDelete(
                      source.id,
                      source.display_name || `@${source.normalized_handle || source.handle}`
                    )}
                    disabled={saving}
                    className="w-full justify-center lg:w-auto"
                    aria-label={`Delete ${source.display_name || source.handle} from news tracker`}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
