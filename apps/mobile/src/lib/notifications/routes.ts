import Constants from 'expo-constants';

const defaultWebAppUrl = 'https://shadochat.online';

export const normalizeNotificationRoute = (value: unknown) => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/?view=catchup';
  }
  try {
    const parsed = new URL(value, defaultWebAppUrl);
    if (parsed.origin !== defaultWebAppUrl) return '/?view=catchup';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/?view=catchup';
  }
};

export const getNotificationWebUrl = (route: string) => {
  const configured = Constants.expoConfig?.extra?.webAppUrl;
  const origin = typeof configured === 'string' && configured.startsWith('https://')
    ? configured.replace(/\/+$/, '')
    : defaultWebAppUrl;
  return new URL(normalizeNotificationRoute(route), origin).href;
};
