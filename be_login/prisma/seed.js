import "dotenv/config";
import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    const displayName = process.env.ADMIN_DISPLAY_NAME?.trim() || "System Admin";
    if (!email || !password) {
        throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set before seeding");
    }
    if (password.length < 12 || Buffer.byteLength(password, "utf8") > 256) {
        throw new Error("ADMIN_PASSWORD must be 12–256 UTF-8 bytes");
    }
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const admin = await prisma.user.upsert({
        where: { email },
        create: { email, displayName, passwordHash, role: "admin" },
        update: { displayName, role: "admin" },
        select: { id: true, email: true, displayName: true, role: true },
    });
    console.log(`Admin seed ready: ${admin.email} (${admin.role})`);
}
main()
    .catch((error) => {
    console.error("Admin seed failed", error);
    process.exitCode = 1;
})
    .finally(async () => {
    await prisma.$disconnect();
});
