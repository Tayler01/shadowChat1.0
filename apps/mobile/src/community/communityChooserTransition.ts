type Queue = { enqueue: <T>(operation: () => Promise<T>) => Promise<T> };

// This gate belongs to one mounted community. A successful request keeps late
// WebView auth messages closed until that community unmounts after selection.
export const createCommunityChooserTransition = () => {
  let pending = false;
  return {
    acceptsAuthSession: () => !pending,
    request: async (options: {
      notificationQueue: Queue;
      sessionQueue: Queue;
      isCurrent: () => boolean;
      revoke: () => Promise<void>;
      clearSession: () => Promise<unknown>;
      openChooser: () => void;
    }) => {
      if (pending) return;
      pending = true;
      try {
        await options.notificationQueue.enqueue(async () => {
          if (!options.isCurrent()) throw new Error('This community is no longer active.');
          await options.revoke();
        });
        await options.sessionQueue.enqueue(async () => {
          if (!options.isCurrent()) throw new Error('This community is no longer active.');
          await options.clearSession();
          if (options.isCurrent()) options.openChooser();
        });
      } catch (error) {
        pending = false;
        throw error;
      }
    },
  };
};
