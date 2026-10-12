// src/app/api/health/route.ts
import { NextResponse } from "next/server";
import { getAppDb } from "@/lib/app-db";
import { getHealthStatus } from "@/lib/health";

export async function GET() {
  const status = getHealthStatus(getAppDb());
  return NextResponse.json(status, {
    status: status.status === "ok" ? 200 : 503,
  });
}
