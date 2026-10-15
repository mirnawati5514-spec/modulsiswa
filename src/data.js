export const weekdays = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"];

export const schedules = {
  Senin: [
    ["07.30–08.50", "Matematika", "Ibu Rina, S.Pd.", "VII-A"],
    ["09.10–10.30", "Bahasa Indonesia", "Pak Budi, S.Pd.", "VII-A"],
    ["10.45–12.00", "Ilmu Pengetahuan Alam", "Ibu Sari, S.Pd.", "Lab IPA"],
  ],
  Selasa: [
    ["07.30–08.50", "Bahasa Inggris", "Pak Andi, S.Pd.", "VII-A"],
    ["09.10–10.30", "Ilmu Pengetahuan Sosial", "Ibu Maya, S.Pd.", "VII-A"],
    ["10.45–12.00", "Pendidikan Jasmani", "Pak Dedi, S.Pd.", "Lapangan"],
  ],
  Rabu: [
    ["07.30–08.50", "Ilmu Pengetahuan Alam", "Ibu Sari, S.Pd.", "Lab IPA"],
    ["09.10–10.30", "Matematika", "Ibu Rina, S.Pd.", "VII-A"],
    ["10.45–12.00", "Seni Budaya", "Ibu Tika, S.Sn.", "Ruang Seni"],
  ],
  Kamis: [
    ["07.30–08.50", "Bahasa Indonesia", "Pak Budi, S.Pd.", "VII-A"],
    ["09.10–10.30", "Pendidikan Pancasila", "Ibu Nia, S.Pd.", "VII-A"],
    ["10.45–12.00", "Bahasa Inggris", "Pak Andi, S.Pd.", "VII-A"],
  ],
  Jumat: [
    ["07.30–08.30", "Pendidikan Agama", "Pak Hasan, S.Ag.", "VII-A"],
    ["08.30–09.30", "Prakarya", "Ibu Tika, S.Sn.", "Ruang Karya"],
    ["09.45–10.30", "Literasi", "Wali Kelas", "Perpustakaan"],
  ],
};

export const students = [
  { name: "Alya Putri", className: "VII-A", icon: "👧", attendanceCode: "QR-VIIA-ALYA-01" },
  { name: "Bima Pratama", className: "VII-A", icon: "👦", attendanceCode: "QR-VIIA-BIMA-02" },
  { name: "Citra Lestari", className: "VII-A", icon: "👩", attendanceCode: "QR-VIIA-CITRA-03" },
  { name: "Dafa Ramadhan", className: "VII-A", icon: "🧑", attendanceCode: "QR-VIIA-DAFA-04" },
  { name: "Nadia Safira", className: "VII-A", icon: "👧", attendanceCode: "QR-VIIA-NADIA-05" },
];

const subjectStyles = {
  "Pendidikan Agama dan Budi Pekerti": ["🕌", "#b7791f", "#fff5dc"],
  "Pendidikan Pancasila": ["🇮🇩", "#6658d9", "#f0eeff"],
  "Bahasa Indonesia": ["✍️", "#d95877", "#fff0f5"],
  "Bahasa Inggris": ["🔤", "#3478bd", "#eaf3ff"],
  Matematika: ["📐", "#4568c7", "#edf1ff"],
  Informatika: ["💻", "#596579", "#eef1f5"],
  Sejarah: ["🏛️", "#bb7131", "#fff2e5"],
  "Pendidikan Jasmani, Olahraga, dan Kesehatan": ["🏃", "#238c6c", "#e8f7f0"],
  Biologi: ["🌿", "#238b68", "#e7f7ee"],
  Fisika: ["⚛️", "#6752bb", "#f0edff"],
  Kimia: ["🧪", "#548a37", "#eff7e8"],
  Geografi: ["🌏", "#328c9a", "#e7f6f7"],
  Ekonomi: ["📈", "#b68125", "#fff6df"],
  Sosiologi: ["👥", "#ad5276", "#fff0f6"],
  "Seni Budaya": ["🎨", "#c85352", "#fff0ed"],
  "Prakarya dan Kewirausahaan": ["🛠️", "#bd6b32", "#fff2e8"],
  Antropologi: ["🧭", "#397f8c", "#eaf6f7"],
};

const officialPublisher = "Pusat Perbukuan, Kemendikbudristek";

function makeClassBooks(grade, roman, subjects) {
  return subjects.map(([subject, availability]) => ({
    title: `Buku Siswa ${subject} untuk SMA/MA Kelas ${roman}`,
    grade,
    roman,
    subject,
    author: "Tim Penulis Buku Teks Utama Kemendikbudristek",
    publisher: officialPublisher,
    icon: subjectStyles[subject][0],
    color: subjectStyles[subject][1],
    tint: subjectStyles[subject][2],
    availability,
  }));
}

export const books = [
  ...makeClassBooks("10", "X", [
    ["Pendidikan Agama dan Budi Pekerti", "Tersedia"],
    ["Pendidikan Pancasila", "Tersedia"],
    ["Bahasa Indonesia", "Tersedia"],
    ["Bahasa Inggris", "Dipinjam"],
    ["Matematika", "Tersedia"],
    ["Informatika", "Tersedia"],
    ["Sejarah", "Tersedia"],
    ["Pendidikan Jasmani, Olahraga, dan Kesehatan", "Tersedia"],
    ["Biologi", "Tersedia"],
    ["Fisika", "Tersedia"],
    ["Kimia", "Dipinjam"],
  ]),
  ...makeClassBooks("11", "XI", [
    ["Pendidikan Agama dan Budi Pekerti", "Tersedia"],
    ["Pendidikan Pancasila", "Tersedia"],
    ["Bahasa Indonesia", "Tersedia"],
    ["Bahasa Inggris", "Tersedia"],
    ["Matematika", "Dipinjam"],
    ["Informatika", "Tersedia"],
    ["Sejarah", "Tersedia"],
    ["Pendidikan Jasmani, Olahraga, dan Kesehatan", "Tersedia"],
    ["Biologi", "Tersedia"],
    ["Fisika", "Tersedia"],
    ["Kimia", "Tersedia"],
    ["Geografi", "Tersedia"],
    ["Ekonomi", "Tersedia"],
    ["Sosiologi", "Dipinjam"],
  ]),
  ...makeClassBooks("12", "XII", [
    ["Pendidikan Agama dan Budi Pekerti", "Tersedia"],
    ["Pendidikan Pancasila", "Tersedia"],
    ["Bahasa Indonesia", "Tersedia"],
    ["Bahasa Inggris", "Tersedia"],
    ["Matematika", "Tersedia"],
    ["Informatika", "Tersedia"],
    ["Sejarah", "Dipinjam"],
    ["Pendidikan Jasmani, Olahraga, dan Kesehatan", "Tersedia"],
    ["Biologi", "Tersedia"],
    ["Fisika", "Tersedia"],
    ["Kimia", "Tersedia"],
    ["Geografi", "Tersedia"],
    ["Ekonomi", "Tersedia"],
    ["Sosiologi", "Tersedia"],
    ["Seni Budaya", "Tersedia"],
    ["Prakarya dan Kewirausahaan", "Tersedia"],
    ["Antropologi", "Tersedia"],
  ]),
];

export const announcements = [
  {
    title: "Pekan Literasi Sekolah",
    text: "Ayo ramaikan Pekan Literasi pada 21–25 Oktober! Bawa buku favoritmu dan ikuti kegiatan membaca bersama di perpustakaan.",
    date: "14 Oktober 2026",
    icon: "📚",
  },
  {
    title: "Jadwal Ulangan Tengah Semester",
    text: "Ulangan Tengah Semester dimulai pada Senin, 26 Oktober. Jangan lupa menyiapkan perlengkapan dan belajar dengan teratur.",
    date: "12 Oktober 2026",
    icon: "📝",
  },
  {
    title: "Kerja Bakti Jumat Bersih",
    text: "Seluruh siswa diharapkan membawa alat kebersihan masing-masing. Kegiatan dimulai pukul 07.00 di halaman sekolah.",
    date: "10 Oktober 2026",
    icon: "🌱",
  },
];
