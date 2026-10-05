import { fireEvent, render, screen } from '@testing-library/react'
import { ShadowCheckersExperience } from '../src/features/games/shadow-checkers/ShadowCheckersExperience'

jest.mock('../src/features/games/shared/useLandscapeGate', () => ({ useLandscapeGate: () => false }))
jest.mock('../src/features/games/shadow-checkers/ShadowCheckersScreen', () => ({
  ShadowCheckersScreen: ({ initialMatchId, onExit }: { initialMatchId?: string; onExit?: () => void }) => (
    <section aria-label="mock multiplayer"><span>Multiplayer {initialMatchId ?? 'lobby'}</span><button type="button" onClick={onExit}>Leave multiplayer</button></section>
  ),
}))
jest.mock('../src/features/games/shadow-checkers/ShadowCheckersSoloScreen', () => ({
  ShadowCheckersSoloScreen: ({ difficulty, onLeaveMode }: { difficulty: string; onLeaveMode: () => void }) => (
    <section aria-label="mock solo"><span>Solo {difficulty}</span><button type="button" onClick={onLeaveMode}>Leave solo</button></section>
  ),
}))

describe('Shadow Checkers mode selection', () => {
  test('offers solo and multiplayer without mounting either game early', () => {
    render(<ShadowCheckersExperience />)
    expect(screen.getByRole('button', { name: /play computer/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /play a person/i })).toBeInTheDocument()
    expect(screen.queryByLabelText('mock solo')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('mock multiplayer')).not.toBeInTheDocument()
  })

  test('selects one of four difficulties and returns to mode selection', () => {
    render(<ShadowCheckersExperience />)
    fireEvent.click(screen.getByRole('button', { name: /play computer/i }))
    const levels = screen.getAllByRole('radio')
    expect(levels).toHaveLength(4)
    fireEvent.click(screen.getByRole('radio', { name: /master/i }))
    fireEvent.click(screen.getByRole('button', { name: /enter the study/i }))
    expect(screen.getByText('Solo master')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /leave solo/i }))
    expect(screen.getByRole('button', { name: /play computer/i })).toBeInTheDocument()
  })

  test('opens multiplayer on demand and deep links bypass the chooser', async () => {
    const view = render(<ShadowCheckersExperience />)
    fireEvent.click(screen.getByRole('button', { name: /play a person/i }))
    expect(await screen.findByText('Multiplayer lobby')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /leave multiplayer/i }))
    expect(screen.getByRole('button', { name: /play a person/i })).toBeInTheDocument()

    view.rerender(<ShadowCheckersExperience initialMatchId="match-42" />)
    expect(await screen.findByText('Multiplayer match-42')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /play computer/i })).not.toBeInTheDocument()
  })
})
