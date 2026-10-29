export function isEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

export function isPassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 12 &&
    Buffer.byteLength(value, "utf8") <= 256
  );
}
