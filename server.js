import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { hashPassword, initializeDatabase, pool } from "./server/database.js";
import { assertSameOrigin, currentUser, login, logout, readJsonBody, requireRole, sendJson } from "./server/auth.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const acceptedMime = new Map([
  ["application/pdf", ".pdf"],
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function decodeProof(proof) {
  if (!proof || !acceptedMime.has(proof.mimeType) || typeof proof.base64 !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(proof.base64)) {
    throw Object.assign(new Error("Lampiran harus berupa PDF, JPG, PNG, atau WebP."), { status: 400 });
  }
  const bytes = Buffer.from(proof.base64, "base64");
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) {
    throw Object.assign(new Error("Ukuran lampiran maksimal 5 MB."), { status: 413 });
  }
  const signatures = {
    "application/pdf": bytes.subarray(0, 5).equals(Buffer.from("%PDF-")),
    "image/jpeg": bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    "image/png": bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/webp": bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP",
  };
  if (!signatures[proof.mimeType]) {
    throw Object.assign(new Error("Isi lampiran tidak sesuai dengan jenis berkasnya."), { status: 400 });
  }
  return { bytes, mimeType: proof.mimeType, name: path.basename(String(proof.name || `surat${acceptedMime.get(proof.mimeType)}`)).slice(0, 120) };
}

async function createStudentAccount(body) {
  const name = String(body.name || "").trim();
  const className = String(body.className || "").trim();
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (name.length < 2 || name.length > 100 || className.length < 1 || className.length > 30) {
    throw Object.assign(new Error("Nama siswa atau kelas tidak valid."), { status: 400 });
  }
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    throw Object.assign(new Error("Username harus 3–32 karakter: huruf kecil, angka, titik, garis bawah, atau tanda hubung."), { status: 400 });
  }
  if (password.length < 12 || password.length > 200) {
    throw Object.assign(new Error("Kata sandi awal harus 12–200 karakter."), { status: 400 });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const student = await client.query(
      "INSERT INTO students (name, class_name, attendance_code) VALUES ($1, $2, $3) RETURNING id",
      [name, className, randomBytes(24).toString("base64url")],
    );
    const passwordHash = await hashPassword(password);
    const account = await client.query(
      "INSERT INTO accounts (username, password_hash, role, student_id) VALUES ($1, $2, 'student', $3) RETURNING id, username, role",
      [username, passwordHash, student.rows[0].id],
    );
    await client.query("COMMIT");
    return { ...account.rows[0], name, className };
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") throw Object.assign(new Error("Username sudah dipakai atau data siswa duplikat."), { status: 409 });
    throw error;
  } finally {
    client.release();
  }
}

async function handleRequest(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/api/health") {
    await pool.query("SELECT 1");
    return sendJson(response, 200, { ok: true, database: "connected" });
  }

  if (request.method === "POST" && ["/api/auth/login", "/api/auth/logout", "/api/admin/students", "/api/attendance"].includes(url.pathname)) {
    assertSameOrigin(request);
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJsonBody(request, 16 * 1024);
    const user = await login(request, response, body.username, body.password);
    return sendJson(response, 200, user);
  }

  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    const user = await currentUser(request);
    if (!user) return sendJson(response, 401, { error: "Sesi tidak aktif." });
    return sendJson(response, 200, user);
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    await logout(request, response);
    return sendJson(response, 200, { ok: true });
  }

  if (request.method === "GET" && url.pathname === "/api/admin/students") {
    const user = await currentUser(request);
    requireRole(user, "admin");
    const result = await pool.query(
      `SELECT s.id, s.name, s.class_name AS "className", a.username, a.active
       FROM students s LEFT JOIN accounts a ON a.student_id = s.id ORDER BY s.class_name, s.name`,
    );
    return sendJson(response, 200, result.rows);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/students") {
    const user = await currentUser(request);
    requireRole(user, "admin");
    const body = await readJsonBody(request, 24 * 1024);
    return sendJson(response, 201, await createStudentAccount(body));
  }

  if (request.method === "GET" && url.pathname === "/api/attendance") {
    const user = await currentUser(request);
    requireRole(user);
    const date = url.searchParams.get("date");
    if (date && !validDate(date)) return sendJson(response, 400, { error: "Tanggal tidak valid." });
    const params = [];
    const filters = [];
    if (user.role === "student") {
      params.push(user.studentId);
      filters.push(`a.student_id = $${params.length}`);
    }
    if (date) {
      params.push(date);
      filters.push(`a.attendance_date = $${params.length}`);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const result = await pool.query(
      `SELECT a.id, a.attendance_date::text AS date,
              s.name, s.class_name AS "className", a.status, a.note,
              a.proof_name AS "proofName",
              CASE WHEN a.proof_bytes IS NULL THEN NULL ELSE '/api/attendance/' || a.id || '/proof' END AS "proofUrl",
              a.created_at AS "submittedAt"
       FROM attendance a JOIN students s ON s.id = a.student_id ${where}
       ORDER BY a.attendance_date DESC, s.name`,
      params,
    );
    return sendJson(response, 200, result.rows.map((record) => ({
      ...record,
      displayDate: new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${record.date}T00:00:00Z`)),
    })));
  }

  if (request.method === "POST" && url.pathname === "/api/attendance") {
    const user = await currentUser(request);
    requireRole(user);
    const body = await readJsonBody(request);
    if (!validDate(body.date)) return sendJson(response, 400, { error: "Tanggal absensi tidak valid." });

    let studentId;
    let status;
    let proof = null;
    if (user.role === "admin") {
      if (body.status !== "Hadir" || typeof body.attendanceCode !== "string") {
        return sendJson(response, 400, { error: "Admin hanya dapat mencatat hadir dengan memindai QR siswa." });
      }
      const result = await pool.query("SELECT id FROM students WHERE attendance_code = $1", [body.attendanceCode.trim()]);
      if (!result.rows[0]) return sendJson(response, 404, { error: "QR siswa tidak dikenali." });
      studentId = result.rows[0].id;
      status = "Hadir";
    } else {
      if (!["Izin", "Sakit"].includes(body.status) || !body.proof) {
        return sendJson(response, 400, { error: "Siswa hanya dapat mengirim izin atau sakit dengan surat keterangan." });
      }
      studentId = user.studentId;
      status = body.status;
      proof = decodeProof(body.proof);
    }
    const note = String(body.note || "").trim().slice(0, 300);
    if (status !== "Hadir" && !note) return sendJson(response, 400, { error: "Keterangan wajib diisi." });

    const result = await pool.query(
      `INSERT INTO attendance
         (student_id, attendance_date, status, note, proof_name, proof_mime, proof_bytes, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (student_id, attendance_date) DO UPDATE SET
         status = EXCLUDED.status, note = EXCLUDED.note,
         proof_name = EXCLUDED.proof_name, proof_mime = EXCLUDED.proof_mime,
         proof_bytes = EXCLUDED.proof_bytes, recorded_by = EXCLUDED.recorded_by,
         updated_at = now()
       RETURNING id, attendance_date::text AS date, status, note,
                 proof_name AS "proofName", created_at AS "submittedAt"`,
      [studentId, body.date, status, note, proof?.name || null, proof?.mimeType || null, proof?.bytes || null, user.id],
    );
    const studentInfo = await pool.query("SELECT name, class_name AS \"className\" FROM students WHERE id = $1", [studentId]);
    const row = result.rows[0];
    return sendJson(response, 201, {
      ...row,
      ...studentInfo.rows[0],
      displayDate: new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${row.date}T00:00:00Z`)),
      proofUrl: row.proofName ? `/api/attendance/${row.id}/proof` : null,
    });
  }

  const proofMatch = url.pathname.match(/^\/api\/attendance\/([0-9a-f-]{36})\/proof$/i);
  if (request.method === "GET" && proofMatch) {
    const user = await currentUser(request);
    requireRole(user);
    const params = [proofMatch[1]];
    const ownRecord = user.role === "student" ? "AND student_id = $2" : "";
    if (user.role === "student") params.push(user.studentId);
    const result = await pool.query(`SELECT proof_name, proof_mime, proof_bytes FROM attendance WHERE id = $1 ${ownRecord}`, params);
    const proof = result.rows[0];
    if (!proof?.proof_bytes) return sendJson(response, 404, { error: "Lampiran tidak ditemukan." });
    response.writeHead(200, {
      "Content-Type": proof.proof_mime,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(proof.proof_name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    });
    return response.end(proof.proof_bytes);
  }

  return sendJson(response, 404, { error: "Rute tidak ditemukan." });
}

await initializeDatabase();
const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    if (!error.status || error.status >= 500) console.error("API request failed:", error);
    if (!response.headersSent) sendJson(response, error.status || 500, { error: error.status ? error.message : "Terjadi kesalahan server." });
    else response.destroy();
  });
});

const sessionCleanup = setInterval(() => {
  pool.query("DELETE FROM sessions WHERE expires_at <= now()").catch((error) => console.error("Session cleanup failed:", error.message));
}, 60 * 60 * 1000);
sessionCleanup.unref();

server.listen(port, host, () => {
  console.log(`Server absensi berjalan di http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    server.close();
    await pool.end();
    process.exit(0);
  });
}
