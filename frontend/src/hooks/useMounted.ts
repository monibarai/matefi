'use client';

// Hydration guard: the wallet store rehydrates from localStorage on the
// client, so any UI that branches on wallet state must render the
// disconnected (server) variant until after mount.

import { useEffect, useState } from 'react';

export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
