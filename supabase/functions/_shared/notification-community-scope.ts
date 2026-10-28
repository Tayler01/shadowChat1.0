export type CommunityScopeInstallation = {
  user_id?: string
  installation_key?: string
  build_number?: string | null
  community_scope_version?: number | null
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// All values come from server configuration/canonical claim/authorized DB row.
// Caller data and envelope payloads are deliberately not accepted as scope.
export const buildNotificationCommunityScope = (
  installation: CommunityScopeInstallation,
  recipientUserId: string | undefined,
  projectUrl: string,
) => {
  if (installation.community_scope_version == null) return null
  if (installation.community_scope_version !== 1 ||
    typeof installation.build_number !== 'string' ||
    !/^[1-9][0-9]{0,8}$/.test(installation.build_number) ||
    Number(installation.build_number) < 22) {
    throw new Error('Unsupported notification community scope capability')
  }
  if (!recipientUserId || !uuid.test(recipientUserId) ||
    installation.user_id !== recipientUserId ||
    !installation.installation_key || !uuid.test(installation.installation_key)) {
    throw new Error('Notification community scope recipient is not bound')
  }
  const url = new URL(projectUrl)
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
    url.search || url.hash || url.pathname !== '/' ||
    !/^[a-z]{20}\.supabase\.co$/.test(url.hostname)) {
    throw new Error('Notification community scope project is not configured')
  }
  return {
    version: 1 as const,
    projectRef: url.hostname.split('.')[0],
    userId: recipientUserId,
    installationKey: installation.installation_key,
  }
}
