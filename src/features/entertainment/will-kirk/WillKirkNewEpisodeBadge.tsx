import { useEffect, useState } from 'react'
import { fetchWillKirkLatestRelease } from './api'
import { getNewEpisodeExpiry } from './catalog'

export function WillKirkNewEpisodeBadge() {
  const [releasedAt, setReleasedAt] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    let disposed = false
    const refresh = async () => {
      if (document.hidden) return
      try {
        const release = await fetchWillKirkLatestRelease()
        if (!disposed) { setReleasedAt(release); setNow(Date.now()) }
      } catch { if (!disposed) { setReleasedAt(null); setNow(Date.now()) } }
    }
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 60_000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      disposed = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  const expiresAt = getNewEpisodeExpiry(releasedAt, now)
  useEffect(() => {
    if (expiresAt == null) return
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, expiresAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [expiresAt])

  if (expiresAt == null) return null
  return <span className="absolute right-3 top-3 z-10 rounded-full border border-[#ffe2a0]/70 bg-[#d7aa46] px-3 py-1.5 text-xs font-black text-black shadow-[0_3px_14px_rgba(0,0,0,0.7)]">New episode</span>
}
