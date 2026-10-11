import type { AccountScope, Condition, Rule, RuleAction, RuleInput } from "@mewte/shared";
import type { Selectable } from "kysely";
import type { Conn, RulesTable } from "../types";

function toRule(row: Selectable<RulesTable>): Rule {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled === 1,
    priority: row.priority,
    accountScope: JSON.parse(row.accountScope) as AccountScope,
    condition: JSON.parse(row.conditionJson) as Condition as Rule["condition"],
    action: row.action as RuleAction,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toColumns(input: RuleInput) {
  return {
    name: input.name,
    enabled: input.enabled ? 1 : 0,
    priority: input.priority,
    accountScope: JSON.stringify(input.accountScope),
    conditionJson: JSON.stringify(input.condition),
    action: input.action,
  };
}

export async function listRules(conn: Conn): Promise<Rule[]> {
  const rows = await conn.db
    .selectFrom("rules")
    .selectAll()
    .orderBy("priority")
    .orderBy("createdAt")
    .orderBy("id")
    .execute();
  return rows.map(toRule);
}

export async function getRule(conn: Conn, id: string): Promise<Rule | undefined> {
  const row = await conn.db.selectFrom("rules").selectAll().where("id", "=", id).executeTakeFirst();
  return row && toRule(row);
}

export async function insertRule(
  conn: Conn,
  id: string,
  input: RuleInput,
  now: number,
): Promise<Rule> {
  const row = { id, ...toColumns(input), createdAt: now, updatedAt: now };
  await conn.db.insertInto("rules").values(row).execute();
  return toRule(row);
}

export async function updateRule(
  conn: Conn,
  id: string,
  input: RuleInput,
  now: number,
): Promise<Rule | undefined> {
  await conn.db
    .updateTable("rules")
    .set({ ...toColumns(input), updatedAt: now })
    .where("id", "=", id)
    .execute();
  return getRule(conn, id);
}

export async function deleteRule(conn: Conn, id: string): Promise<void> {
  await conn.db.deleteFrom("rules").where("id", "=", id).execute();
}
