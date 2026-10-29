import express from "express";
import { database } from "./config/database.ts";
import { authRouter } from "./features/auth/auth.routes.ts";
import { adminRouter } from "./features/admin/admin.routes.ts";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.ts";
import { sendApiError } from "./utils/api-error.ts";
import { openApiSpec } from "./openapi.ts";

export const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

app.get("/", (_request, response) => {
  response.status(200).json({ name: "be_login API", status: "ready", health: "/health" });
});

app.get("/health", async (_request, response) => {
  try {
    await database.$queryRaw`SELECT 1`;
    response.status(200).json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("Health check failed: MySQL is unavailable", error);
    response.status(503).json({ status: "error", database: "unavailable" });
  }
});

app.get("/openapi.json", (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.json(openApiSpec);
});

app.get("/docs", (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>be_login API — Swagger UI</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css" />
    <style>body { margin: 0; } .topbar { display: none; }</style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js"></script>
    <script>
      SwaggerUIBundle({
        url: './openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        withCredentials: true,
        persistAuthorization: false,
        presets: [SwaggerUIBundle.presets.apis],
        layout: 'BaseLayout'
      });
    </script>
  </body>
</html>`);
});
app.use(["/auth", "/admin"], (request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.get("origin");
    const allowed = (process.env.FRONTEND_ORIGINS ?? "http://localhost:4200,http://127.0.0.1:4200").split(",").map(value => value.trim());
    if (origin && !allowed.includes(origin) && origin !== `${request.protocol}://${request.get("host")}`) {
      sendApiError(response, 403, "ORIGIN_NOT_ALLOWED", "Origin not allowed");
      return;
    }
  }
  next();
});
app.use("/auth", authRouter);
app.use("/admin", adminRouter);
app.use(notFoundHandler);
app.use(errorHandler);

