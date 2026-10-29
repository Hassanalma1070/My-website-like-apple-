import { Router } from "express";
import { authNotConfigured, isAuthConfigured, requireAuth, requireRole } from "../auth.js";
import { listSalesUsersWithCustomerCounts } from "../admin.js";
import { checkCredentials, session } from "./auth.js";

const router = Router();

// Separate from the sales login: only admin accounts get a token here
router.post("/login", async (req, res, next) => {
  try {
    if (!isAuthConfigured()) return authNotConfigured(res);
    const { user, status, error } = await checkCredentials(req.body);
    if (error) return res.status(status).json({ error });
    if (user.role !== "admin") return res.status(403).json({ error: "This account does not have admin access." });
    res.json(session(user));
  } catch (err) {
    next(err);
  }
});

router.get("/users", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    res.json(await listSalesUsersWithCustomerCounts());
  } catch (err) {
    next(err);
  }
});

export default router;
