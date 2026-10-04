import { storage } from "@/src/utils/storage";

export const TOKEN_KEY = "absensi_access_token";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await storage.secureGet<string>(TOKEN_KEY, "");
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      typeof (data as any)?.detail === "string"
        ? (data as any).detail
        : `Terjadi kesalahan (${res.status})`;
    throw new ApiError(detail, res.status);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(p: string) => request<T>(p, { method: "DELETE" }),
};

// ---- Types ----
export type User = {
  id: string;
  email: string;
  name: string;
  position?: string | null;
  department?: string | null;
  employee_id: string;
  avatar_url?: string | null;
  created_at: string;
};

export type BiometricState = {
  enrolled: boolean;
  enrolled_at: string | null;
  device_id: string | null;
};

export type BiometricsResponse = {
  face: BiometricState;
  fingerprint: BiometricState;
};

export type OfficeLocation = {
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
};

export type AttendanceRecord = {
  id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  check_in_method: string | null;
  check_out_method: string | null;
  check_in_distance_m: number | null;
  status: string;
};
