export const getHypeTier = (count = 0) => {
  if (count >= 5) return 3
  if (count >= 3) return 2
  if (count > 0) return 1
  return 0
}
