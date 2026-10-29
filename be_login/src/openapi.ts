export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "be_login API",
    version: "1.0.0",
    description: "Authentication API. Keep accessToken in memory and use it as a Bearer token. The refresh token is an HttpOnly cookie.",
  },
  servers: [{ url: ".", description: "Current API base path (works directly or through the /api proxy)" }],
  tags: [
    { name: "System" },
    { name: "Auth" },
    { name: "Admin" },
  ],
  paths: {
    "/": {
      get: { tags: ["System"], summary: "API status", responses: { "200": { description: "API is ready" } } },
    },
    "/health": {
      get: { tags: ["System"], summary: "Health check", responses: {
        "200": { description: "API and database are available" },
        "503": { description: "Database is unavailable" },
      } },
    },
    "/auth/register": {
      post: {
        tags: ["Auth"], summary: "Register a user", description: "Optional endpoint; public registration is not required for the demo.",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/RegisterRequest" } } } },
        responses: {
          "201": {
            description: "User created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { user: { $ref: "#/components/schemas/User" } },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/ValidationError" }, "409": { $ref: "#/components/responses/EmailConflict" },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"], summary: "Login", description: "Returns an access token. With rememberMe=true, sets a rotating HttpOnly refresh cookie.",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/LoginRequest" } } } },
        responses: {
          "200": { description: "Login successful", headers: { "Set-Cookie": { description: "Refresh cookie when rememberMe=true; cleared otherwise.", schema: { type: "string" } } }, content: { "application/json": { schema: { $ref: "#/components/schemas/TokenResponse" } } } },
          "400": { $ref: "#/components/responses/ValidationError" }, "401": { $ref: "#/components/responses/InvalidCredentials" },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["Auth"], summary: "Refresh and rotate tokens", description: "Requires the HttpOnly refresh cookie. Reusing an older token revokes its session.",
        security: [{ RefreshCookie: [] }],
        responses: {
          "200": { description: "Tokens rotated", headers: { "Set-Cookie": { description: "Replaced refresh cookie.", schema: { type: "string" } } }, content: { "application/json": { schema: { $ref: "#/components/schemas/TokenResponse" } } } },
          "401": { $ref: "#/components/responses/RefreshError" }, "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"], summary: "Get current user", security: [{ BearerAuth: [] }],
        responses: {
          "200": {
            description: "Current user",
            content: { "application/json": { schema: { type: "object", properties: { user: { $ref: "#/components/schemas/User" } }, required: ["user"] } } },
          },
          "401": { $ref: "#/components/responses/AuthenticationError" },
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"], summary: "Logout", description: "Revokes the session identified by a signed access token and/or refresh cookie. Safe to repeat.",
        security: [{ BearerAuth: [] }, { RefreshCookie: [] }],
        responses: { "204": { description: "Session revoked and refresh cookie cleared" } },
      },
    },
    "/admin/sessions": {
      get: {
        tags: ["Admin"], summary: "List recent sessions", security: [{ BearerAuth: [] }],
        responses: {
          "200": {
            description: "Up to 100 recent sessions",
            content: { "application/json": { schema: { type: "object", properties: { sessions: { type: "array", items: { $ref: "#/components/schemas/AdminSession" } } }, required: ["sessions"] } } },
          },
          "401": { $ref: "#/components/responses/AuthenticationError" }, "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      RefreshCookie: { type: "apiKey", in: "cookie", name: "refresh_token" },
    },
    schemas: {
      User: {
        type: "object", required: ["id", "email", "displayName", "role"],
        properties: {
          id: { type: "string", format: "uuid" }, email: { type: "string", format: "email" },
          displayName: { type: "string" }, role: { type: "string", enum: ["user", "admin"] },
        },
      },
      LoginRequest: {
        type: "object", required: ["email", "password"],
        properties: { email: { type: "string", format: "email" }, password: { type: "string", format: "password" }, rememberMe: { type: "boolean", default: false } },
      },
      RegisterRequest: {
        type: "object", required: ["email", "password"],
        properties: { email: { type: "string", format: "email" }, password: { type: "string", minLength: 12, maxLength: 256 } },
      },
      TokenResponse: {
        type: "object", required: ["user", "accessToken", "accessExpiresAt", "sessionExpiresAt"],
        properties: {
          user: { $ref: "#/components/schemas/User" }, accessToken: { type: "string" },
          accessExpiresAt: { type: "string", format: "date-time" }, sessionExpiresAt: { type: "string", format: "date-time" },
        },
      },
      ApiError: {
        type: "object", required: ["error"],
        properties: { error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" } } } },
      },
      AdminSession: {
        type: "object", properties: {
          id: { type: "string", format: "uuid" }, userId: { type: "string", format: "uuid" }, email: { type: "string", format: "email" },
          rememberMe: { type: "boolean" }, createdAt: { type: "string", format: "date-time" }, expiresAt: { type: "string", format: "date-time" },
          revokedAt: { type: "string", format: "date-time", nullable: true }, ipAddress: { type: "string", nullable: true }, userAgent: { type: "string", nullable: true },
        },
      },
    },
    responses: {
      ValidationError: { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" }, example: { error: { code: "VALIDATION_ERROR", message: "Request is invalid" } } } } },
      EmailConflict: { description: "Email already exists", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
      InvalidCredentials: { description: "Email or password is incorrect", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" }, example: { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } } } } },
      AuthenticationError: { description: "Authentication failed or access token expired", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
      RefreshError: { description: "Refresh token invalid, expired, revoked, or reused", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
      Forbidden: { description: "Insufficient role", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
      RateLimited: { description: "Too many requests", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
    },
  },
} as const;
