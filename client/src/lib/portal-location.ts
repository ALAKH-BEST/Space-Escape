// In-memory routing for portal builds. The game runs inside a portal's iframe, so the
// address bar must not change and a reload must not land on a path that does not exist.
// wouter's own memoryLocation keeps the query string inside the path, which breaks route
// matching for links like /game?launch=1, so path and search are split here.

import { useSyncExternalStore } from "react";

let current = "/game";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

const snapshot = () => current;

export function navigatePortal(to: string) {
  current = to;
  listeners.forEach((listener) => listener());
}

export function usePortalLocation(): [string, (to: string) => void] {
  const value = useSyncExternalStore(subscribe, snapshot);
  return [value.split("?")[0], navigatePortal];
}

export function usePortalSearch(): string {
  const value = useSyncExternalStore(subscribe, snapshot);
  const index = value.indexOf("?");
  return index < 0 ? "" : value.slice(index + 1);
}
