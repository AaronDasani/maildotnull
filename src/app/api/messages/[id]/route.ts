import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const store = getStore();
  const email = store.get(id);
  if (!email) return NextResponse.json({ message: "Not found" }, { status: 404 });
  store.markRead(id);
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

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!getStore().remove(id)) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
