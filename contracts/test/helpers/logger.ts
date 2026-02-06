const VERBOSE = process.env.VERBOSE === "1" || process.env.DEBUG === "1";

function formatData(data: unknown): string {
  if (data === undefined || data === null) return "";
  if (typeof data === "object" && "toBigInt" in (data as object)) {
    return (data as bigint).toString();
  }
  return JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);
}

export function logStep(label: string, data?: unknown): void {
  if (!VERBOSE) return;
  const msg = data !== undefined ? `[TEST] ${label} ${formatData(data)}` : `[TEST] ${label}`;
  console.log(msg);
}

export function logEvent(name: string, args: unknown): void {
  if (!VERBOSE) return;
  console.log(`[TEST] event: ${name}`, formatData(args));
}

export function logBalance(who: string, balance: bigint | string, label?: string): void {
  if (!VERBOSE) return;
  const bal = typeof balance === "string" ? balance : balance.toString();
  const msg = label ? `[TEST] balance ${who} (${label}): ${bal}` : `[TEST] balance ${who}: ${bal}`;
  console.log(msg);
}
