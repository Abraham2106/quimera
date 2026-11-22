import type {
  FiscalOutboxTransport,
  TransportCallResult,
} from "../../src/worker/types.js";

export type MockTransportHooks = {
  onPost?: () => void;
  onGet?: () => void;
};

type PostInput = { clave: string; xml: string; signal?: AbortSignal };

export function createCountingTransport(
  behavior: {
    post: (input?: PostInput) => Promise<TransportCallResult> | TransportCallResult;
    get: (clave?: string, signal?: AbortSignal) => Promise<TransportCallResult> | TransportCallResult;
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
    async postDocument(input) {
      postCount += 1;
      hooks?.onPost?.();
      return await behavior.post(input);
    },
    async getByClave(clave, signal) {
      getCount += 1;
      hooks?.onGet?.();
      return await behavior.get(clave, signal);
    },
  };
  return transport;
}
