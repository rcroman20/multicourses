export type AdminPlatformSettings = {
  supportEmail: string;
  contactEmail: string;
  maintenanceMode: boolean;
  defaultResponseHoursStarter: number;
  defaultResponseHoursPriority: number;
  defaultOnboardingMonths: number;
  defaultStudentPerCourseLimit: number;
  globalBannerText: string;
  allowTeacherSelfRequest: boolean;
  allowBackupDeletionByAdmin: boolean;
};

const STORAGE_KEY = "multicourses:admin-platform-settings:v1";

const defaultSettings: AdminPlatformSettings = {
  supportEmail: "rcroman20@gmail.com",
  contactEmail: "rcroman20@gmail.com",
  maintenanceMode: false,
  defaultResponseHoursStarter: 48,
  defaultResponseHoursPriority: 24,
  defaultOnboardingMonths: 2,
  defaultStudentPerCourseLimit: 35,
  globalBannerText: "",
  allowTeacherSelfRequest: true,
  allowBackupDeletionByAdmin: true,
};

export function getAdminPlatformSettings(): AdminPlatformSettings {
  if (typeof window === "undefined") return defaultSettings;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<AdminPlatformSettings>;
    return { ...defaultSettings, ...parsed };
  } catch {
    return defaultSettings;
  }
}

export function saveAdminPlatformSettings(settings: AdminPlatformSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function resetAdminPlatformSettings(): AdminPlatformSettings {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  return defaultSettings;
}
