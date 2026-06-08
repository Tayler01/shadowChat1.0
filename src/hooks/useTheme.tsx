/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState } from 'react'

export type ColorScheme =
  | 'original'
  | 'obsidian-gold'
  | 'aurora-veil'
  | 'ember-slate'
  | 'neon-circuit'
  | 'moonstone-light'
  | 'blush-bloom'
  | 'mint-fizz'
  | 'silver-halo'

export type ThemeMode = 'dark' | 'light'

interface ThemeContextValue {
  scheme: ColorScheme
  setScheme: (scheme: ColorScheme) => void
  mode: ThemeMode
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export const colorSchemes: Record<
  ColorScheme,
  {
    label: string
    description: string
    start: string
    end: string
    accent: string
    mode: ThemeMode
    preview: string
    backdrop: string
    texture: string
  }
> = {
  original: {
    label: 'Original',
    description: 'The classic black-and-gold ShadowChat surface.',
    start: '#0c0d0e',
    end: '#080909',
    accent: '#d7aa46',
    mode: 'dark',
    preview: '',
    backdrop: '',
    texture: '',
  },
  'obsidian-gold': {
    label: 'Obsidian Gold',
    description: 'Black glass, liquid metal, and gold backdrop art.',
    start: '#fff0b8',
    end: '#9a7421',
    accent: '#d7aa46',
    mode: 'dark',
    preview: '/themes/obsidian-gold/backdrop.webp',
    backdrop: '/themes/obsidian-gold/backdrop.webp',
    texture: '/themes/obsidian-gold/texture.webp',
  },
  'aurora-veil': {
    label: 'Aurora Veil',
    description: 'Charcoal glass with teal, violet, and blue aurora light.',
    start: '#5de3df',
    end: '#8e5cff',
    accent: '#58d7d5',
    mode: 'dark',
    preview: '/themes/aurora-veil/preview.webp',
    backdrop: '/themes/aurora-veil/backdrop.webp',
    texture: '/themes/aurora-veil/texture.webp',
  },
  'ember-slate': {
    label: 'Ember Slate',
    description: 'Smoky slate, copper heat, and warm ember edges.',
    start: '#ffb36b',
    end: '#6f2918',
    accent: '#df7a3a',
    mode: 'dark',
    preview: '/themes/ember-slate/preview.webp',
    backdrop: '/themes/ember-slate/backdrop.webp',
    texture: '/themes/ember-slate/texture.webp',
  },
  'neon-circuit': {
    label: 'Neon Circuit',
    description: 'Dark acrylic, cyan circuitry, and magenta edge glow.',
    start: '#25e8ff',
    end: '#ff4fd8',
    accent: '#22d8ff',
    mode: 'dark',
    preview: '/themes/neon-circuit/preview.webp',
    backdrop: '/themes/neon-circuit/backdrop.webp',
    texture: '/themes/neon-circuit/texture.webp',
  },
  'moonstone-light': {
    label: 'Moonstone Light',
    description: 'Pearlescent daylight surfaces with soft blue prism accents.',
    start: '#fafdff',
    end: '#b9d8f3',
    accent: '#5c82c8',
    mode: 'light',
    preview: '/themes/moonstone-light/preview.webp',
    backdrop: '/themes/moonstone-light/backdrop.webp',
    texture: '/themes/moonstone-light/texture.webp',
  },
  'blush-bloom': {
    label: 'Blush Bloom',
    description: 'Pearl blush glass with berry, lavender, peach, and mint shimmer.',
    start: '#fff7fb',
    end: '#ff9fc4',
    accent: '#dd4e85',
    mode: 'light',
    preview: '/themes/blush-bloom/preview.webp',
    backdrop: '/themes/blush-bloom/backdrop.webp',
    texture: '/themes/blush-bloom/texture.webp',
  },
  'mint-fizz': {
    label: 'Mint Fizz',
    description: 'Fresh mint glass with aqua shine, soft lime, and bubbly pearl light.',
    start: '#f6fff9',
    end: '#8ce9ce',
    accent: '#2fbf9b',
    mode: 'light',
    preview: '/themes/mint-fizz/backdrop.webp',
    backdrop: '/themes/mint-fizz/backdrop.webp',
    texture: '/themes/mint-fizz/texture.webp',
  },
  'silver-halo': {
    label: 'Silver Halo',
    description: 'Graphite glass with chrome ribbons, silver glow, and cool blue shine.',
    start: '#f4f8fb',
    end: '#596676',
    accent: '#c8d2dd',
    mode: 'dark',
    preview: '/themes/silver-halo/backdrop.webp',
    backdrop: '/themes/silver-halo/backdrop.webp',
    texture: '/themes/silver-halo/texture.webp',
  },
}

const legacySchemeMap: Record<string, ColorScheme> = {
  indigo: 'original',
  teal: 'aurora-veil',
  rose: 'ember-slate',
  violet: 'aurora-veil',
  orange: 'ember-slate',
  contrast: 'moonstone-light',
  'obsidian-champagne': 'original',
  'graphite-amber': 'ember-slate',
  'carbon-ivory': 'neon-circuit',
}

function normalizeScheme(value: string | null): ColorScheme {
  if (!value) {
    return 'original'
  }

  if (value in colorSchemes) {
    return value as ColorScheme
  }

  return legacySchemeMap[value] || 'original'
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [scheme, setScheme] = useState<ColorScheme>(() => {
    if (typeof window !== 'undefined') {
      return normalizeScheme(localStorage.getItem('colorScheme'))
    }
    return 'original'
  })

  useEffect(() => {
    const mode = colorSchemes[scheme].mode
    document.documentElement.dataset.scheme = scheme
    document.documentElement.dataset.themeMode = mode
    document.documentElement.classList.remove(
      ...(Object.keys(colorSchemes) as ColorScheme[]),
      'obsidian-champagne',
      'graphite-amber',
      'carbon-ivory',
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
