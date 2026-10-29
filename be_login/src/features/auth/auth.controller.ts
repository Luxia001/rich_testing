import jwt, { type JwtPayload } from "jsonwebtoken";
import { env } from "../../config/env.ts";
import { readCookie } from "../../utils/cookies.ts";
import type { Request, Response, NextFunction } from "express";
import { clearAccessTokenCookie, setAccessTokenCookie } from "../../utils/cookies.ts";
import * as authService from "./auth.service.ts";
import { isEmail, isPassword } from "./auth.validation.ts";

export async function register(request: Request, response: Response, next: NextFunction) {
  try {
    const { email, password } = request.body ?? {};
    if (!isEmail(email) || !isPassword(password)) {
      response.status(400).json({ error: "Valid email and password (12–256 bytes) are required" });
      return;
    }
    const user = await authService.register(email, password);
    if (!user) {
      response.status(409).json({ error: "Unable to create account with this email" });
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
      response.status(400).json({ error: "Email, password, and optional boolean rememberMe are required" });
      return;
    }
    const session = await authService.login(email, password, rememberMe, request);
    if (!session) {
      response.status(401).json({ error: "Invalid email or password" });
      return;
    }
    setAccessTokenCookie(response, session.token, session.ttl, session.rememberMe);
    response.json({ user: session.user, expiresAt: session.expiresAt, rememberMe: session.rememberMe });
  } catch (error) {
    next(error);
  }
}

export async function logout(request: Request, response: Response, next: NextFunction) {
  try {
    const token = readCookie(request, env.cookieName);
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
    clearAccessTokenCookie(response);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function me(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await authService.findUserById(request.auth!.userId);
    response.json({ user, expiresAt: request.auth!.expiresAt, rememberMe: request.auth!.rememberMe });
  } catch (error) {
    next(error);
  }
}

