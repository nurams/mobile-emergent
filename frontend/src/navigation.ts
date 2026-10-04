import { Platform } from "react-native";

// iOS 26+ uses the native (liquid glass) tab bar; everything else falls back
// to the classic JS Tabs. "unstable" is only the import path.
export const usesNativeTabs =
  Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;
