export function createAsyncMutex(): {
  run<T>(fn: () => Promise<T> | T): Promise<T>;
} {
  let chain: Promise<unknown> = Promise.resolve();
  return {
    run<T>(fn: () => Promise<T> | T): Promise<T> {
      const next = chain.then(fn, fn);
      chain = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
  };
}