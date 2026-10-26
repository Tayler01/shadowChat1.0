export const FULL_APP_ORIGIN = 'https://shadochat.online';

export function resolveAppConfiguration(extra?: Record<string, unknown> | null) {
  const streamlined = extra?.appEdition === 'streamlined';
  const configured = extra?.webAppUrl;
  const url = new URL(typeof configured === 'string' ? configured : FULL_APP_ORIGIN);
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.pathname !== '/' || url.search || url.hash ||
      (streamlined && url.origin === FULL_APP_ORIGIN)) {
    throw new Error('Invalid native app origin configuration.');
  }
  return {
    origin: url.origin,
    streamlined,
    fallbackRoute: streamlined ? '/?view=chat' : '/?view=catchup',
  };
}
