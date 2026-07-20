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
      type: 'notifications_enrollment_prepare';
      requestId: string;
    }
  | {
      version: 1;
      type: 'notifications_enable';
      requestId: string;
      ticket: string;
      userId: string;
    }
  | { version: 1; type: 'notifications_disable'; requestId: string | null }
  | { version: 1; type: 'notifications_open_settings' }
  | { version: 1; type: 'native_state_request' };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const ENROLLMENT_TICKET_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[0-9a-f]{64}$/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const parseRequestId = (value: unknown) => {
  const requestId = typeof value === 'string' ? value : '';
  return (
    requestId.length >= 16 &&
    requestId.length <= 160 &&
    /^[A-Za-z0-9._:-]+$/.test(requestId)
  ) ? requestId : null;
};

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

  if (value.type === 'notifications_enrollment_prepare') {
    const requestId = parseRequestId(value.requestId);
    if (!requestId) return null;
    return {
      version: 1,
      type: 'notifications_enrollment_prepare',
      requestId,
    };
  }

  if (value.type === 'auth_session') {
    const session = parseSession(value.session);
    if (session === undefined) return null;
    return { version: 1, type: 'auth_session', session };
  }

  if (value.type === 'notifications_enable') {
    const requestId = parseRequestId(value.requestId);
    const ticket = typeof value.ticket === 'string' ? value.ticket : '';
    const userId = typeof value.userId === 'string' ? value.userId : '';
    if (
      !requestId ||
      !ENROLLMENT_TICKET_PATTERN.test(ticket) ||
      !UUID_PATTERN.test(userId)
    ) return null;
    return {
      version: 1,
      type: 'notifications_enable',
      requestId,
      ticket,
      userId,
    };
  }

  return null;
};
