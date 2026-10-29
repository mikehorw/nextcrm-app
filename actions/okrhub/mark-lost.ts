"use server";
// OKR Hub fork (OKR-171): mark an opportunity lost, with a Lost reason.

import { revalidatePath } from "next/cache";
import { prismadb } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import { lostData } from "@/lib/okrhub/outcome";
import { LOST_REASONS } from "@/lib/okrhub/fields";
import {
  requireAuthenticated,
  assertCanWriteOpportunity,
  AuthenticationError,
  AuthorizationError,
} from "@/lib/authz";

export async function markOpportunityLost(id: string, reason: string) {
  if (!id) return { error: "id is required" };
  if (!(LOST_REASONS as readonly string[]).includes(reason)) {
    return { error: "Choose a lost reason" };
  }

  let user;
  try {
    user = await requireAuthenticated();
  } catch (e) {
    if (e instanceof AuthenticationError) return { error: "Unauthorized" };
    throw e;
  }
  try {
    await assertCanWriteOpportunity(user, id);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: "Forbidden" };
    throw e;
  }

  const before = await prismadb.crm_Opportunities.findUnique({
    where: { id, deletedAt: null },
    select: { status: true, lost_reason: true },
  });
  if (!before) return { error: "Opportunity not found" };

  await prismadb.crm_Opportunities.update({
    where: { id },
    data: { ...lostData(reason), updatedBy: user.id },
  });
  await writeAuditLog({
    entityType: "opportunity",
    entityId: id,
    action: "updated",
    changes: [
      { field: "status", old: before.status, new: "INACTIVE" },
      { field: "lost_reason", old: before.lost_reason, new: reason },
    ],
    userId: user.id,
  });
  revalidatePath("/[locale]/(routes)/crm/opportunities", "page");
  revalidatePath("/[locale]/(routes)/crm/opportunities/[opportunityId]", "page");
  return { data: { id } };
}
