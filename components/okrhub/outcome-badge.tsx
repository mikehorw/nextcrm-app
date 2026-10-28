// OKR Hub fork (OKR-171): Won / Lost badge for an opportunity. Server-safe.

import { Badge } from "@/components/ui/badge";

export function OutcomeBadge({ status }: { status?: string | null }) {
  if (status === "CLOSED") {
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Won</Badge>;
  }
  if (status === "INACTIVE") return <Badge variant="destructive">Lost</Badge>;
  return null;
}
