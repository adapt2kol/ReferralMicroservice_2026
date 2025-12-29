import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");

  const isEmbedRoute = pathname.startsWith("/embed");
  
  if (isEmbedRoute) {
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-ancestors *;"
    );
  } else {
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-ancestors 'self';"
    );
  }

  const isApiRoute = pathname.startsWith("/api");
  if (isApiRoute) {
    const origin = request.headers.get("origin");
    const adminUiOrigin = process.env.ADMIN_UI_ORIGIN;
    
    if (origin) {
      const allowedOrigins = [
        adminUiOrigin,
        process.env.NEXT_PUBLIC_BASE_URL,
      ].filter(Boolean);

      if (allowedOrigins.includes(origin) || !origin || origin === "null") {
        response.headers.set("Access-Control-Allow-Origin", origin);
        response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
        response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID");
        response.headers.set("Access-Control-Allow-Credentials", "true");
        response.headers.set("Access-Control-Max-Age", "86400");
      }
    }

    if (request.method === "OPTIONS") {
      return new NextResponse(null, {
        status: 204,
        headers: response.headers,
      });
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
