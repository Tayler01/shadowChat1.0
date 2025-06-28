import React, { createContext, useContext, useEffect, useState } from 'react'

export type ColorScheme = 'indigo' | 'teal' | 'rose'

interface ThemeContextValue {
  scheme: ColorScheme
  setScheme: (scheme: ColorScheme) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export const colorSchemes: Record<ColorScheme, { start: string; end: string }> = {
  indigo: { start: '#6366f1', end: '#8b5cf6' },
  teal: { start: '#14b8a6', end: '#10b981' },
  rose: { start: '#f43f5e', end: '#d946ef' },
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [scheme, setScheme] = useState<ColorScheme>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('colorScheme') as ColorScheme) || 'indigo'
    }
    return 'indigo'
  })

  useEffect(() => {
    document.documentElement.dataset.scheme = scheme
    document.documentElement.classList.remove('indigo', 'teal', 'rose')
    document.documentElement.classList.add(scheme)
    localStorage.setItem('colorScheme', scheme)
  }, [scheme])

  return (
    <ThemeContext.Provider value={{ scheme, setScheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
