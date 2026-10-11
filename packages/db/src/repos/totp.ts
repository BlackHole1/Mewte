import type { Selectable } from "kysely";
import { transaction } from "../client";
import type { Conn, RecoveryCodesTable, TotpTable } from "../types";
import { upsert } from "../upsert";

export type TotpRecord = Selectable<TotpTable>;
export type RecoveryCodeRecord = Selectable<RecoveryCodesTable>;

export async function getTotp(conn: Conn, userId: string): Promise<TotpRecord | undefined> {
  return conn.db.selectFrom("totp").selectAll().where("userId", "=", userId).executeTakeFirst();
}

/** Stores a secret that is not active until `enableTotp` confirms it. */
export async function savePendingTotp(
  conn: Conn,
  input: { userId: string; secretEnc: string; now: number },
): Promise<void> {
  await upsert(
    conn,
    "totp",
    {
      userId: input.userId,
      secretEnc: input.secretEnc,
      enabled: 0,
      lastUsedStep: null,
      createdAt: input.now,
    },
    ["userId"],
  );
}

export async function enableTotp(
  conn: Conn,
  input: { userId: string; step: number; recoveryCodes: { id: string; codeHash: string }[] },
): Promise<void> {
  await transaction(conn, async (trx) => {
    await trx.db
      .updateTable("totp")
      .set({ enabled: 1, lastUsedStep: input.step })
      .where("userId", "=", input.userId)
      .execute();
    await replaceRecoveryCodes(trx, input.userId, input.recoveryCodes);
  });
}

export async function deleteTotp(conn: Conn, userId: string): Promise<void> {
  await transaction(conn, async (trx) => {
    await trx.db.deleteFrom("totp").where("userId", "=", userId).execute();
    await trx.db.deleteFrom("recoveryCodes").where("userId", "=", userId).execute();
  });
}

/**
 * Records the time step of an accepted code. Returns false when that step (or a later
 * one) was already used, which is how a replayed code is rejected.
 */
export async function claimTotpStep(conn: Conn, userId: string, step: number): Promise<boolean> {
  const result = await conn.db
    .updateTable("totp")
    .set({ lastUsedStep: step })
    .where("userId", "=", userId)
    .where((eb) => eb.or([eb("lastUsedStep", "is", null), eb("lastUsedStep", "<", step)]))
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function replaceRecoveryCodes(
  conn: Conn,
  userId: string,
  codes: { id: string; codeHash: string }[],
): Promise<void> {
  await conn.db.deleteFrom("recoveryCodes").where("userId", "=", userId).execute();
  if (codes.length === 0) return;
  await conn.db
    .insertInto("recoveryCodes")
    .values(codes.map((code) => ({ ...code, userId, usedAt: null })))
    .execute();
}

/** Spends a recovery code. Returns false when it is unknown or already used. */
export async function useRecoveryCode(
  conn: Conn,
  input: { userId: string; codeHash: string; now: number },
): Promise<boolean> {
  const result = await conn.db
    .updateTable("recoveryCodes")
    .set({ usedAt: input.now })
    .where("userId", "=", input.userId)
    .where("codeHash", "=", input.codeHash)
    .where("usedAt", "is", null)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function countUnusedRecoveryCodes(conn: Conn, userId: string): Promise<number> {
  const row = await conn.db
    .selectFrom("recoveryCodes")
    .select((eb) => eb.fn.countAll().as("total"))
    .where("userId", "=", userId)
    .where("usedAt", "is", null)
    .executeTakeFirstOrThrow();
  return Number(row.total);
}
