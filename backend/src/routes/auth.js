import { Router } from "express";
import * as users from "../users.js";
import { authNotConfigured, hashPassword, isAuthConfigured, requireAuth, signToken, verifyPassword } from "../auth.js";
import { consumeResetToken, createResetLink, sendPasswordResetLink } from "../passwordResets.js";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
// bcrypt only uses the first 72 bytes of a password
const MAX_PASSWORD = 72;
const FORGOT_MESSAGE = "If that email is registered, a password reset link has been sent.";
// Compared against when the email is unknown, so a failed login takes the same time either way
let dummyHash;
const getDummyHash = async () => (dummyHash ??= await hashPassword("not-a-real-password"));

const isEmail = (email) => typeof email === "string" && EMAIL_RE.test(email.trim());
const isObject = (body) => body && typeof body === "object";

// Rules for a password being set (register, change, reset)
function newPasswordError(password, field = "password") {
  if (typeof password !== "string" || !password) return `${field} is required`;
  if (password.length < MIN_PASSWORD) return `${field} must be at least ${MIN_PASSWORD} characters`;
  if (Buffer.byteLength(password) > MAX_PASSWORD) return `${field} must be at most ${MAX_PASSWORD} bytes`;
  return null;
}

function validateCredentials(body, { requireName }) {
  if (!isObject(body)) return "Request body must be a JSON object";
  const { name, email, password } = body;
  if (requireName && (typeof name !== "string" || !name.trim())) return "name is required";
  if (!isEmail(email)) return "A valid email is required";
  if (requireName) return newPasswordError(password);
  if (typeof password !== "string" || !password) return "password is required";
  if (Buffer.byteLength(password) > MAX_PASSWORD) return `password must be at most ${MAX_PASSWORD} bytes`;
  return null;
}

export const session = (user) => ({ token: signToken(user), user: users.publicUser(user) });

// Shared by the sales and admin logins. Returns { user } or { status, error }.
// Callers check the role only after this succeeds, so a role is never revealed without the password.
export async function checkCredentials(body) {
  const error = validateCredentials(body, { requireName: false });
  if (error) return { status: 400, error };
  const found = await users.findUserByEmail(body.email.trim());
  const ok = await verifyPassword(body.password, found?.password_hash ?? (await getDummyHash()));
  if (!found || !ok) return { status: 401, error: "Invalid email or password" };
  return { user: found };
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
    res.status(201).json(session(user));
  } catch (err) {
    if (err instanceof users.DuplicateEmailError) return res.status(409).json({ error: err.message });
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    if (!isAuthConfigured()) return authNotConfigured(res);
    const { user, status, error } = await checkCredentials(req.body);
    if (error) return res.status(status).json({ error });
    if (user.role === "admin") return res.status(403).json({ error: "Admin accounts sign in on the admin login page." });
    res.json(session(user));
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await users.getUserById(req.user.user_id);
    if (!user) return res.status(401).json({ error: "Account no longer exists. Log in again." });
    res.json(users.publicUser(user));
  } catch (err) {
    next(err);
  }
});

// Returns a fresh token: the password change signs out every older token, including the one used here
router.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = isObject(req.body) ? req.body : {};
    if (typeof currentPassword !== "string" || !currentPassword) return res.status(400).json({ error: "currentPassword is required" });
    const error = newPasswordError(newPassword, "newPassword");
    if (error) return res.status(400).json({ error });
    if (newPassword === currentPassword) return res.status(400).json({ error: "newPassword must be different from the current password" });

    const found = await users.findUserWithHashById(req.user.user_id);
    if (!found || !(await verifyPassword(currentPassword, found.password_hash))) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }
    const user = await users.setPassword(found.user_id, await hashPassword(newPassword));
    res.json(session(user));
  } catch (err) {
    next(err);
  }
});

// Always answers the same way, so it cannot be used to discover which emails are registered
router.post("/forgot-password", async (req, res, next) => {
  try {
    const email = isObject(req.body) ? req.body.email : undefined;
    if (!isEmail(email)) return res.status(400).json({ error: "A valid email is required" });
    const user = await users.findUserByEmail(email.trim());
    if (user) {
      const reset = await createResetLink(user);
      if (reset) await sendPasswordResetLink(user, reset.link);
    }
    res.status(202).json({ message: FORGOT_MESSAGE });
  } catch (err) {
    next(err);
  }
});

router.post("/reset-password", async (req, res, next) => {
  try {
    const { token, newPassword } = isObject(req.body) ? req.body : {};
    if (typeof token !== "string" || !token) return res.status(400).json({ error: "token is required" });
    const error = newPasswordError(newPassword, "newPassword");
    if (error) return res.status(400).json({ error });
    if (!(await consumeResetToken(token, await hashPassword(newPassword)))) {
      return res.status(400).json({ error: "This reset link is invalid or has expired. Request a new one." });
    }
    res.json({ message: "Your password has been reset. Sign in with your new password." });
  } catch (err) {
    next(err);
  }
});

export default router;
