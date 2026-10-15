import { createHash, randomBytes } from "node:crypto";
import { pool, verifyPassword } from "./database.js";

const cookieName = "school_session";
const sessionDurationMs = 12 * 60 * 60 * 1000;
const loginAttempts = new Map();

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((part) => {
    const index = part.indexOf("=");
    if (index < 0) return ["", ""];
    try { return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())]; }
    catch { return ["", ""]; }
  }).filter(([name]) => name));
}

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    name: row.name || row.username,
    className: row.class_name || null,
    studentId: row.student_id || null,
    attendanceCode: row.attendance_code || null,
  };
}

export function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(JSON.stringify(value));
}

export function assertSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    if (new URL(origin).host === request.headers.host) return true;
  } catch {}
  throw Object.assign(new Error("Asal permintaan tidak diizinkan."), { status: 403 });
}

export async function readJsonBody(request, maxBytes = 8 * 1024 * 1024) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw Object.assign(new Error("Permintaan terlalu besar."), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Isi permintaan bukan JSON yang valid."), { status: 400 });
  }
}

export async function login(request, response, username, password) {
  const forwardedAddress = process.env.TRUST_PROXY === "true" ? request.headers["x-forwarded-for"]?.split(",")[0]?.trim() : null;
  const address = forwardedAddress || request.socket.remoteAddress || "unknown";
  const key = `${address}:${String(username || "").trim().toLowerCase().slice(0, 100)}`;
  const attempt = loginAttempts.get(key) || { count: 0, since: Date.now() };
  if (Date.now() - attempt.since > 15 * 60 * 1000) {
    attempt.count = 0;
    attempt.since = Date.now();
  }
  if (attempt.count >= 10) throw Object.assign(new Error("Terlalu banyak percobaan. Coba lagi 15 menit lagi."), { status: 429 });

  const result = await pool.query(
    `SELECT a.id, a.username, a.password_hash, a.role, a.student_id,
            s.name, s.class_name, s.attendance_code
     FROM accounts a LEFT JOIN students s ON s.id = a.student_id
     WHERE lower(a.username) = lower($1) AND a.active = true`,
    [String(username || "").trim().slice(0, 100)],
  );
  const account = result.rows[0];
  const passwordValid = account && await verifyPassword(String(password || ""), account.password_hash);
  if (!passwordValid) {
    attempt.count += 1;
    loginAttempts.set(key, attempt);
    throw Object.assign(new Error("Nama pengguna atau kata sandi salah."), { status: 401 });
  }
  loginAttempts.delete(key);

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionDurationMs);
  await pool.query(
    "INSERT INTO sessions (token_hash, account_id, expires_at) VALUES ($1, $2, $3)",
    [sha256(token), account.id, expiresAt],
  );
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader("Set-Cookie", `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(sessionDurationMs / 1000)}${secure}`);
  return publicUser(account);
}

export async function currentUser(request) {
  const token = parseCookies(request.headers.cookie)[cookieName];
  if (!token || token.length > 100) return null;
  const result = await pool.query(
    `SELECT a.id, a.username, a.role, a.student_id, s.name, s.class_name, s.attendance_code
     FROM sessions ss JOIN accounts a ON a.id = ss.account_id
     LEFT JOIN students s ON s.id = a.student_id
     WHERE ss.token_hash = $1 AND ss.expires_at > now() AND a.active = true`,
    [sha256(token)],
  );
  return result.rows[0] ? publicUser(result.rows[0]) : null;
}

export async function logout(request, response) {
  const token = parseCookies(request.headers.cookie)[cookieName];
  if (token) await pool.query("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader("Set-Cookie", `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
}

export function requireRole(user, role) {
  if (!user) throw Object.assign(new Error("Silakan masuk terlebih dahulu."), { status: 401 });
  if (role && user.role !== role) throw Object.assign(new Error("Kamu tidak memiliki akses untuk tindakan ini."), { status: 403 });
}
