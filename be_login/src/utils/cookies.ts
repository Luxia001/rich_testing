import type { Request, Response } from "express";
import { env } from "../config/env.ts";

export function setAccessTokenCookie(
  response: Response,
  token: string,
  maxAgeSeconds: number,
  rememberMe: boolean,
): void {
  response.cookie(env.cookieName, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    path: "/",
    ...(rememberMe ? { maxAge: maxAgeSeconds * 1000 } : {}),
  });
}

export function clearAccessTokenCookie(response: Response): void {
  response.clearCookie(env.cookieName, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    path: "/",
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

