// OKR Hub fork (OKR-171, OKR-174): revenue goals page.
import { redirect } from "next/navigation";
import Container from "../../components/ui/Container";
import { requireAuthenticated, isManagerOrAdmin, AuthenticationError } from "@/lib/authz";
import { getGoalsWithProgress } from "@/actions/okrhub/goals";
import { getFreeAgentStatus } from "@/actions/okrhub/freeagent";
import { GoalsBoard } from "@/components/okrhub/goals-board";
import { FreeAgentPanel } from "@/components/okrhub/freeagent-panel";
import { getGoalsCharts } from "@/actions/okrhub/charts";
import { GoalsCharts } from "@/components/okrhub/goals-charts";

export const dynamic = "force-dynamic";

const GoalsPage = async (props: { searchParams: Promise<{ freeagent?: string }> }) => {
  let user;
  try {
    user = await requireAuthenticated();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/sign-in");
    throw e;
  }
  const { freeagent } = await props.searchParams;
  const canEdit = isManagerOrAdmin(user);
  const [goals, faStatus, charts] = await Promise.all([
    getGoalsWithProgress(),
    canEdit ? getFreeAgentStatus() : Promise.resolve(null),
    canEdit ? getGoalsCharts() : Promise.resolve(null),
  ]);
  return (
    <Container
      title="Goals"
      description="Revenue targets: invoiced revenue from FreeAgent and deals won in the CRM, for each period"
    >
      <div className="space-y-6">
        <GoalsBoard goals={goals} canEdit={canEdit} />
        {charts && <GoalsCharts data={charts} />}
        {faStatus && <FreeAgentPanel status={faStatus} notice={freeagent} />}
      </div>
    </Container>
  );
};

export default GoalsPage;
