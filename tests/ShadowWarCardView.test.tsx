import React from 'react'
import { render, screen } from '@testing-library/react'
import { ShadowWarCardView } from '../src/features/games/shadow-war/components/ShadowWarCardView'
import { createCardInstance } from '../src/features/games/shadow-war/engine/cards'
import { SHADOW_WAR_ASSETS } from '../src/features/games/shadow-war/assets/manifest'

describe('ShadowWarCardView', () => {
  it('renders optimized generated card art for visible units', () => {
    const card = createCardInstance('scout', 1, 'player-one', 1)

    render(<ShadowWarCardView card={card} />)

    const images = screen.getAllByRole('img', { hidden: true })
    expect(images.some(image => image.getAttribute('src') === '/games/shadow-war/cards/scout.webp')).toBe(true)
    expect(screen.getByText('Scout')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Scout strength 1' })).toBeInTheDocument()
  })

  it('renders the generated card back for hidden opponent cards', () => {
    render(<ShadowWarCardView hidden />)

    const images = screen.getAllByRole('img', { hidden: true })
    expect(images.some(image => image.getAttribute('src') === SHADOW_WAR_ASSETS.cardBack)).toBe(true)
    expect(screen.getByText('Hidden')).toBeInTheDocument()
  })
})
