import { useCallback, useEffect, useState } from 'react'

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type InstallPromptListener = (event: BeforeInstallPromptEvent | null) => void

let installPromptEvent: BeforeInstallPromptEvent | null = null
let listenersInstalled = false
const listeners = new Set<InstallPromptListener>()

const notifyListeners = () => {
  listeners.forEach(listener => listener(installPromptEvent))
}

const ensureInstallPromptListeners = () => {
  if (listenersInstalled || typeof window === 'undefined') {
    return
  }

  const handleBeforeInstallPrompt = (event: Event) => {
    event.preventDefault()
    installPromptEvent = event as BeforeInstallPromptEvent
    notifyListeners()
  }

  const handleAppInstalled = () => {
    installPromptEvent = null
    notifyListeners()
  }

  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.addEventListener('appinstalled', handleAppInstalled)
  listenersInstalled = true
}

export const usePwaInstallPrompt = () => {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(() => {
    ensureInstallPromptListeners()
    return installPromptEvent
  })

  useEffect(() => {
    ensureInstallPromptListeners()
    listeners.add(setPromptEvent)
    setPromptEvent(installPromptEvent)

    return () => {
      listeners.delete(setPromptEvent)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    const event = installPromptEvent
    if (!event) {
      return null
    }

    try {
      await event.prompt()
      const choice = await event.userChoice.catch(() => null)
      return choice?.outcome ?? null
    } finally {
      installPromptEvent = null
      notifyListeners()
    }
  }, [])

  return {
    canInstall: Boolean(promptEvent),
    promptInstall,
  }
}
