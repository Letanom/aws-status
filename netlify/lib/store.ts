import { getStore } from "@netlify/blobs";

export interface Storage {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
}

/** Netlify Blobs. Güçlü tutarlılık, her 5 dakikalık kontrolün bir öncekinin yazdığını kesin görmesini sağlar. */
export function blobStorage(): Storage {
  const store = getStore({ name: "aws-status", consistency: "strong" });
  return {
    async get<T>(key: string) {
      return ((await store.get(key, { type: "json" })) as T | null) ?? null;
    },
    async set(key, value) {
      await store.setJSON(key, value);
    },
  };
}

/** Testler için bellek içi depo. */
export function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    async get<T>(key: string) {
      const v = data.get(key);
      return v === undefined ? null : (JSON.parse(v) as T);
    },
    async set(key, value) {
      data.set(key, JSON.stringify(value));
    },
  };
}
