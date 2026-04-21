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
    result.current.setScheme('obsidian-champagne');
  });

  expect(document.documentElement.classList.contains('obsidian-champagne')).toBe(true);
  expect(document.documentElement.classList.contains('obsidian-gold')).toBe(false);
});

test('supports additional color schemes', () => {
  const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

  act(() => {
    result.current.setScheme('carbon-ivory');
  });

  expect(document.documentElement.classList.contains('carbon-ivory')).toBe(true);
});

test('maps legacy saved schemes to the new palette', () => {
  localStorage.setItem('colorScheme', 'teal');

  const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

  expect(result.current.scheme).toBe('obsidian-champagne');
  expect(document.documentElement.classList.contains('obsidian-champagne')).toBe(true);
});
