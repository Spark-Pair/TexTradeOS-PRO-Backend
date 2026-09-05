import "dotenv/config";
import app from "./app.js";
import { env } from "./config/environment.js";

const server = app.listen(env.port, () => {
  console.log(`TexTradeOS PRO Backend running on http://localhost:${env.port}`);
});

const shutdown = (signal) => {
  console.log(`${signal} received. Shutting down...`);
  server.close((error) => {
    if (error) {
      console.error("Failed to shut down cleanly", error);
      process.exitCode = 1;
    }
  });
};

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
