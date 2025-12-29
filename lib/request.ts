import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  authenticateApiKey,
  extractBearerToken,
  hasScope,
  maskApiKey,
} from "@/lib/auth";
import type { AuthContext } from "@/lib/auth";

export interface ApiSuccessResponse<T> {
  ok: true;
  data: T;
  meta: {
    timestamp: string;
    requestId: string;
  };
}

export interface ApiErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: {
    timestamp: string;
    requestId: string;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface RequestContext {
  tenantId: string;
  apiKeyId: string;
  scopes: string[];
  requestId: string;
}

function generateRequestId(): string {
  return `req_${crypto.randomBytes(12).toString("hex")}`;
}

function log(
  level: "info" | "warn" | "error",
  requestId: string,
  message: string,
  data?: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    level,
    requestId,
    message,
    ...data,
  };
  console.log(JSON.stringify(logData));
}

export function successResponse<T>(
  data: T,
  requestId: string,
  status: number = 200
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    {
      ok: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
      },
    },
    { status }
  );
}

export function errorResponse(
  code: string,
  message: string,
  requestId: string,
  status: number = 400,
  details?: Record<string, unknown>
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        ...(details && { details }),
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
      },
    },
    { status }
  );
}

export type RouteHandler<T> = (
  request: NextRequest,
  context: RequestContext
) => Promise<NextResponse<ApiResponse<T>>>;

export interface HandlerResult<T> {
  ok: true;
  data: T;
  status?: number;
}

export interface HandlerError {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  status: number;
}

export type HandlerOutcome<T> = HandlerResult<T> | HandlerError;

export type SimpleHandler<T> = (
  ctx: RequestContext
) => Promise<HandlerOutcome<T>>;

export function withAuth<T>(
  request: NextRequest,
  requiredScopes: string[],
  handler: SimpleHandler<T>
): Promise<NextResponse<ApiResponse<T> | ApiErrorResponse>>;

export function withAuth<T>(
  requiredScope: string,
  handler: RouteHandler<T>
): (request: NextRequest) => Promise<NextResponse<ApiResponse<T> | ApiErrorResponse>>;

export function withAuth<T>(
  requestOrScope: NextRequest | string,
  scopesOrHandler: string[] | RouteHandler<T>,
  maybeHandler?: SimpleHandler<T>
): Promise<NextResponse<ApiResponse<T> | ApiErrorResponse>> | ((request: NextRequest) => Promise<NextResponse<ApiResponse<T> | ApiErrorResponse>>) {
  if (typeof requestOrScope === "string") {
    const requiredScope = requestOrScope;
    const handler = scopesOrHandler as RouteHandler<T>;
    return createAuthMiddleware(requiredScope, handler);
  }

  const request = requestOrScope;
  const requiredScopes = scopesOrHandler as string[];
  const handler = maybeHandler!;
  return executeWithAuth(request, requiredScopes, handler);
}

function createAuthMiddleware<T>(
  requiredScope: string,
  handler: RouteHandler<T>
): (request: NextRequest) => Promise<NextResponse<ApiResponse<T> | ApiErrorResponse>> {
  return async (request: NextRequest) => {
    const requestId = generateRequestId();
    const startTime = Date.now();

    try {
      const authHeader = request.headers.get("authorization");
      const rawKey = extractBearerToken(authHeader);

      if (!rawKey) {
        log("warn", requestId, "Missing API key", {
          path: request.nextUrl.pathname,
        });
        return errorResponse(
          "MISSING_API_KEY",
          "API key is required in Authorization header",
          requestId,
          401
        );
      }

      log("info", requestId, "Authenticating request", {
        path: request.nextUrl.pathname,
        method: request.method,
        keyPrefix: maskApiKey(rawKey),
      });

      const authResult = await authenticateApiKey(rawKey);

      if (!authResult.success) {
        log("warn", requestId, "Authentication failed", {
          code: authResult.code,
          keyPrefix: maskApiKey(rawKey),
        });
        return errorResponse(
          authResult.code,
          authResult.message,
          requestId,
          authResult.status
        );
      }

      const { context: authContext } = authResult;

      if (!hasScope(authContext, requiredScope)) {
        log("warn", requestId, "Insufficient permissions", {
          requiredScope,
          keyScopes: authContext.scopes,
        });
        return errorResponse(
          "INSUFFICIENT_PERMISSIONS",
          `This API key does not have the required scope: ${requiredScope}`,
          requestId,
          403,
          {
            required_scope: requiredScope,
            key_scopes: authContext.scopes,
          }
        );
      }

      const requestContext: RequestContext = {
        tenantId: authContext.tenantId,
        apiKeyId: authContext.apiKeyId,
        scopes: authContext.scopes,
        requestId,
      };

      log("info", requestId, "Request authorized", {
        tenantId: authContext.tenantId,
        scope: requiredScope,
      });

      const response = await handler(request, requestContext);

      const duration = Date.now() - startTime;
      log("info", requestId, "Request completed", {
        duration,
        status: response.status,
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      log("error", requestId, "Request failed", {
        duration,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return errorResponse(
        "INTERNAL",
        "An unexpected error occurred",
        requestId,
        500
      );
    }
  };
}

async function executeWithAuth<T>(
  request: NextRequest,
  requiredScopes: string[],
  handler: SimpleHandler<T>
): Promise<NextResponse<ApiResponse<T> | ApiErrorResponse>> {
  const requestId = generateRequestId();
  const startTime = Date.now();

  try {
    const authHeader = request.headers.get("authorization");
    const rawKey = extractBearerToken(authHeader);

    if (!rawKey) {
      log("warn", requestId, "Missing API key", {
        path: request.nextUrl.pathname,
      });
      return errorResponse(
        "MISSING_API_KEY",
        "API key is required in Authorization header",
        requestId,
        401
      );
    }

    log("info", requestId, "Authenticating request", {
      path: request.nextUrl.pathname,
      method: request.method,
      keyPrefix: maskApiKey(rawKey),
    });

    const authResult = await authenticateApiKey(rawKey);

    if (!authResult.success) {
      log("warn", requestId, "Authentication failed", {
        code: authResult.code,
        keyPrefix: maskApiKey(rawKey),
      });
      return errorResponse(
        authResult.code,
        authResult.message,
        requestId,
        authResult.status
      );
    }

    const { context: authContext } = authResult;

    const hasRequiredScope = requiredScopes.some((scope) =>
      hasScope(authContext, scope)
    );

    if (!hasRequiredScope) {
      log("warn", requestId, "Insufficient permissions", {
        requiredScopes,
        keyScopes: authContext.scopes,
      });
      return errorResponse(
        "INSUFFICIENT_PERMISSIONS",
        `This API key does not have any of the required scopes: ${requiredScopes.join(", ")}`,
        requestId,
        403,
        {
          required_scopes: requiredScopes,
          key_scopes: authContext.scopes,
        }
      );
    }

    const requestContext: RequestContext = {
      tenantId: authContext.tenantId,
      apiKeyId: authContext.apiKeyId,
      scopes: authContext.scopes,
      requestId,
    };

    log("info", requestId, "Request authorized", {
      tenantId: authContext.tenantId,
      scopes: requiredScopes,
    });

    const result = await handler(requestContext);

    const duration = Date.now() - startTime;

    if (result.ok) {
      log("info", requestId, "Request completed", {
        duration,
        status: result.status ?? 200,
      });
      return successResponse(result.data, requestId, result.status ?? 200);
    } else {
      log("warn", requestId, "Request failed with error", {
        duration,
        code: result.error.code,
        status: result.status,
      });
      return errorResponse(
        result.error.code,
        result.error.message,
        requestId,
        result.status,
        result.error.details
      );
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    log("error", requestId, "Request failed", {
      duration,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return errorResponse(
      "INTERNAL",
      "An unexpected error occurred",
      requestId,
      500
    );
  }
}

export async function parseJsonBody<T>(
  request: NextRequest,
  requestId: string
): Promise<{ success: true; data: T } | { success: false; response: NextResponse<ApiErrorResponse> }> {
  try {
    const body = await request.json();
    return { success: true, data: body as T };
  } catch {
    return {
      success: false,
      response: errorResponse(
        "INVALID_REQUEST",
        "Request body must be valid JSON",
        requestId,
        400
      ),
    };
  }
}
