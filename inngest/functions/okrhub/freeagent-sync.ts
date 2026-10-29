// OKR Hub fork (OKR-174): daily FreeAgent revenue sync (06:30 UTC), skipped if not connected.
import { inngest } from "@/inngest/client";
import { getConnection, syncFreeAgent } from "@/lib/okrhub/freeagent";

export const okrhubFreeAgentSync = inngest.createFunction(
  { id: "okrhub-freeagent-sync", name: "OKR Hub: FreeAgent revenue sync", triggers: [{ cron: "30 6 * * *" }] },
  async ({ step }) => {
    const connected = await step.run("check-connection", async () => !!(await getConnection()));
    if (!connected) return { skipped: "not connected" };
    return step.run("sync", () => syncFreeAgent());
  },
);
