import pg from "pg";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const { Pool } = pg;
const scrypt = promisify(scryptCallback);
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL wajib diisi untuk menghubungkan PostgreSQL.");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password, stored) {
  const [algorithm, saltText, hashText] = (stored || "").split("$");
  if (algorithm !== "scrypt" || !saltText || !hashText) return false;
  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(hashText, "base64url");
  const actual = await scrypt(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS students (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      class_name TEXT NOT NULL,
      attendance_code TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'student')),
      student_id UUID UNIQUE REFERENCES students(id) ON DELETE CASCADE,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK ((role = 'student') = (student_id IS NOT NULL))
    );
    CREATE TABLE IF NOT EXISTS attendance (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      attendance_date DATE NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('Hadir', 'Izin', 'Sakit')),
      note TEXT NOT NULL DEFAULT '',
      proof_name TEXT,
      proof_mime TEXT,
      proof_bytes BYTEA,
      recorded_by UUID REFERENCES accounts(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (student_id, attendance_date)
    );
    CREATE INDEX IF NOT EXISTS attendance_date_idx ON attendance(attendance_date DESC);
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
  `);

  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (username && password) {
    if (password.length < 12) throw new Error("ADMIN_PASSWORD harus memiliki minimal 12 karakter.");
    const passwordHash = await hashPassword(password);
    await pool.query(
      `INSERT INTO accounts (username, password_hash, role)
       VALUES ($1, $2, 'admin') ON CONFLICT (username) DO NOTHING`,
      [username, passwordHash],
    );
    const bootstrap = await pool.query("SELECT role FROM accounts WHERE username = $1", [username]);
    if (bootstrap.rows[0]?.role !== "admin") throw new Error("ADMIN_USERNAME sudah digunakan akun non-admin.");
  } else {
    console.warn("Admin awal belum dibuat. Set ADMIN_USERNAME dan ADMIN_PASSWORD, lalu restart server.");
  }
}
