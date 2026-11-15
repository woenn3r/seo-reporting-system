// IDs must match the contract pattern ^[a-z0-9][a-z0-9_-]{1,63}$
export function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "getRandomValues" in crypto
      ? Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${rand}`.toLowerCase();
}
