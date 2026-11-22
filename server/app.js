import cors from "cors";
import express from "express";
import { opponentForRound, parseRound } from "./opponents.js";

/** Creates an app without listening, with process storage supplied by the caller. */
export function createApp({ leaderboardStore }) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.get("/api/health", (_req, res) => res.json({ ok: true, service: "backpack-brawl" }));

  app.get("/api/opponents", (req, res) => {
    const requested = Number(req.query.latency ?? process.env.API_LATENCY ?? 1200);
    const latency = Number.isFinite(requested) ? Math.max(0, Math.min(5000, requested)) : 1200;
    setTimeout(() => {
      const round = parseRound(req.query.round);
      if (round === null) return res.status(400).json({ error: "round must be a positive whole number" });
      if (req.query.fail === "true" || process.env.API_FAIL === "true") {
        return res.status(503).json({ error: "The arena gates are shut. No challenger answered the call." });
      }
      res.json(opponentForRound(round));
    }, latency);
  });

  app.get("/api/leaderboard", (_req, res) => {
    res.json({ entries: leaderboardStore.list() });
  });

  app.post("/api/leaderboard", (req, res) => {
    // The store owns normalization, validation and conflicts. This snapshot only
    // distinguishes creation from an idempotent retry, without changing its API.
    const previousIds = new Set(leaderboardStore.list().map((entry) => entry.runId));
    const entry = leaderboardStore.submit(req.body);
    res.status(previousIds.has(entry.runId) ? 200 : 201).json({ entry });
  });

  app.use((error, _req, res, _next) => {
    if (error.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Request body must contain valid JSON." });
    }
    if (error.status === 400 || error.status === 409) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ error: "An unexpected server error occurred." });
  });

  return app;
}
