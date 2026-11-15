export type LaunchState = { progress: number; stage: string };
export function advanceLaunch(previous: LaunchState, progress: number, stage: string): LaunchState {
  return !Number.isFinite(progress) || previous.progress >= 1 || progress <= previous.progress
    ? previous : { progress: Math.min(1, progress), stage };
}

/** Startup milestones are completed work, not a timer or an estimate of time left. */
export function pageLaunchProgress(progress: number): number {
  return Number.isFinite(progress) ? 0.1 + Math.max(0, Math.min(1, progress)) * 0.6 : 0.1;
}

// The native cover stays mounted while HTML, React, session restoration and lazy
// route modules load underneath it. Observe the existing loaders so old deployed
// web editions also work; never treat the WebView load event as app readiness.
export const STREAMLINED_LAUNCH_SCRIPT = `
(function () {
  var authoritative = false;
  var finished = false;
  var pending = false;
  function post(progress, stage) {
    window.ReactNativeWebView.postMessage(JSON.stringify({version:1,type:'launch_progress',progress:progress,stage:stage}));
  }
  window.addEventListener('shadowchat:startup-work', function(event) {
    var state = event.detail;
    if (!state || typeof state.progress !== 'number' || !isFinite(state.progress) || state.progress < 0 || state.progress > 1) return;
    authoritative = true;
    window.ReactNativeWebView.postMessage(JSON.stringify({version:1,type:'startup_work',progress:state.progress,complete:state.complete === true,failed:state.failed === true}));
    if (state.complete || state.failed) { finished = true; observer.disconnect(); }
  });
  function check() {
    if (authoritative || finished || pending || !document.documentElement) return;
    var root = document.getElementById('root');
    if (!root || !root.children.length) return;
    if (document.getElementById('streamlined-document-startup')) return;
    var loader = document.querySelector('.streamlined-loading[aria-busy="true"]');
    if (loader) {
      if (loader.textContent.indexOf('Checking your membership') !== -1) post(0.9, 'Checking your membership');
      else post(0.8, 'Restoring your community');
      return;
    }
    // React can replace one suspense fallback with another in the same frame.
    pending = true;
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      if (authoritative) return;
      pending = false;
      if (!root.children.length || document.querySelector('.streamlined-loading[aria-busy="true"]')) return;
      finished = true;
      observer.disconnect();
      post(1, 'Ready');
    }); });
  }
  var observer = new MutationObserver(check);
  observer.observe(document, {subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-busy']});
  document.addEventListener('DOMContentLoaded',check,{once:true});
  check();
})(); true;
`;

export function parseLaunchProgress(raw: string): { progress: number; stage: string } | null {
  try {
    const message = JSON.parse(raw);
    if (message?.version === 1 && message.type === 'startup_work' && Number.isFinite(message.progress) && message.progress >= 0 && message.progress <= 1) {
      if (message.failed === true) return { progress: 1, stage: 'Connection interrupted' };
      if (message.complete === true && message.progress === 1) return { progress: 1, stage: 'Ready' };
      if (message.complete === false && message.progress < 1) return { progress: 0.7 + message.progress * 0.3, stage: 'Loading startup work' };
      return null;
    }
    if (message?.version !== 1 || message.type !== 'launch_progress') return null;
    // The bootstrap emits only these exact milestones. No arbitrary overlay text.
    if (message.progress === 0.8 && message.stage === 'Restoring your community') return { progress: 0.8, stage: message.stage };
    if (message.progress === 0.9 && message.stage === 'Checking your membership') return { progress: 0.9, stage: message.stage };
    if (message.progress === 1 && message.stage === 'Ready') return { progress: 1, stage: 'Ready' };
  } catch { /* Other bridge traffic is parsed by its own protocol. */ }
  return null;
}
