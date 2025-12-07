
// Agora route removed — Agora functionality disabled.
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Agora functionality has been removed" },
    { status: 410 }
  );
}
