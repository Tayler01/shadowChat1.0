export type AppNavigationRequest = {
  url: string;
  isTopFrame?: boolean;
  navigationType?: string;
};

/** Frame loads belong to the page; only deliberate external links leave the app. */
export function decideAppNavigation(
  request: AppNavigationRequest,
  isAllowedAppUrl: (url: string) => boolean,
): 'allow' | 'external' | 'block' {
  let protocol: string;
  try { protocol = new URL(request.url).protocol; } catch { return 'block'; }
  if (isAllowedAppUrl(request.url)) return 'allow';
  const externalProtocol = ['https:', 'mailto:', 'tel:', 'sms:'].includes(protocol);

  // iOS reports every iframe navigation here, including initial player loads.
  // These must not invoke Linking.openURL or navigate the community document.
  if (request.isTopFrame === false) {
    if (request.navigationType === 'click') return 'block';
    return protocol === 'https:' || request.url === 'about:blank' || request.url === 'about:srcdoc' ? 'allow' : 'block';
  }

  // Android's reviewed native patch supplies frame and gesture metadata too.
  // Missing metadata is not evidence of a deliberate external navigation.
  if (externalProtocol && request.isTopFrame === true && request.navigationType === 'click') {
    return 'external';
  }
  return 'block';
}

/** Native trusted app links use the main frame so iframe clicks remain isolated. */
export const NATIVE_MAIN_DOCUMENT_LINK_SCRIPT = `
(function () {
  if (window.top !== window.self) return;
  document.addEventListener('click', function (event) {
    if (!event.isTrusted || event.defaultPrevented) return;
    var target = event.target;
    var anchor = target && target.closest ? target.closest('a[href]') : null;
    if (!anchor || anchor.ownerDocument !== document) return;
    try {
      var url = new URL(anchor.href, window.location.href);
      if (['https:', 'mailto:', 'tel:', 'sms:'].indexOf(url.protocol) === -1) return;
      if (url.protocol === 'https:' && url.origin === window.location.origin) return;
      anchor.target = '_self';
    } catch (_) {}
  }, true);
})(); true;
`;
