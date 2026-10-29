import { useState } from 'react'
import { Settings } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { canChangeNativeCommunity, requestNativeCommunityChooser } from '../nativeCommunity'

export function SignInSettings() {
  const [open, setOpen] = useState(false)
  if (!canChangeNativeCommunity()) return null
  return <div className="border-t border-[var(--border-subtle)] pt-3 text-center">
    <Button variant="ghost" style={{ minHeight: 'max(48px, var(--comfort-control-min-size))' }} onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="signin-community-settings">
      <Settings className="mr-2 h-4 w-4" aria-hidden="true" />Settings
    </Button>
    {open && <section id="signin-community-settings" className="mt-3 space-y-3 text-left" aria-label="Sign-in settings">
      <p className="text-sm text-[var(--text-muted)]">Choose the member community for your account, or the demo community for an App Review login.</p>
      <Button variant="secondary" className="w-full" style={{ minHeight: 'max(48px, var(--comfort-control-min-size))' }} onClick={() => requestNativeCommunityChooser()}>Change community</Button>
    </section>}
  </div>
}
