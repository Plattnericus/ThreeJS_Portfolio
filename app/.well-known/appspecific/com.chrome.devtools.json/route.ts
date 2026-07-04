import { NextResponse } from "next/server";

// Chrome/Brave DevTools request this on localhost; answering it keeps the
// console free of 404 noise in development.
export function GET() {
  return NextResponse.json({});
}
