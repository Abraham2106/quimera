/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_TENANT_ID?: string;
  readonly VITE_TEST_ROLE?: string;
  readonly VITE_ACTOR_ID?: string;
  readonly VITE_WORK_ORDER_ID?: string;
  readonly VITE_LABEL_CLIENTE?: string;
  readonly VITE_LABEL_EQUIPO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}