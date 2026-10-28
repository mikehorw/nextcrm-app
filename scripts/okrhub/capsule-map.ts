// OKR Hub fork (OKR-172): pure mapping from a Capsule CRM export to NextCRM
// records. No database access here; capsule-import.ts does the writing.
// Mapping signed off on OKR-170.

export type CapsuleParty = {
  id: number;
  type: "person" | "organisation";
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  title?: string | null;
  jobTitle?: string | null;
  about?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  lastContactedAt?: string | null;
  organisation?: { id: number } | null;
  emailAddresses: { type: string | null; address: string }[];
  phoneNumbers: { type: string | null; number: string }[];
  addresses: { type?: string | null; street?: string | null; city?: string | null; state?: string | null; zip?: string | null; country?: string | null }[];
  websites: { service: string; address: string; url?: string | null }[];
  tags: { name: string }[];
  fields: { definition: { name: string }; value: unknown }[];
};

export type CapsuleOpportunity = {
  id: number;
  name: string;
  description?: string | null;
  createdAt: string;
  lastStageChangedAt?: string | null;
  expectedCloseOn?: string | null;
  closedOn?: string | null;
  value?: { amount: number; currency: string } | null;
  milestone: { name: string };
  lastOpenMilestone?: { name: string } | null;
  lostReason?: { name: string } | null;
  party?: { id: number; type: string; organisation?: { id: number } | null } | null;
  fields: { definition: { name: string }; value: unknown }[];
};

export type CapsuleEntry = {
  id: number;
  type: "email" | "note" | "task" | string;
  subject?: string | null;
  content?: string | null;
  entryAt: string;
  party?: { id: number } | null;
  parties?: { id: number }[] | null;
  participants?: unknown;
  opportunity?: { id: number } | null;
  kase?: { id: number } | null;
};

export type CapsuleTask = {
  id: number;
  description: string;
  detail?: string | null;
  dueOn?: string | null;
  status: "OPEN" | "COMPLETED" | string;
  completedAt?: string | null;
  createdAt: string;
  category?: { name: string } | null;
  party?: { id: number } | null;
  opportunity?: { id: number } | null;
  kase?: { id: number } | null;
};

export type CapsuleKase = {
  id: number;
  name: string;
  description?: string | null;
  status: string;
  createdAt: string;
  stage?: { name: string } | null;
  party?: { id: number } | null;
  opportunity?: { id: number } | null;
};

export type Skip = { kind: string; id: number; label: string; reason: string };

/** Capsule's own sample organisation, created with the account, plus its onboarding tasks. */
export function isCapsuleSample(p: CapsuleParty): boolean {
  return (
    p.type === "organisation" &&
    (p.name ?? "").trim().toLowerCase() === "capsule" &&
    p.emailAddresses.some((e) => e.address.toLowerCase().endsWith("@capsulecrm.com"))
  );
}

export const field = (fields: { definition: { name: string }; value: unknown }[], name: string) =>
  fields.filter((f) => f.definition.name === name).map((f) => f.value);

const firstOf = <T>(xs: T[], pick: (x: T) => boolean) => xs.find(pick) ?? null;
const clean = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim() : null);
const day = (s: string | null | undefined) => (s ? new Date(`${s.slice(0, 10)}T00:00:00.000Z`) : null);

function extraLines(fields: CapsuleParty["fields"], names: string[]) {
  return names
    .map((n) => {
      const v = field(fields, n)[0];
      return v === undefined || v === null || v === "" ? null : `${n}: ${v}`;
    })
    .filter(Boolean) as string[];
}

const joinText = (parts: (string | null | undefined)[]) =>
  parts.filter((p) => p && p.trim()).join("\n\n") || null;

export function mapAccount(p: CapsuleParty) {
  const addr = p.addresses[0];
  const street = addr?.street ?? clean(field(p.fields, "Street Address")[0]);
  const url = firstOf(p.websites, (w) => w.service === "URL");
  const employees = field(p.fields, "Number of Employees")[0];
  return {
    name: (p.name ?? "").trim(),
    email: p.emailAddresses[0]?.address ?? null,
    office_phone: p.phoneNumbers[0]?.number ?? clean(field(p.fields, "Phone")[0]),
    website: url ? (url.url ?? url.address) : null,
    billing_street: street ?? null,
    billing_city: addr?.city ?? null,
    billing_state: addr?.state ?? null,
    billing_postal_code: addr?.zip ?? null,
    billing_country: addr?.country ?? null,
    employees: employees === undefined || employees === null ? null : String(employees),
    industryName: clean(field(p.fields, "Industry")[0]),
    description: joinText([
      clean(p.about),
      extraLines(p.fields, ["Year Founded", "Total Funding", "Twitter URL"]).join("\n") || null,
    ]),
    tags: p.tags.map((t) => t.name),
    status: "Active",
    createdAt: new Date(p.createdAt),
  };
}

export function mapContact(p: CapsuleParty) {
  const work = firstOf(p.emailAddresses, (e) => e.type !== "Home") ?? null;
  const home = firstOf(p.emailAddresses, (e) => e.type === "Home");
  const mobile = firstOf(p.phoneNumbers, (n) => n.type === "Mobile");
  const office = firstOf(p.phoneNumbers, (n) => n.type !== "Mobile");
  const site = (service: string) => {
    const w = firstOf(p.websites, (x) => x.service === service);
    return w ? (w.url ?? w.address) : null;
  };
  return {
    first_name: clean(p.firstName),
    last_name: clean(p.lastName) ?? clean(p.firstName) ?? "(no name)",
    email: work?.address ?? null,
    personal_email: home && home !== work ? home.address : null,
    office_phone: office?.number ?? clean(field(p.fields, "Phone")[0]),
    mobile_phone: mobile?.number ?? null,
    position: clean(p.jobTitle),
    website: site("URL"),
    social_linkedin: site("LINKED_IN"),
    social_twitter: site("TWITTER") ?? clean(field(p.fields, "Twitter URL")[0]),
    social_facebook: site("FACEBOOK"),
    social_youtube: site("YOUTUBE"),
    description: joinText([
      clean(p.about),
      extraLines(p.fields, ["Headline", "Department", "Seniority"]).join("\n") || null,
    ]),
    tags: p.tags.map((t) => t.name),
    created_on: new Date(p.createdAt),
    cratedAt: new Date(p.createdAt),
    last_activity: p.lastContactedAt ? new Date(p.lastContactedAt) : null,
  };
}

export type OppOutcome = "won" | "lost" | "open";

export function opportunityOutcome(o: CapsuleOpportunity): OppOutcome {
  const m = o.milestone.name.trim().toLowerCase();
  if (m === "won") return "won";
  if (m === "lost") return "lost";
  return "open";
}

/** NextCRM stage name for a Capsule opportunity. Lost deals keep the stage they were lost at. */
export function opportunityStageName(o: CapsuleOpportunity): string {
  if (opportunityOutcome(o) === "lost") return o.lastOpenMilestone?.name ?? "Qualification";
  return o.milestone.name;
}

export function mapOpportunity(o: CapsuleOpportunity) {
  const outcome = opportunityOutcome(o);
  const closed = day(o.closedOn);
  const amount = o.value?.amount ?? 0;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    name: o.name.trim(),
    description: clean(o.description),
    budget: amount,
    expected_revenue: amount,
    currency: o.value?.currency ?? "GBP",
    close_date: closed ?? day(o.expectedCloseOn),
    created_on: new Date(o.createdAt),
    createdAt: new Date(o.createdAt),
    stage_entered_at: o.lastStageChangedAt ? new Date(o.lastStageChangedAt) : null,
    stageName: opportunityStageName(o),
    dealTypeName: str(field(o.fields, "Deal type")[0]),
    brand: str(field(o.fields, "Brand")[0]),
    service_lines: field(o.fields, "Service line").map(str).filter(Boolean) as string[],
    value_types: field(o.fields, "Value type").map(str).filter(Boolean) as string[],
    status: outcome === "won" ? "CLOSED" : outcome === "lost" ? "INACTIVE" : "ACTIVE",
    won_at: outcome === "won" ? closed : null,
    lost_at: outcome === "lost" ? closed : null,
    lost_reason: outcome === "lost" ? (o.lostReason?.name ?? null) : null,
  } as const;
}

export function mapEntry(e: CapsuleEntry) {
  const text = clean(e.content) ?? "";
  const firstLine = text.split("\n").find((l) => l.trim())?.trim() ?? "";
  const title = clean(e.subject) ?? (firstLine ? firstLine.slice(0, 120) : e.type === "email" ? "Email" : "Note");
  return {
    type: e.type === "email" ? ("email" as const) : ("note" as const),
    title,
    description: text || null,
    date: new Date(e.entryAt),
    status: "completed" as const,
    metadata: { source: "capsule", capsule_entry_id: e.id, participants: e.participants ?? null },
  };
}

export function mapTask(t: CapsuleTask) {
  return {
    title: t.description.trim(),
    content: clean(t.detail) ?? t.description.trim(),
    dueDateAt: day(t.dueOn) ?? new Date(t.createdAt),
    priority: "medium",
    taskStatus: t.status === "COMPLETED" ? ("COMPLETE" as const) : ("ACTIVE" as const),
    createdAt: new Date(t.createdAt),
  };
}

export function mapKaseNote(k: CapsuleKase) {
  return {
    type: "note" as const,
    title: `Capsule project: ${k.name}`,
    description: joinText([
      `Status: ${k.status}${k.stage?.name ? ` (stage: ${k.stage.name})` : ""}`,
      clean(k.description),
    ]),
    date: new Date(k.createdAt),
    status: "completed" as const,
    metadata: { source: "capsule", capsule_kase_id: k.id },
  };
}
