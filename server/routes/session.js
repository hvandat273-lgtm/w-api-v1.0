import express from "express";

import { requireIdentity } from "../auth.js";

export function createSessionRouter(store) {
  const router = express.Router();

  router.get("/me", requireIdentity(store), (req, res) => {
    res.json(req.identity);
  });

  return router;
}
