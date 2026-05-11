import { renderHook, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../src/hooks/useTheme';

beforeEach(() => {
  document.documentElement.className = '';
  document.documentElement.dataset.scheme = '';
  localStorage.clear();
});

test('defaults to obsidian-gold scheme', () => {
  const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
  expect(result.current.scheme).toBe('obsidian-gold');
  expect(document.documentElement.classList.contains('obsidian-gold')).toBe(true);
});

test('changing scheme updates document.classList', () => {
  const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

  act(() => {
    result.current.setScheme('aurora-veil');
  });

  expect(document.documentElement.classList.contains('aurora-veil')).toBe(true);
  expect(document.documentElement.classList.contains('obsidian-gold')).toBe(false);
});

test('supports additional color schemes', () => {
  const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

  act(() => {
    result.current.setScheme('neon-circuit');
  });

  expect(document.documentElement.classList.contains('neon-circuit')).toBe(true);
});

test('supports a light theme mode', () => {
  const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

  act(() => {
    result.current.setScheme('moonstone-light');
  });

  expect(result.current.mode).toBe('light');
  expect(document.documentElement.dataset.themeMode).toBe('light');
  expect(document.documentElement.classList.contains('moonstone-light')).toBe(true);
  expect(document.documentElement.classList.contains('light')).toBe(true);
  expect(document.documentElement.classList.contains('dark')).toBe(false);
});

test('dark themes publish dark mode metadata', () => {
  const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

  expect(result.current.mode).toBe('dark');
  expect(document.documentElement.dataset.themeMode).toBe('dark');
  expect(document.documentElement.classList.contains('dark')).toBe(true);
});

test('maps legacy saved schemes to the new palette', () => {
  localStorage.setItem('colorScheme', 'teal');

  const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

  expect(result.current.scheme).toBe('aurora-veil');
  expect(document.documentElement.classList.contains('aurora-veil')).toBe(true);
});

test('maps retired material scheme ids to unique themes', () => {
  localStorage.setItem('colorScheme', 'carbon-ivory');

  const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

  expect(result.current.scheme).toBe('neon-circuit');
  expect(document.documentElement.classList.contains('carbon-ivory')).toBe(false);
  expect(document.documentElement.classList.contains('neon-circuit')).toBe(true);
});
