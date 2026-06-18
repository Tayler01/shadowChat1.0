import type { ShadowPinCategory } from './types'

type SearchableCategory = Pick<ShadowPinCategory, 'id' | 'title'>

const normalizeSearchText = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const tokenizeTitle = (title: string) =>
  normalizeSearchText(title)
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)

const fuzzySubsequenceScore = (query: string, token: string) => {
  let queryIndex = 0
  let penalty = 0

  for (let tokenIndex = 0; tokenIndex < token.length && queryIndex < query.length; tokenIndex += 1) {
    if (token[tokenIndex] === query[queryIndex]) {
      penalty += tokenIndex
      queryIndex += 1
    }
  }

  return queryIndex === query.length ? 120 + penalty + token.length / 100 : Infinity
}

export function scoreShadowPinCategoryTitle(query: string, title: string) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return Infinity

  const normalizedTitle = normalizeSearchText(title)
  const tokens = tokenizeTitle(title)
  let score = Infinity

  if (normalizedTitle === normalizedQuery) score = Math.min(score, 0)
  if (normalizedTitle.startsWith(normalizedQuery)) score = Math.min(score, 10 + normalizedTitle.length / 100)
  if (normalizedTitle.includes(normalizedQuery)) score = Math.min(score, 80 + normalizedTitle.indexOf(normalizedQuery) / 10)

  tokens.forEach((token, index) => {
    if (token === normalizedQuery) score = Math.min(score, 20 + index)
    if (token.startsWith(normalizedQuery)) score = Math.min(score, 30 + index * 2 + token.length / 100)
    if (token.includes(normalizedQuery)) score = Math.min(score, 70 + index * 2 + token.indexOf(normalizedQuery) / 10)
    score = Math.min(score, fuzzySubsequenceScore(normalizedQuery, token) + index * 2)
  })

  return score
}

export function rankShadowPinCategories<TCategory extends SearchableCategory>(
  query: string,
  categories: TCategory[],
  limit = 5
) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return []

  return categories
    .map((category, index) => ({
      category,
      index,
      score: scoreShadowPinCategoryTitle(normalizedQuery, category.title),
    }))
    .filter(result => Number.isFinite(result.score))
    .sort((a, b) => a.score - b.score || a.category.title.localeCompare(b.category.title) || a.index - b.index)
    .slice(0, limit)
    .map(result => result.category)
}
