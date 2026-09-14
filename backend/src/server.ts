import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./core/logger.js";
import { closeDb } from "./core/prisma.js";

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(`API đang chạy tại http://localhost:${env.PORT}/api (NODE_ENV=${env.NODE_ENV})`);
});

async function shutdown(signal: string) {
  logger.info(`Nhận ${signal}, đang tắt...`);
  server.close(async () => {
    await closeDb();
    process.exit(0);
  });
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
