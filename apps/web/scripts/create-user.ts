/**
 * Create a household user in the database.
 *
 * Usage (from apps/web):
 *   npx tsx scripts/create-user.ts <username> <password>
 */
import "dotenv/config";

import { hashPassword, normalizeUsername, validatePassword, validateUsername } from "../lib/auth/password";
import { prisma } from "../lib/prisma";

async function main() {
  const username = process.argv[2];
  const password = process.argv[3];

  if (!username || !password) {
    console.error("Usage: npx tsx scripts/create-user.ts <username> <password>");
    process.exit(1);
  }

  const usernameError = validateUsername(username);
  if (usernameError) {
    console.error(usernameError);
    process.exit(1);
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    console.error(passwordError);
    process.exit(1);
  }

  const normalized = normalizeUsername(username);
  const existing = await prisma.user.findUnique({ where: { username: normalized } });
  if (existing) {
    console.error(`User "${normalized}" already exists`);
    process.exit(1);
  }

  const user = await prisma.user.create({
    data: {
      username: normalized,
      passwordHash: hashPassword(password),
    },
    select: { id: true, username: true, createdAt: true },
  });

  console.log("Created user:", user);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
