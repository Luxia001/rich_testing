import type { ErrorRequestHandler } from "express";

export const notFoundHandler = (_request: unknown, response: import("express").Response) => {
  response.status(404).json({ error: "Not found" });
};

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  console.error("Request failed", error);
  response.status(500).json({ error: "Internal server error" });
};
