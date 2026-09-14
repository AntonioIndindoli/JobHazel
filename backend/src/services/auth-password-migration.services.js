import { pbkdf2, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { hashPassword } from "better-auth/crypto";
import { getPrismaAsync } from "../db/prisma.js";

const derive = promisify(pbkdf2);

// Only imported credential accounts with no Neon password are eligible. A password
// reset/change in Neon always wins; never overwrite an existing managed password.
export async function migrateLegacyPassword(email, password) {
  const prisma = await getPrismaAsync();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.neonAuthId || !user.passwordHash) return;
  const [iterations, salt, expected] = user.passwordHash.split(":");
  if (iterations !== "120000" || !salt || !/^[a-f0-9]{128}$/i.test(expected ?? "")) return;
  const actual = await derive(password, salt, 120000, 64, "sha512");
  if (!timingSafeEqual(actual, Buffer.from(expected, "hex"))) return;
  const managedHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE neon_auth.account SET password = ${managedHash}, "updatedAt" = NOW()
      WHERE "userId" = ${user.neonAuthId}::uuid AND "providerId" = 'credential' AND password IS NULL`;
    await tx.user.update({ where: { id: user.id }, data: { passwordHash: null } });
  });
}
