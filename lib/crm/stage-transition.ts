import { prismadb } from "@/lib/prisma";
import { inngest } from "@/inngest/client";
import { applyStageOutcome } from "@/lib/okrhub/outcome";

// Single funnel-transition chokepoint: every action that writes
// crm_Opportunities.sales_stage calls this after its update so the
// timer engine (cadence/care) reacts to exactly one event shape.
export async function handleStageTransition(opts: {
  opportunityId: string;
  fromStage: string | null;
  toStage: string | null;
}): Promise<boolean> {
  const { opportunityId, fromStage, toStage } = opts;
  if (!toStage || toStage === fromStage) return false;

  await prismadb.crm_Opportunities.update({
    where: { id: opportunityId },
    data: { stage_entered_at: new Date() },
  });
  // OKR Hub fork (OKR-171): entering the Won stage marks the deal won.
  await applyStageOutcome({ opportunityId, fromStage, toStage });
  await inngest.send({
    name: "crm/opportunity.stage-changed",
    data: { record_id: opportunityId, to_stage: toStage },
  });
  return true;
}
