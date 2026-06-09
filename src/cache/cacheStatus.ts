export type CacheInfo = {
  name: string;
  description: string;
  entryCount: number;
};

type CacheRegistration = {
  name: string;
  description: string;
  getSize: () => number;
  clear: () => void;
};

const registry = new Map<string, CacheRegistration>();

export function registerCache(name: string, description: string, getSize: () => number, clear: () => void): void {
  registry.set(name, { name, description, getSize, clear });
}

export function getCacheStatus(): CacheInfo[] {
  const result: CacheInfo[] = [];
  for (const [, reg] of registry) {
    result.push({
      name: reg.name,
      description: reg.description,
      entryCount: reg.getSize(),
    });
  }
  return result;
}

export function clearCache(name: string): boolean {
  const reg = registry.get(name);
  if (!reg) return false;
  reg.clear();
  return true;
}

export function clearAllCaches(): string[] {
  const cleared: string[] = [];
  for (const [name, reg] of registry) {
    reg.clear();
    cleared.push(name);
  }
  return cleared;
}
