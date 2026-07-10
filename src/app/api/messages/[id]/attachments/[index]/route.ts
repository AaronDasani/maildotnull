import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; index: string }> }
) {
  const { id, index } = await ctx.params;
  const attachment = getStore().get(id)?.attachments[Number(index)];
  if (!attachment) return NextResponse.json({ message: "Not found" }, { status: 404 });
  return new NextResponse(Buffer.from(attachment.content, "base64"), {
    headers: {
      "Content-Type": attachment.contentType,
      "Content-Disposition": `attachment; filename="${attachment.filename.replace(/"/g, "")}"`,
    },
  });
}
