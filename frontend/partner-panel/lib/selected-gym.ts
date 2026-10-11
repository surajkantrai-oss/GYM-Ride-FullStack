"use client";

import { useCallback, useEffect, useState } from "react";

const storageKey = "gymride.partner.selected-gym";

export function useSelectedGym<T extends { id: string }>(gyms?: T[]) {
  const [preferred, setPreferred] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (window.sessionStorage.getItem(storageKey) ?? ""),
  );
  const selected = gyms?.some((gym) => gym.id === preferred)
    ? preferred
    : (gyms?.[0]?.id ?? "");

  useEffect(() => {
    if (!selected || selected === preferred) return;
    setPreferred(selected);
    window.sessionStorage.setItem(storageKey, selected);
  }, [preferred, selected]);

  const select = useCallback((gymId: string) => {
    setPreferred(gymId);
    if (gymId) window.sessionStorage.setItem(storageKey, gymId);
    else window.sessionStorage.removeItem(storageKey);
  }, []);

  return [selected, select] as const;
}
