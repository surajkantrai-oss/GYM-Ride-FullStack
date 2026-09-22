import { Prisma } from '@prisma/client';

/** Shared lock order: finance advisory lock, then booking row if needed. */
export async function lockFinance(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(517005)::text`;
}
