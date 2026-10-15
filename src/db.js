import Dexie from "dexie";

export const db = new Dexie("modul-siswa-sekolah");

db.version(1).stores({
  tasks: "++id, done",
  attendance: "++id, date, name, [date+name]",
  settings: "&key",
});

const starterTasks = [
  { text: "Membaca Bab 3 buku IPA", done: false },
  { text: "Mengerjakan latihan Matematika halaman 24", done: false },
  { text: "Mengumpulkan rangkuman Bahasa Indonesia", done: true },
];

export async function initializeDatabase() {
  await db.transaction("rw", db.tasks, db.settings, async () => {
    const seeded = await db.settings.get("starter-tasks-seeded");
    if (!seeded) {
      if ((await db.tasks.count()) === 0) {
        await db.tasks.bulkAdd(starterTasks);
      }
      await db.settings.put({ key: "starter-tasks-seeded", value: true });
    }
  });
}

export async function saveAttendanceForDate(date, records) {
  await db.transaction("rw", db.attendance, async () => {
    await db.attendance.where("date").equals(date).delete();
    await db.attendance.bulkAdd(records);
  });
}

export async function recordStudentAttendance(record) {
  const localRecord = { ...record };
  delete localRecord.id;
  await db.transaction("rw", db.attendance, async () => {
    const previous = await db.attendance
      .where("[date+name]")
      .equals([record.date, record.name])
      .first();
    if (previous) await db.attendance.delete(previous.id);
    await db.attendance.add(localRecord);
  });
}
