import { NextResponse, type NextRequest } from "next/server";

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function buildCorsHeaders(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin =
    allowedOrigins.length === 0 || allowedOrigins.includes(origin)
      ? origin || "*"
      : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      req.headers.get("Access-Control-Request-Headers") ||
      "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

export function proxy(req: NextRequest) {
  // Apply CORS to API routes so the frontend can call the backend from a different origin.
  if (!req.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const headers = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers });
  }

  const response = NextResponse.next({ headers });
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

export const config = {
  matcher: "/api/:path*",
};

