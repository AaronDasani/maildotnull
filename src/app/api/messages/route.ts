import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";

export async function GET() {
  return NextResponse.json(getStore().list());
}

export async function PATCH() {
  getStore().markAllRead();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  getStore().clear();
  return NextResponse.json({ ok: true });
}
