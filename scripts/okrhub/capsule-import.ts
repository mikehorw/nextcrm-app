/**
 * OKR Hub fork (OKR-172): import a Capsule CRM export into NextCRM.
 *
 *   pnpm exec tsx scripts/okrhub/capsule-import.ts --dir <export dir> [--live] [--owner <email>]
 *
 * Without --live it is a dry run: it reads the database (stages, types, user)
 * but writes nothing, and prints a report. With --live it writes. A mapping
 * table (okrhub_import_map) records Capsule ID -> NextCRM ID, so re-running
 * updates the same records instead of creating duplicates.
 *
 * The export dir holds the JSON files written by capsule-export.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { prismaBase as db } from "@/lib/prisma-base";
import {
  type CapsuleEntry,
  type CapsuleKase,
  type CapsuleOpportunity,
  type CapsuleParty,
  type CapsuleTask,
  type Skip,
  isCapsuleSample,
  mapAccount,
  mapContact,
  mapEntry,
  mapKaseNote,
  mapOpportunity,
  mapTask,
} from "./capsule-map";
import { BRANDS, LOST_REASONS, SERVICE_LINES, VALUE_TYPES } from "@/lib/okrhub/fields";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const LIVE = args.includes("--live");
const DIR = arg("--dir") ?? "capsule-export";
const OWNER = arg("--owner") ?? "mike@mikehorw.co.uk";
// Optional JSON of Mike's corrections, kept outside the repo (it names people):
// { "skipPeople": [capsuleId], "addOrganisations": [{ "id": -1, "name": "...",
//   "website": "https://...", "people": [capsuleId] }] }
// Added organisations use negative IDs so they map stably across re-runs.
const OVERRIDES = arg("--overrides");
const SOURCE = "capsule";

const load = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), "utf8"));

const report = {
  mode: LIVE ? "LIVE" : "DRY RUN",
  created: {} as Record<string, number>,
  updated: {} as Record<string, number>,
  skipped: [] as Skip[],
  warnings: [] as string[],
};
const bump = (bucket: Record<string, number>, kind: string) => (bucket[kind] = (bucket[kind] ?? 0) + 1);

// ---- mapping table -------------------------------------------------------

async function ensureMapTable() {
  if (!LIVE) return;
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "okrhub_import_map" (
      "source" TEXT NOT NULL,
      "kind" TEXT NOT NULL,
      "source_id" TEXT NOT NULL,
      "target_id" UUID NOT NULL,
      "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("source", "kind", "source_id")
    )`);
}

const existing = new Map<string, string>();
async function loadMap() {
  const exists = await db.$queryRawUnsafe<{ t: string | null }[]>(
    `SELECT to_regclass('public.okrhub_import_map')::text AS t`,
  );
  if (!exists[0]?.t) return;
  const rows = await db.$queryRawUnsafe<{ kind: string; source_id: string; target_id: string }[]>(
    `SELECT kind, source_id, target_id::text FROM "okrhub_import_map" WHERE source = $1`,
    SOURCE,
  );
  for (const r of rows) existing.set(`${r.kind}:${r.source_id}`, r.target_id);
}

async function remember(kind: string, sourceId: number, targetId: string) {
  existing.set(`${kind}:${sourceId}`, targetId);
  if (!LIVE) return;
  await db.$executeRawUnsafe(
    `INSERT INTO "okrhub_import_map" (source, kind, source_id, target_id) VALUES ($1, $2, $3, $4::uuid)
     ON CONFLICT (source, kind, source_id) DO UPDATE SET target_id = EXCLUDED.target_id, imported_at = CURRENT_TIMESTAMP`,
    SOURCE,
    kind,
    String(sourceId),
    targetId,
  );
}

/**
 * Create or update one record. In a dry run nothing is written and a
 * placeholder ID is returned so later records can still be linked.
 */
async function upsert(
  kind: string,
  sourceId: number,
  create: () => Promise<{ id: string }>,
  update: (id: string) => Promise<unknown>,
): Promise<string> {
  const known = existing.get(`${kind}:${sourceId}`);
  if (known) {
    if (LIVE) await update(known);
    bump(report.updated, kind);
    return known;
  }
  const id = LIVE ? (await create()).id : `dry-${kind}-${sourceId}`;
  await remember(kind, sourceId, id);
  bump(report.created, kind);
  return id;
}

// ---- main ----------------------------------------------------------------

async function main() {
  let parties = load<CapsuleParty[]>("parties");
  if (OVERRIDES) {
    const o = JSON.parse(fs.readFileSync(OVERRIDES, "utf8")) as {
      skipPeople?: number[];
      addOrganisations?: { id: number; name: string; website?: string; people?: number[] }[];
    };
    const skip = new Set(o.skipPeople ?? []);
    for (const p of parties.filter((x) => skip.has(x.id))) {
      report.skipped.push({ kind: "person", id: p.id, label: `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim(), reason: "Mike: don't migrate" });
    }
    parties = parties.filter((x) => !skip.has(x.id));
    for (const org of o.addOrganisations ?? []) {
      if (org.id >= 0) throw new Error(`Added organisation ${org.name} needs a negative id`);
      parties.push({
        id: org.id, type: "organisation", name: org.name, createdAt: new Date().toISOString(),
        emailAddresses: [], phoneNumbers: [], addresses: [], tags: [], fields: [],
        websites: org.website ? [{ service: "URL", address: org.website, url: org.website }] : [],
      });
      for (const p of parties) if (org.people?.includes(p.id)) p.organisation = { id: org.id };
      report.warnings.push(`Added organisation (not in Capsule): ${org.name}`);
    }
  }
  const opps = load<CapsuleOpportunity[]>("opportunities");
  const entries = load<CapsuleEntry[]>("entries");
  const tasks = load<CapsuleTask[]>("tasks");
  const kases = load<CapsuleKase[]>("kases");

  const owner = await db.users.findFirst({ where: { email: OWNER }, select: { id: true } });
  if (!owner) throw new Error(`No NextCRM user with email ${OWNER}`);
  const me = owner.id;

  const stages = await db.crm_Opportunities_Sales_Stages.findMany({ select: { id: true, name: true } });
  const types = await db.crm_Opportunities_Type.findMany({ select: { id: true, name: true } });
  const stageId = new Map(stages.map((s) => [s.name.toLowerCase(), s.id]));
  const typeId = new Map(types.map((t) => [t.name.toLowerCase(), t.id]));

  await ensureMapTable();
  await loadMap();

  // -- Accounts (organisations)
  const sample = new Set(parties.filter(isCapsuleSample).map((p) => p.id));
  for (const id of Array.from(sample)) {
    report.skipped.push({ kind: "organisation", id, label: "Capsule", reason: "Capsule's own sample record" });
  }
  const accountOf = new Map<number, string>(); // capsule party id -> account id
  const industryIds = new Map<string, string>();
  for (const p of parties.filter((x) => x.type === "organisation" && !sample.has(x.id))) {
    const { industryName, ...a } = mapAccount(p);
    let industry: string | null = null;
    if (industryName) {
      const key = industryName.toLowerCase();
      if (!industryIds.has(key)) {
        const found = await db.crm_Industry_Type.findFirst({ where: { name: { equals: industryName, mode: "insensitive" } } });
        if (found) industryIds.set(key, found.id);
        else if (LIVE) industryIds.set(key, (await db.crm_Industry_Type.create({ data: { name: industryName } })).id);
        else industryIds.set(key, `dry-industry-${key}`);
      }
      industry = LIVE ? industryIds.get(key)! : null;
    }
    const data = { ...a, industry, assigned_to: me, updatedBy: me };
    const id = await upsert(
      "account",
      p.id,
      () => db.crm_Accounts.create({ data: { v: 0, ...data, createdBy: me }, select: { id: true } }),
      (id) => db.crm_Accounts.update({ where: { id }, data }),
    );
    accountOf.set(p.id, id);
  }

  // -- Contacts (people)
  const contactOf = new Map<number, string>();
  const personAccount = new Map<number, string | null>();
  for (const p of parties.filter((x) => x.type === "person")) {
    const acc = p.organisation ? (accountOf.get(p.organisation.id) ?? null) : null;
    if (!p.organisation) report.warnings.push(`Contact without organisation: ${p.firstName ?? ""} ${p.lastName ?? ""}`.trim());
    personAccount.set(p.id, acc);
    const data = { ...mapContact(p), accountsIDs: acc, account: acc, assigned_to: me, updatedBy: me };
    const id = await upsert(
      "contact",
      p.id,
      () => db.crm_Contacts.create({ data: { v: 0, ...data, createdBy: me }, select: { id: true } }),
      (id) => db.crm_Contacts.update({ where: { id }, data }),
    );
    contactOf.set(p.id, id);
  }

  const accountForParty = (pid?: number | null) =>
    pid == null ? null : (accountOf.get(pid) ?? personAccount.get(pid) ?? null);

  // -- Opportunities
  const oppOf = new Map<number, string>();
  const oppAccount = new Map<number, string | null>();
  const check = (label: string, value: string | null, allowed: readonly string[], what: string) => {
    if (value && !allowed.includes(value)) report.warnings.push(`${label}: ${what} "${value}" not in NextCRM list, left blank`);
    return value && allowed.includes(value) ? value : null;
  };
  for (const o of opps) {
    const m = mapOpportunity(o);
    const sid = stageId.get(m.stageName.toLowerCase()) ?? null;
    if (!sid) report.warnings.push(`${o.name}: stage "${m.stageName}" not found in NextCRM`);
    const tid = m.dealTypeName ? (typeId.get(m.dealTypeName.toLowerCase()) ?? null) : null;
    if (m.dealTypeName && !tid) report.warnings.push(`${o.name}: deal type "${m.dealTypeName}" not found in NextCRM`);
    const partyId = o.party?.id ?? null;
    const acc = accountForParty(partyId);
    oppAccount.set(o.id, acc);
    const data = {
      name: m.name,
      description: m.description,
      budget: m.budget,
      expected_revenue: m.expected_revenue,
      currency: m.currency,
      close_date: m.close_date,
      created_on: m.created_on,
      stage_entered_at: m.stage_entered_at,
      sales_stage: sid,
      type: tid,
      brand: check(o.name, m.brand, BRANDS, "brand"),
      service_lines: m.service_lines.filter((s) => check(o.name, s, SERVICE_LINES, "service line")),
      value_types: m.value_types.filter((s) => check(o.name, s, VALUE_TYPES, "value type")),
      lost_reason: check(o.name, m.lost_reason, LOST_REASONS, "lost reason"),
      status: m.status,
      won_at: m.won_at,
      lost_at: m.lost_at,
      account: acc,
      assigned_to: me,
      updatedBy: me,
    };
    const id = await upsert(
      "opportunity",
      o.id,
      () => db.crm_Opportunities.create({ data: { v: 0, ...data, createdAt: m.createdAt, createdBy: me }, select: { id: true } }),
      (id) => db.crm_Opportunities.update({ where: { id }, data }),
    );
    oppOf.set(o.id, id);
    const contact = partyId != null ? contactOf.get(partyId) : undefined;
    if (contact && LIVE) {
      await db.contactsToOpportunities.createMany({
        data: [{ contact_id: contact, opportunity_id: id }],
        skipDuplicates: true,
      });
    }
  }

  // -- Cases -> a note on the case's account (and its opportunity)
  const kaseById = new Map(kases.map((k) => [k.id, k]));
  const links = (pids: (number | null | undefined)[], oppId?: number | null, kaseId?: number | null) => {
    const out: { entityType: string; entityId: string }[] = [];
    const add = (entityType: string, entityId?: string | null) => {
      if (entityId && !out.some((l) => l.entityType === entityType && l.entityId === entityId)) out.push({ entityType, entityId });
    };
    const kase = kaseId != null ? kaseById.get(kaseId) : undefined;
    for (const pid of [...pids, kase?.party?.id]) {
      if (pid == null) continue;
      add("contact", contactOf.get(pid));
      add("account", accountForParty(pid));
    }
    for (const oid of [oppId, kase?.opportunity?.id]) {
      if (oid == null) continue;
      add("opportunity", oppOf.get(oid));
      add("account", oppAccount.get(oid));
    }
    return out;
  };

  async function upsertActivity(kind: string, sourceId: number, a: ReturnType<typeof mapEntry> | ReturnType<typeof mapKaseNote>, ls: ReturnType<typeof links>) {
    if (ls.length === 0) report.warnings.push(`${kind} ${sourceId} ("${a.title}") has nothing to link to`);
    const data = { ...a, createdBy: me, updatedBy: me };
    await upsert(
      kind,
      sourceId,
      () => db.crm_Activities.create({ data: { ...data, links: { create: ls } }, select: { id: true } }),
      async (id) => {
        await db.crm_Activities.update({ where: { id }, data });
        await db.crm_ActivityLinks.deleteMany({ where: { activityId: id } });
        if (ls.length) await db.crm_ActivityLinks.createMany({ data: ls.map((l) => ({ ...l, activityId: id })) });
      },
    );
  }

  for (const k of kases) {
    await upsertActivity("kase", k.id, mapKaseNote(k), links([k.party?.id], k.opportunity?.id));
  }

  // -- Entries: emails and notes become activities
  for (const e of entries) {
    if (e.type !== "email" && e.type !== "note") {
      report.skipped.push({ kind: `entry:${e.type}`, id: e.id, label: e.subject ?? "", reason: "task history; tasks are imported from the task list" });
      continue;
    }
    const pids = [e.party?.id, ...(e.parties ?? []).map((p) => p.id)];
    if (pids.some((pid) => pid != null && sample.has(pid))) {
      report.skipped.push({ kind: `entry:${e.type}`, id: e.id, label: e.subject ?? "", reason: "on Capsule's sample record" });
      continue;
    }
    await upsertActivity(e.type, e.id, mapEntry(e), links(pids, e.opportunity?.id, e.kase?.id));
  }

  // -- Tasks
  for (const t of tasks) {
    if (t.party && sample.has(t.party.id)) {
      report.skipped.push({ kind: "task", id: t.id, label: t.description, reason: "Capsule onboarding task" });
      continue;
    }
    const kase = t.kase ? kaseById.get(t.kase.id) : undefined;
    const oppSource = t.opportunity?.id ?? kase?.opportunity?.id ?? null;
    const account = accountForParty(t.party?.id) ?? (oppSource != null ? oppAccount.get(oppSource) : null) ?? accountForParty(kase?.party?.id);
    if (!account && oppSource == null) report.warnings.push(`Task "${t.description}" has no account or opportunity`);
    const data = {
      ...mapTask(t),
      account: account ?? null,
      opportunity_id: oppSource != null ? (oppOf.get(oppSource) ?? null) : null,
      user: me,
      updatedBy: me,
    };
    await upsert(
      "task",
      t.id,
      () => db.crm_Accounts_Tasks.create({ data: { v: 0, ...data, createdBy: me }, select: { id: true } }),
      (id) => db.crm_Accounts_Tasks.update({ where: { id }, data }),
    );
  }

  // -- Summary
  const won = opps.filter((o) => o.milestone.name === "Won");
  const sumBetween = (from: string, to: string) =>
    won.filter((o) => o.closedOn && o.closedOn >= from && o.closedOn <= to).reduce((s, o) => s + (o.value?.amount ?? 0), 0);
  const out = {
    ...report,
    capsule: {
      organisations: parties.filter((p) => p.type === "organisation").length,
      people: parties.filter((p) => p.type === "person").length,
      opportunities: opps.length,
      won: won.length,
      lost: opps.filter((o) => o.milestone.name === "Lost").length,
      entries: entries.length,
      tasks: tasks.length,
      cases: kases.length,
      won_value_2025_26: sumBetween("2025-08-01", "2026-07-31"),
      won_value_2026_27: sumBetween("2026-08-01", "2027-07-31"),
    },
  };
  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
