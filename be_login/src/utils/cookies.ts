import type { Request, Response } from "express";
import { env } from "../config/env.ts";

export function setRefreshTokenCookie(response: Response, token: string, maxAgeSeconds: number): void {
  response.cookie(env.refreshCookieName, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    path: env.refreshCookiePath,
    maxAge: maxAgeSeconds * 1000,
  });
}

export function clearRefreshTokenCookie(response: Response): void {
  response.clearCookie(env.refreshCookieName, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    path: env.refreshCookiePath,
  });
}

export function readCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

