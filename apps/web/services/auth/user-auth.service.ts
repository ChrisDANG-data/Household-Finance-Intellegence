import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  normalizeUsername,
  validatePassword,
  validateUsername,
  verifyPassword,
} from "@/lib/auth/password";
import { AppError } from "@/utils/errors";

export interface AuthUser {
  id: string;
  username: string;
}

export class UserAuthService {
  async findByUsername(username: string): Promise<{
    id: string;
    username: string;
    passwordHash: string;
  } | null> {
    const normalized = normalizeUsername(username);
    return prisma.user.findUnique({
      where: { username: normalized },
      select: { id: true, username: true, passwordHash: true },
    });
  }

  async authenticate(
    username: string,
    password: string,
  ): Promise<AuthUser | null> {
    const user = await this.findByUsername(username);
    if (!user) return null;
    if (!verifyPassword(password, user.passwordHash)) return null;
    return { id: user.id, username: user.username };
  }

  async register(username: string, password: string): Promise<AuthUser> {
    const usernameError = validateUsername(username);
    if (usernameError) {
      throw new AppError(usernameError, {
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      throw new AppError(passwordError, {
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }

    const normalized = normalizeUsername(username);
    const existing = await prisma.user.findUnique({
      where: { username: normalized },
      select: { id: true },
    });
    if (existing) {
      throw new AppError("Username is already taken", {
        code: "VALIDATION_ERROR",
        statusCode: 409,
      });
    }

    const user = await prisma.user.create({
      data: {
        username: normalized,
        passwordHash: hashPassword(password),
      },
      select: { id: true, username: true },
    });

    return user;
  }

  async countUsers(): Promise<number> {
    return prisma.user.count();
  }
}

export const userAuthService = new UserAuthService();
