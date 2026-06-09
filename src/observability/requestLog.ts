import { requestTracker, type RequestLogFilter } from "./requestTracker.js";

export function getRequestLog(filter?: RequestLogFilter) {
  return requestTracker.getEntries(filter);
}

export function clearRequestLog(filter?: RequestLogFilter): number {
  return requestTracker.clear(filter);
}
