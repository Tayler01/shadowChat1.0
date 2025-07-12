import { renderHook, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../src/hooks/useTheme';

beforeEach(() => {
  document.documentElement.className = '';
  document.documentElement.dataset.scheme = '';
  localStorage.clear();
});

test('defaults to indigo scheme', () => {
  const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
  expect(result.current.scheme).toBe('indigo');
  expect(document.documentElement.classList.contains('indigo')).toBe(true);
});

test('changing scheme updates document.classList', () => {
  const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

  act(() => {
    result.current.setScheme('teal');
  });

  expect(document.documentElement.classList.contains('teal')).toBe(true);
  expect(document.documentElement.classList.contains('indigo')).toBe(false);
});

test('supports additional color schemes', () => {
  const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

  act(() => {
    result.current.setScheme('violet');
  });

  expect(document.documentElement.classList.contains('violet')).toBe(true);
});
