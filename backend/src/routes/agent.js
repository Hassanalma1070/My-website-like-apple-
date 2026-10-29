import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { chat } from "../agent.js";
import { requireAuth } from "../auth.js";

const router = Router();

router.post("/chat", requireAuth, async (req, res, next) => {
  const { message, history = [] } = req.body ?? {};
  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "message is required" });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: "The agent is not configured. Set ANTHROPIC_API_KEY in backend/.env and restart the server." });
  }
  if (!Array.isArray(history)) {
    return res.status(400).json({ error: "history must be an array" });
  }
  // Keep only well-formed text turns from the client
  const cleanHistory = history
    .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));

  try {
    res.json(await chat(message.trim(), cleanHistory, req.user));
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return res.status(500).json({ error: "Anthropic API key is missing or invalid. Set ANTHROPIC_API_KEY in backend/.env." });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: "Rate limited by the Anthropic API. Try again shortly." });
    }
    if (err instanceof Anthropic.APIError) {
      return res.status(502).json({ error: `Anthropic API error: ${err.message}` });
    }
    next(err);
  }
});

export default router;
