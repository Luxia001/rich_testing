export {};

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        sessionId: string;
        expiresAt: string;
        rememberMe: boolean;
        role: "user" | "admin";
      };
    }
  }
}

