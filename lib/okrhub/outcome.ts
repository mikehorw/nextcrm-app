// OKR Hub fork (OKR-171): won/lost handling.
//
// Meaning of status in this fork:
//   ACTIVE   = open deal
//   CLOSED   = won   (entered the Won stage; won_at set)
//   INACTIVE = lost  (Mark lost, kanban thumbs-down, or the stale-deal rule; lost_at set)
//
// Upstream reports already treat CLOSED as won, so keeping CLOSED for won only
// (the kill rule now marks deals INACTIVE) makes those reports correct too.

import { prismadb } from "@/lib/prisma";
import { LOST_REASONS } from "@/lib/okrhub/fields";

export const STALE_LOST_REASON = "Became Stale";

type StageLike = { name?: string | null; probability?: number | null } | null | undefined;

/** The Won stage: named "Won", or any stage at 100% probability. */
export function isWonStage(stage: StageLike): boolean {
  if (!stage) return false;
  if ((stage.name ?? "").trim().toLowerCase() === "won") return true;
  return (stage.probability ?? 0) >= 100;
}

type OutcomeState = {
  status?: string | null;
  won_at?: Date | null;
};

/**
 * Fields to write when a deal moves between stages. Returns null when nothing
 * changes. Entering Won marks it won (and sets close_date to the win date, so
 * "close date" and "won date" agree). Leaving Won, or moving a lost deal to
 * another stage, reopens it.
 */
export function outcomeForStageMove(
  current: OutcomeState,
  fromWon: boolean,
  toWon: boolean,
  now: Date = new Date(),
): Record<string, unknown> | null {
  if (toWon) {
    if (current.status === "CLOSED" && current.won_at) return null;
    return {
      status: "CLOSED",
      won_at: current.won_at ?? now,
      close_date: current.won_at ?? now,
      lost_at: null,
      lost_reason: null,
    };
  }
  if (fromWon || current.status === "CLOSED" || current.status === "INACTIVE") {
    return { status: "ACTIVE", won_at: null, lost_at: null, lost_reason: null };
  }
  return null;
}

/** Fields that mark a deal lost. Unknown reasons are dropped, not stored. */
export function lostData(reason: string | null | undefined, now: Date = new Date()) {
  const valid =
    reason && (LOST_REASONS as readonly string[]).includes(reason) ? reason : null;
  return { status: "INACTIVE" as const, lost_at: now, lost_reason: valid, won_at: null };
}

/**
 * Called from the upstream stage-transition chokepoint after any stage write.
 * Applies won/reopen state for the move from `fromStage` to `toStage`.
 */
export async function applyStageOutcome(opts: {
  opportunityId: string;
  fromStage: string | null;
  toStage: string | null;
}): Promise<void> {
  const { opportunityId, fromStage, toStage } = opts;
  if (!toStage || toStage === fromStage) return;

  const ids = [fromStage, toStage].filter((x): x is string => !!x);
  const [stages, current] = await Promise.all([
    prismadb.crm_Opportunities_Sales_Stages.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, probability: true },
    }),
    prismadb.crm_Opportunities.findUnique({
      where: { id: opportunityId },
      select: { status: true, won_at: true },
    }),
  ]);
  if (!current) return;
  const byId = new Map(stages.map((s) => [s.id, s]));
  const data = outcomeForStageMove(
    current,
    isWonStage(fromStage ? byId.get(fromStage) : null),
    isWonStage(byId.get(toStage)),
  );
  if (!data) return;
  await prismadb.crm_Opportunities.update({ where: { id: opportunityId }, data });
}
