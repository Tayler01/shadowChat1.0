/** Reconcile authoritative counts at OS lifecycle boundaries, including a late
 * delivery after a message was already read. Never derive a count from payloads. */
export function subscribeBadgeLifecycle(options: {
  refresh: () => Promise<void>;
  subscribeState: (listener: (state: string) => void) => { remove: () => void };
  subscribeReceived: (listener: () => void) => { remove: () => void };
}) {
  let active = true;
  const refresh = () => {
    if (active) void options.refresh().catch(() => undefined);
  };
  const state = options.subscribeState(value => {
    // Reconcile before the Home Screen is visible, as well as on resume.
    if (value === 'active' || value === 'inactive' || value === 'background') refresh();
  });
  const received = options.subscribeReceived(refresh);
  refresh();
  return () => {
    active = false;
    state.remove();
    received.remove();
  };
}
