import { Router } from "express";
import * as users from "../users.js";
import { authNotConfigured, hashPassword, isAuthConfigured, requireAuth, signToken, verifyPassword } from "../auth.js";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
// bcrypt only uses the first 72 bytes of a password
const MAX_PASSWORD = 72;
// Compared against when the email is unknown, so a failed login takes the same time either way
let dummyHash;
const getDummyHash = async () => (dummyHash ??= await hashPassword("not-a-real-password"));

function validateCredentials(body, { requireName }) {
  if (!body || typeof body !== "object") return "Request body must be a JSON object";
  const { name, email, password } = body;
  if (requireName && (typeof name !== "string" || !name.trim())) return "name is required";
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) return "A valid email is required";
  if (typeof password !== "string" || !password) return "password is required";
  if (requireName && password.length < MIN_PASSWORD) return `password must be at least ${MIN_PASSWORD} characters`;
  if (Buffer.byteLength(password) > MAX_PASSWORD) return `password must be at most ${MAX_PASSWORD} bytes`;
  return null;
}

router.post("/register", async (req, res, next) => {
  try {
    if (!isAuthConfigured()) return authNotConfigured(res);
    const error = validateCredentials(req.body, { requireName: true });
    if (error) return res.status(400).json({ error });
    // role is never taken from the request; new users get the database default ('sales')
    const user = await users.createUser({
      name: req.body.name.trim(),
      email: req.body.email.trim(),
      passwordHash: await hashPassword(req.body.password),
    });
    res.status(201).json({ token: signToken(user), user });
  } catch (err) {
    if (err instanceof users.DuplicateEmailError) return res.status(409).json({ error: err.message });
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    if (!isAuthConfigured()) return authNotConfigured(res);
    const error = validateCredentials(req.body, { requireName: false });
    if (error) return res.status(400).json({ error });
    const found = await users.findUserByEmail(req.body.email.trim());
    const ok = await verifyPassword(req.body.password, found?.password_hash ?? (await getDummyHash()));
    if (!found || !ok) return res.status(401).json({ error: "Invalid email or password" });
    const { password_hash: _hash, ...user } = found;
    res.json({ token: signToken(user), user });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await users.getUserById(req.user.user_id);
    if (!user) return res.status(401).json({ error: "Account no longer exists. Log in again." });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

export default router;
