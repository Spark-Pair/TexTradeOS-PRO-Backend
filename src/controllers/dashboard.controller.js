import { DashboardService } from "../services/dashboard.service.js";

export const DashboardController = {
  trend(req, res) {
    try {
      res.json(DashboardService.trend(req.user.business_id, req.query.date_from, req.query.date_to));
    } catch (error) {
      res.status(error.status || 500).json({ message: error.message || "Dashboard request failed" });
    }
  },
};
