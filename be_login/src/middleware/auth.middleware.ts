import type { RequestHandler } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { env } from "../config/env.ts";
import { findActiveSession } from "../features/auth/auth.service.ts";
import { sendApiError } from "../utils/api-error.ts";

export const requireAuth: RequestHandler = async (request, response, next) => {
  const authorization = request.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    sendApiError(response, 401, "AUTH_REQUIRED", "Bearer access token required");
    return;
  }
  const token = match[1];

  let claims: JwtPayload;
  try {
    claims = jwt.verify(token, env.jwtSecret, {
      algorithms: ["HS256"],
      issuer: "be_login",
      audience: "be_login_api",
    }) as JwtPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      sendApiError(response, 401, "ACCESS_EXPIRED", "Access token has expired");
      return;
    }
    sendApiError(response, 401, "AUTH_REQUIRED", "Access token is invalid");
    return;
  }

  if (typeof claims.sub !== "string" || typeof claims.sid !== "string") {
    sendApiError(response, 401, "AUTH_REQUIRED", "Access token is invalid");
    return;
  }

  try {
    const session = await findActiveSession(claims.sid, claims.sub);
    if (!session) {
      sendApiError(response, 401, "SESSION_REVOKED", "Session has expired or been revoked");
      return;
    }
    if (session.user.role !== "user" && session.user.role !== "admin") {
      sendApiError(response, 403, "FORBIDDEN", "You do not have permission to access this resource");
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
      sendApiError(response, 403, "FORBIDDEN", "You do not have permission to access this resource");
      return;
    }
    next();
  };
}

