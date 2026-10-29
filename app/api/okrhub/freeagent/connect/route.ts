// OKR Hub fork (OKR-174): start the FreeAgent OAuth approval (managers and admins).
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireRole, AuthenticationError, AuthorizationError } from "@/lib/authz";
import { authorizeUrl, freeAgentConfigured } from "@/lib/okrhub/freeagent";

export async function GET(req: Request) {
  try {
    await requireRole(["manager", "admin"]);
  } catch (e) {
    if (e instanceof AuthenticationError || e instanceof AuthorizationError) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    throw e;
  }
  if (!freeAgentConfigured()) {
    return NextResponse.redirect(new URL("/crm/goals?freeagent=not-configured", req.url));
  }
  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("okrhub_fa_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/okrhub/freeagent",
    maxAge: 600,
  });
  return res;
}
