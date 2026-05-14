export const SHADOW_WAR_CARD_MATCHUP_NOTES: Record<string, string> = {
  scout: 'Best when you are willing to lose a lane now for an extra draw next round.',
  spy: 'Hunt Champion, Warlord, and Sovereign. Spy is weak into mid-strength cards.',
  squire: 'Put Squire beside a weaker lane that needs one more point to steal a result.',
  archer: 'Archer is strongest when the lane to the right, or Center from Right, needs pressure.',
  shieldbearer: 'Use Shieldbearer to turn close losses into contested lanes and protect a 2-lane plan.',
  knight: 'Knight is your clean dependable play. It has no trick, so it can be outmaneuvered.',
  captain: 'Captain rewards balanced formations by boosting the weakest lane.',
  champion: 'Champion punches up into stronger cards but does not gain value against weaker cards.',
  warlord: 'Warlord can snowball an adjacent lane after winning, but Spy and sacrifice lanes can blunt it.',
  sovereign: 'Sovereign wins raw strength fights, but committing it into Spy can lose the whole lane plan.',
}

export const SHADOW_WAR_CARD_WEAKNESS_NOTES: Record<string, string> = {
  scout: 'Almost any card beats Scout directly. Its value comes from the next-round draw.',
  spy: 'Spy loses most raw-strength lanes unless it catches a rank 8-10 enemy.',
  squire: 'Squire needs useful neighbors. Isolated Squire lanes are easy to overpower.',
  archer: 'Archer can waste its volley if the target lane is already lost by too much.',
  shieldbearer: 'Shieldbearer only saves narrow losses. Big power gaps still break through.',
  knight: 'Knight has no ability, so buffed lower cards can pass it.',
  captain: 'Captain can be inefficient if all lanes are already strong or if the weakest lane is sacrificed.',
  champion: 'Champion loses its bonus against equal or weaker cards and still fears Spy setups.',
  warlord: 'Warlord is expensive to commit and can be countered by Spy or by losing the other two lanes.',
  sovereign: 'Sovereign is the biggest commitment and is especially vulnerable to Spy sabotage.',
}

export const getShadowWarCardTip = (cardId: string) =>
  SHADOW_WAR_CARD_MATCHUP_NOTES[cardId] ?? 'Place this card where its strength changes the 2-of-3 lane math.'

export const getShadowWarCardWeakness = (cardId: string) =>
  SHADOW_WAR_CARD_WEAKNESS_NOTES[cardId] ?? 'Watch for counter-placement and adjacent-lane buffs.'
