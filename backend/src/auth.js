import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const BCRYPT_COST = 10;
const ALGORITHM = "HS256";

export const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_COST);
// A malformed stored hash counts as a wrong password
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash).catch(() => false);

export const isAuthConfigured = () => Boolean(process.env.JWT_SECRET);

export function signToken(user) {
  return jwt.sign({ email: user.email, role: user.role }, process.env.JWT_SECRET, {
    algorithm: ALGORITHM,
    subject: String(user.user_id),
    expiresIn: process.env.JWT_EXPIRES_IN || "8h",
  });
}

export const authNotConfigured = (res) =>
  res.status(503).json({ error: "Authentication is not configured. Set JWT_SECRET in backend/.env and restart the server." });

// Sets req.user = { user_id, email, role } from a valid "Authorization: Bearer <token>" header
export function requireAuth(req, res, next) {
  if (!isAuthConfigured()) return authNotConfigured(res);
  const [scheme, token] = (req.get("authorization") || "").split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Authentication required. Send Authorization: Bearer <token>." });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: [ALGORITHM] });
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) throw new Error("Invalid subject");
    req.user = { user_id: userId, email: payload.email, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token. Log in again." });
  }
}
