import { Router } from "express";
import * as customers from "../customers.js";
import { listCustomerDeals } from "../deals.js";
import { requireAuth, requireRole } from "../auth.js";

const router = Router();
// Only sales users own customers; admins get 403
router.use(requireAuth, requireRole("sales"));

function parseId(req, res) {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id must be a positive integer" });
    return null;
  }
  return id;
}

function validateBody(body, { requireName }) {
  if (!body || typeof body !== "object") return "Request body must be a JSON object";
  if (requireName && (typeof body.name !== "string" || !body.name.trim())) return "name is required";
  for (const key of ["name", "email", "phone"]) {
    if (body[key] !== undefined && body[key] !== null && typeof body[key] !== "string") {
      return `${key} must be a string`;
    }
  }
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return "email is not valid";
  return null;
}

router.get("/", async (req, res, next) => {
  try {
    const { name } = req.query;
    res.json(name ? await customers.findCustomersByName(req.user.user_id, String(name)) : await customers.listCustomers(req.user.user_id));
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = parseId(req, res);
    if (id === null) return;
    const customer = await customers.getCustomerById(req.user.user_id, id);
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    res.json(customer);
  } catch (err) {
    next(err);
  }
});

router.get("/:id/deals", async (req, res, next) => {
  try {
    const id = parseId(req, res);
    if (id === null) return;
    const deals = await listCustomerDeals(req.user.user_id, id);
    if (!deals) return res.status(404).json({ error: "Customer not found" });
    res.json(deals);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const error = validateBody(req.body, { requireName: true });
    if (error) return res.status(400).json({ error });
    res.status(201).json(await customers.createCustomer(req.user.user_id, req.body));
  } catch (err) {
    if (err instanceof customers.DuplicateCustomerEmailError) return res.status(409).json({ error: err.message });
    next(err);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const id = parseId(req, res);
    if (id === null) return;
    const error = validateBody(req.body, { requireName: false });
    if (error) return res.status(400).json({ error });
    const customer = await customers.updateCustomer(req.user.user_id, id, req.body);
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    res.json(customer);
  } catch (err) {
    if (err instanceof customers.DuplicateCustomerEmailError) return res.status(409).json({ error: err.message });
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseId(req, res);
    if (id === null) return;
    const customer = await customers.deleteCustomer(req.user.user_id, id);
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    res.json(customer);
  } catch (err) {
    next(err);
  }
});

export default router;
