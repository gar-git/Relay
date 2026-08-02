import type { RelayApi } from '../../electron/preload';

declare global {
  interface Window {
    relay: RelayApi;
  }
}

export {};
