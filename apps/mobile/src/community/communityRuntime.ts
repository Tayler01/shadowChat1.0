/** Pure native community boundary. No client, credentials, storage or network is created at import time. */
export type CommunityId = 'member' | 'demo';
export type CommunityDefinition = Readonly<{
  id: CommunityId;
  label: string;
  origin: string;
  projectRef: string;
  supabaseUrl: string;
  publicKey: string;
  storageNamespace: string;
}>;
export type CommunityRegistry = Readonly<{
  member: CommunityDefinition;
  demo: CommunityDefinition | null;
}>;
type RawDefinition = {
  origin?: unknown;
  projectRef?: unknown;
  supabaseUrl?: unknown;
  publicKey?: unknown;
};
export type CommunityContext = Readonly<{ community: CommunityDefinition; generation: number }>;
export type WebSession = { accessToken: string; refreshToken: string; userId: string };
export type SessionAdapter = {
  // MUST use a client permanently bound to context.community, with refresh disabled.
  // getUser verifies the signature/expiry with the selected Auth server; local issuer checks are not authentication.
  getUser(accessToken: string): Promise<{ id: string }>;
  setSession(session: WebSession): Promise<{ id: string }>;
  // Discard THIS helper client's memory/listeners; never revoke the WebView-owned refresh chain.
  // If SDK signOut performs a remote logout, dispose/recreate the helper client instead.
  clearSession(reason?: 'signout' | 'stale' | 'failed'): Promise<void>;
};
export type CommunityTeardown = {
  // Abort/drain existing commands without aborting the independently scoped revocation request.
  abortAndDrainCommands(context: CommunityContext): Promise<void>;
  // Return only after absence/revocation is confirmed; do not swallow transport failures.
  revokeInstallation(context: CommunityContext): Promise<void>;
  clearPresentedNotifications(context: CommunityContext): Promise<void>;
  clearClientSession(context: CommunityContext): Promise<void>;
  unmountAndDispose(context: CommunityContext): Promise<void>;
  persistSelection?(id: CommunityId): Promise<void>;
};
const REF = /^[a-z]{20}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORBIDDEN_DEMO_REFS = new Set([
  'shsqqouecvdoifzufkqm',
  'udvmevvbgbxnciburfjh',
  'kvznsjytzoiyaekicbbp',
]);
const FORBIDDEN_DEMO_ORIGINS = new Set([
  'https://shadochat.online',
  'https://www.shadochat.online',
  'https://shadowchat-streamlined.netlify.app',
]);
function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const decodeClaims = (token: string): Record<string, unknown> => {
  ensure(
    typeof token === 'string' &&
      token.length <= 32_768 &&
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token),
    'Invalid session token.'
  );
  const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  try {
    const value: unknown = JSON.parse(atob(payload + '='.repeat((4 - (payload.length % 4)) % 4)));
    ensure(value && typeof value === 'object' && !Array.isArray(value), 'Invalid token claims.');
    return value as Record<string, unknown>;
  } catch {
    throw new Error('Invalid session token.');
  }
};
const parseOrigin = (raw: unknown) => {
  ensure(typeof raw === 'string', 'Missing community origin.');
  const url = new URL(raw);
  ensure(
    url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash,
    'Community requires an HTTPS origin.'
  );
  ensure(
    url.hostname !== 'localhost' &&
      !url.hostname.endsWith('.localhost') &&
      url.hostname.includes('.') &&
      !url.hostname.includes(':') &&
      !/^\d+(?:\.\d+){3}$/.test(url.hostname),
    'Invalid community host.'
  );
  return url.origin;
};

function definition(id: CommunityId, raw: RawDefinition): CommunityDefinition {
  const origin = parseOrigin(raw.origin);
  ensure(
    typeof raw.projectRef === 'string' && REF.test(raw.projectRef),
    'Invalid community project.'
  );
  ensure(
    raw.supabaseUrl === `https://${raw.projectRef}.supabase.co`,
    'Community backend does not match its project.'
  );
  ensure(
    typeof raw.publicKey === 'string' && raw.publicKey.length <= 4096,
    'Missing public client key.'
  );
  const publicKey = raw.publicKey;
  if (/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(publicKey)) {
    // Opaque publishable keys are bound by authoritative project configuration, never by token decoding.
  } else {
    const claims = decodeClaims(publicKey);
    ensure(
      claims.role === 'anon' && claims.ref === raw.projectRef,
      'Client key is not this project public key.'
    );
  }
  if (id === 'demo') {
    ensure(
      !FORBIDDEN_DEMO_REFS.has(raw.projectRef) && !FORBIDDEN_DEMO_ORIGINS.has(origin),
      'An existing community cannot be reused as the demo.'
    );
  }
  return Object.freeze({
    id,
    label: id === 'demo' ? 'Demo community' : 'Community',
    origin,
    projectRef: raw.projectRef,
    supabaseUrl: raw.supabaseUrl as string,
    publicKey,
    storageNamespace: `shadowchat-community-v1.${raw.projectRef}`,
  });
}

export function resolveCommunityRegistry(options: {
  member: RawDefinition;
  demoEnabled?: unknown;
  demo?: RawDefinition | null;
}): CommunityRegistry {
  const member = definition('member', options.member);
  let demo: CommunityDefinition | null = null;
  // Missing/partial/invalid demo configuration can never fall back to member data.
  if (options.demoEnabled === true && options.demo) {
    try {
      const candidate = definition('demo', options.demo);
      ensure(
        candidate.projectRef !== member.projectRef && candidate.origin !== member.origin,
        'Demo must be separate.'
      );
      demo = candidate;
    } catch {
      demo = null;
    }
  }
  return Object.freeze({ member, demo });
}

export const communityStorageKeys = (community: CommunityDefinition) =>
  Object.freeze({
    installation: `${community.storageNamespace}.installation`,
    credential: `${community.storageNamespace}.credential`,
    optOut: `${community.storageNamespace}.opt-out`,
    // Contains only enum member/demo; never a token, key, origin or password.
    selection: 'shadowchat-community-selection-v1',
  });

export const restoreCommunitySelection = (
  registry: CommunityRegistry,
  stored: unknown
): CommunityId | null =>
  stored === 'member' ? 'member' : stored === 'demo' && registry.demo ? 'demo' : null;

export function createCommunityRuntime(registry: CommunityRegistry) {
  let active: CommunityContext | null = null;
  let generation = 0;
  let userId: string | null = null;
  let phase: 'unselected' | 'active' | 'switching' | 'blocked' = 'unselected';
  let pendingTarget: CommunityId | null = null;
  let authRevision = 0;
  let authQueue: Promise<unknown> = Promise.resolve();
  let transition: Promise<CommunityContext> | null = null;
  const pick = (id: CommunityId) => {
    ensure(id === 'member' || id === 'demo', 'Unknown community.');
    const result = id === 'member' ? registry.member : registry.demo;
    ensure(result, 'The demo community is currently unavailable.');
    return result;
  };
  const current = (context: CommunityContext) =>
    phase === 'active' && active === context && context.generation === generation;
  const select = (id: CommunityId) => {
    ensure(phase === 'unselected' && !active, 'Community is already selected.');
    active = Object.freeze({ community: pick(id), generation: ++generation });
    phase = 'active';
    return active;
  };
  const acceptsBridge = (context: CommunityContext, eventUrl: string) => {
    if (!current(context)) return false;
    try {
      const url = new URL(eventUrl);
      return !url.username && !url.password && url.origin === context.community.origin;
    } catch {
      return false;
    }
  };
  const runSession = (
    context: CommunityContext,
    eventUrl: string,
    session: WebSession | null,
    adapter: SessionAdapter,
    now = Date.now()
  ) => {
    if (!acceptsBridge(context, eventUrl)) return Promise.resolve(false);
    const revision = ++authRevision;
    const eligible = () => acceptsBridge(context, eventUrl) && authRevision === revision;
    let committing = false;
    const task = authQueue
      .catch(() => undefined)
      .then(async () => {
        if (!eligible()) return false;
        if (!session) {
          await adapter.clearSession('signout');
          if (!eligible()) return false;
          userId = null;
          return true;
        }
        ensure(
          UUID.test(session.userId) &&
            typeof session.refreshToken === 'string' &&
            // Refresh tokens are opaque; valid Supabase tokens can be 12 characters.
            // Authentication still requires the scoped access-token checks and getUser below.
            session.refreshToken.length > 0 &&
            session.refreshToken.length <= 4096,
          'Invalid account session.'
        );
        const claims = decodeClaims(session.accessToken);
        // Do this BEFORE any refresh token can reach an Auth endpoint.
        ensure(
          claims.iss === `${context.community.supabaseUrl}/auth/v1` &&
            claims.sub === session.userId &&
            claims.role === 'authenticated' &&
            typeof claims.exp === 'number' &&
            claims.exp > Math.floor(now / 1000),
          'Session belongs to another community or has expired.'
        );
        const verified = await adapter.getUser(session.accessToken);
        ensure(verified.id === session.userId, 'The authenticated account did not match.');
        if (!eligible()) return false;
        committing = true;
        const committed = await adapter.setSession(session);
        // Same-generation auth requests serialize; switching never mounts its next client until this finishes.
        if (!eligible()) {
          await adapter.clearSession('stale');
          return false;
        }
        ensure(committed.id === session.userId, 'The native account did not match.');
        userId = committed.id;
        return true;
      })
      .catch(async () => {
        if (active === context || committing) {
          try {
            await adapter.clearSession('failed');
          } catch {
            if (active === context && phase === 'active') {
              phase = 'blocked';
              pendingTarget = context.community.id;
              ++generation;
              ++authRevision;
            }
          }
          if (active === context) userId = null;
        }
        throw new Error('The account could not be verified for this community.');
      });
    authQueue = task;
    return task;
  };
  const switchCommunity = (
    id: CommunityId,
    teardown: CommunityTeardown
  ): Promise<CommunityContext> => {
    const next = pick(id);
    if (transition) {
      ensure(pendingTarget === id, 'A community switch is already pending.');
      return transition;
    }
    ensure(active && (phase === 'active' || phase === 'blocked'), 'Choose a community first.');
    ensure(userId === null, 'Sign out before changing community.');
    if (phase === 'active' && active.community.id === id) return Promise.resolve(active);
    if (phase === 'blocked')
      ensure(
        pendingTarget === id,
        'Retry the incomplete switch before selecting another community.'
      );
    const previous = active;
    pendingTarget = id;
    phase = 'switching';
    ++generation;
    ++authRevision;
    // Invalidate all captured bridge/notification work immediately, even before the first await.
    const work = (async () => {
      try {
        await teardown.abortAndDrainCommands(previous);
        await authQueue.catch(() => undefined);
        await teardown.revokeInstallation(previous);
        await teardown.clearPresentedNotifications(previous);
        await teardown.clearClientSession(previous);
        await teardown.unmountAndDispose(previous);
        await teardown.persistSelection?.(id);
        active = Object.freeze({ community: next, generation });
        userId = null;
        pendingTarget = null;
        phase = 'active';
        return active;
      } catch {
        phase = 'blocked';
        // Never expose provider errors, credentials or arbitrary response bodies in UI.
        throw new Error('The community switch could not finish. Retry before continuing.');
      } finally {
        transition = null;
      }
    })();
    transition = work;
    return work;
  };
  const acceptsNotification = (
    context: CommunityContext,
    scope: unknown,
    installationId: string | null
  ) => {
    if (
      !current(context) ||
      !userId ||
      !installationId ||
      !UUID.test(installationId) ||
      !scope ||
      typeof scope !== 'object' ||
      Array.isArray(scope)
    )
      return false;
    const value = scope as Record<string, unknown>;
    return (
      value.version === 1 &&
      value.projectRef === context.community.projectRef &&
      value.userId === userId &&
      value.installationKey === installationId
    );
  };
  const route = (context: CommunityContext, value: unknown) => {
    if (
      !current(context) ||
      typeof value !== 'string' ||
      !value.startsWith('/') ||
      value.startsWith('//')
    )
      return null;
    try {
      const url = new URL(value, context.community.origin);
      if (url.origin !== context.community.origin || url.username || url.password) return null;
      return url.href;
    } catch {
      return null;
    }
  };
  return {
    select,
    switchCommunity,
    acceptsBridge,
    runSession,
    acceptsNotification,
    route,
    isCurrent: current,
    // Deliberately excludes public keys, tokens and session payloads.
    status: () => ({
      phase,
      communityId: active?.community.id ?? null,
      generation,
      signedIn: userId !== null,
    }),
    capture: () => (phase === 'active' ? active : null),
  };
}
