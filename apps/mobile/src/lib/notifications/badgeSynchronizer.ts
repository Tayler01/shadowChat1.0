let badgeWriteTail: Promise<unknown> = Promise.resolve();
// OS badge APIs are asynchronous. Keep writes ordered even when a provider is
// replaced during account/community restoration, including explicit clearing.
export const queueBadgeWrite = (write: () => Promise<void>) => {
  const next = badgeWriteTail.catch(() => undefined).then(write);
  badgeWriteTail = next;
  return next;
};

/** One canonical badge request at a time; an event during a request forces a
 * fresh read and prevents its superseded response from restoring an old badge. */
export function createBadgeSynchronizer(options: {
  identity: () => string | null;
  read: () => Promise<unknown>;
  apply: (count: number) => Promise<void>;
}) {
  let revision = 0;
  let pending: Promise<void> | null = null;
  const sync = () => {
    revision += 1;
    if (pending) return pending;
    pending = (async () => {
      let observed: number;
      do {
        observed = revision;
        const identity = options.identity();
        if (!identity) return;
        let data: unknown;
        try { data = await options.read(); }
        catch (error) {
          if (observed !== revision) continue;
          throw error;
        }
        if (options.identity() !== identity || observed !== revision) continue;
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          throw new Error('Invalid notification badge response.');
        }
        const total = (data as { total?: unknown }).total;
        if (typeof total !== 'number' || !Number.isFinite(total) || total < 0) {
          throw new Error('Invalid notification badge count.');
        }
        await queueBadgeWrite(async () => {
          if (options.identity() === identity && observed === revision) {
            await options.apply(Math.min(99, Math.floor(total)));
          }
        });
      } while (observed !== revision);
    })().finally(() => { pending = null; });
    return pending;
  };
  return { sync };
}
