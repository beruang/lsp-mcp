export type LivenessResult = {
  alive: true;
  uptimeMs: number;
  memory?: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
};

export function checkLiveness(includeMemory: boolean): LivenessResult {
  const result: LivenessResult = {
    alive: true,
    uptimeMs: process.uptime() * 1000,
  };

  if (includeMemory) {
    const mem = process.memoryUsage();
    result.memory = {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      rss: mem.rss,
    };
  }

  return result;
}
