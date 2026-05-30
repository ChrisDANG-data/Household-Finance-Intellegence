import { prisma } from "@/lib/prisma";
import { DEFAULT_USER_ID } from "@/services/financial-state/financial-state.persistence";

import type { PlaidAccountBalance, PlaidBalanceSnapshot } from "./plaid-balance.types";

export type PlaidSyncSource = "manual" | "scheduled" | "link";

export interface RecordedBalanceRow {
  id: string;
  plaid_account_id: string;
  account_name: string;
  balance: number;
  currency: string;
  year: number;
  month: number;
  snapshot_date: string;
  balance_delta: number | null;
  sync_source: string;
}

export interface PlaidBalanceChartPoint {
  snapshot_date: string;
  year: number;
  month: number;
  balance: number;
  balance_delta: number | null;
}

export interface PlaidBalanceChartSeries {
  plaid_account_id: string;
  account_name: string;
  points: PlaidBalanceChartPoint[];
}

function utcDateParts(date: Date): { year: number; month: number; snapshotDate: Date } {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const snapshotDate = new Date(Date.UTC(year, month - 1, date.getUTCDate()));
  return { year, month, snapshotDate };
}

function decimalToNumber(value: { toString(): string } | number | null): number | null {
  if (value == null) return null;
  return Number(value);
}

function accountDisplayName(account: PlaidAccountBalance): string {
  const parts = [account.name, account.subtype].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : account.account_id;
}

function resolveBalance(account: PlaidAccountBalance): number {
  return Number((account.available ?? account.current ?? 0).toFixed(2));
}

export class PlaidBalanceHistoryService {
  async hasSnapshotForMonth(
    userId: string = DEFAULT_USER_ID,
    at: Date = new Date(),
  ): Promise<boolean> {
    const { year, month } = utcDateParts(at);
    const row = await prisma.plaidBalanceHistory.findFirst({
      where: { userId, year, month },
      select: { id: true },
    });
    return Boolean(row);
  }

  async recordFromSnapshot(input: {
    user_id?: string;
    item_id: string;
    snapshot: PlaidBalanceSnapshot;
    sync_source: PlaidSyncSource;
    correlation_id?: string;
    as_of?: Date;
  }): Promise<RecordedBalanceRow[]> {
    const userId = input.user_id ?? DEFAULT_USER_ID;
    const asOf = input.as_of ?? new Date(input.snapshot.as_of);
    const { year, month, snapshotDate } = utcDateParts(asOf);
    const recorded: RecordedBalanceRow[] = [];

    for (const account of input.snapshot.accounts) {
      const balance = resolveBalance(account);
      const currency = account.iso_currency_code ?? "USD";

      const previous = await prisma.plaidBalanceHistory.findFirst({
        where: { userId, plaidAccountId: account.account_id },
        orderBy: [{ snapshotDate: "desc" }, { createdAt: "desc" }],
      });

      const previousBalance = previous ? Number(previous.balance) : null;
      const balanceDelta =
        previousBalance == null
          ? null
          : Number((balance - previousBalance).toFixed(2));

      const row = await prisma.plaidBalanceHistory.create({
        data: {
          userId,
          itemId: input.item_id,
          plaidAccountId: account.account_id,
          accountName: accountDisplayName(account),
          balance,
          currency,
          year,
          month,
          snapshotDate,
          balanceDelta,
          syncSource: input.sync_source,
          correlationId: input.correlation_id ?? null,
        },
      });

      recorded.push({
        id: row.id,
        plaid_account_id: row.plaidAccountId,
        account_name: row.accountName,
        balance: Number(row.balance),
        currency: row.currency,
        year: row.year,
        month: row.month,
        snapshot_date: row.snapshotDate.toISOString().slice(0, 10),
        balance_delta: decimalToNumber(row.balanceDelta),
        sync_source: row.syncSource,
      });
    }

    return recorded;
  }

  async getChartSeries(
    userId: string = DEFAULT_USER_ID,
  ): Promise<PlaidBalanceChartSeries[]> {
    const rows = await prisma.plaidBalanceHistory.findMany({
      where: { userId },
      orderBy: [{ snapshotDate: "asc" }, { createdAt: "asc" }],
    });

    const byAccount = new Map<string, PlaidBalanceChartSeries>();

    for (const row of rows) {
      const key = row.plaidAccountId;
      let series = byAccount.get(key);
      if (!series) {
        series = {
          plaid_account_id: row.plaidAccountId,
          account_name: row.accountName,
          points: [],
        };
        byAccount.set(key, series);
      }

      series.points.push({
        snapshot_date: row.snapshotDate.toISOString().slice(0, 10),
        year: row.year,
        month: row.month,
        balance: Number(row.balance),
        balance_delta: decimalToNumber(row.balanceDelta),
      });
    }

    return [...byAccount.values()];
  }

  async listRecent(
    userId: string = DEFAULT_USER_ID,
    limit = 50,
  ): Promise<RecordedBalanceRow[]> {
    const rows = await prisma.plaidBalanceHistory.findMany({
      where: { userId },
      orderBy: [{ snapshotDate: "desc" }, { createdAt: "desc" }],
      take: limit,
    });

    return rows.map((row) => ({
      id: row.id,
      plaid_account_id: row.plaidAccountId,
      account_name: row.accountName,
      balance: Number(row.balance),
      currency: row.currency,
      year: row.year,
      month: row.month,
      snapshot_date: row.snapshotDate.toISOString().slice(0, 10),
      balance_delta: decimalToNumber(row.balanceDelta),
      sync_source: row.syncSource,
    }));
  }
}

export const plaidBalanceHistoryService = new PlaidBalanceHistoryService();
