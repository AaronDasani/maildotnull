import { NextRequest, NextResponse } from "next/server";
import { ingestPostmarkMessage, type PostmarkMessage } from "@/lib/postmark";
import { applyHttpFault } from "@/lib/error-testing";

/**
 * Postmark — POST https://api.postmarkapp.com/email
 * Point the SDK at this server: `new postmark.ServerClient("mock", { requestHost: "localhost:8025", useHttps: false })`
 */
export async function POST(req: NextRequest) {
  let body: PostmarkMessage;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ErrorCode: 300, Message: "Invalid JSON body" }, { status: 422 });
  }
  const failure = await applyHttpFault("postmark");
  if (failure) return failure;

  const result = ingestPostmarkMessage(body);
  return NextResponse.json(result, { status: result.ErrorCode === 0 ? 200 : 422 });
}
