import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'
import { approveBridgePairing } from '../../lib/bridge'
import { Button } from '../ui/Button'

export function BridgePairingAdminPanel() {
  const [pairingCode, setPairingCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastDeviceId, setLastDeviceId] = useState('')

  const handleApprove = async () => {
    try {
      setLoading(true)
      const approval = await approveBridgePairing(pairingCode)
      setLastDeviceId(approval.deviceId)
      setPairingCode('')
      toast.success('Bridge pairing approved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to approve bridge pairing')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-panel rounded-[var(--radius-lg)] p-5">
      <div className="mb-4 flex items-center gap-3">
        <KeyRound className="h-5 w-5 text-[var(--text-muted)]" />
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">ESP Bridge Pairing</h2>
      </div>
      <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="min-w-0 flex-1">
            <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Pairing code</span>
            <input
              value={pairingCode}
              onChange={(event) => setPairingCode(event.target.value.toUpperCase())}
              placeholder="ABCDEFGH"
              autoCapitalize="characters"
              spellCheck={false}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.28)] px-4 py-3 font-mono text-sm uppercase tracking-[0.18em] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--border-glow)]"
            />
          </label>
          <Button
            onClick={() => void handleApprove()}
            disabled={loading || pairingCode.trim().length < 4}
            variant="secondary"
            className="w-full justify-center lg:w-auto"
          >
            <KeyRound className="mr-3 h-4 w-4" />
            {loading ? 'Approving' : 'Approve Bridge'}
          </Button>
        </div>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Enter the code shown by the ESP bridge to approve this account as owner.
        </p>
        {lastDeviceId && (
          <p className="mt-3 break-all text-xs uppercase tracking-[0.14em] text-[var(--text-gold)]">
            Approved: {lastDeviceId}
          </p>
        )}
      </div>
    </div>
  )
}
