import type { AppView } from '../types/navigation'

const SETTINGS_SECTION_STORAGE_KEY = 'shadowchat:settings-section'
const SETTINGS_MAIN_EVENT = 'shadowchat:settings-main'

export function openSettingsMain(onViewChange: (view: AppView) => void) {
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(SETTINGS_SECTION_STORAGE_KEY)
    window.dispatchEvent(new CustomEvent(SETTINGS_MAIN_EVENT))
  }
  onViewChange('settings')
}
