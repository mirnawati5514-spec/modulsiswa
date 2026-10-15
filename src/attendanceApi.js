async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: { Accept: "application/json", ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Server merespons ${response.status}.`);
  return body;
}

async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function getCurrentUser() {
  try {
    return await request("/api/auth/me");
  } catch (error) {
    if (error.message === "Sesi tidak aktif.") return null;
    throw error;
  }
}

export function login(username, password) {
  return request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

export function logout() {
  return request("/api/auth/logout", { method: "POST" });
}

export function fetchAttendanceFromServer(date) {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  return request(`/api/attendance${query}`);
}

export function fetchStudentsFromServer() {
  return request("/api/admin/students");
}

export function createStudentOnServer(student) {
  return request("/api/admin/students", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(student),
  });
}

export async function sendAttendanceToServer({ attendanceCode, status, date, note = "", proof = null }) {
  return request("/api/attendance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      attendanceCode,
      status,
      date,
      note,
      proof: proof ? {
        name: proof.name,
        mimeType: proof.type || "application/octet-stream",
        base64: await fileToBase64(proof),
      } : null,
    }),
  });
}
