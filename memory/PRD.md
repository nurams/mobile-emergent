# PRD — Aplikasi Absensi (AbsensiKu)

## Original Problem Statement
Mobile app absensi karyawan: login, buat akun, deteksi geolocation dari titik kantor, biometrik (fingerprint & face), dashboard check-in/checkout, dashboard profile, setting untuk menambah finger & face (limit masing-masing 1 per akun agar tidak disalahgunakan), logout. Navigasi: Home, Dashboard Absen, Profile, Setting.

## User Choices
- Auth: Email + password (JWT custom)
- Biometrik: bawaan HP (expo-local-authentication / Face ID & fingerprint perangkat)
- Geofence: koordinat & radius diisi nanti (default seeded: lat -6.2, lng 106.816666, radius 200m, "Kantor Pusat")
- Lokasi di Home: status teks (dalam/luar area + jarak), tanpa peta
- Tema: Biru profesional (corporate)

## Architecture
- Backend: FastAPI + MongoDB (motor), JWT (pyjwt), passlib bcrypt. Semua route prefix /api.
- Frontend: Expo Router, React Query, react-native-keyboard-controller, expo-location, expo-local-authentication, Ionicons.
- Auth token disimpan via `@/src/utils/storage` secureGet/secureSet (key: absensi_access_token).

## Core Requirements (static)
- Akun email+password, JWT 30 hari.
- Geofence haversine di backend (tolak absen di luar radius).
- Biometrik max 1 face + 1 fingerprint per akun (enforced di backend, 409 jika sudah ada).
- Check-in/out harian, status hadir/terlambat (WORK_START_HOUR=9).
- Riwayat per bulan.

## Implemented (2026-10-04)
- Backend endpoints: /auth/register|login|me|profile, /biometrics (get/enroll/delete), /office-location (get/put), /attendance/checkin|checkout|today, /attendance?month=.
- Frontend screens: Login, Register, Home (geo status + punch finger/face), Riwayat (month chips + cards + empty state), Profile (cover+avatar+data), Setting (enroll/remove biometrik + logout).
- Toast system, auth context + route guards, professional blue theme in src/theme.ts.
- Permissions: app.json location + Face ID/biometric descriptions (iOS) & Android permissions.
- Tested: 11/11 backend pytest pass; frontend flows verified.

## Backlog / Remaining
- P1: Admin UI untuk set koordinat & radius kantor dari dalam app (endpoint PUT /office-location sudah ada).
- P2: Edit profil & foto avatar (upload via Object Storage).
- P2: Ringkasan statistik bulanan (jumlah hadir/terlambat).
- P2: Dark mode.

## Notes
- Biometrik & geolocation permission flows hanya bisa diuji penuh di build native (bukan Expo Go web preview).
