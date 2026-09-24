import { NextResponse } from "next/server";

export const json = <T>(data: T, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export const errorJson = (message: string, status = 400, extra: Record<string, unknown> = {}) =>
  json({ error: message, ...extra }, status);
