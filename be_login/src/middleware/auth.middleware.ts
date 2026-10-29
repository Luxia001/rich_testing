import type { RequestHandler } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { env } from "../config/env.ts";
import { findActiveSession } from "../features/auth/auth.service.ts";
import { readCookie } from "../utils/cookies.ts";

export const requireAuth: RequestHandler = async (request, response, next) => {
  const token = readCookie(request, env.cookieName);
  if (!token) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  let claims: JwtPayload;
  try {
    claims = jwt.verify(token, env.jwtSecret, {
      algorithms: ["HS256"],
      issuer: "be_login",
      audience: "be_login_api",
    }) as JwtPayload;
  } catch {
    response.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  if (typeof claims.sub !== "string" || typeof claims.sid !== "string") {
    response.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  try {
    const session = await findActiveSession(claims.sid, claims.sub);
    if (!session) {
      response.status(401).json({ error: "Session expired or revoked" });
      return;
    }
    if (session.user.role !== "user" && session.user.role !== "admin") {
      response.status(403).json({ error: "Forbidden" });
      return;
    }
    request.auth = {
      userId: session.userId,
      sessionId: session.id,
      expiresAt: session.expiresAt.toISOString(),
      rememberMe: session.rememberMe,
      role: session.user.role,
    };
    next();
  } catch (error) {
    next(error);
  }
};

export function requireRole(role: "user" | "admin"): RequestHandler {
  return (request, response, next) => {
    if (request.auth?.role !== role) {
      response.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

