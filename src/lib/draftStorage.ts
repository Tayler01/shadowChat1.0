/** Legacy drafts have no owner; keep them untouched when an account is known. */
export const getDraftStorageKey = (key: string, identityKey?: string | null) => identityKey === null
  ? null
  : identityKey
    ? `draft-account:${identityKey}:${key}`
    : `draft-${key}`

export const getAccountDMDraftPrefix = (identityKey: string) => `draft-account:${identityKey}:dm-`
