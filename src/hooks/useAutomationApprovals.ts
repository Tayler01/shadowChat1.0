import { useCallback, useEffect, useState } from 'react'
import {
  approveAutomationApprovalPacket,
  archiveAutomationApprovalPacket,
  fetchAutomationApprovalPacketEvents,
  fetchAutomationApprovalPackets,
  rejectAutomationApprovalPacket,
  type AutomationApprovalPacket,
  type AutomationApprovalPacketEvent,
} from '../lib/automationApprovals'

type UseAutomationApprovalsOptions = {
  enabled?: boolean
}

const groupEventsByPacketId = (events: AutomationApprovalPacketEvent[]) =>
  events.reduce<Record<string, AutomationApprovalPacketEvent[]>>((acc, event) => {
    acc[event.packet_id] = [...(acc[event.packet_id] ?? []), event]
    return acc
  }, {})

export function useAutomationApprovals(options: UseAutomationApprovalsOptions = {}) {
  const { enabled = true } = options
  const [packets, setPackets] = useState<AutomationApprovalPacket[]>([])
  const [eventsByPacketId, setEventsByPacketId] = useState<Record<string, AutomationApprovalPacketEvent[]>>({})
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [activeActionId, setActiveActionId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled) {
      setPackets([])
      setEventsByPacketId({})
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    try {
      const nextPackets = await fetchAutomationApprovalPackets()
      const nextEvents = await fetchAutomationApprovalPacketEvents(nextPackets.map(packet => packet.id))
      setPackets(nextPackets)
      setEventsByPacketId(groupEventsByPacketId(nextEvents))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load automation approvals')
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const updatePacket = useCallback((packet: AutomationApprovalPacket) => {
    setPackets(current => current.map(item => item.id === packet.id ? packet : item))
  }, [])

  const refreshEventsFor = useCallback(async (packetId: string) => {
    try {
      const nextEvents = await fetchAutomationApprovalPacketEvents([packetId])
      setEventsByPacketId(current => ({
        ...current,
        [packetId]: nextEvents,
      }))
    } catch {
      await refresh()
    }
  }, [refresh])

  const approvePacket = useCallback(async (packetId: string) => {
    setActiveActionId(packetId)
    try {
      const nextPacket = await approveAutomationApprovalPacket(packetId)
      updatePacket(nextPacket)
      await refreshEventsFor(packetId)
      setError(null)
      return nextPacket
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to approve automation packet')
      throw err
    } finally {
      setActiveActionId(null)
    }
  }, [refreshEventsFor, updatePacket])

  const rejectPacket = useCallback(async (packetId: string, reason?: string) => {
    setActiveActionId(packetId)
    try {
      const nextPacket = await rejectAutomationApprovalPacket(packetId, reason)
      updatePacket(nextPacket)
      await refreshEventsFor(packetId)
      setError(null)
      return nextPacket
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reject automation packet')
      throw err
    } finally {
      setActiveActionId(null)
    }
  }, [refreshEventsFor, updatePacket])

  const archivePacket = useCallback(async (packetId: string) => {
    setActiveActionId(packetId)
    try {
      const nextPacket = await archiveAutomationApprovalPacket(packetId)
      updatePacket(nextPacket)
      await refreshEventsFor(packetId)
      setError(null)
      return nextPacket
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to archive automation packet')
      throw err
    } finally {
      setActiveActionId(null)
    }
  }, [refreshEventsFor, updatePacket])

  return {
    packets,
    eventsByPacketId,
    loading,
    error,
    activeActionId,
    refresh,
    approvePacket,
    rejectPacket,
    archivePacket,
  }
}
