import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Request } from "express";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { database } from "../../config/database.ts";
import { env } from "../../config/env.ts";

type Role = "user" | "admin";
const hashRefreshToken = (token: string) => createHash("sha256").update(token).digest("hex");
const newRefreshToken = () => randomBytes(48).toString("base64url");

function createAccessToken(sessionId: string, userId: string, sessionExpiresAt: Date, issuedAt = Math.floor(Date.now() / 1000)) {
  const accessTtl = Math.min(env.accessTtlSeconds, Math.floor(sessionExpiresAt.getTime() / 1000) - issuedAt);
  if (accessTtl <= 0) throw new Error("Session has expired");
  const token = jwt.sign({ sid: sessionId, iat: issuedAt }, env.jwtSecret, {
    algorithm: "HS256", subject: userId, expiresIn: accessTtl,
    issuer: "be_login", audience: "be_login_api",
  });
  return { token, accessTtl, accessExpiresAt: new Date((issuedAt + accessTtl) * 1000) };
}

export class RefreshTokenError extends Error {
  readonly code: "REFRESH_INVALID" | "REFRESH_REUSED";
  constructor(code: "REFRESH_INVALID" | "REFRESH_REUSED") {
    super(code === "REFRESH_REUSED" ? "Refresh token reuse detected" : "Refresh token is invalid or expired");
    this.code = code;
  }
}

export async function register(email: string, password: string) {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  return database.user.create({
    data: { email: email.trim().toLowerCase(), displayName: email.split("@")[0].slice(0, 100), passwordHash },
    select: { id: true, email: true, displayName: true, role: true, createdAt: true },
  }).catch((error: { code?: string }) => {
    if (error.code === "P2002") return null;
    throw error;
  });
}

export async function login(email: string, password: string, rememberMe: boolean, request: Request, previousRefreshToken?: string) {
  const user = await database.user.findFirst({ where: { email: email.trim().toLowerCase(), disabledAt: null } });
  if (!user || !(await argon2.verify(user.passwordHash, password))) return null;

  // Only revoke the browser's previous session after credentials have been verified.
  if (previousRefreshToken) await revokeByRefreshToken(previousRefreshToken);

  const ttl = rememberMe ? env.rememberTtlSeconds : env.accessTtlSeconds;
  const issuedAt = Math.floor(Date.now() / 1000);
  const sessionId = randomUUID();
  const expiresAt = new Date((issuedAt + ttl) * 1000);
  const access = createAccessToken(sessionId, user.id, expiresAt, issuedAt);
  const refreshToken = rememberMe ? newRefreshToken() : null;
  const refreshExpiresAt = refreshToken
    ? new Date(Math.min(Date.now() + env.refreshTtlSeconds * 1000, expiresAt.getTime()))
    : null;
  await database.$transaction(async (tx) => {
    await tx.session.create({ data: {
      id: sessionId, rememberMe, expiresAt, ipAddress: request.ip ?? null,
      userAgent: request.get("user-agent")?.slice(0, 512) ?? null, userId: user.id,
    } });
    if (refreshToken) await tx.refreshToken.create({
      data: { sessionId, tokenHash: hashRefreshToken(refreshToken), expiresAt: refreshExpiresAt! },
    });
  });

  return {
    user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role as Role },
    token: access.token,
    accessExpiresAt: access.accessExpiresAt,
    accessTtl: access.accessTtl, sessionExpiresAt: expiresAt, ttl, rememberMe, refreshToken, refreshExpiresAt,
  };
}

export async function refresh(rawToken: string) {
  const tokenHash = hashRefreshToken(rawToken);
  const replacement = newRefreshToken();
  const replacementId = randomUUID();
  const now = new Date();

  const result = await database.$transaction(async (tx) => {
    const current = await tx.refreshToken.findUnique({
      where: { tokenHash },
      include: { session: { include: { user: true } } },
    });
    if (!current) return { kind: "invalid" as const };
    const session = current.session;

    if (current.usedAt) {
      await tx.session.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: now } });
      return { kind: "reused" as const };
    }
    if (!session.rememberMe || session.revokedAt || session.expiresAt <= now || current.expiresAt <= now || session.user.disabledAt) {
      return { kind: "invalid" as const };
    }

    const nextRefreshExpiresAt = new Date(Math.min(now.getTime() + env.refreshTtlSeconds * 1000, session.expiresAt.getTime()));

    // Create the replacement first so the old row's replaced_by_id FK is valid
    // when the conditional consume runs. Both writes commit or roll back together.
    await tx.refreshToken.create({ data: {
      id: replacementId, sessionId: session.id, tokenHash: hashRefreshToken(replacement), expiresAt: nextRefreshExpiresAt,
    } });

    const consumed = await tx.refreshToken.updateMany({
      where: { id: current.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now, replacedById: replacementId },
    });
    if (consumed.count !== 1) {
      await tx.refreshToken.deleteMany({ where: { id: replacementId } });
      await tx.session.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: now } });
      return { kind: "reused" as const };
    }
    const issuedAt = Math.floor(now.getTime() / 1000);
    const access = createAccessToken(session.id, session.userId, session.expiresAt, issuedAt);
    return {
      kind: "ok" as const,
      token: access.token,
      accessTtl: access.accessTtl,
      accessExpiresAt: access.accessExpiresAt,
      sessionExpiresAt: session.expiresAt,
      refreshExpiresAt: nextRefreshExpiresAt,
      user: { id: session.user.id, email: session.user.email, displayName: session.user.displayName, role: session.user.role as Role },
    };
  });

  if (result.kind === "invalid") throw new RefreshTokenError("REFRESH_INVALID");
  if (result.kind === "reused") throw new RefreshTokenError("REFRESH_REUSED");
  return { ...result, refreshToken: replacement };
}

export async function findActiveSession(sessionId: string, userId: string) {
  return database.session.findFirst({
    where: { id: sessionId, userId, revokedAt: null, expiresAt: { gt: new Date() }, user: { disabledAt: null } },
    select: { id: true, userId: true, expiresAt: true, rememberMe: true, user: { select: { role: true } } },
  });
}

export async function revokeSession(sessionId: string): Promise<void> {
  await database.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeByRefreshToken(rawToken: string): Promise<void> {
  const token = await database.refreshToken.findUnique({ where: { tokenHash: hashRefreshToken(rawToken) }, select: { sessionId: true } });
  if (token) await revokeSession(token.sessionId);
}

export async function findUserById(userId: string) {
  return database.user.findUnique({ where: { id: userId }, select: { id: true, email: true, displayName: true, role: true, createdAt: true } });
}
