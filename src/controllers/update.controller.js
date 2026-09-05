import { checkForUpdate, requestUpdate } from "../updates.js";

export const UpdateController = {
  async status(req, res, next) {
    try {
      res.json(await checkForUpdate());
    } catch (error) {
      next(error);
    }
  },

  async install(req, res, next) {
    try {
      res.status(202).json(await requestUpdate());
    } catch (error) {
      next(error);
    }
  },
};
