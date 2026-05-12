import { useEffect, useState } from 'react'
import {
  DEFAULT_SHADOW_WAR_IDENTITY,
  SHADOW_WAR_IDENTITY_STORAGE_KEY,
  type ShadowWarIdentity,
} from '../identity'

const isValidIdentity = (value: unknown): value is ShadowWarIdentity => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ShadowWarIdentity>
  return typeof candidate.avatarId === 'string' && typeof candidate.factionId === 'string'
}

export function useShadowWarIdentity() {
  const [identity, setIdentity] = useState<ShadowWarIdentity>(() => {
    if (typeof window === 'undefined') return DEFAULT_SHADOW_WAR_IDENTITY

    try {
      const stored = window.localStorage.getItem(SHADOW_WAR_IDENTITY_STORAGE_KEY)
      if (!stored) return DEFAULT_SHADOW_WAR_IDENTITY
      const parsed = JSON.parse(stored)
      return isValidIdentity(parsed) ? parsed : DEFAULT_SHADOW_WAR_IDENTITY
    } catch {
      return DEFAULT_SHADOW_WAR_IDENTITY
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SHADOW_WAR_IDENTITY_STORAGE_KEY, JSON.stringify(identity))
  }, [identity])

  return { identity, setIdentity }
}

