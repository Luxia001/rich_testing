import { randomUUID } from "node:crypto";
import type { Request } from "express";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { database } from "../../config/database.ts";
import { env } from "../../config/env.ts";

type Role = "user" | "admin";

export async function register(email: string, password: string) {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  return database.user.create({
    data: {
      email: email.trim().toLowerCase(),
      displayName: email.split("@")[0].slice(0, 100),
      passwordHash,
    },
    select: { id: true, email: true, displayName: true, role: true, createdAt: true },
  }).catch((error: { code?: string }) => {
    if (error.code === "P2002") return null;
    throw error;
  });
}

export async function login(
  email: string,
  password: string,
  rememberMe: boolean,
  request: Request,
) {
  const user = await database.user.findFirst({
    where: { email: email.trim().toLowerCase(), disabledAt: null },
  });
  if (!user || !(await argon2.verify(user.passwordHash, password))) return null;

  const ttl = rememberMe ? env.rememberTtlSeconds : env.sessionTtlSeconds;
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + ttl * 1000);
  await database.session.create({
    data: {
      id: sessionId,
      rememberMe,
      expiresAt,
      ipAddress: request.ip ?? null,
      userAgent: request.get("user-agent")?.slice(0, 512) ?? null,
      user: { connect: { id: user.id } },
    },
  });

  const token = jwt.sign({ sid: sessionId }, env.jwtSecret, {
    algorithm: "HS256",
    subject: user.id,
    expiresIn: ttl,
    issuer: "be_login",
    audience: "be_login_api",
  });

  return {
    user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role as Role },
    token,
    ttl,
    expiresAt,
    rememberMe,
  };
}

export async function findActiveSession(sessionId: string, userId: string) {
  return database.session.findFirst({
    where: {
      id: sessionId,
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      user: { disabledAt: null },
    },
    select: { id: true, userId: true, expiresAt: true, rememberMe: true, user: { select: { role: true } } },
  });
}

export async function revokeSession(sessionId: string): Promise<void> {
  await database.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function findUserById(userId: string) {
  return database.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, displayName: true, role: true, createdAt: true },
  });
}


