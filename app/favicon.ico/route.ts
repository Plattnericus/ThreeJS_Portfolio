import { NextResponse } from "next/server";

// Browsers request /favicon.ico unconditionally; the real icon is /icon.svg.
// Redirecting keeps the console free of 404 noise.
export function GET(request: Request) {
  return NextResponse.redirect(new URL("/icon.svg", request.url), 308);
}
