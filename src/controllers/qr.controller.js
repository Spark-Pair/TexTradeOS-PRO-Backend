import { ArticleQrService } from "../services/qr.service.js";

export const QrController = {
  signArticle(req, res) {
    try {
      res.json({ code: ArticleQrService.create(req.body || {}) });
    } catch (error) {
      res.status(400).json({ message: error.message || "Could not create QR code" });
    }
  },

  verifyArticle(req, res) {
    try {
      res.json({ valid: true, ...ArticleQrService.verify(req.body?.code) });
    } catch {
      res.status(400).json({ valid: false, message: "This is not a genuine TexTradeOS article QR code." });
    }
  },
};
