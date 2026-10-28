import { Router } from "express";
import * as customers from "../customers.js";

const router = Router();

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
    res.json(name ? await customers.findCustomersByName(String(name)) : await customers.listCustomers());
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = parseId(req, res);
    if (id === null) return;
    const customer = await customers.getCustomerById(id);
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    res.json(customer);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const error = validateBody(req.body, { requireName: true });
    if (error) return res.status(400).json({ error });
    res.status(201).json(await customers.createCustomer(req.body));
  } catch (err) {
    next(err);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const id = parseId(req, res);
    if (id === null) return;
    const error = validateBody(req.body, { requireName: false });
    if (error) return res.status(400).json({ error });
    const customer = await customers.updateCustomer(id, req.body);
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    res.json(customer);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseId(req, res);
    if (id === null) return;
    const customer = await customers.deleteCustomer(id);
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    res.json(customer);
  } catch (err) {
    next(err);
  }
});

export default router;
