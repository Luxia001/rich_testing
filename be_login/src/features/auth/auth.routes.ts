import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as authController from "./auth.controller.ts";
import { requireAuth } from "../../middleware/auth.middleware.ts";
import { sendApiError } from "../../utils/api-error.ts";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_request, response) => sendApiError(response, 429, "RATE_LIMITED", "Too many authentication attempts. Please try again later."),
});

// Refresh is normal session traffic and must not consume the login-attempt budget.
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_request, response) => sendApiError(response, 429, "RATE_LIMITED", "Too many refresh requests. Please try again later."),
});
authRouter.post("/register", authLimiter, authController.register);
authRouter.post("/login", authLimiter, authController.login);
authRouter.post("/refresh", refreshLimiter, authController.refresh);
authRouter.post("/logout", authController.logout);
authRouter.get("/me", requireAuth, authController.me);


