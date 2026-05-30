import { prisma } from "@/lib/prisma";
import { AppError } from "@/utils/errors";

import { DEFAULT_USER_ID } from "@/services/financial-state/financial-state.persistence";

export interface PlaidConnectionStatus {
  connected: boolean;
  item_id: string | null;
  user_id: string;
  updated_at: string | null;
}

export class PlaidItemService {
  async saveAccessToken(input: {
    user_id?: string;
    item_id: string;
    access_token: string;
  }): Promise<void> {
    const userId = input.user_id ?? DEFAULT_USER_ID;

    await prisma.plaidItem.upsert({
      where: { itemId: input.item_id },
      create: {
        userId,
        itemId: input.item_id,
        accessToken: input.access_token,
      },
      update: {
        userId,
        accessToken: input.access_token,
      },
    });
  }

  async getAccessTokenForUser(
    userId: string = DEFAULT_USER_ID,
  ): Promise<{ item_id: string; access_token: string } | null> {
    const row = await prisma.plaidItem.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
    if (!row) return null;
    return { item_id: row.itemId, access_token: row.accessToken };
  }

  async getConnectionStatus(
    userId: string = DEFAULT_USER_ID,
  ): Promise<PlaidConnectionStatus> {
    const row = await prisma.plaidItem.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { itemId: true, updatedAt: true },
    });

    return {
      connected: Boolean(row),
      item_id: row?.itemId ?? null,
      user_id: userId,
      updated_at: row?.updatedAt.toISOString() ?? null,
    };
  }

  async requireAccessToken(
    userId: string = DEFAULT_USER_ID,
  ): Promise<{ item_id: string; access_token: string }> {
    const item = await this.getAccessTokenForUser(userId);
    if (!item) {
      throw new AppError("No Plaid item linked. Complete Link flow first.", {
        code: "INTEGRATION_NOT_CONFIGURED",
        statusCode: 503,
      });
    }
    return item;
  }
}

export const plaidItemService = new PlaidItemService();
