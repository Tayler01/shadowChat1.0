import { render, screen } from '@testing-library/react'
import React from 'react'
import { UserAchievementBadges } from '../src/components/ui/UserAchievementBadges'
import { shouldShowLegacyAchievementBadges } from '../src/lib/achievementBadges'

test('renders rotating medals and the permanent gold egg for a regular user', () => {
  render(
    <div>
      <UserAchievementBadges
        user={{
          admin_role: null,
          checkers_crown: true,
          war_sword: true,
          shadow_pin_gold_pin: true,
          gold_easter_egg: true,
        }}
      />
    </div>
  )

  expect(screen.getByLabelText('Shadow Checkers champion')).toBeInTheDocument()
  expect(screen.getByLabelText('Shadow War champion')).toBeInTheDocument()
  expect(screen.getByLabelText('Shadow Pin top scorer')).toBeInTheDocument()
  expect(screen.getByLabelText('Golden egg found')).toBeInTheDocument()
})

test('hides rotating medals for the primary admin but keeps the permanent gold egg', () => {
  render(
    <div>
      <UserAchievementBadges
        user={{
          admin_role: 'admin',
          checkers_crown: true,
          war_sword: true,
          shadow_pin_gold_pin: true,
          gold_easter_egg: true,
        }}
      />
    </div>
  )

  expect(screen.queryByLabelText('Shadow Checkers champion')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Shadow War champion')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Shadow Pin top scorer')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Golden egg found')).toBeInTheDocument()
})

test('keeps legacy medals available for sub-admin users', () => {
  expect(shouldShowLegacyAchievementBadges({ admin_role: 'sub_admin' })).toBe(true)
  expect(shouldShowLegacyAchievementBadges({ admin_role: 'admin' })).toBe(false)
})
