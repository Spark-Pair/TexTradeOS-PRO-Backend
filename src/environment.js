export const IS_DEVELOPMENT =
  String(process.env.IS_DEVELOPMENT || "").trim().toLowerCase() === "true";
