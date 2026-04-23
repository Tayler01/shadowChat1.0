import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import ErrorBoundary from '../src/components/ErrorBoundary';

test('displays fallback when child throws', () => {
  const Bomb = () => {
    throw new Error('Boom');
  };
  jest.spyOn(console, 'error').mockImplementation(() => {});

  render(
    <ErrorBoundary>
      <Bomb />
    </ErrorBoundary>
  );

  expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  (console.error as jest.Mock).mockRestore();
});

test('renders children after retry', () => {
  const Bomb = ({ shouldThrow }: { shouldThrow: boolean }) => {
    if (shouldThrow) throw new Error('Boom');
    return <div>Child</div>;
  };
  jest.spyOn(console, 'error').mockImplementation(() => {});

  const { rerender } = render(
    <ErrorBoundary>
      <Bomb shouldThrow={true} />
    </ErrorBoundary>
  );

  expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();

  rerender(
    <ErrorBoundary>
      <Bomb shouldThrow={false} />
    </ErrorBoundary>
  );

  fireEvent.click(screen.getByRole('button', { name: /try again/i }));
  expect(screen.getByText('Child')).toBeInTheDocument();
  (console.error as jest.Mock).mockRestore();
});
