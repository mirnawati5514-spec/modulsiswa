import { useEffect, useMemo, useRef, useState } from "react";
import { db, initializeDatabase, recordStudentAttendance } from "./db.js";
import { createStudentOnServer, fetchAttendanceFromServer, fetchStudentsFromServer, sendAttendanceToServer } from "./attendanceApi.js";
import { announcements, books, schedules, students, weekdays } from "./data.js";

const pages = [
  ["beranda", "Beranda", "🏠"],
  ["jadwal", "Jadwal Pelajaran", "📅"],
  ["absensi", "Absensi", "📋"],
  ["tugas", "Daftar Tugas", "📝"],
  ["perpustakaan", "Perpustakaan", "📚"],
  ["pengumuman", "Pengumuman", "📢"],
  ["akun", "Akun Siswa", "👥"],
];
const grades = [
  { number: "10", roman: "X" },
  { number: "11", roman: "XI" },
  { number: "12", roman: "XII" },
];
const today = new Date();
const dateText = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(today);
const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
const dayIndex = today.getDay();
const todayName = dayIndex >= 1 && dayIndex <= 5 ? weekdays[dayIndex - 1] : "Senin";
async function loadLocalAttendance() {
  const records = await db.attendance.toArray();
  return records.sort((first, second) => {
    const firstTime = first.scannedAt || `${first.date}T00:00:00`;
    const secondTime = second.scannedAt || `${second.date}T00:00:00`;
    return secondTime.localeCompare(firstTime);
  });
}
const demoStudent = {
  id: "local-demo-student",
  role: "student",
  name: "Alya Putri",
  className: "VII-A",
  username: "alya.demo",
  attendanceCode: "QR-VIIA-ALYA-01",
};
const localDemoEnabled = true;

function App() {
  return <AuthenticatedApp key={demoStudent.id} user={demoStudent} isDemo={localDemoEnabled} />;
}

function AuthenticatedApp({ user, isDemo }) {
  const [page, setPage] = useState("beranda");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeDay, setActiveDay] = useState(todayName);
  const [tasks, setTasks] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [taskInput, setTaskInput] = useState("");
  const [bookQuery, setBookQuery] = useState("");
  const [selectedGrade, setSelectedGrade] = useState("all");
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  useEffect(() => {
    if (!feedback) return undefined;
    const timer = window.setTimeout(() => setFeedback(""), 2600);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  useEffect(() => {
    let cancelled = false;
    async function loadDatabase() {
      try {
        await initializeDatabase();
        const loadedTasks = await db.tasks.orderBy("id").reverse().toArray();
        if (cancelled) return;
        setTasks(loadedTasks);
        const serverRecords = isDemo ? await loadLocalAttendance() : await fetchAttendanceFromServer();
        if (cancelled) return;
        setAttendanceRecords(serverRecords);
        setDbError("");
      } catch (error) {
        if (!cancelled) setDbError(`Data tidak dapat dimuat: ${error.message}`);
      } finally {
        if (!cancelled) setDbReady(true);
      }
    }
    loadDatabase();
    return () => {
      cancelled = true;
    };
  }, [isDemo]);

  const currentPage = pages.find(([id]) => id === page);
  const filteredBooks = useMemo(() => {
    const query = bookQuery.trim().toLocaleLowerCase("id-ID");
    return books.filter((book) => {
      const gradeMatches = selectedGrade === "all" || book.grade === selectedGrade;
      const queryMatches = [
        book.title,
        book.author,
        book.publisher,
        book.subject,
        book.grade,
      ].some((value) => value.toLocaleLowerCase("id-ID").includes(query));
      return gradeMatches && queryMatches;
    });
  }, [bookQuery, selectedGrade]);
  const availableBooks = books.filter((book) => book.availability === "Tersedia").length;
  const pendingTasks = tasks.filter((task) => !task.done).length;

  function navigate(nextPage) {
    setPage(nextPage);
    setMobileMenuOpen(false);
    setFeedback("");
  }

  async function refreshTasks() {
    setTasks(await db.tasks.orderBy("id").reverse().toArray());
  }

  async function addTask(event) {
    event.preventDefault();
    const text = taskInput.trim();
    if (!text || !dbReady) return;
    try {
      await db.tasks.add({ text, done: false });
      await refreshTasks();
      setTaskInput("");
      setDbError("");
      setFeedback("Tugas berhasil ditambahkan.");
    } catch (error) {
      setDbError(`Tugas tidak dapat disimpan: ${error.message}`);
    }
  }

  async function toggleTask(task) {
    try {
      await db.tasks.update(task.id, { done: !task.done });
      await refreshTasks();
      setDbError("");
    } catch (error) {
      setDbError(`Status tugas tidak dapat diperbarui: ${error.message}`);
    }
  }

  async function deleteTask(taskId) {
    try {
      await db.tasks.delete(taskId);
      await refreshTasks();
      setDbError("");
      setFeedback("Tugas berhasil dihapus.");
    } catch (error) {
      setDbError(`Tugas tidak dapat dihapus: ${error.message}`);
    }
  }

  async function refreshAttendance() {
    setAttendanceRecords(isDemo
      ? await loadLocalAttendance()
      : await fetchAttendanceFromServer());
  }

  async function recordAttendance(attendanceCode, status, extra = {}) {
    if (isDemo) {
      const student = students.find((entry) => entry.attendanceCode === attendanceCode?.trim());
      if (status !== "Hadir" || !student) {
        setDbError("Kode QR siswa tidak dikenali. Coba scan kembali.");
        return false;
      }
      setIsSavingAttendance(true);
      try {
        const scannedAt = new Date();
        const scannedDate = `${scannedAt.getFullYear()}-${String(scannedAt.getMonth() + 1).padStart(2, "0")}-${String(scannedAt.getDate()).padStart(2, "0")}`;
        const scannedDateText = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(scannedAt);
        const scannedTimeText = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(scannedAt);
        await recordStudentAttendance({
          date: scannedDate,
          displayDate: scannedDateText,
          time: scannedTimeText,
          scannedAt: scannedAt.toISOString(),
          name: student.name,
          className: student.className,
          status: "Hadir",
          note: "QR dipindai pada perangkat ini",
        });
        await refreshAttendance();
        setDbError("");
        setFeedback(`✅ Tersimpan: HADIR — ${student.name} — ${scannedTimeText}`);
        return true;
      } catch (error) {
        setDbError(`Absensi tidak dapat dicatat: ${error.message}`);
        return false;
      } finally {
        setIsSavingAttendance(false);
      }
    }
    setIsSavingAttendance(true);
    try {
      const serverRecord = await sendAttendanceToServer({
        date: dateKey,
        attendanceCode,
        status,
        ...extra,
      });
      setAttendanceRecords((current) => [serverRecord, ...current.filter((record) => record.id !== serverRecord.id)]);
      await refreshAttendance();
      setDbError("");
      setFeedback(`Absensi berhasil dicatat dengan status ${status.toUpperCase()}.`);
      return true;
    } catch (error) {
      setDbError(`Absensi tidak dapat disimpan: ${error.message}`);
      return false;
    } finally {
      setIsSavingAttendance(false);
    }
  }

  async function scanAttendanceCode(code) {
    return recordAttendance(code.trim(), "Hadir");
  }

  async function saveDailyAttendance(statuses) {
    setIsSavingAttendance(true);
    try {
      const savedAt = new Date();
      const date = `${savedAt.getFullYear()}-${String(savedAt.getMonth() + 1).padStart(2, "0")}-${String(savedAt.getDate()).padStart(2, "0")}`;
      const displayDate = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(savedAt);
      const time = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(savedAt);
      for (const student of students) {
        await recordStudentAttendance({
          date,
          displayDate,
          time,
          scannedAt: savedAt.toISOString(),
          name: student.name,
          className: student.className,
          status: statuses[student.attendanceCode] || "Hadir",
          note: "Dicatat pada perangkat ini",
        });
      }
      await refreshAttendance();
      setDbError("");
      setFeedback(`✅ Absensi hari ini tersimpan — ${time}`);
      return true;
    } catch (error) {
      setDbError(`Absensi tidak dapat disimpan: ${error.message}`);
      return false;
    } finally {
      setIsSavingAttendance(false);
    }
  }

  return (
    <div className="app min-h-screen">
      <aside
        className={`sidebar ${mobileMenuOpen ? "open" : ""}`}
        aria-label="Navigasi utama"
      >
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">✦</div>
          <div className="brand-name">
            Modul Siswa<span>SEKOLAH CERDAS</span>
          </div>
        </div>
        <p className="nav-label">MENU UTAMA</p>
        <nav className="nav">
          {pages.filter(([id]) => id !== "akun" || user.role === "admin").map(([id, label, icon]) => (
            <button
              className={`nav-button ${page === id ? "active" : ""}`}
              key={id}
              onClick={() => navigate(id)}
              type="button"
            >
              <span className="nav-icon" aria-hidden="true">{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <strong>🌟 Semangat belajar!</strong>
          Langkah kecil setiap hari membawa hasil yang luar biasa.
        </div>
      </aside>
      {mobileMenuOpen && (
        <button
          className="mobile-backdrop visible"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Tutup menu"
          type="button"
        />
      )}

      <main className="main min-h-screen">
        <header className="topbar">
          <div className="topbar-title">
            <button
              className="mobile-menu"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Buka menu"
              type="button"
            >
              ☰
            </button>
            <div>
              <div className="breadcrumb">Modul Siswa <span aria-hidden="true">/</span> {currentPage[1]}</div>
              <h1 className="page-heading">{currentPage[1]}</h1>
            </div>
          </div>
          <div className="profile">
            <div className="profile-text">Halo, Siswa!<small>{dateText}</small></div>
            <div className="avatar" aria-hidden="true">🧑‍🎓</div>
          </div>
        </header>

        {dbError && (
          <div className="error-banner" role="alert">
            <span>{dbError}</span>
            <button onClick={() => setDbError("")} aria-label="Tutup pesan" type="button">×</button>
          </div>
        )}
        {feedback && (
          <div className="success-banner" role="status">
            <span>{feedback}</span>
            <button onClick={() => setFeedback("")} aria-label="Tutup pesan" type="button">×</button>
          </div>
        )}

        {page === "beranda" && (
            <HomePage
            availableBooks={availableBooks}
            attendanceCount={attendanceRecords.length}
            pendingTasks={pendingTasks}
            onNavigate={navigate}
          />
        )}
        {page === "jadwal" && (
          <SchedulePage activeDay={activeDay} onSelectDay={setActiveDay} />
        )}
        {page === "absensi" && (
          <AttendancePage
            records={attendanceRecords}
            onScanCode={scanAttendanceCode}
            isSaving={isSavingAttendance}
            dbReady={dbReady}
            onSaveAttendance={saveDailyAttendance}
          />
        )}
        {page === "akun" && user.role === "admin" && <AdminStudentsPage />}
        {page === "tugas" && (
          <TasksPage
            tasks={tasks}
            taskInput={taskInput}
            dbReady={dbReady}
            onInput={setTaskInput}
            onAdd={addTask}
            onToggle={toggleTask}
            onDelete={deleteTask}
          />
        )}
        {page === "perpustakaan" && (
          <LibraryPage
            books={filteredBooks}
            query={bookQuery}
            selectedGrade={selectedGrade}
            onQuery={setBookQuery}
            onGrade={setSelectedGrade}
          />
        )}
        {page === "pengumuman" && <AnnouncementsPage />}
      </main>
    </div>
  );
}

function AdminStudentsPage() {
  const [studentsList, setStudentsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [form, setForm] = useState({ name: "", className: "", username: "", password: "" });

  async function loadStudents() {
    setLoading(true);
    try {
      setStudentsList(await fetchStudentsFromServer());
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadStudents(); }, []);

  async function addStudent(event) {
    event.preventDefault();
    setError("");
    setFeedback("");
    try {
      await createStudentOnServer(form);
      setForm({ name: "", className: "", username: "", password: "" });
      setFeedback("Akun siswa berhasil dibuat. Sampaikan username dan kata sandi awal secara pribadi kepada siswa.");
      await loadStudents();
    } catch (createError) {
      setError(createError.message);
    }
  }

  return (
    <section>
      <div className="toolbar"><div><h2>Akun Siswa</h2><p>Hanya admin yang dapat membuat akun siswa.</p></div></div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {feedback && <div className="success-banner" role="status">{feedback}</div>}
      <div className="panel">
        <div className="panel-heading"><h3>Buat akun siswa</h3><span>Kata sandi minimal 12 karakter</span></div>
        <form className="student-account-form" onSubmit={addStudent}>
          <label>Nama lengkap<input className="task-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength="100" /></label>
          <label>Kelas<input className="task-input" value={form.className} onChange={(event) => setForm({ ...form, className: event.target.value })} required maxLength="30" placeholder="Contoh: VII-A" /></label>
          <label>Username<input className="task-input" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase() })} required minLength="3" maxLength="32" pattern="[a-z0-9._-]+" autoComplete="off" /></label>
          <label>Kata sandi awal<input className="task-input" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required minLength="12" autoComplete="new-password" /></label>
          <button className="primary-button" type="submit">Buat akun</button>
        </form>
      </div>
      <div className="section-title"><div><h2>Daftar akun</h2><p>QR pribadi dibuat saat siswa masuk ke akunnya.</p></div></div>
      <div className="panel table-wrap">
        <table><thead><tr><th>NAMA</th><th>KELAS</th><th>USERNAME</th><th>STATUS</th></tr></thead>
          <tbody>{loading ? <tr><td colSpan="4" className="empty-state">Memuat akun…</td></tr> : studentsList.length ? studentsList.map((student) => (
            <tr key={student.id}><td>{student.name}</td><td>{student.className}</td><td>{student.username || "Belum ada akun"}</td><td>{student.active === false ? "Nonaktif" : "Aktif"}</td></tr>
          )) : <tr><td colSpan="4" className="empty-state">Belum ada akun siswa. Buat akun pertama di atas.</td></tr>}</tbody>
        </table>
      </div>
    </section>
  );
}

function HomePage({ availableBooks, attendanceCount, pendingTasks, onNavigate }) {
  const lessons = schedules[todayName].slice(0, 3);
  return (
    <section>
      <div className="welcome">
        <div className="welcome-copy">
          <div className="welcome-kicker">SELAMAT DATANG DI MODUL SISWA ✨</div>
          <h2>Belajar jadi lebih teratur!</h2>
          <p>
            Semua yang kamu butuhkan untuk hari sekolah yang produktif, ada di satu tempat.
            Yuk, mulai hari ini dengan semangat!
          </p>
        </div>
        <div className="welcome-art" aria-hidden="true">🎒</div>
      </div>
      <div className="stats">
        <StatCard icon="📚" color="purple" value={availableBooks} label="Buku tersedia" />
        <StatCard icon="✅" color="teal" value={attendanceCount} label="Catatan absensi" />
        <StatCard icon="📝" color="orange" value={pendingTasks} label="Tugas belum selesai" />
        <StatCard icon="📢" color="blue" value={announcements.length} label="Pengumuman" />
      </div>
      <div className="section-title">
        <div>
          <h2>Ringkasan Hari Ini</h2>
          <p>Siapkan dirimu untuk menjalani hari yang menyenangkan.</p>
        </div>
      </div>
      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-heading">
            <h3>📅 Jadwal Pelajaran</h3>
            <button className="text-link" onClick={() => onNavigate("jadwal")} type="button">Lihat jadwal →</button>
          </div>
          {lessons.map(([time, subject, teacher]) => (
            <div className="today-row" key={`${time}-${subject}`}>
              <div className="subject-time">{time.split("–")[0]}</div>
              <div className="subject-dot" />
              <div className="subject-info">{subject}<small>{teacher}</small></div>
            </div>
          ))}
        </div>
        <div className="panel">
          <div className="panel-heading">
            <h3>📢 Pengumuman Terbaru</h3>
            <button className="text-link" onClick={() => onNavigate("pengumuman")} type="button">Lihat semua →</button>
          </div>
          {announcements.slice(0, 2).map((item) => (
            <div className="notice-row" key={item.title}>
              <div className="notice-emoji">{item.icon}</div>
              <div className="notice-copy">{item.title}<small>{item.date}</small></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatCard({ icon, color, value, label }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${color}`}>{icon}</div>
      <div><div className="stat-number">{value}</div><div className="stat-label">{label}</div></div>
    </div>
  );
}

function SchedulePage({ activeDay, onSelectDay }) {
  return (
    <section>
      <div className="toolbar">
        <div><h2>Jadwal Pelajaran</h2><p>Pilih hari untuk melihat pelajaranmu.</p></div>
      </div>
      <div className="day-tabs" aria-label="Pilih hari">
        {weekdays.map((day) => (
          <button
            className={`day-tab ${activeDay === day ? "active" : ""}`}
            key={day}
            onClick={() => onSelectDay(day)}
            type="button"
          >
            {day}
          </button>
        ))}
      </div>
      <div className="panel schedule-panel">
        <div className="panel-heading">
          <h3>Jadwal Hari {activeDay}</h3><span>Semester Ganjil</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>WAKTU</th><th>MATA PELAJARAN</th><th>GURU</th><th>RUANG</th></tr></thead>
            <tbody>
              {schedules[activeDay].map(([time, subject, teacher, room]) => (
                <tr key={`${time}-${subject}`}>
                  <td><span className="time-pill">{time}</span></td>
                  <td className="subject-name">{subject}</td>
                  <td className="teacher">{teacher}</td>
                  <td>{room}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function AttendancePage({ records, onScanCode, onSaveAttendance, isSaving, dbReady }) {
  const videoRef = useRef(null);
  const scanHandlerRef = useRef(onScanCode);
  scanHandlerRef.current = onScanCode;
  const [cameraActive, setCameraActive] = useState(true);
  const [cameraError, setCameraError] = useState("");
  const processingScanRef = useRef(false);
  const [statuses, setStatuses] = useState(() => Object.fromEntries(students.map((student) => [student.attendanceCode, "Hadir"])));
  useEffect(() => {
    const todayRecords = records.filter((record) => record.date === dateKey);
    setStatuses(Object.fromEntries(students.map((student) => {
      const saved = todayRecords.find((record) => record.name === student.name);
      return [student.attendanceCode, saved?.status || "Hadir"];
    })));
  }, [records]);

  useEffect(() => {
    if (!cameraActive) return undefined;
    let controls;
    let stopped = false;
    let lastVisibleCode = "";
    let lastVisibleAt = 0;
    setCameraError("");
    import("@zxing/browser").then(({ BrowserMultiFormatReader }) => {
      if (stopped) return;
      const reader = new BrowserMultiFormatReader();
      return reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, videoRef.current, (result) => {
        if (stopped) return;
        const now = Date.now();
        if (!result) {
          if (now - lastVisibleAt > 1200) lastVisibleCode = "";
          return;
        }
        const code = result.getText().trim();
        if (!code || processingScanRef.current) return;
        if (code === lastVisibleCode && now - lastVisibleAt < 2500) {
          lastVisibleAt = now;
          return;
        }
        lastVisibleCode = code;
        lastVisibleAt = now;
        processingScanRef.current = true;
        Promise.resolve(scanHandlerRef.current(code)).finally(() => { processingScanRef.current = false; });
      }).then((startedControls) => {
        controls = startedControls;
        if (stopped) controls.stop();
      });
    }).catch((error) => {
      setCameraActive(false);
      setCameraError(error.name === "NotAllowedError"
        ? "Izinkan akses kamera di browser untuk mulai memindai."
        : `Kamera tidak dapat dibuka: ${error.message}`);
    });
    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [cameraActive]);

  return (
    <section>
      <div className="toolbar"><div><h2>Absensi Siswa</h2><p>Pilih status kehadiran, atau scan QR untuk mencatat HADIR otomatis.</p></div></div>
      <div className="attendance-workflow">
        <div className="panel workflow-panel">
          <div className="panel-heading"><h3>Scan QR Otomatis</h3><span>{dateText}</span></div>
          <div className="camera-controls">
            <button className="secondary-button" disabled={!dbReady || isSaving} onClick={() => setCameraActive((active) => !active)} type="button">{cameraActive ? "Jeda kamera" : "Mulai scan QR"}</button>
            <span>Arahkan kamera ke QR siswa. Kehadiran tersimpan otomatis saat kode dikenali.</span>
          </div>
          {cameraError && <p className="camera-error" role="alert">{cameraError}</p>}
          {cameraActive && <video className="qr-camera" ref={videoRef} muted playsInline aria-label="Kamera pemindai QR absensi" />}
        </div>
      </div>
      <div className="panel">
        <div className="panel-heading"><h3>📋 Catat Kehadiran</h3><span>{dateText}</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>NAMA SISWA</th><th>KELAS</th><th>STATUS</th></tr></thead>
            <tbody>{students.map((student) => (
              <tr key={student.attendanceCode}>
                <td><div className="student-cell"><span className="student-avatar">{student.icon}</span>{student.name}</div></td>
                <td>{student.className}</td>
                <td><select className="status-select" value={statuses[student.attendanceCode] || "Hadir"} onChange={(event) => setStatuses((current) => ({ ...current, [student.attendanceCode]: event.target.value }))} aria-label={`Status ${student.name}`}>
                  <option>Hadir</option><option>Izin</option><option>Sakit</option><option>Alpa</option>
                </select></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="attendance-actions"><button className="primary-button" disabled={!dbReady || isSaving} onClick={() => onSaveAttendance(statuses)} type="button">{isSaving ? "Menyimpan..." : "Simpan Absensi Hari Ini"}</button></div>
      </div>
      <div className="section-title"><div><h2>Riwayat Absensi</h2><p>Catatan tersimpan di perangkat ini dan bisa dilihat kembali.</p></div></div>
      <div className="panel"><div className="table-wrap">
        <table>
          <thead><tr><th>TANGGAL</th><th>NAMA SISWA</th><th>KELAS</th><th>STATUS</th></tr></thead>
          <tbody>{records.length ? records.map((record) => (
            <tr key={record.id}><td><div>{record.displayDate || record.date}</div>{record.time && <small className="attendance-time-display">{record.time}</small>}</td><td>{record.name}</td><td>{record.className}</td><td><span className={`badge ${record.status.toLowerCase()}`}>{record.status}</span></td></tr>
          )) : <tr><td colSpan="4" className="empty-state">Belum ada catatan absensi. Scan QR atau simpan absensi hari ini untuk memulai.</td></tr>}</tbody>
        </table>
      </div></div>
    </section>
  );
}
function TasksPage({ tasks, taskInput, dbReady, onInput, onAdd, onToggle, onDelete }) {
  return (
    <section>
      <div className="toolbar">
        <div><h2>Daftar Tugas</h2><p>Catat tugasmu dan tandai jika sudah selesai.</p></div>
      </div>
      <div className="panel task-entry-panel">
        <form className="task-form" onSubmit={onAdd}>
          <input
            className="task-input"
            type="text"
            maxLength="100"
            placeholder="Contoh: Kerjakan latihan Matematika halaman 24"
            aria-label="Tugas baru"
            required
            value={taskInput}
            onChange={(event) => onInput(event.target.value)}
          />
          <button className="primary-button" disabled={!dbReady} type="submit">ï¼‹ Tambah Tugas</button>
        </form>
      </div>
      {!dbReady ? <div className="panel empty-state">Membuka penyimpanan tugas...</div> : null}
      <div className="task-list">
        {tasks.length ? tasks.map((task) => (
          <div className="task-item" key={task.id}>
            <input
              className="task-check"
              type="checkbox"
              checked={task.done}
              onChange={() => onToggle(task)}
              aria-label={`Tandai ${task.text} selesai`}
            />
            <span className={`task-text ${task.done ? "done" : ""}`}>{task.text}</span>
            <button className="delete-button" onClick={() => onDelete(task.id)} aria-label={`Hapus ${task.text}`} type="button">Hapus</button>
          </div>
        )) : dbReady ? <div className="panel empty-state">Belum ada tugas. Tambahkan tugas pertamamu di atas! ✨</div> : null}
      </div>
    </section>
  );
}

function LibraryPage({ books: visibleBooks, query, selectedGrade, onQuery, onGrade }) {
  return (
    <section>
      <div className="toolbar">
        <div><h2>Perpustakaan SMA</h2><p>Buku teks utama Kurikulum Merdeka per kelas. Status koleksi merupakan contoh.</p></div>
        <div className="library-filters">
          <select className="class-filter" value={selectedGrade} onChange={(event) => onGrade(event.target.value)} aria-label="Filter kelas">
            <option value="all">Semua kelas</option>
            <option value="10">Kelas 10</option>
            <option value="11">Kelas 11</option>
            <option value="12">Kelas 12</option>
          </select>
          <input
            className="search-input"
            type="search"
            placeholder="🔎  Cari buku..."
            aria-label="Cari buku"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
        </div>
      </div>
      {visibleBooks.length ? grades.map((grade) => {
        const gradeBooks = visibleBooks.filter((book) => book.grade === grade.number);
        if (!gradeBooks.length) return null;
        return (
          <section className="book-group" key={grade.number} aria-labelledby={`books-grade-${grade.number}`}>
            <div className="book-group-heading">
              <span className="grade-mark">{grade.roman}</span>
              <h3 id={`books-grade-${grade.number}`}>Kelas {grade.number}</h3>
              <span>{gradeBooks.length} buku</span>
            </div>
            <div className="book-grid">
              {gradeBooks.map((book) => (
                <article
                  className="book-card"
                  key={`${book.grade}-${book.subject}`}
                  style={{ "--subject-color": book.color, "--subject-tint": book.tint }}
                >
                  <div className="book-card-top">
                    <div className="book-symbol" aria-hidden="true">{book.icon}</div>
                    <span className="book-grade">Kelas {book.grade}</span>
                  </div>
                  <div className="book-info">
                    <strong>{book.title}</strong>
                    <span className="book-author">Penulis: {book.author}</span>
                    <span className="book-publisher">Penerbit: {book.publisher}</span>
                  </div>
                  <div className="book-card-bottom">
                    <span className="subject-tag">{book.subject}</span>
                    <span className={`availability ${book.availability === "Dipinjam" ? "borrowed" : ""}`}>{book.availability}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      }) : <div className="panel empty-state">Buku tidak ditemukan. Coba kata kunci atau kelas lain.</div>}
    </section>
  );
}

function AnnouncementsPage() {
  return (
    <section>
      <div className="toolbar">
        <div><h2>Pengumuman Sekolah</h2><p>Informasi terbaru untuk seluruh siswa.</p></div>
      </div>
      <div className="announcement-list">
        {announcements.map((item) => (
          <article className="announcement" key={item.title}>
            <div className="announcement-icon" aria-hidden="true">{item.icon}</div>
            <div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <time>{item.date}</time>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default App;
