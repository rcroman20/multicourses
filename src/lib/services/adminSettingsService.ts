import { useEffect, useState } from "react";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { firebaseDB } from "@/lib/firebase";

export const DEFAULT_PLATFORM_LOGO_PATH = "/brand-mark.svg";
export const DEFAULT_PLATFORM_FAVICON_PATH = "/favicon.svg";
export const DEFAULT_PLATFORM_TOUCH_ICON_PATH = "/apple-touch-icon.png";
export const DEFAULT_PLATFORM_RASTER_ICON_PATH = "/icon-192.png";
export const DEFAULT_PLATFORM_SHARE_IMAGE_PATH = "/icon-512.png";

const LEGACY_LOGO_PATHS = new Set([
  "",
  "/logo.png",
  "logo.png",
  "/favicon.ico",
  "favicon.ico",
]);

const normalizePathValue = (value: unknown): string => String(value || "").trim();

export function resolvePlatformLogoUrl(value: unknown): string {
  const normalized = normalizePathValue(value);
  return LEGACY_LOGO_PATHS.has(normalized) ? DEFAULT_PLATFORM_LOGO_PATH : normalized;
}

export function resolvePlatformFaviconUrl(value: unknown): string {
  const normalized = normalizePathValue(value);
  return LEGACY_LOGO_PATHS.has(normalized) ? DEFAULT_PLATFORM_FAVICON_PATH : normalized;
}

export function resolvePlatformTouchIconUrl(value: unknown): string {
  const normalized = normalizePathValue(value);
  return LEGACY_LOGO_PATHS.has(normalized) ? DEFAULT_PLATFORM_TOUCH_ICON_PATH : normalized;
}

export function resolvePlatformRasterIconUrl(value: unknown): string {
  const normalized = normalizePathValue(value);
  return LEGACY_LOGO_PATHS.has(normalized) ? DEFAULT_PLATFORM_RASTER_ICON_PATH : normalized;
}

export function resolvePlatformShareImageUrl(value: unknown): string {
  const normalized = normalizePathValue(value);
  return LEGACY_LOGO_PATHS.has(normalized) ? DEFAULT_PLATFORM_SHARE_IMAGE_PATH : normalized;
}

export type AdminPlatformSettings = {
  platformName: string;
  logoUrl: string;
  supportEmail: string;
  contactEmail: string;
  supportPhone: string;
  supportWhatsApp: string;
  publicActiveUsersCount: number;
  maintenanceMode: boolean;
  maintenanceCtaLabel: string;
  maintenanceCtaHref: string;
  defaultResponseHoursStarter: number;
  defaultResponseHoursPriority: number;
  defaultOnboardingMonths: number;
  defaultStudentPerCourseLimit: number;
  globalBannerText: string;
  publicAnnouncementTone: "info" | "warning" | "critical";
  allowTeacherSelfRequest: boolean;
  teacherSelfRequestMessage: string;
  allowBackupDeletionByAdmin: boolean;
};

const defaultSettings: AdminPlatformSettings = {
  platformName: "Socrattica",
  logoUrl: DEFAULT_PLATFORM_LOGO_PATH,
  supportEmail: "rcroman20@gmail.com",
  contactEmail: "rcroman20@gmail.com",
  supportPhone: "",
  supportWhatsApp: "",
  publicActiveUsersCount: 0,
  maintenanceMode: false,
  maintenanceCtaLabel: "Request support",
  maintenanceCtaHref: "/contact",
  defaultResponseHoursStarter: 48,
  defaultResponseHoursPriority: 24,
  defaultOnboardingMonths: 2,
  defaultStudentPerCourseLimit: 35,
  globalBannerText: "",
  publicAnnouncementTone: "info",
  allowTeacherSelfRequest: true,
  teacherSelfRequestMessage:
    "Teacher self-registration is currently disabled. Please contact the admin team to request access.",
  allowBackupDeletionByAdmin: true,
};

const platformSettingsRef = doc(firebaseDB, "adminConfig", "platformSettings");
let cachedSettings: AdminPlatformSettings = defaultSettings;

function toSafeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeAdminPlatformSettings(
  value?: Partial<AdminPlatformSettings> | null,
): AdminPlatformSettings {
  const announcementTone =
    value?.publicAnnouncementTone === "warning" || value?.publicAnnouncementTone === "critical"
      ? value.publicAnnouncementTone
      : "info";

  return {
    platformName: String(value?.platformName || defaultSettings.platformName).trim() || defaultSettings.platformName,
    logoUrl: resolvePlatformLogoUrl(value?.logoUrl || defaultSettings.logoUrl),
    supportEmail: String(value?.supportEmail || defaultSettings.supportEmail).trim().toLowerCase(),
    contactEmail: String(value?.contactEmail || defaultSettings.contactEmail).trim().toLowerCase(),
    supportPhone: String(value?.supportPhone || "").trim(),
    supportWhatsApp: String(value?.supportWhatsApp || "").trim(),
    publicActiveUsersCount: Math.max(
      0,
      Math.floor(toSafeNumber(value?.publicActiveUsersCount, defaultSettings.publicActiveUsersCount)),
    ),
    maintenanceMode: value?.maintenanceMode === true,
    maintenanceCtaLabel:
      String(value?.maintenanceCtaLabel || defaultSettings.maintenanceCtaLabel).trim() ||
      defaultSettings.maintenanceCtaLabel,
    maintenanceCtaHref:
      String(value?.maintenanceCtaHref || defaultSettings.maintenanceCtaHref).trim() ||
      defaultSettings.maintenanceCtaHref,
    defaultResponseHoursStarter: toSafeNumber(
      value?.defaultResponseHoursStarter,
      defaultSettings.defaultResponseHoursStarter,
    ),
    defaultResponseHoursPriority: toSafeNumber(
      value?.defaultResponseHoursPriority,
      defaultSettings.defaultResponseHoursPriority,
    ),
    defaultOnboardingMonths: toSafeNumber(
      value?.defaultOnboardingMonths,
      defaultSettings.defaultOnboardingMonths,
    ),
    defaultStudentPerCourseLimit: toSafeNumber(
      value?.defaultStudentPerCourseLimit,
      defaultSettings.defaultStudentPerCourseLimit,
    ),
    globalBannerText: String(value?.globalBannerText || "").trim(),
    publicAnnouncementTone: announcementTone,
    allowTeacherSelfRequest:
      value?.allowTeacherSelfRequest !== false,
    teacherSelfRequestMessage:
      String(value?.teacherSelfRequestMessage || defaultSettings.teacherSelfRequestMessage).trim() ||
      defaultSettings.teacherSelfRequestMessage,
    allowBackupDeletionByAdmin:
      value?.allowBackupDeletionByAdmin !== false,
  };
}

function setCachedSettings(settings: Partial<AdminPlatformSettings> | null | undefined) {
  cachedSettings = normalizeAdminPlatformSettings(settings);
  return cachedSettings;
}

export function getAdminPlatformSettings(): AdminPlatformSettings {
  return cachedSettings;
}

export async function loadAdminPlatformSettings(): Promise<AdminPlatformSettings> {
  try {
    const snapshot = await getDoc(platformSettingsRef);
    return setCachedSettings(snapshot.exists() ? snapshot.data() : defaultSettings);
  } catch {
    return cachedSettings;
  }
}

export function subscribeToAdminPlatformSettings(
  onChange: (settings: AdminPlatformSettings) => void,
): () => void {
  onChange(cachedSettings);

  return onSnapshot(
    platformSettingsRef,
    (snapshot) => {
      onChange(setCachedSettings(snapshot.exists() ? snapshot.data() : defaultSettings));
    },
    () => {
      onChange(cachedSettings);
    },
  );
}

export async function saveAdminPlatformSettings(
  settings: AdminPlatformSettings,
): Promise<AdminPlatformSettings> {
  const normalized = normalizeAdminPlatformSettings(settings);
  await setDoc(platformSettingsRef, normalized, { merge: true });
  return setCachedSettings(normalized);
}

export async function resetAdminPlatformSettings(): Promise<AdminPlatformSettings> {
  await setDoc(platformSettingsRef, defaultSettings, { merge: false });
  return setCachedSettings(defaultSettings);
}

export function useAdminPlatformSettings(): {
  settings: AdminPlatformSettings;
  isLoading: boolean;
} {
  const [settings, setSettings] = useState<AdminPlatformSettings>(cachedSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = subscribeToAdminPlatformSettings((next) => {
      if (!isMounted) return;
      setSettings(next);
      setIsLoading(false);
    });

    void loadAdminPlatformSettings().then((next) => {
      if (!isMounted) return;
      setSettings(next);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return { settings, isLoading };
}
