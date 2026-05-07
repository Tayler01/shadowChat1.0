/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState } from 'react'

export type ColorScheme =
  | 'obsidian-gold'
  | 'obsidian-champagne'
  | 'graphite-amber'
  | 'carbon-ivory'
  | 'moonstone-light'

export type ThemeMode = 'dark' | 'light'

interface ThemeContextValue {
  scheme: ColorScheme
  setScheme: (scheme: ColorScheme) => void
  mode: ThemeMode
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export const colorSchemes: Record<
  ColorScheme,
  { label: string; start: string; end: string; accent: string; mode: ThemeMode }
> = {
  'obsidian-gold': {
    label: 'Obsidian Gold',
    start: '#fff0b8',
    end: '#9a7421',
    accent: '#d7aa46',
    mode: 'dark',
  },
  'obsidian-champagne': {
    label: 'Noir Champagne',
    start: '#f3ddb0',
    end: '#8f6a37',
    accent: '#d2ac69',
    mode: 'dark',
  },
  'graphite-amber': {
    label: 'Blackened Brass',
    start: '#e6bf7d',
    end: '#7a5628',
    accent: '#b88646',
    mode: 'dark',
  },
  'carbon-ivory': {
    label: 'Smoked Ivory',
    start: '#e4d5b6',
    end: '#7b694b',
    accent: '#c8b08a',
    mode: 'dark',
  },
  'moonstone-light': {
    label: 'Moonstone Light',
    start: '#fff8e8',
    end: '#d7aa46',
    accent: '#b9851f',
    mode: 'light',
  },
}

const legacySchemeMap: Record<string, ColorScheme> = {
  indigo: 'obsidian-gold',
  teal: 'obsidian-champagne',
  rose: 'graphite-amber',
  violet: 'obsidian-gold',
  orange: 'graphite-amber',
  contrast: 'carbon-ivory',
}

function normalizeScheme(value: string | null): ColorScheme {
  if (!value) {
    return 'obsidian-gold'
  }

  if (value in colorSchemes) {
    return value as ColorScheme
  }

  return legacySchemeMap[value] || 'obsidian-gold'
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [scheme, setScheme] = useState<ColorScheme>(() => {
    if (typeof window !== 'undefined') {
      return normalizeScheme(localStorage.getItem('colorScheme'))
    }
    return 'obsidian-gold'
  })

  useEffect(() => {
    const mode = colorSchemes[scheme].mode
    document.documentElement.dataset.scheme = scheme
    document.documentElement.dataset.themeMode = mode
    document.documentElement.classList.remove(
      ...(Object.keys(colorSchemes) as ColorScheme[]),
      'dark',
      'light'
    )
    document.documentElement.classList.add(scheme, mode)
    localStorage.setItem('colorScheme', scheme)
  }, [scheme])

  return (
    <ThemeContext.Provider value={{ scheme, setScheme, mode: colorSchemes[scheme].mode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
