import jwt, { type JwtPayload } from "jsonwebtoken";
import { env } from "../../config/env.ts";
import { readCookie, clearRefreshTokenCookie, setRefreshTokenCookie } from "../../utils/cookies.ts";
import type { Request, Response, NextFunction } from "express";
import * as authService from "./auth.service.ts";
import { isEmail, isPassword } from "./auth.validation.ts";
import { sendApiError } from "../../utils/api-error.ts";

export async function register(request: Request, response: Response, next: NextFunction) {
  try {
    const { email, password } = request.body ?? {};
    if (!isEmail(email) || !isPassword(password)) {
      sendApiError(response, 400, "VALIDATION_ERROR", "Valid email and password (12–256 bytes) are required");
      return;
    }
    const user = await authService.register(email, password);
    if (!user) {
      sendApiError(response, 409, "EMAIL_ALREADY_EXISTS", "Unable to create account with this email");
      return;
    }
    response.status(201).json({ user });
  } catch (error) {
    next(error);
  }
}

export async function login(request: Request, response: Response, next: NextFunction) {
  try {
    const { email, password, rememberMe = false } = request.body ?? {};
    if (!isEmail(email) || typeof password !== "string" || typeof rememberMe !== "boolean") {
      sendApiError(response, 400, "VALIDATION_ERROR", "Email, password, and optional boolean rememberMe are required");
      return;
    }
    const previousRefreshToken = readCookie(request, env.refreshCookieName);
    const session = await authService.login(email, password, rememberMe, request, previousRefreshToken);
    if (!session) {
      sendApiError(response, 401, "INVALID_CREDENTIALS", "Invalid email or password");
      return;
    }
    if (session.refreshToken) setRefreshTokenCookie(response, session.refreshToken, session.ttl);
    else clearRefreshTokenCookie(response);
    response.json({ user: session.user, accessToken: session.token, accessExpiresAt: session.accessExpiresAt, sessionExpiresAt: session.sessionExpiresAt });
  } catch (error) {
    next(error);
  }
}

export async function logout(request: Request, response: Response, next: NextFunction) {
  try {
    const token = request.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    let claims: JwtPayload | undefined;
    if (token) {
      try {
        const verified = jwt.verify(token, env.jwtSecret, {
          algorithms: ["HS256"], issuer: "be_login", audience: "be_login_api", ignoreExpiration: true,
        });
        if (typeof verified !== "string") claims = verified;
      } catch { /* An invalid cookie must still be cleared. */ }
    }
    if (typeof claims?.sid === "string" && typeof claims.sub === "string") {
      await authService.revokeSession(claims.sid);
    }
    const refreshToken = readCookie(request, env.refreshCookieName);
    if (refreshToken) await authService.revokeByRefreshToken(refreshToken);
    clearRefreshTokenCookie(response);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function refresh(request: Request, response: Response, next: NextFunction) {
  const rawToken = readCookie(request, env.refreshCookieName);
  if (!rawToken) {
    clearRefreshTokenCookie(response);
    sendApiError(response, 401, "REFRESH_INVALID", "Refresh token required");
    return;
  }
  try {
    const result = await authService.refresh(rawToken);
    setRefreshTokenCookie(response, result.refreshToken, Math.floor((result.sessionExpiresAt.getTime() - Date.now()) / 1000));
    response.json({ user: result.user, accessToken: result.token, accessExpiresAt: result.accessExpiresAt, sessionExpiresAt: result.sessionExpiresAt });
  } catch (error) {
    if (error instanceof authService.RefreshTokenError) {
      clearRefreshTokenCookie(response);
      sendApiError(response, 401, error.code, error.message);
      return;
    }
    next(error);
  }
}

export async function me(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await authService.findUserById(request.auth!.userId);
    response.json({ user });
  } catch (error) {
    next(error);
  }
}

