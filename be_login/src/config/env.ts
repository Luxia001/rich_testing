import "dotenv/config";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

const jwtSecret = requiredEnv("JWT_SECRET");
if (Buffer.byteLength(jwtSecret) < 32) {
  throw new Error("JWT_SECRET must be at least 32 bytes");
}

export const env = {
  port: positiveIntegerEnv("PORT", 8000),
  jwtSecret,
  rememberTtlSeconds: positiveIntegerEnv("REMEMBER_ME_TTL_SECONDS", 90),
  refreshTtlSeconds: positiveIntegerEnv("REFRESH_TOKEN_TTL_SECONDS", 20),
  accessTtlSeconds: positiveIntegerEnv("ACCESS_TTL_SECONDS", 60),
  refreshCookieName: "refresh_token",
  refreshCookiePath: process.env.REFRESH_COOKIE_PATH || "/api/auth",
  cookieSecure: process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE !== "false"
    : process.env.NODE_ENV === "production",
};
