export type SerializedCommandQueue = {
  enqueue: <T>(command: () => Promise<T>) => Promise<T>;
  cancel: () => void;
  drain: () => Promise<void>;
};

export const createSerializedCommandQueue = (): SerializedCommandQueue => {
  let tail: Promise<unknown> = Promise.resolve();
  let cancelled=false;

  return {
    cancel(){cancelled=true;},
    async drain(){await tail;},
    enqueue<T>(command: () => Promise<T>) {
      const result = tail.catch(() => undefined).then(()=>{if(cancelled)throw new Error('This community is no longer active.');return command();});
      tail = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    },
  };
};
