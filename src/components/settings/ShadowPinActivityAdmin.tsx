import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Search,
  Table2,
  UserRound,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { Avatar } from '../ui/Avatar'
import { UserRoleBadge } from '../ui/UserRoleBadge'
import { fetchShadowPinActivityDashboard } from '../../features/shadow-pin/api/shadowPinActivityApi'
import type {
  ShadowPinActivityActionFilter,
  ShadowPinActivityDashboardData,
  ShadowPinActivityTab,
} from '../../features/shadow-pin/activityTypes'

type RangePreset = 'today' | '7d' | '30d' | '90d'

const EMPTY_DATA: ShadowPinActivityDashboardData = {
  users: [],
  categories: [],
  pins: [],
  timeline: [],
}

const rangePresets: Array<{ id: RangePreset; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
]

const actionFilters: Array<{ id: ShadowPinActivityActionFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'views', label: 'Views' },
  { id: 'opens', label: 'Opens' },
  { id: 'posts', label: 'Posts' },
  { id: 'hearts', label: 'Hearts' },
  { id: 'shares', label: 'Shares' },
  { id: 'edits', label: 'Edits' },
  { id: 'deletes', label: 'Deletes' },
  { id: 'visits', label: 'Visits' },
]

const chartTabs: Array<{ id: ShadowPinActivityTab; label: string; icon: typeof UserRound }> = [
  { id: 'users', label: 'Users', icon: UserRound },
  { id: 'categories', label: 'Categories', icon: Table2 },
  { id: 'pins', label: 'Pins', icon: ImageIcon },
]

const userTableGrid = 'grid-cols-[minmax(14rem,1.4fr)_repeat(7,minmax(5rem,0.7fr))]'
const categoryTableGrid = 'grid-cols-[minmax(14rem,1.4fr)_repeat(7,minmax(5rem,0.7fr))]'
const pinTableGrid = 'grid-cols-[minmax(14rem,1.4fr)_repeat(6,minmax(5rem,0.7fr))]'

const getRange = (preset: RangePreset) => {
  const end = new Date()
  const start = new Date(end)

  if (preset === 'today') {
    start.setHours(0, 0, 0, 0)
  } else {
    const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90
    start.setDate(start.getDate() - days)
  }

  const compareEnd = new Date(start)
  const compareStart = new Date(compareEnd.getTime() - (end.getTime() - start.getTime()))

  return {
    start,
    end,
    compareStart,
    compareEnd,
  }
}

const formatDateTime = (value?: string | null) => {
  if (!value) return 'None'
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const formatDuration = (seconds: number) => {
  if (seconds <= 0) return '0m'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

const formatNumber = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)

const formatDelta = (current: number, previous: number) => {
  const delta = Math.round(current - previous)
  if (delta === 0) return '0'
  return `${delta > 0 ? '+' : ''}${formatNumber(delta)}`
}

const formatChartName = (value: string) => {
  if (value.length <= 18) return value
  return `${value.slice(0, 17)}...`
}

const eventLabels: Record<string, string> = {
  shadow_pin_visit: 'Shadow Pin visit',
  category_visit: 'Category visit',
  pin_viewed: 'Pin viewed',
  pin_opened: 'Pin opened',
  category_heart_added: 'Category heart added',
  category_heart_removed: 'Category heart removed',
  pin_heart_added: 'Pin heart added',
  pin_heart_removed: 'Pin heart removed',
  share_tapped: 'Share tapped',
  category_created: 'Category created',
  category_edited: 'Category edited',
  category_deleted: 'Category deleted',
  pin_created: 'Pin posted',
  pin_edited: 'Pin edited',
  pin_deleted: 'Pin deleted',
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[var(--text-muted)]">
      {label}
    </div>
  )
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex flex-col rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-2">
      <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</span>
      <span className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{value}</span>
    </span>
  )
}

function SpreadsheetHeader({
  columns,
  gridClass,
}: {
  columns: string[]
  gridClass: string
}) {
  return (
    <div className={`grid w-full gap-3 rounded-t-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.045)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] ${gridClass}`}>
      {columns.map(column => (
        <span key={column}>{column}</span>
      ))}
    </div>
  )
}

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <span className="min-w-0">
      <b className="block text-sm font-semibold text-[var(--text-primary)]">{value}</b>
      <small className="block truncate text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]">{label}</small>
    </span>
  )
}

export function ShadowPinActivityAdmin() {
  const [preset, setPreset] = useState<RangePreset>('7d')
  const [activeTab, setActiveTab] = useState<ShadowPinActivityTab>('users')
  const [actionFilter, setActionFilter] = useState<ShadowPinActivityActionFilter>('all')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [showTimeline, setShowTimeline] = useState(false)
  const [data, setData] = useState<ShadowPinActivityDashboardData>(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const range = useMemo(() => getRange(preset), [preset])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const nextData = await fetchShadowPinActivityDashboard({
        startAt: range.start.toISOString(),
        endAt: range.end.toISOString(),
        compareStartAt: range.compareStart.toISOString(),
        compareEndAt: range.compareEnd.toISOString(),
        filterUserId: selectedUserId,
        filterCategoryId: selectedCategoryId,
        filterImageId: selectedImageId,
        actionFilter,
      })
      setData(nextData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Shadow Pin activity')
    } finally {
      setLoading(false)
    }
  }, [actionFilter, range.compareEnd, range.compareStart, range.end, range.start, selectedCategoryId, selectedImageId, selectedUserId])

  useEffect(() => {
    void load()
  }, [load])

  const totals = useMemo(() => ({
    visits: data.users.reduce((sum, user) => sum + user.visits, 0),
    activeSeconds: data.users.reduce((sum, user) => sum + user.active_seconds, 0),
    score: data.users.reduce((sum, user) => sum + user.activity_score, 0),
    previousScore: data.users.reduce((sum, user) => sum + user.previous_activity_score, 0),
    posts: data.users.reduce((sum, user) => sum + user.posts, 0),
    pinsViewed: data.users.reduce((sum, user) => sum + user.pins_viewed, 0),
  }), [data.users])

  const chartData = useMemo(() => {
    if (activeTab === 'users') {
      return data.users.slice(0, 10).map(user => ({
        name: formatChartName(user.display_name || user.username),
        score: Math.round(user.activity_score),
      }))
    }

    if (activeTab === 'categories') {
      return data.categories.slice(0, 10).map(category => ({
        name: formatChartName(category.title),
        score: Math.round(category.activity_score),
      }))
    }

    return data.pins.slice(0, 10).map(pin => ({
      name: formatChartName(pin.title),
      score: Math.round(pin.activity_score),
    }))
  }, [activeTab, data.categories, data.pins, data.users])

  const openUserDrilldown = (userId: string) => {
    setSelectedUserId(userId)
    setSelectedImageId(null)
    setShowTimeline(true)
  }

  const openCategoryDrilldown = (categoryId: string) => {
    setSelectedCategoryId(categoryId)
    setSelectedImageId(null)
    setShowTimeline(true)
  }

  const openPinDrilldown = (imageId: string) => {
    setSelectedImageId(imageId)
    setShowTimeline(true)
  }

  const clearFilters = () => {
    setSelectedUserId(null)
    setSelectedCategoryId(null)
    setSelectedImageId(null)
    setActionFilter('all')
  }

  const selectedUser = data.users.find(user => user.user_id === selectedUserId)
  const selectedCategory = data.categories.find(category => category.category_id === selectedCategoryId)
  const selectedPin = data.pins.find(pin => pin.image_id === selectedImageId)

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-[var(--radius-lg)] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-3">
              <BarChart3 className="h-5 w-5 text-[var(--text-gold)]" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Shadow Pin Activity</h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
              Activity score combines visits, views, hearts, shares, posts, edits, deletes, and active time.
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading} className="w-full justify-center sm:w-auto">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {rangePresets.map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => setPreset(option.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${
                preset === option.id
                  ? 'border-[rgba(215,170,70,0.4)] bg-[rgba(215,170,70,0.16)] text-[var(--text-gold)]'
                  : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-muted)] hover:border-[var(--border-glow)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            {range.start.toLocaleDateString()} - {range.end.toLocaleDateString()}
          </span>
          <span className="rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-1.5">
            Compared to {range.compareStart.toLocaleDateString()} - {range.compareEnd.toLocaleDateString()}
          </span>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.35)] bg-[rgba(87,14,28,0.18)] p-3 text-sm text-red-100 sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex min-w-0 items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </span>
          <Button type="button" size="sm" variant="secondary" onClick={() => void load()} disabled={loading} className="w-full justify-center sm:w-auto">
            Retry
          </Button>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        <MetricPill label="Visits" value={formatNumber(totals.visits)} />
        <MetricPill label="Active Time" value={formatDuration(totals.activeSeconds)} />
        <MetricPill label="Score" value={formatNumber(totals.score)} />
        <MetricPill label="Score Delta" value={formatDelta(totals.score, totals.previousScore)} />
        <MetricPill label="Pins Viewed" value={formatNumber(totals.pinsViewed)} />
        <MetricPill label="Posts" value={formatNumber(totals.posts)} />
      </div>

      <div className="grid gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-3 lg:grid-cols-[1fr_1fr_auto]">
        <label>
          <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">User</span>
          <select
            value={selectedUserId ?? ''}
            onChange={event => {
              setSelectedUserId(event.target.value || null)
              setSelectedImageId(null)
            }}
            className="obsidian-input w-full rounded-[var(--radius-md)] px-3.5 py-3 text-sm"
          >
            <option value="">All users</option>
            {data.users.map(user => (
              <option key={user.user_id} value={user.user_id}>
                {user.display_name || user.username}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Category</span>
          <select
            value={selectedCategoryId ?? ''}
            onChange={event => {
              setSelectedCategoryId(event.target.value || null)
              setSelectedImageId(null)
            }}
            className="obsidian-input w-full rounded-[var(--radius-md)] px-3.5 py-3 text-sm"
          >
            <option value="">All categories</option>
            {data.categories.map(category => (
              <option key={category.category_id} value={category.category_id}>
                {category.title}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" variant="secondary" onClick={clearFilters} className="w-full justify-center self-end lg:w-auto">
          Clear
        </Button>
      </div>

      {(selectedUser || selectedCategory || selectedPin) && (
        <div className="flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
          {selectedUser && <span className="rounded-full border border-[var(--border-subtle)] px-3 py-1.5">User: {selectedUser.display_name || selectedUser.username}</span>}
          {selectedCategory && <span className="rounded-full border border-[var(--border-subtle)] px-3 py-1.5">Category: {selectedCategory.title}</span>}
          {selectedPin && <span className="rounded-full border border-[var(--border-subtle)] px-3 py-1.5">Pin: {selectedPin.title}</span>}
        </div>
      )}

      <div className="glass-panel rounded-[var(--radius-lg)] p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {chartTabs.map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition-colors ${
                    activeTab === tab.id
                      ? 'border-[rgba(215,170,70,0.42)] bg-[rgba(215,170,70,0.14)] text-[var(--text-gold)]'
                      : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)] hover:border-[var(--border-glow)]'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>
          <span className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Weighted score</span>
        </div>

        <div className="h-72 min-h-72">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading activity
            </div>
          ) : chartData.length === 0 ? (
            <EmptyState label="No chart data for this range." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 6, left: -18, bottom: 36 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis
                  dataKey="name"
                  interval={0}
                  angle={-28}
                  textAnchor="end"
                  height={58}
                  tick={{ fill: 'rgba(238,232,218,0.72)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
                />
                <YAxis tick={{ fill: 'rgba(238,232,218,0.72)', fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(215,170,70,0.08)' }}
                  contentStyle={{
                    background: 'rgba(8,9,12,0.96)',
                    border: '1px solid rgba(215,170,70,0.22)',
                    borderRadius: 8,
                    color: 'var(--text-primary)',
                  }}
                />
                <Bar dataKey="score" fill="#d7aa46" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="glass-panel rounded-[var(--radius-lg)] p-5">
        {activeTab === 'users' && (
          <div className="-mx-2 overflow-x-auto px-2 pb-1">
            {data.users.length === 0 ? <EmptyState label="No user activity for this range." /> : data.users.map(user => (
              <div key={user.user_id} className="min-w-[840px]">
                {user === data.users[0] && (
                  <SpreadsheetHeader columns={['User', 'Score', 'Visits', 'Active', 'Views', 'Posts', 'Hearts', 'Delta']} gridClass={userTableGrid} />
                )}
                <button
                  type="button"
                  onClick={() => openUserDrilldown(user.user_id)}
                  className={`grid w-full gap-3 border-x border-b border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] p-3 text-left text-sm transition-colors hover:border-[var(--border-glow)] hover:bg-[rgba(215,170,70,0.055)] ${userTableGrid}`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar src={user.avatar_url ?? undefined} alt={user.display_name || user.username} size="sm" />
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-semibold text-[var(--text-primary)]">{user.display_name || user.username}</span>
                        <UserRoleBadge role={user.admin_role as any} />
                      </span>
                      <span className="block truncate text-xs text-[var(--text-muted)]">@{user.username}</span>
                    </span>
                  </span>
                  <StatCell value={formatNumber(user.activity_score)} label="score" />
                  <StatCell value={formatNumber(user.visits)} label="visits" />
                  <StatCell value={formatDuration(user.active_seconds)} label="active" />
                  <StatCell value={formatNumber(user.pins_viewed)} label="views" />
                  <StatCell value={formatNumber(user.posts)} label="posts" />
                  <StatCell value={formatNumber(user.hearts)} label="hearts" />
                  <span className="inline-flex min-w-0 items-center justify-between gap-2">
                    <StatCell value={formatDelta(user.activity_score, user.previous_activity_score)} label="delta" />
                    <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'categories' && (
          <div className="-mx-2 overflow-x-auto px-2 pb-1">
            {data.categories.length === 0 ? <EmptyState label="No category activity for this range." /> : data.categories.map(category => (
              <div key={category.category_id} className="min-w-[840px]">
                {category === data.categories[0] && (
                  <SpreadsheetHeader columns={['Category', 'Score', 'Visits', 'Active', 'Users', 'Views', 'Posts', 'Delta']} gridClass={categoryTableGrid} />
                )}
                <button
                  type="button"
                  onClick={() => openCategoryDrilldown(category.category_id)}
                  className={`grid w-full gap-3 border-x border-b border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] p-3 text-left text-sm transition-colors hover:border-[var(--border-glow)] hover:bg-[rgba(215,170,70,0.055)] ${categoryTableGrid}`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    {category.thumbnail_url ? <img src={category.thumbnail_url} alt="" className="h-11 w-11 rounded-[var(--radius-sm)] object-cover" /> : <span className="h-11 w-11 rounded-[var(--radius-sm)] bg-[rgba(255,255,255,0.06)]" />}
                    <span className="truncate font-semibold text-[var(--text-primary)]">{category.title}</span>
                  </span>
                  <StatCell value={formatNumber(category.activity_score)} label="score" />
                  <StatCell value={formatNumber(category.visits)} label="visits" />
                  <StatCell value={formatDuration(category.active_seconds)} label="active" />
                  <StatCell value={formatNumber(category.unique_visitors)} label="users" />
                  <StatCell value={formatNumber(category.pin_views)} label="views" />
                  <StatCell value={formatNumber(category.pins_created)} label="posts" />
                  <span className="inline-flex min-w-0 items-center justify-between gap-2">
                    <StatCell value={formatDelta(category.activity_score, category.previous_activity_score)} label="delta" />
                    <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'pins' && (
          <div className="-mx-2 overflow-x-auto px-2 pb-1">
            {data.pins.length === 0 ? <EmptyState label="No pin activity for this range." /> : data.pins.map(pin => (
              <div key={pin.image_id} className="min-w-[780px]">
                {pin === data.pins[0] && (
                  <SpreadsheetHeader columns={['Pin', 'Score', 'Views', 'Opens', 'Hearts', 'Shares', 'Delta']} gridClass={pinTableGrid} />
                )}
                <button
                  type="button"
                  onClick={() => openPinDrilldown(pin.image_id)}
                  className={`grid w-full gap-3 border-x border-b border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] p-3 text-left text-sm transition-colors hover:border-[var(--border-glow)] hover:bg-[rgba(215,170,70,0.055)] ${pinTableGrid}`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    {pin.thumbnail_url ? <img src={pin.thumbnail_url} alt="" className="h-11 w-11 rounded-[var(--radius-sm)] object-cover" /> : <span className="h-11 w-11 rounded-[var(--radius-sm)] bg-[rgba(255,255,255,0.06)]" />}
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-[var(--text-primary)]">{pin.title}</span>
                      <span className="block truncate text-xs text-[var(--text-muted)]">{pin.category_title || 'Uncategorized'}</span>
                    </span>
                  </span>
                  <StatCell value={formatNumber(pin.activity_score)} label="score" />
                  <StatCell value={formatNumber(pin.grid_views)} label="views" />
                  <StatCell value={formatNumber(pin.opens)} label="opens" />
                  <StatCell value={formatNumber(pin.hearts)} label="hearts" />
                  <StatCell value={formatNumber(pin.shares)} label="shares" />
                  <span className="inline-flex min-w-0 items-center justify-between gap-2">
                    <StatCell value={formatDelta(pin.activity_score, pin.previous_activity_score)} label="delta" />
                    <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-panel rounded-[var(--radius-lg)] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
              <Search className="h-4 w-4 text-[var(--text-gold)]" />
              Activity Timeline
            </h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Rows follow the selected filters and action type.</p>
          </div>
          <Button type="button" variant="secondary" onClick={() => setShowTimeline(value => !value)} className="w-full justify-center sm:w-auto">
            {showTimeline ? 'Hide Timeline' : 'Show Timeline'}
          </Button>
        </div>

        {showTimeline && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {actionFilters.map(filter => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setActionFilter(filter.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] ${
                    actionFilter === filter.id
                      ? 'border-[rgba(215,170,70,0.4)] bg-[rgba(215,170,70,0.14)] text-[var(--text-gold)]'
                      : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-muted)]'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {data.timeline.length === 0 ? <EmptyState label="No timeline rows for this filter." /> : (
              <div className="space-y-2">
                {data.timeline.map(event => (
                  <div key={event.id} className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-3 text-sm lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-center">
                    <div className="min-w-0">
                      <span className="font-semibold text-[var(--text-primary)]">{eventLabels[event.event_type] || event.event_type}</span>
                      <p className="mt-1 truncate text-xs text-[var(--text-muted)]">{formatDateTime(event.created_at)}</p>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar src={event.avatar_url ?? undefined} alt={event.display_name || event.username} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-[var(--text-primary)]">{event.display_name || event.username}</span>
                        <span className="block truncate text-xs text-[var(--text-muted)]">@{event.username}</span>
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="block truncate text-[var(--text-primary)]">{event.item_title || event.category_title || 'Shadow Pin'}</span>
                      {event.category_title && event.item_title !== event.category_title && (
                        <span className="block truncate text-xs text-[var(--text-muted)]">{event.category_title}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      {event.duration_seconds ? <span className="rounded-full border border-[var(--border-subtle)] px-2 py-1 text-xs text-[var(--text-muted)]">{formatDuration(event.duration_seconds)}</span> : null}
                      <span className="rounded-full border border-[rgba(215,170,70,0.22)] bg-[rgba(215,170,70,0.08)] px-2 py-1 text-xs text-[var(--text-gold)]">+{event.score_value}</span>
                      {event.source === 'backfill' && <span className="rounded-full border border-[var(--border-subtle)] px-2 py-1 text-xs text-[var(--text-muted)]">Backfill</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
