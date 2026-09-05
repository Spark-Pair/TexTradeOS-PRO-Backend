const parseBoolean = (value) => String(value || "").trim().toLowerCase() === "true";

const parseOrigins = (value) => String(value || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const env = Object.freeze({
  port: Number(process.env.PORT || 4000),
  appVersion: process.env.APP_VERSION || "0.0.0",
  isDevelopment: parseBoolean(process.env.IS_DEVELOPMENT),
  corsOrigins: parseOrigins(process.env.CORS_ORIGIN),
  databasePath: process.env.DATABASE_PATH || "./textradeos.sqlite",
});

export const isAllowedCorsOrigin = (origin) => {
  if (!origin || env.corsOrigins.includes("*") || env.corsOrigins.includes(origin)) return true;
  if (!env.isDevelopment) return false;

  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost"
      || hostname === "127.0.0.1"
      || hostname.startsWith("192.168.")
      || hostname.startsWith("10.")
      || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
  } catch {
    return false;
  }
};
