import { database } from "../../config/database.ts";

export async function listRecentSessions() {
  const rows = await database.session.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      userId: true,
      rememberMe: true,
      createdAt: true,
      expiresAt: true,
      revokedAt: true,
      ipAddress: true,
      userAgent: true,
      user: { select: { email: true } },
    },
  });
  return rows.map(({ user, ...session }) => ({ ...session, email: user.email }));
}
