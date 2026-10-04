import * as LocalAuthentication from "expo-local-authentication";

import { storage } from "@/src/utils/storage";

const DEVICE_ID_KEY = "absensi_device_id";

export async function getDeviceId(): Promise<string> {
  const existing = await storage.getItem<string>(DEVICE_ID_KEY, "");
  if (existing) return existing;
  const id = `dev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  await storage.setItem(DEVICE_ID_KEY, id);
  return id;
}

export type BiometricCapability = {
  hasHardware: boolean;
  isDeviceEnrolled: boolean;
  faceSupported: boolean;
  fingerprintSupported: boolean;
};

export async function getCapability(): Promise<BiometricCapability> {
  const [hasHardware, isDeviceEnrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  return {
    hasHardware,
    isDeviceEnrolled,
    faceSupported: types.includes(
      LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
    ),
    fingerprintSupported: types.includes(
      LocalAuthentication.AuthenticationType.FINGERPRINT,
    ),
  };
}

export async function authenticate(prompt: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: prompt,
    disableDeviceFallback: false,
    cancelLabel: "Batal",
  });
  return result.success;
}
