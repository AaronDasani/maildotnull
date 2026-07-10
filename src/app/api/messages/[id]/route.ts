import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const store = getStore();
  const email = store.get(id);
  if (!email) return NextResponse.json({ message: "Not found" }, { status: 404 });
  store.setRead(id, true);
  // Strip attachment contents from the detail payload; they are served separately.
  return NextResponse.json({
    ...email,
    read: true,
    attachments: email.attachments.map((a, index) => ({
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
      index,
    })),
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: { read?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.read !== "boolean") {
    return NextResponse.json({ message: "Expected { read: boolean }" }, { status: 400 });
  }
  if (!getStore().setRead(id, body.read)) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!getStore().remove(id)) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
