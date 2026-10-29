import type { Request, Response, NextFunction } from "express";
import { listRecentSessions } from "./admin.service.ts";

export async function sessions(_request: Request, response: Response, next: NextFunction) {
  try {
    response.json({ sessions: await listRecentSessions() });
  } catch (error) {
    next(error);
  }
}
