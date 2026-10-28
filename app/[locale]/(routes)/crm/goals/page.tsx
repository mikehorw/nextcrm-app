// OKR Hub fork (OKR-171): revenue goals page.
import { redirect } from "next/navigation";
import Container from "../../components/ui/Container";
import { requireAuthenticated, isManagerOrAdmin, AuthenticationError } from "@/lib/authz";
import { getGoalsWithProgress } from "@/actions/okrhub/goals";
import { GoalsBoard } from "@/components/okrhub/goals-board";

export const dynamic = "force-dynamic";

const GoalsPage = async () => {
  let user;
  try {
    user = await requireAuthenticated();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/sign-in");
    throw e;
  }
  const goals = await getGoalsWithProgress();
  return (
    <Container
      title="Goals"
      description="Revenue targets, measured as the value of opportunities won in each period"
    >
      <GoalsBoard goals={goals} canEdit={isManagerOrAdmin(user)} />
    </Container>
  );
};

export default GoalsPage;
