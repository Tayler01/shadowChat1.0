import {
  restoreCommunitySelection,
  type CommunityRegistry,
  type CommunityId,
  type createCommunityRuntime,
} from './communityRuntime';

/** One startup per JS runtime, shared by StrictMode effects and provider remounts. */
export function createCommunityStartup() {
  let pending: Promise<ReturnType<ReturnType<typeof createCommunityRuntime>['capture']>> | null =
    null;
  return (options: {
    registry: CommunityRegistry;
    controller: ReturnType<typeof createCommunityRuntime>;
    streamlined: boolean;
    revokeLegacy: () => Promise<void>;
    readSelection: () => Promise<unknown>;
    persistSelection: (id: CommunityId) => Promise<void>;
  }) => {
    const selected = options.controller.capture();
    if (selected) return Promise.resolve(selected);
    if (pending) return pending;
    pending = (async () => {
      if (!options.streamlined) return options.controller.select('member');
      await options.revokeLegacy();
      const current = options.controller.capture();
      if (current) return current;
      const stored = restoreCommunitySelection(options.registry, await options.readSelection());
      if (options.streamlined && !stored) return null;
      const selected = stored ?? 'member';
      await options.persistSelection(selected);
      return options.controller.select(selected);
    })().catch((error) => {
      pending = null;
      throw error;
    });
    return pending;
  };
}
