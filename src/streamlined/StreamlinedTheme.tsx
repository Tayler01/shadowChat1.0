/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react'

// The separate origin uses one lightweight appearance. Do not overwrite the
// member's full-app theme preference or load its backdrop assets.
const theme = { scheme: 'original' as const, mode: 'dark' as const, setScheme: () => {} }
export function ThemeProvider({ children }: { children: ReactNode }) { return children }
export function useTheme() { return theme }
