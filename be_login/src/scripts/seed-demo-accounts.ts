import "dotenv/config";
import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo accounts must not be seeded in production");
  }

  const password = process.env.DEMO_ACCOUNT_PASSWORD;
  if (!password || password.length < 8 || Buffer.byteLength(password, "utf8") > 256) {
    throw new Error("DEMO_ACCOUNT_PASSWORD must be 8–256 UTF-8 bytes");
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const accounts = [
    { email: "user@rich.demo", displayName: "Demo User", role: "user" as const },
    { email: "admin@rich.demo", displayName: "Demo Admin", role: "admin" as const },
  ];

  for (const account of accounts) {
    const seeded = await prisma.user.upsert({
      where: { email: account.email },
      create: { ...account, passwordHash },
      update: { ...account, passwordHash, disabledAt: null },
      select: { email: true, role: true },
    });
    console.log(`Demo account ready: ${seeded.email} (${seeded.role})`);
  }
}

main()
  .catch((error: unknown) => {
    console.error("Demo account seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
