import { NextResponse } from "next/server";

// Reminder delivery will be added by the scheduled worker. Keeping this
// endpoint explicit prevents an accidental client-triggered email send.
export async function POST() {
  return NextResponse.json(
    { error: "Email reminder delivery has not been enabled yet." },
    { status: 501 },
  );
}
