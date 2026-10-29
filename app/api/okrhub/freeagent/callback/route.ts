// OKR Hub fork (OKR-174): FreeAgent OAuth callback. Stores tokens, then syncs once.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireRole, AuthenticationError, AuthorizationError } from "@/lib/authz";
import { exchangeCode, syncFreeAgent } from "@/lib/okrhub/freeagent";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (status: string) => NextResponse.redirect(new URL(`/crm/goals?freeagent=${status}`, req.url));
  let user;
  try {
    user = await requireRole(["manager", "admin"]);
  } catch (e) {
    if (e instanceof AuthenticationError || e instanceof AuthorizationError) return NextResponse.redirect(new URL("/", req.url));
    throw e;
  }
  const jar = await cookies();
  const expected = jar.get("okrhub_fa_state")?.value;
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!expected || !state || state !== expected || !code) return back("failed");
  try {
    await exchangeCode(code, user.id);
  } catch (e) {
    console.error("[FREEAGENT_CONNECT]", e);
    return back("failed");
  }
  try {
    await syncFreeAgent();
  } catch (e) {
    console.error("[FREEAGENT_FIRST_SYNC]", e);
  }
  const res = back("connected");
  res.cookies.delete({ name: "okrhub_fa_state", path: "/api/okrhub/freeagent" });
  return res;
}
