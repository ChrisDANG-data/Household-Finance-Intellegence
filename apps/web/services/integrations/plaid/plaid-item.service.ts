import { prisma } from "@/lib/prisma";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedValue,
} from "@/lib/crypto/token-encryption";
import { AppError } from "@/utils/errors";

import { DEFAULT_USER_ID } from "@/services/financial-state/financial-state.persistence";

export interface PlaidConnectionStatus {
  connected: boolean;
  item_id: string | null;
  user_id: string;
  /** When the Plaid item was linked or re-linked */
  linked_at: string | null;
  /** When balances were last synced from Plaid */
  last_synced_at: string | null;
  updated_at: string | null;
}

export class PlaidItemService {
  async saveAccessToken(input: {
    user_id?: string;
    item_id: string;
    access_token: string;
  }): Promise<void> {
    const userId = input.user_id ?? DEFAULT_USER_ID;
    const accessToken = encryptSecret(input.access_token);

    await prisma.plaidItem.upsert({
      where: { itemId: input.item_id },
      create: {
        userId,
        itemId: input.item_id,
        accessToken,
      },
      update: {
        userId,
        accessToken,
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

    try {
      return {
        item_id: row.itemId,
        access_token: decryptSecret(row.accessToken),
      };
    } catch (error) {
      throw new AppError("Failed to decrypt Plaid access token", {
        code: "DECRYPTION_ERROR",
        statusCode: 500,
        details:
          isEncryptedValue(row.accessToken)
            ? "Check TOKEN_ENCRYPTION_KEY matches the key used at encryption time"
            : undefined,
      });
    }
  }

  async getConnectionStatus(
    userId: string = DEFAULT_USER_ID,
  ): Promise<PlaidConnectionStatus> {
    const [row, lastSnapshot] = await Promise.all([
      prisma.plaidItem.findFirst({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        select: { itemId: true, updatedAt: true },
      }),
      prisma.plaidBalanceHistory.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);

    const linkedAt = row?.updatedAt.toISOString() ?? null;
    const lastSyncedAt = lastSnapshot?.createdAt.toISOString() ?? null;

    return {
      connected: Boolean(row),
      item_id: row?.itemId ?? null,
      user_id: userId,
      linked_at: linkedAt,
      last_synced_at: lastSyncedAt,
      updated_at: lastSyncedAt ?? linkedAt,
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
