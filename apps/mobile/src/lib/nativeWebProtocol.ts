export type NativeWebSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  userId: string;
};

export type NativeWebMessage =
  | { version: 1; type: 'bridge_ready' }
  | { version: 1; type: 'auth_session'; session: NativeWebSession | null }
  | {
      version: 1;
      type: 'notifications_enable';
      requestId: string | null;
      /**
       * Older cached web shells did not send a session with this command.
       * Undefined means preserve the native session instead of signing out.
       */
      session?: NativeWebSession | null;
    }
  | { version: 1; type: 'notifications_disable'; requestId: string | null }
  | { version: 1; type: 'notifications_open_settings' }
  | { version: 1; type: 'native_state_request' };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseSession = (value: unknown): NativeWebSession | null | undefined => {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;

  if (
    typeof value.accessToken !== 'string' ||
    value.accessToken.length < 20 ||
    typeof value.refreshToken !== 'string' ||
    value.refreshToken.length < 20 ||
    typeof value.userId !== 'string' ||
    value.userId.length < 16 ||
    (
      value.expiresAt !== null &&
      typeof value.expiresAt !== 'number'
    )
  ) {
    return undefined;
  }

  return {
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    expiresAt: value.expiresAt as number | null,
    userId: value.userId,
  };
};

export const parseNativeWebMessage = (raw: string): NativeWebMessage | null => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(value) || value.version !== 1 || typeof value.type !== 'string') {
    return null;
  }

  if (
    value.type === 'bridge_ready' ||
    value.type === 'notifications_open_settings' ||
    value.type === 'native_state_request'
  ) {
    return { version: 1, type: value.type };
  }

  if (value.type === 'notifications_disable') {
    return {
      version: 1,
      type: 'notifications_disable',
      requestId: typeof value.requestId === 'string' ? value.requestId : null,
    };
  }

  if (value.type === 'auth_session') {
    const session = parseSession(value.session);
    if (session === undefined) return null;
    return { version: 1, type: 'auth_session', session };
  }

  if (value.type === 'notifications_enable') {
    const hasSession = Object.prototype.hasOwnProperty.call(value, 'session');
    if (!hasSession) {
      return {
        version: 1,
        type: 'notifications_enable',
        requestId: typeof value.requestId === 'string' ? value.requestId : null,
      };
    }

    const session = parseSession(value.session);
    if (session === undefined) return null;
    return {
      version: 1,
      type: 'notifications_enable',
      requestId: typeof value.requestId === 'string' ? value.requestId : null,
      session,
    };
  }

  return null;
};

export const parseNativeNotificationControlUrl = (
  value: string,
  appOrigin: string
) => {
  try {
    const url = new URL(value);
    if (
      url.origin !== appOrigin ||
      url.pathname !== '/' ||
      url.searchParams.get('nativeApp') !== '1' ||
      url.searchParams.get('nativeControl') !== 'notifications_enable'
    ) {
      return null;
    }

    const requestId = url.searchParams.get('requestId');
    if (!requestId || requestId.length > 160) return null;
    return {
      version: 1 as const,
      type: 'notifications_enable' as const,
      requestId,
    };
  } catch {
    return null;
  }
};
