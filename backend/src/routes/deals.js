import { Router } from "express";
import * as deals from "../deals.js";
import { requireAuth, requireRole } from "../auth.js";
import { STAGES, validateDealInput } from "../dealValidation.js";
import { validTimeZone } from "../exportFilters.js";

const router = Router();
// Deals belong to sales users, like customers; admins get 403
router.use(requireAuth, requireRole("sales"));

const MAX_Q = 200;

function parseId(req, res) {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id must be a positive integer" });
    return null;
  }
  return id;
}

// Returns { filters, tz } or { error }
function parseListQuery(query) {
  const { stage, customer_id: customerId, q, tz } = query;
  if (stage !== undefined && stage !== "" && !["open", "closed", ...STAGES].includes(stage)) {
    return { error: `stage must be open, closed or one of ${STAGES.join(", ")}` };
  }
  let customer;
  if (customerId !== undefined && customerId !== "") {
    customer = Number(customerId);
    if (!Number.isInteger(customer) || customer <= 0) return { error: "customer_id must be a positive integer" };
  }
  if (q !== undefined && (typeof q !== "string" || q.length > MAX_Q)) return { error: `q must be at most ${MAX_Q} characters` };
  return {
    filters: { stage: stage || undefined, customerId: customer, q: q?.trim() || undefined },
    tz: validTimeZone(tz) ? tz : "UTC",
  };
}

router.get("/", async (req, res, next) => {
  try {
    const { filters, tz, error } = parseListQuery(req.query);
    if (error) return res.status(400).json({ error });
    const [list, summary] = await Promise.all([
      deals.listDeals(req.user.user_id, filters),
      deals.dealSummary(req.user.user_id, filters, tz),
    ]);
    res.json({ deals: list, summary });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = parseId(req, res);
    if (id === null) return;
    const deal = await deals.getDeal(req.user.user_id, id);
    if (!deal) return res.status(404).json({ error: "Deal not found" });
    res.json(deal);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { fields, error } = validateDealInput(req.body, { create: true });
    if (error) return res.status(400).json({ error });
    const deal = await deals.createDeal(req.user.user_id, fields);
    if (!deal) return res.status(404).json({ error: "Customer not found" });
    res.status(201).json(deal);
  } catch (err) {
    next(err);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const id = parseId(req, res);
    if (id === null) return;
    const { fields, error } = validateDealInput(req.body, { create: false });
    if (error) return res.status(400).json({ error });
    const deal = await deals.updateDeal(req.user.user_id, id, fields);
    if (!deal) return res.status(404).json({ error: "Deal not found" });
    res.json(deal);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseId(req, res);
    if (id === null) return;
    const deal = await deals.deleteDeal(req.user.user_id, id);
    if (!deal) return res.status(404).json({ error: "Deal not found" });
    res.json(deal);
  } catch (err) {
    next(err);
  }
});

export default router;
