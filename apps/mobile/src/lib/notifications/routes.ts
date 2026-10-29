import { appRuntime } from '../appRuntime';

export const normalizeNotificationRoute = (value: unknown) => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return appRuntime.fallbackRoute;
  }
  try {
    const parsed = new URL(value, appRuntime.origin);
    if (parsed.origin !== appRuntime.origin) return appRuntime.fallbackRoute;
    if (appRuntime.streamlined && parsed.pathname === '/') {
      const view = parsed.searchParams.get('view');
      if (view && !['chat', 'dms', 'pins', 'settings', 'active-users', 'discover'].includes(view)) return appRuntime.fallbackRoute;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return appRuntime.fallbackRoute;
  }
};

export const getNotificationWebUrl = (route: string) => {
  return new URL(normalizeNotificationRoute(route), appRuntime.origin).href;
};

export type NotificationNavigationTarget = { url: string; revision: number };
// A new tap to the same DM still navigates after the web UI has moved elsewhere.
export const nextNotificationNavigationTarget = (
  previous: NotificationNavigationTarget | null,
  url: string
): NotificationNavigationTarget => ({ url, revision: (previous?.revision ?? 0) + 1 });
