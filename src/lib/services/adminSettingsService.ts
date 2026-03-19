import { useEffect, useState } from "react";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { firebaseDB } from "@/lib/firebase";

export const DEFAULT_PLATFORM_LOGO_PATH = "/brand-mark.svg";
export const DEFAULT_PLATFORM_FAVICON_PATH = "/favicon.svg";
export const DEFAULT_PLATFORM_TOUCH_ICON_PATH = "/apple-touch-icon.png";
export const DEFAULT_PLATFORM_RASTER_ICON_PATH = "/icon-192.png";
export const DEFAULT_PLATFORM_SHARE_IMAGE_PATH = "/icon-512.png";
export const DEFAULT_PLATFORM_NAME = "Multicourses";
export const DEFAULT_SITE_URL = "https://multicourses.web.app";
export const DEFAULT_THEME_COLOR = "#2563eb";
export const DEFAULT_PWA_BACKGROUND_COLOR = "#ffffff";
export const DEFAULT_PLATFORM_TAGLINE = "Academic Platform";
export const DEFAULT_PUBLIC_WORKSPACE_LABEL = "Public Workspace";
export const DEFAULT_PUBLIC_FOOTER_TAGLINE =
  "Built for teachers, students, institutions, and academic operations.";
export const DEFAULT_FOOTER_EYEBROW_LABEL = "Platform";
export const DEFAULT_FOOTER_GENERAL_TITLE = "General";
export const DEFAULT_FOOTER_LEGAL_TITLE = "Legal";
export const DEFAULT_FOOTER_CONTACT_TITLE = "Contact";
export const DEFAULT_FOOTER_HOME_LABEL = "Home";
export const DEFAULT_FOOTER_ABOUT_LABEL = "About";
export const DEFAULT_FOOTER_CONTACT_LINK_LABEL = "Contact";
export const DEFAULT_FOOTER_PLANS_LABEL = "Plans";
export const DEFAULT_FOOTER_HOME_HREF = "/";
export const DEFAULT_FOOTER_ABOUT_HREF = "/about";
export const DEFAULT_FOOTER_CONTACT_HREF = "/contact";
export const DEFAULT_FOOTER_PLANS_HREF = "/plans/starter-annual";
export const DEFAULT_FOOTER_PRIVACY_LABEL = "Privacy Policy";
export const DEFAULT_FOOTER_TERMS_LABEL = "Terms & Conditions";
export const DEFAULT_FOOTER_COOKIES_LABEL = "Cookies Policy";
export const DEFAULT_FOOTER_PRIVACY_HREF = "/privacy-policy";
export const DEFAULT_FOOTER_TERMS_HREF = "/terms-and-conditions";
export const DEFAULT_FOOTER_COOKIES_HREF = "/cookies-policy";
export const DEFAULT_FOOTER_SUPPORT_LABEL = "Support";
export const DEFAULT_FOOTER_DIRECT_CONTACT_LABEL = "Contact";
export const DEFAULT_FOOTER_PHONE_LABEL = "Phone";
export const DEFAULT_FOOTER_WHATSAPP_LABEL = "WhatsApp";
export const DEFAULT_FOOTER_COPYRIGHT_TEMPLATE = "© {{year}} {{platformName}}. All rights reserved.";
export const DEFAULT_PWA_SHORT_NAME = "Multicourses";
export const DEFAULT_PWA_COURSES_LABEL = "Courses";
export const DEFAULT_PWA_GRADES_LABEL = "Grades";
export const DEFAULT_SITE_DESCRIPTION =
  `${DEFAULT_PLATFORM_NAME} is an academic platform for teachers, students, and institutions with course management, academic tracking, approval workflows, and plan control.`;
export const DEFAULT_SITE_KEYWORDS =
  `academic platform, LMS, course management, teacher dashboard, student dashboard, education software, ${DEFAULT_PLATFORM_NAME}`;
export const ADMIN_PLATFORM_SETTINGS_STORAGE_KEY = "admin-platform-settings-cache";
export const ADMIN_PLATFORM_NAME_STORAGE_KEY = "admin-platform-name-cache";
export const ADMIN_PLATFORM_NAME_COOKIE = "admin_platform_name";

const LEGACY_LOGO_PATHS = new Set([
  "",
  "/logo.png",
  "logo.png",
  "/favicon.ico",
  "favicon.ico",
]);

const normalizePathValue = (value: unknown): string => String(value || "").trim();

export function applyPlatformNameTemplate(value: unknown, platformName: string): string {
  return String(value || "").replace(/Socrattica|\{\{platformName\}\}/g, platformName);
}

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

export function resolvePlatformSiteUrl(value: unknown): string {
  const normalized = String(value || "").trim();
  if (!normalized) return DEFAULT_SITE_URL;

  try {
    const parsed = new URL(normalized);
    const normalizedPath = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${normalizedPath}`;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export function resolveHexColor(value: unknown, fallback: string): string {
  const normalized = String(value || "").trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)
    ? normalized
    : fallback;
}

export function resolvePlatformThemeColor(value: unknown): string {
  return resolveHexColor(value, DEFAULT_THEME_COLOR);
}

export function resolveInternalRoute(value: unknown, fallback: string): string {
  const normalized = String(value || "").trim();
  if (!normalized) return fallback;
  if (/^[a-z]+:/i.test(normalized)) return fallback;
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

export type AdminPlatformSettings = {
  platformName: string;
  platformTagline: string;
  publicWorkspaceLabel: string;
  publicFooterTagline: string;
  footerEyebrowLabel: string;
  footerGeneralTitle: string;
  footerLegalTitle: string;
  footerContactTitle: string;
  footerHomeLabel: string;
  footerAboutLabel: string;
  footerContactLinkLabel: string;
  footerPlansLabel: string;
  footerHomeHref: string;
  footerAboutHref: string;
  footerContactHref: string;
  footerPlansHref: string;
  footerPrivacyLabel: string;
  footerTermsLabel: string;
  footerCookiesLabel: string;
  footerPrivacyHref: string;
  footerTermsHref: string;
  footerCookiesHref: string;
  footerSupportLabel: string;
  footerDirectContactLabel: string;
  footerPhoneLabel: string;
  footerWhatsAppLabel: string;
  footerCopyrightTemplate: string;
  siteUrl: string;
  siteDescription: string;
  siteKeywords: string;
  themeColor: string;
  pwaShortName: string;
  pwaBackgroundColor: string;
  pwaCoursesShortcutLabel: string;
  pwaGradesShortcutLabel: string;
  logoUrl: string;
  faviconUrl: string;
  touchIconUrl: string;
  shareImageUrl: string;
  supportEmail: string;
  contactEmail: string;
  supportPhone: string;
  supportWhatsApp: string;
  publicActiveUsersCount: number;
  maintenanceMode: boolean;
  maintenanceCtaLabel: string;
  maintenanceCtaHref: string;
  maintenanceTitle: string;
  maintenanceMessage: string;
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
  platformName: DEFAULT_PLATFORM_NAME,
  platformTagline: DEFAULT_PLATFORM_TAGLINE,
  publicWorkspaceLabel: DEFAULT_PUBLIC_WORKSPACE_LABEL,
  publicFooterTagline: DEFAULT_PUBLIC_FOOTER_TAGLINE,
  footerEyebrowLabel: DEFAULT_FOOTER_EYEBROW_LABEL,
  footerGeneralTitle: DEFAULT_FOOTER_GENERAL_TITLE,
  footerLegalTitle: DEFAULT_FOOTER_LEGAL_TITLE,
  footerContactTitle: DEFAULT_FOOTER_CONTACT_TITLE,
  footerHomeLabel: DEFAULT_FOOTER_HOME_LABEL,
  footerAboutLabel: DEFAULT_FOOTER_ABOUT_LABEL,
  footerContactLinkLabel: DEFAULT_FOOTER_CONTACT_LINK_LABEL,
  footerPlansLabel: DEFAULT_FOOTER_PLANS_LABEL,
  footerHomeHref: DEFAULT_FOOTER_HOME_HREF,
  footerAboutHref: DEFAULT_FOOTER_ABOUT_HREF,
  footerContactHref: DEFAULT_FOOTER_CONTACT_HREF,
  footerPlansHref: DEFAULT_FOOTER_PLANS_HREF,
  footerPrivacyLabel: DEFAULT_FOOTER_PRIVACY_LABEL,
  footerTermsLabel: DEFAULT_FOOTER_TERMS_LABEL,
  footerCookiesLabel: DEFAULT_FOOTER_COOKIES_LABEL,
  footerPrivacyHref: DEFAULT_FOOTER_PRIVACY_HREF,
  footerTermsHref: DEFAULT_FOOTER_TERMS_HREF,
  footerCookiesHref: DEFAULT_FOOTER_COOKIES_HREF,
  footerSupportLabel: DEFAULT_FOOTER_SUPPORT_LABEL,
  footerDirectContactLabel: DEFAULT_FOOTER_DIRECT_CONTACT_LABEL,
  footerPhoneLabel: DEFAULT_FOOTER_PHONE_LABEL,
  footerWhatsAppLabel: DEFAULT_FOOTER_WHATSAPP_LABEL,
  footerCopyrightTemplate: DEFAULT_FOOTER_COPYRIGHT_TEMPLATE,
  siteUrl: DEFAULT_SITE_URL,
  siteDescription: DEFAULT_SITE_DESCRIPTION,
  siteKeywords: DEFAULT_SITE_KEYWORDS,
  themeColor: DEFAULT_THEME_COLOR,
  pwaShortName: DEFAULT_PWA_SHORT_NAME,
  pwaBackgroundColor: DEFAULT_PWA_BACKGROUND_COLOR,
  pwaCoursesShortcutLabel: DEFAULT_PWA_COURSES_LABEL,
  pwaGradesShortcutLabel: DEFAULT_PWA_GRADES_LABEL,
  logoUrl: DEFAULT_PLATFORM_LOGO_PATH,
  faviconUrl: DEFAULT_PLATFORM_FAVICON_PATH,
  touchIconUrl: DEFAULT_PLATFORM_TOUCH_ICON_PATH,
  shareImageUrl: DEFAULT_PLATFORM_SHARE_IMAGE_PATH,
  supportEmail: "rcroman20@gmail.com",
  contactEmail: "rcroman20@gmail.com",
  supportPhone: "",
  supportWhatsApp: "",
  publicActiveUsersCount: 0,
  maintenanceMode: false,
  maintenanceCtaLabel: "Request support",
  maintenanceCtaHref: "/contact",
  maintenanceTitle: "{{platformName}} is temporarily under maintenance",
  maintenanceMessage:
    "Student and teacher workspaces are temporarily paused while the admin team applies updates.",
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

function readStoredAdminPlatformSettings(): Partial<AdminPlatformSettings> | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(ADMIN_PLATFORM_SETTINGS_STORAGE_KEY);
    if (!raw) {
      const platformName = String(
        window.localStorage.getItem(ADMIN_PLATFORM_NAME_STORAGE_KEY) || "",
      ).trim();
      if (platformName) return { platformName };

      const cookiePlatformName = readStoredPlatformNameCookie();
      return cookiePlatformName ? { platformName: cookiePlatformName } : null;
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Partial<AdminPlatformSettings>) : null;
  } catch {
    try {
      const platformName = String(
        window.localStorage.getItem(ADMIN_PLATFORM_NAME_STORAGE_KEY) || "",
      ).trim();
      if (platformName) return { platformName };

      const cookiePlatformName = readStoredPlatformNameCookie();
      return cookiePlatformName ? { platformName: cookiePlatformName } : null;
    } catch {
      return null;
    }
  }
}

function readStoredPlatformNameCookie(): string {
  if (typeof document === "undefined") return "";

  try {
    const encodedName = `${ADMIN_PLATFORM_NAME_COOKIE}=`;
    const match = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(encodedName));
    if (!match) return "";
    return decodeURIComponent(match.slice(encodedName.length)).trim();
  } catch {
    return "";
  }
}

function persistStoredPlatformNameCookie(platformName: string) {
  if (typeof document === "undefined") return;

  try {
    document.cookie = `${ADMIN_PLATFORM_NAME_COOKIE}=${encodeURIComponent(platformName)}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // Ignore cookie write failures so settings loading never breaks the app.
  }
}

function persistStoredAdminPlatformSettings(settings: AdminPlatformSettings) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(ADMIN_PLATFORM_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    window.localStorage.setItem(ADMIN_PLATFORM_NAME_STORAGE_KEY, settings.platformName);
    persistStoredPlatformNameCookie(settings.platformName);
  } catch {
    // Ignore storage write failures so settings loading never breaks the app.
  }
}

let cachedSettings: AdminPlatformSettings = normalizeAdminPlatformSettings(
  readStoredAdminPlatformSettings() || defaultSettings,
);

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
    platformTagline:
      String(value?.platformTagline || defaultSettings.platformTagline).trim() ||
      defaultSettings.platformTagline,
    publicWorkspaceLabel:
      String(value?.publicWorkspaceLabel || defaultSettings.publicWorkspaceLabel).trim() ||
      defaultSettings.publicWorkspaceLabel,
    publicFooterTagline:
      String(value?.publicFooterTagline || defaultSettings.publicFooterTagline).trim() ||
      defaultSettings.publicFooterTagline,
    footerEyebrowLabel:
      String(value?.footerEyebrowLabel || defaultSettings.footerEyebrowLabel).trim() ||
      defaultSettings.footerEyebrowLabel,
    footerGeneralTitle:
      String(value?.footerGeneralTitle || defaultSettings.footerGeneralTitle).trim() ||
      defaultSettings.footerGeneralTitle,
    footerLegalTitle:
      String(value?.footerLegalTitle || defaultSettings.footerLegalTitle).trim() ||
      defaultSettings.footerLegalTitle,
    footerContactTitle:
      String(value?.footerContactTitle || defaultSettings.footerContactTitle).trim() ||
      defaultSettings.footerContactTitle,
    footerHomeLabel:
      String(value?.footerHomeLabel || defaultSettings.footerHomeLabel).trim() ||
      defaultSettings.footerHomeLabel,
    footerAboutLabel:
      String(value?.footerAboutLabel || defaultSettings.footerAboutLabel).trim() ||
      defaultSettings.footerAboutLabel,
    footerContactLinkLabel:
      String(value?.footerContactLinkLabel || defaultSettings.footerContactLinkLabel).trim() ||
      defaultSettings.footerContactLinkLabel,
    footerPlansLabel:
      String(value?.footerPlansLabel || defaultSettings.footerPlansLabel).trim() ||
      defaultSettings.footerPlansLabel,
    footerHomeHref: resolveInternalRoute(
      value?.footerHomeHref || defaultSettings.footerHomeHref,
      defaultSettings.footerHomeHref,
    ),
    footerAboutHref: resolveInternalRoute(
      value?.footerAboutHref || defaultSettings.footerAboutHref,
      defaultSettings.footerAboutHref,
    ),
    footerContactHref: resolveInternalRoute(
      value?.footerContactHref || defaultSettings.footerContactHref,
      defaultSettings.footerContactHref,
    ),
    footerPlansHref: resolveInternalRoute(
      value?.footerPlansHref || defaultSettings.footerPlansHref,
      defaultSettings.footerPlansHref,
    ),
    footerPrivacyLabel:
      String(value?.footerPrivacyLabel || defaultSettings.footerPrivacyLabel).trim() ||
      defaultSettings.footerPrivacyLabel,
    footerTermsLabel:
      String(value?.footerTermsLabel || defaultSettings.footerTermsLabel).trim() ||
      defaultSettings.footerTermsLabel,
    footerCookiesLabel:
      String(value?.footerCookiesLabel || defaultSettings.footerCookiesLabel).trim() ||
      defaultSettings.footerCookiesLabel,
    footerPrivacyHref: resolveInternalRoute(
      value?.footerPrivacyHref || defaultSettings.footerPrivacyHref,
      defaultSettings.footerPrivacyHref,
    ),
    footerTermsHref: resolveInternalRoute(
      value?.footerTermsHref || defaultSettings.footerTermsHref,
      defaultSettings.footerTermsHref,
    ),
    footerCookiesHref: resolveInternalRoute(
      value?.footerCookiesHref || defaultSettings.footerCookiesHref,
      defaultSettings.footerCookiesHref,
    ),
    footerSupportLabel:
      String(value?.footerSupportLabel || defaultSettings.footerSupportLabel).trim() ||
      defaultSettings.footerSupportLabel,
    footerDirectContactLabel:
      String(value?.footerDirectContactLabel || defaultSettings.footerDirectContactLabel).trim() ||
      defaultSettings.footerDirectContactLabel,
    footerPhoneLabel:
      String(value?.footerPhoneLabel || defaultSettings.footerPhoneLabel).trim() ||
      defaultSettings.footerPhoneLabel,
    footerWhatsAppLabel:
      String(value?.footerWhatsAppLabel || defaultSettings.footerWhatsAppLabel).trim() ||
      defaultSettings.footerWhatsAppLabel,
    footerCopyrightTemplate:
      String(value?.footerCopyrightTemplate || defaultSettings.footerCopyrightTemplate).trim() ||
      defaultSettings.footerCopyrightTemplate,
    siteUrl: resolvePlatformSiteUrl(value?.siteUrl || defaultSettings.siteUrl),
    siteDescription:
      String(value?.siteDescription || defaultSettings.siteDescription).trim() ||
      defaultSettings.siteDescription,
    siteKeywords:
      String(value?.siteKeywords || defaultSettings.siteKeywords).trim() ||
      defaultSettings.siteKeywords,
    themeColor: resolvePlatformThemeColor(value?.themeColor || defaultSettings.themeColor),
    pwaShortName:
      String(value?.pwaShortName || defaultSettings.pwaShortName).trim() ||
      defaultSettings.pwaShortName,
    pwaBackgroundColor: resolveHexColor(
      value?.pwaBackgroundColor || defaultSettings.pwaBackgroundColor,
      DEFAULT_PWA_BACKGROUND_COLOR,
    ),
    pwaCoursesShortcutLabel:
      String(value?.pwaCoursesShortcutLabel || defaultSettings.pwaCoursesShortcutLabel).trim() ||
      defaultSettings.pwaCoursesShortcutLabel,
    pwaGradesShortcutLabel:
      String(value?.pwaGradesShortcutLabel || defaultSettings.pwaGradesShortcutLabel).trim() ||
      defaultSettings.pwaGradesShortcutLabel,
    logoUrl: resolvePlatformLogoUrl(value?.logoUrl || defaultSettings.logoUrl),
    faviconUrl: resolvePlatformFaviconUrl(value?.faviconUrl || value?.logoUrl || defaultSettings.faviconUrl),
    touchIconUrl: resolvePlatformTouchIconUrl(
      value?.touchIconUrl || value?.logoUrl || defaultSettings.touchIconUrl,
    ),
    shareImageUrl: resolvePlatformShareImageUrl(
      value?.shareImageUrl || value?.logoUrl || defaultSettings.shareImageUrl,
    ),
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
    maintenanceTitle:
      String(value?.maintenanceTitle || defaultSettings.maintenanceTitle).trim() ||
      defaultSettings.maintenanceTitle,
    maintenanceMessage:
      String(value?.maintenanceMessage || defaultSettings.maintenanceMessage).trim() ||
      defaultSettings.maintenanceMessage,
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
  persistStoredAdminPlatformSettings(cachedSettings);
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
