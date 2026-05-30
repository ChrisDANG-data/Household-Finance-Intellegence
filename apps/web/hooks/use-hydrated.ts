"use client";

import { useEffect, useState } from "react";

/** True after the client has mounted (safe for browser-only UI). */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}
