import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../../hooks/useAuth'
import { usePwaInstallPrompt } from '../../hooks/usePwaInstallPrompt'
import {
  markPhoneInstallOnboardingSeen,
  shouldShowPhoneInstallOnboarding,
} from '../../lib/phoneInstallOnboarding'
import { PhoneInstallGuide } from './PhoneInstallGuide'

const isInstalledApp = () => {
  if (typeof window === 'undefined') {
    return false
  }

  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean
  }

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    navigatorWithStandalone.standalone === true
  )
}

const isPhoneLikeDevice = () => {
  if (typeof window === 'undefined') {
    return false
  }

  const nav = window.navigator as Navigator & { standalone?: boolean }
  const userAgent = nav.userAgent || ''
  const isMobileUserAgent =
    /iPhone|iPod/i.test(userAgent) ||
    /Android.+Mobile/i.test(userAgent) ||
    (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const narrowScreen = Math.min(window.innerWidth, window.screen?.width || window.innerWidth) <= 900

  return isMobileUserAgent || (hasCoarsePointer && narrowScreen)
}

export function PhoneInstallOnboarding() {
  const { profile } = useAuth()
  const { canInstall, promptInstall } = usePwaInstallPrompt()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (profile && shouldShowPhoneInstallOnboarding(profile, isInstalledApp(), isPhoneLikeDevice())) {
      toast.dismiss()
      setOpen(true)
    }
  }, [profile])

  if (!profile) {
    return null
  }

  const closeAndRemember = () => {
    markPhoneInstallOnboardingSeen(profile)
    setOpen(false)
  }

  const handleNativeInstall = async () => {
    const outcome = await promptInstall()

    if (outcome === 'accepted') {
      markPhoneInstallOnboardingSeen(profile)
      setOpen(false)
      toast.success('Shadow Chat install started')
      return outcome
    }

    if (outcome === 'dismissed') {
      toast('No problem. You can reopen phone setup from Settings.')
      return outcome
    }

    toast('Use your browser menu to install Shadow Chat on this device.')
    return outcome
  }

  return (
    <PhoneInstallGuide
      open={open}
      canInstall={canInstall}
      onClose={closeAndRemember}
      onComplete={closeAndRemember}
      onInstall={handleNativeInstall}
    />
  )
}
