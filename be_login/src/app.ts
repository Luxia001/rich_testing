import express from "express";
import { database } from "./config/database.ts";
import { authRouter } from "./features/auth/auth.routes.ts";
import { adminRouter } from "./features/admin/admin.routes.ts";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.ts";

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
app.use(["/auth", "/admin"], (request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.get("origin");
    const allowed = (process.env.FRONTEND_ORIGINS ?? "http://localhost:4200,http://127.0.0.1:4200").split(",").map(value => value.trim());
    if (origin && !allowed.includes(origin) && origin !== `${request.protocol}://${request.get("host")}`) {
      response.status(403).json({ error: "Origin not allowed" });
      return;
    }
  }
  next();
});
app.use("/auth", authRouter);
app.use("/admin", adminRouter);
app.use(notFoundHandler);
app.use(errorHandler);

