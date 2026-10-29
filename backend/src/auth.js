import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getTokenVersion } from "./users.js";

const BCRYPT_COST = 10;
const ALGORITHM = "HS256";

export const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_COST);
// A malformed stored hash counts as a wrong password
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash).catch(() => false);

export const isAuthConfigured = () => Boolean(process.env.JWT_SECRET);

// ver is the user's token_version; changing the password bumps it and invalidates older tokens
export function signToken(user) {
  return jwt.sign({ email: user.email, role: user.role, ver: user.token_version }, process.env.JWT_SECRET, {
    algorithm: ALGORITHM,
    subject: String(user.user_id),
    expiresIn: process.env.JWT_EXPIRES_IN || "8h",
  });
}

export const authNotConfigured = (res) =>
  res.status(503).json({ error: "Authentication is not configured. Set JWT_SECRET in backend/.env and restart the server." });

const invalidToken = (res) => res.status(401).json({ error: "Invalid or expired token. Log in again." });

// Sets req.user = { user_id, email, role } from a valid "Authorization: Bearer <token>" header
export async function requireAuth(req, res, next) {
  if (!isAuthConfigured()) return authNotConfigured(res);
  const [scheme, token] = (req.get("authorization") || "").split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Authentication required. Send Authorization: Bearer <token>." });
  }
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: [ALGORITHM] });
  } catch {
    return invalidToken(res);
  }
  const userId = Number(payload.sub);
  if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(payload.ver)) return invalidToken(res);
  try {
    // A deleted user or a password change since the token was issued both end the session
    if ((await getTokenVersion(userId)) !== payload.ver) return invalidToken(res);
  } catch (err) {
    return next(err);
  }
  req.user = { user_id: userId, email: payload.email, role: payload.role };
  next();
}
