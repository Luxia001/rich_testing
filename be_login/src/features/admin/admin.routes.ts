import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.ts";
import * as adminController from "./admin.controller.ts";

export const adminRouter = Router();
adminRouter.get("/sessions", requireAuth, requireRole("admin"), adminController.sessions);
