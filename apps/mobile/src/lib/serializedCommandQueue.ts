export type SerializedCommandQueue = {
  enqueue: <T>(command: () => Promise<T>) => Promise<T>;
};

export const createSerializedCommandQueue = (): SerializedCommandQueue => {
  let tail: Promise<unknown> = Promise.resolve();

  return {
    enqueue<T>(command: () => Promise<T>) {
      const result = tail.catch(() => undefined).then(command);
      tail = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    },
  };
};
