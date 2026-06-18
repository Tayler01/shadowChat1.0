import { rankShadowPinCategories, scoreShadowPinCategoryTitle } from '../src/features/shadow-pin/categorySearch'

const categories = [
  { id: 'nature', title: 'Nature' },
  { id: 'family', title: 'Family and Friends' },
  { id: 'food', title: 'Food Ideas' },
  { id: 'fitness', title: 'Fitness Progress' },
  { id: 'gaming', title: 'Gaming Setups' },
]

test('ShadowPin category search ranks token prefixes without using descriptions', () => {
  expect(rankShadowPinCategories('n', categories).map(category => category.id)[0]).toBe('nature')
  expect(rankShadowPinCategories('fa', categories).map(category => category.id)[0]).toBe('family')
  expect(rankShadowPinCategories('fr', categories).map(category => category.id)[0]).toBe('family')
})

test('ShadowPin category search prefers word starts over fuzzy matches', () => {
  const fuzzyScore = scoreShadowPinCategoryTitle('ft', 'Fitness Progress')
  const prefixScore = scoreShadowPinCategoryTitle('fi', 'Fitness Progress')

  expect(prefixScore).toBeLessThan(fuzzyScore)
  expect(rankShadowPinCategories('fi', categories).map(category => category.id)[0]).toBe('fitness')
})

test('ShadowPin category search returns no results for blank searches', () => {
  expect(rankShadowPinCategories('   ', categories)).toEqual([])
})
