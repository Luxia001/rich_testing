import { app } from "./app.ts";
import { database } from "./config/database.ts";
import { env } from "./config/env.ts";

const server = app.listen(env.port, "0.0.0.0", () => {
  console.log(`API listening on http://localhost:${env.port}`);
  console.log(`Prisma on http://localhost:${env.port}/docs`);
});

function shutdown(): void {
  server.close(
    () => void database.$disconnect().finally(() => process.exit(0)),
  );
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
