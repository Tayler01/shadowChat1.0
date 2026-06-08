import { renderHook, act } from '@testing-library/react';
import { ThemeProvider, colorSchemes, useTheme } from '../src/hooks/useTheme';

beforeEach(() => {
  document.documentElement.className = '';
  document.documentElement.dataset.scheme = '';
  localStorage.clear();
});

test('defaults to original scheme', () => {
  const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
  expect(result.current.scheme).toBe('original');
  expect(document.documentElement.classList.contains('original')).toBe(true);
});

test('lists original first and uses backdrop previews for art themes', () => {
  expect(Object.keys(colorSchemes)[0]).toBe('original');
  expect(colorSchemes.original.label).toBe('Original');
  expect(colorSchemes['obsidian-gold'].label).toBe('Obsidian Gold');
  expect(colorSchemes['mint-fizz'].preview).toBe(colorSchemes['mint-fizz'].backdrop);
  expect(colorSchemes['silver-halo'].preview).toBe(colorSchemes['silver-halo'].backdrop);
});

test('changing scheme updates document.classList', () => {
  const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

  act(() => {
    result.current.setScheme('aurora-veil');
  });

  expect(document.documentElement.classList.contains('aurora-veil')).toBe(true);
  expect(document.documentElement.classList.contains('original')).toBe(false);
});

test('supports additional color schemes', () => {
  const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

  act(() => {
    result.current.setScheme('neon-circuit');
  });

  expect(document.documentElement.classList.contains('neon-circuit')).toBe(true);
});

test('supports the obsidian gold theme separately from original', () => {
  const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

  act(() => {
    result.current.setScheme('obsidian-gold');
  });

  expect(result.current.scheme).toBe('obsidian-gold');
  expect(document.documentElement.dataset.scheme).toBe('obsidian-gold');
  expect(document.documentElement.classList.contains('obsidian-gold')).toBe(true);
  expect(document.documentElement.classList.contains('original')).toBe(false);
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

test('supports the blush bloom theme', () => {
  const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

  act(() => {
    result.current.setScheme('blush-bloom');
  });

  expect(result.current.scheme).toBe('blush-bloom');
  expect(result.current.mode).toBe('light');
  expect(document.documentElement.dataset.scheme).toBe('blush-bloom');
  expect(document.documentElement.dataset.themeMode).toBe('light');
  expect(document.documentElement.classList.contains('blush-bloom')).toBe(true);
});

test('supports the mint fizz theme', () => {
  const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

  act(() => {
    result.current.setScheme('mint-fizz');
  });

  expect(result.current.scheme).toBe('mint-fizz');
  expect(result.current.mode).toBe('light');
  expect(document.documentElement.dataset.scheme).toBe('mint-fizz');
  expect(document.documentElement.dataset.themeMode).toBe('light');
  expect(document.documentElement.classList.contains('mint-fizz')).toBe(true);
});

test('supports the silver halo theme', () => {
  const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

  act(() => {
    result.current.setScheme('silver-halo');
  });

  expect(result.current.scheme).toBe('silver-halo');
  expect(result.current.mode).toBe('dark');
  expect(document.documentElement.dataset.scheme).toBe('silver-halo');
  expect(document.documentElement.dataset.themeMode).toBe('dark');
  expect(document.documentElement.classList.contains('silver-halo')).toBe(true);
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
