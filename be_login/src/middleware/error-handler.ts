import type { ErrorRequestHandler } from "express";
import { sendApiError } from "../utils/api-error.ts";

export const notFoundHandler = (_request: unknown, response: import("express").Response) => {
  sendApiError(response, 404, "NOT_FOUND", "Not found");
};

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  console.error("Request failed", error);
  sendApiError(response, 500, "INTERNAL_SERVER_ERROR", "Internal server error");
};
