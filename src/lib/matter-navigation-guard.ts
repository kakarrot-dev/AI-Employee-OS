let currentGuard: (() => boolean) | undefined;

export function setMatterNavigationGuard(guard: () => boolean): () => void {
  currentGuard = guard;
  return () => { if (currentGuard === guard) currentGuard = undefined; };
}

export function allowMatterNavigation(): boolean {
  return currentGuard?.() ?? true;
}
