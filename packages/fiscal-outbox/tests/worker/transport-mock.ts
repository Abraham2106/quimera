import type { FiscalOutboxTransport, TransportCallResult } from "../../src/worker/types.js";

export type MockTransportHooks = {
  onPost?: () => void;
  onGet?: () => void;
};

export function createCountingTransport(
  behavior: {
    post: () => Promise<TransportCallResult> | TransportCallResult;
    get: () => Promise<TransportCallResult> | TransportCallResult;
  },
  hooks?: MockTransportHooks,
): FiscalOutboxTransport & { postCount: number; getCount: number } {
  let postCount = 0;
  let getCount = 0;
  const transport: FiscalOutboxTransport & { postCount: number; getCount: number } = {
    get postCount() {
      return postCount;
    },
    get getCount() {
      return getCount;
    },
    async postDocument() {
      postCount += 1;
      hooks?.onPost?.();
      return await behavior.post();
    },
    async getByClave() {
      getCount += 1;
      hooks?.onGet?.();
      return await behavior.get();
    },
  };
  return transport;
}