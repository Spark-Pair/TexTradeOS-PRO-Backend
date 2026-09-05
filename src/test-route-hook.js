import express from "express";

const originalUse = express.application.use;
let testRouteRegistered = false;

express.application.use = function patchedUse(...args) {
  if (!testRouteRegistered) {
    testRouteRegistered = true;
    this.get("/test", (req, res) => {
      res.json({
        ok: true,
        message: "ChatGPT backend test route is working",
      });
    });
  }

  return originalUse.apply(this, args);
};
