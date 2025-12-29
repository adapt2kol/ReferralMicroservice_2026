import { NextResponse } from "next/server";

interface HealthResponse {
  ok: boolean;
  service: string;
  ts: string;
}

export function GET(): NextResponse<HealthResponse> {
  return NextResponse.json({
    ok: true,
    service: "ReferralOS",
    ts: new Date().toISOString(),
  });
}
