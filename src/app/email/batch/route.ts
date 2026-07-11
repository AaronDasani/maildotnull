import { NextRequest, NextResponse } from "next/server";
import { ingestPostmarkMessage, type PostmarkMessage } from "@/lib/postmark";
import { applyHttpFault } from "@/lib/error-testing";

/** Postmark batch — POST https://api.postmarkapp.com/email/batch */
export async function POST(req: NextRequest) {
  let body: PostmarkMessage[];
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ErrorCode: 300, Message: "Invalid JSON body" }, { status: 422 });
  }
  if (!Array.isArray(body)) {
    return NextResponse.json({ ErrorCode: 300, Message: "Expected an array" }, { status: 422 });
  }
  const failure = await applyHttpFault("postmark");
  if (failure) return failure;

  return NextResponse.json(body.map(ingestPostmarkMessage));
}
