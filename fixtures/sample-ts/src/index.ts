import { add } from "./util.js";
export function sumTo(n: number): number {
  let total = 0;
  for (let i = 1; i <= n; i++) total = add(total, i);
  return total;
}
