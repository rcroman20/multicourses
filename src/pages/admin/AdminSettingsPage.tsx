import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Globe,
  Image,
  Loader2,
  Mail,
  Megaphone,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { appendAdminAuditLog } from "@/lib/services/adminAuditLogService";
import { assertAdminPermission } from "@/lib/services/adminPermissionGuardService";
import {
  DEFAULT_FOOTER_ABOUT_LABEL,
  DEFAULT_FOOTER_ABOUT_HREF,
  DEFAULT_FOOTER_CONTACT_LINK_LABEL,
  DEFAULT_FOOTER_CONTACT_HREF,
  DEFAULT_FOOTER_CONTACT_TITLE,
  DEFAULT_FOOTER_COOKIES_LABEL,
  DEFAULT_FOOTER_COOKIES_HREF,
  DEFAULT_FOOTER_COPYRIGHT_TEMPLATE,
  DEFAULT_FOOTER_DIRECT_CONTACT_LABEL,
  DEFAULT_FOOTER_EYEBROW_LABEL,
  DEFAULT_FOOTER_GENERAL_TITLE,
  DEFAULT_FOOTER_HOME_LABEL,
  DEFAULT_FOOTER_HOME_HREF,
  DEFAULT_FOOTER_LEGAL_TITLE,
  DEFAULT_FOOTER_PHONE_LABEL,
  DEFAULT_FOOTER_PLANS_LABEL,
  DEFAULT_FOOTER_PLANS_HREF,
  DEFAULT_FOOTER_PRIVACY_LABEL,
  DEFAULT_FOOTER_PRIVACY_HREF,
  DEFAULT_FOOTER_SUPPORT_LABEL,
  DEFAULT_FOOTER_TERMS_LABEL,
  DEFAULT_FOOTER_TERMS_HREF,
  DEFAULT_FOOTER_WHATSAPP_LABEL,
  DEFAULT_PLATFORM_FAVICON_PATH,
  DEFAULT_PLATFORM_NAME,
  DEFAULT_PLATFORM_LOGO_PATH,
  DEFAULT_PLATFORM_SHARE_IMAGE_PATH,
  DEFAULT_PLATFORM_TAGLINE,
  DEFAULT_PLATFORM_TOUCH_ICON_PATH,
  DEFAULT_PWA_BACKGROUND_COLOR,
  DEFAULT_PWA_COURSES_LABEL,
  DEFAULT_PWA_GRADES_LABEL,
  DEFAULT_PWA_SHORT_NAME,
  DEFAULT_PUBLIC_FOOTER_TAGLINE,
  DEFAULT_PUBLIC_WORKSPACE_LABEL,
  DEFAULT_SITE_DESCRIPTION,
  DEFAULT_SITE_KEYWORDS,
  DEFAULT_SITE_URL,
  DEFAULT_THEME_COLOR,
  resetAdminPlatformSettings,
  saveAdminPlatformSettings,
  type AdminPlatformSettings,
  useAdminPlatformSettings,
} from "@/lib/services/adminSettingsService";

const clampNumber = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));

export default function AdminSettingsPage() {
  const { user } = useAuth();
  const { settings: liveSettings, isLoading } = useAdminPlatformSettings();
  const [settings, setSettings] = useState<AdminPlatformSettings | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings || !isDirty) {
      setSettings(liveSettings);
    }
  }, [isDirty, liveSettings, settings]);

  const canSave = useMemo(() => {
    if (!settings) return false;
    return isValidEmail(settings.supportEmail) && isValidEmail(settings.contactEmail);
  }, [settings]);

  const updateField = <K extends keyof AdminPlatformSettings>(
    key: K,
    value: AdminPlatformSettings[K],
  ) => {
    setIsDirty(true);
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = async () => {
    if (!settings) return;
    try {
      assertAdminPermission(
        "manageSettings",
        user?.email,
        "You do not have permission to update platform settings.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update settings.");
      return;
    }
    if (!isValidEmail(settings.supportEmail) || !isValidEmail(settings.contactEmail)) {
      toast.error("Please enter valid support and contact emails.");
      return;
    }

    setSaving(true);
    try {
      const next: AdminPlatformSettings = {
        ...settings,
        platformName: String(settings.platformName || "").trim() || DEFAULT_PLATFORM_NAME,
        platformTagline: String(settings.platformTagline || "").trim() || DEFAULT_PLATFORM_TAGLINE,
        publicWorkspaceLabel:
          String(settings.publicWorkspaceLabel || "").trim() || DEFAULT_PUBLIC_WORKSPACE_LABEL,
        publicFooterTagline:
          String(settings.publicFooterTagline || "").trim() || DEFAULT_PUBLIC_FOOTER_TAGLINE,
        footerEyebrowLabel:
          String(settings.footerEyebrowLabel || "").trim() || DEFAULT_FOOTER_EYEBROW_LABEL,
        footerGeneralTitle:
          String(settings.footerGeneralTitle || "").trim() || DEFAULT_FOOTER_GENERAL_TITLE,
        footerLegalTitle:
          String(settings.footerLegalTitle || "").trim() || DEFAULT_FOOTER_LEGAL_TITLE,
        footerContactTitle:
          String(settings.footerContactTitle || "").trim() || DEFAULT_FOOTER_CONTACT_TITLE,
        footerHomeLabel:
          String(settings.footerHomeLabel || "").trim() || DEFAULT_FOOTER_HOME_LABEL,
        footerAboutLabel:
          String(settings.footerAboutLabel || "").trim() || DEFAULT_FOOTER_ABOUT_LABEL,
        footerContactLinkLabel:
          String(settings.footerContactLinkLabel || "").trim() || DEFAULT_FOOTER_CONTACT_LINK_LABEL,
        footerPlansLabel:
          String(settings.footerPlansLabel || "").trim() || DEFAULT_FOOTER_PLANS_LABEL,
        footerHomeHref:
          String(settings.footerHomeHref || "").trim() || DEFAULT_FOOTER_HOME_HREF,
        footerAboutHref:
          String(settings.footerAboutHref || "").trim() || DEFAULT_FOOTER_ABOUT_HREF,
        footerContactHref:
          String(settings.footerContactHref || "").trim() || DEFAULT_FOOTER_CONTACT_HREF,
        footerPlansHref:
          String(settings.footerPlansHref || "").trim() || DEFAULT_FOOTER_PLANS_HREF,
        footerPrivacyLabel:
          String(settings.footerPrivacyLabel || "").trim() || DEFAULT_FOOTER_PRIVACY_LABEL,
        footerTermsLabel:
          String(settings.footerTermsLabel || "").trim() || DEFAULT_FOOTER_TERMS_LABEL,
        footerCookiesLabel:
          String(settings.footerCookiesLabel || "").trim() || DEFAULT_FOOTER_COOKIES_LABEL,
        footerPrivacyHref:
          String(settings.footerPrivacyHref || "").trim() || DEFAULT_FOOTER_PRIVACY_HREF,
        footerTermsHref:
          String(settings.footerTermsHref || "").trim() || DEFAULT_FOOTER_TERMS_HREF,
        footerCookiesHref:
          String(settings.footerCookiesHref || "").trim() || DEFAULT_FOOTER_COOKIES_HREF,
        footerSupportLabel:
          String(settings.footerSupportLabel || "").trim() || DEFAULT_FOOTER_SUPPORT_LABEL,
        footerDirectContactLabel:
          String(settings.footerDirectContactLabel || "").trim() || DEFAULT_FOOTER_DIRECT_CONTACT_LABEL,
        footerPhoneLabel:
          String(settings.footerPhoneLabel || "").trim() || DEFAULT_FOOTER_PHONE_LABEL,
        footerWhatsAppLabel:
          String(settings.footerWhatsAppLabel || "").trim() || DEFAULT_FOOTER_WHATSAPP_LABEL,
        footerCopyrightTemplate:
          String(settings.footerCopyrightTemplate || "").trim() || DEFAULT_FOOTER_COPYRIGHT_TEMPLATE,
        siteUrl: String(settings.siteUrl || "").trim() || DEFAULT_SITE_URL,
        siteDescription:
          String(settings.siteDescription || "").trim() || DEFAULT_SITE_DESCRIPTION,
        siteKeywords: String(settings.siteKeywords || "").trim() || DEFAULT_SITE_KEYWORDS,
        themeColor: String(settings.themeColor || "").trim() || DEFAULT_THEME_COLOR,
        pwaShortName: String(settings.pwaShortName || "").trim() || DEFAULT_PWA_SHORT_NAME,
        pwaBackgroundColor:
          String(settings.pwaBackgroundColor || "").trim() || DEFAULT_PWA_BACKGROUND_COLOR,
        pwaCoursesShortcutLabel:
          String(settings.pwaCoursesShortcutLabel || "").trim() || DEFAULT_PWA_COURSES_LABEL,
        pwaGradesShortcutLabel:
          String(settings.pwaGradesShortcutLabel || "").trim() || DEFAULT_PWA_GRADES_LABEL,
        logoUrl: String(settings.logoUrl || "").trim() || DEFAULT_PLATFORM_LOGO_PATH,
        faviconUrl: String(settings.faviconUrl || "").trim() || DEFAULT_PLATFORM_FAVICON_PATH,
        touchIconUrl:
          String(settings.touchIconUrl || "").trim() || DEFAULT_PLATFORM_TOUCH_ICON_PATH,
        shareImageUrl:
          String(settings.shareImageUrl || "").trim() || DEFAULT_PLATFORM_SHARE_IMAGE_PATH,
        supportEmail: normalizeEmail(settings.supportEmail),
        contactEmail: normalizeEmail(settings.contactEmail),
        supportPhone: String(settings.supportPhone || "").trim(),
        supportWhatsApp: String(settings.supportWhatsApp || "").trim(),
        publicActiveUsersCount: Math.max(
          0,
          Math.floor(Number(settings.publicActiveUsersCount) || 0),
        ),
        maintenanceCtaLabel: String(settings.maintenanceCtaLabel || "").trim(),
        maintenanceCtaHref: String(settings.maintenanceCtaHref || "").trim(),
        maintenanceTitle: String(settings.maintenanceTitle || "").trim(),
        maintenanceMessage: String(settings.maintenanceMessage || "").trim(),
        globalBannerText: String(settings.globalBannerText || "").trim(),
        publicAnnouncementTone:
          settings.publicAnnouncementTone === "warning" || settings.publicAnnouncementTone === "critical"
            ? settings.publicAnnouncementTone
            : "info",
        teacherSelfRequestMessage: String(settings.teacherSelfRequestMessage || "").trim(),
        defaultResponseHoursStarter: clampNumber(
          Math.floor(Number(settings.defaultResponseHoursStarter) || 0),
          1,
          240,
        ),
        defaultResponseHoursPriority: clampNumber(
          Math.floor(Number(settings.defaultResponseHoursPriority) || 0),
          1,
          240,
        ),
        defaultOnboardingMonths: clampNumber(
          Math.floor(Number(settings.defaultOnboardingMonths) || 0),
          1,
          24,
        ),
        defaultStudentPerCourseLimit: clampNumber(
          Math.floor(Number(settings.defaultStudentPerCourseLimit) || 0),
          5,
          500,
        ),
      };

      const savedSettings = await saveAdminPlatformSettings(next);
      void appendAdminAuditLog({
        actorEmail: user?.email || "admin",
        actorName: user?.name || "Admin",
        action: "Updated platform settings",
        category: "settings",
        targetType: "platform_settings",
        targetLabel: "Global defaults",
        detail: `${savedSettings.supportEmail} • maintenance ${savedSettings.maintenanceMode ? "on" : "off"}`,
      }).catch(() => undefined);
      setIsDirty(false);
      setSettings(savedSettings);
      toast.success("Platform defaults saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      assertAdminPermission(
        "manageSettings",
        user?.email,
        "You do not have permission to reset platform settings.",
      );
      const next = await resetAdminPlatformSettings();
      void appendAdminAuditLog({
        actorEmail: user?.email || "admin",
        actorName: user?.name || "Admin",
        action: "Reset platform settings",
        category: "settings",
        targetType: "platform_settings",
        targetLabel: "Global defaults",
      }).catch(() => undefined);
      setIsDirty(false);
      setSettings(next);
      toast.success("Settings restored to defaults.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reset settings.");
    }
  };

  const policyToggleItems = [
    {
      key: "maintenanceMode" as const,
      label: "Maintenance mode",
      value: settings?.maintenanceMode ?? false,
      description: "Pauses student and teacher protected routes. Admin modules remain available.",
    },
    {
      key: "allowTeacherSelfRequest" as const,
      label: "Allow teacher self-request",
      value: settings?.allowTeacherSelfRequest ?? true,
      description: "Controls self-registration and re-apply actions for teacher access requests.",
    },
    {
      key: "allowBackupDeletionByAdmin" as const,
      label: "Allow backup deletion",
      value: settings?.allowBackupDeletionByAdmin ?? true,
      description: "Enables deletion actions in Backups for delegated admins with backup permissions.",
    },
  ];

  if (isLoading && !settings) {
    return (
      <DashboardLayout contentClassName="pt-0 lg:pt-1">
        <div className="flex min-h-[320px] items-center justify-center">
          <div className="space-y-2 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
            <p className="text-base font-semibold text-slate-900">Loading settings</p>
            <p className="text-sm text-slate-600">Preparing global platform defaults</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const configuredBrandAssetCount = [
    settings.logoUrl,
    settings.faviconUrl,
    settings.touchIconUrl,
    settings.shareImageUrl,
  ].filter((value) => String(value || "").trim()).length;
  const configuredSupportChannelCount = [
    settings.supportEmail,
    settings.contactEmail,
    settings.supportPhone,
    settings.supportWhatsApp,
  ].filter((value) => String(value || "").trim()).length;
  const enabledToggleCount = policyToggleItems.filter((item) => item.value).length;
  const hasAnnouncement = Boolean(settings.globalBannerText.trim());

  return (
    <DashboardLayout contentClassName="pt-0 lg:pt-1">
      <div className="relative overflow-x-hidden">
        <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
        <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />

        <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <section className="space-y-4">
            <section className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
              <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-sky-200/35" />
              <div className="pointer-events-none absolute -right-24 -bottom-24 h-64 w-64 rounded-full bg-indigo-200/35" />

              <div className="relative space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                  <Settings2 className="h-3.5 w-3.5" />
                  Admin Module
                </div>

                <div className="min-w-0">
                  <h1 className="mt-1 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                    Settings
                  </h1>
                  <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                    Global platform defaults. Configure support channels, response windows, and operational toggles.
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700">
                        <Mail className="h-4 w-4" />
                      </div>
                      <p className="truncate text-xs font-semibold text-slate-900">{settings.platformName}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Platform name</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">
                        {settings.defaultResponseHoursStarter}h
                      </p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Starter response target</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                        <ShieldCheck className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">
                        {settings.defaultStudentPerCourseLimit}
                      </p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Default students per course</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${
                          settings.maintenanceMode ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {settings.maintenanceMode ? (
                          <AlertTriangle className="h-4 w-4" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                      </div>
                      <p className="shrink-0 text-sm font-bold text-slate-900">
                        {settings.maintenanceMode ? "Maintenance ON" : "Operational"}
                      </p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Platform mode</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm xl:col-span-2">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Branding, Identity & Contact</p>
                    <p className="text-xs text-slate-500">Edit the visible brand, asset paths, and support channels from one place.</p>
                  </div>
                  <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    4 groups
                  </span>
                </div>
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                        <Sparkles className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Core naming and public labels</p>
                        <p className="mt-1 text-xs text-slate-500">Updates the visible name, tagline, workspace label, and footer copy used across the platform.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Platform name</label>
                        <input
                          type="text"
                          value={settings.platformName}
                          onChange={(event) => updateField("platformName", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Platform tagline</label>
                        <input
                          type="text"
                          value={settings.platformTagline}
                          onChange={(event) => updateField("platformTagline", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_PLATFORM_TAGLINE}
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-600">Public workspace label</label>
                          <input
                            type="text"
                            value={settings.publicWorkspaceLabel}
                            onChange={(event) => updateField("publicWorkspaceLabel", event.target.value)}
                            className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                            placeholder={DEFAULT_PUBLIC_WORKSPACE_LABEL}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-600">Theme color</label>
                          <input
                            type="text"
                            value={settings.themeColor}
                            onChange={(event) => updateField("themeColor", event.target.value)}
                            className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                            placeholder={DEFAULT_THEME_COLOR}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Footer closing line</label>
                        <p className="text-[11px] leading-5 text-slate-500">
                          Global closing sentence shown on the right side of the footer bottom bar.
                        </p>
                        <input
                          type="text"
                          value={settings.publicFooterTagline}
                          onChange={(event) => updateField("publicFooterTagline", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_PUBLIC_FOOTER_TAGLINE}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700">
                        <Globe className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Footer copy</p>
                        <p className="text-sm font-semibold text-slate-900">Organize the words shown in the public footer</p>
                        <p className="mt-1 text-xs text-slate-500">Each block below matches one visible area of the footer, so it is easier to know what each field changes.</p>
                      </div>
                    </div>

                    <div className="mb-3 rounded-xl border border-slate-200/60 bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">1. Brand and bottom bar</p>
                      <p className="mt-1 text-xs text-slate-500">Text shown next to the logo and the copyright sentence used in the footer bottom strip.</p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Footer eyebrow label</label>
                        <input
                          type="text"
                          value={settings.footerEyebrowLabel}
                          onChange={(event) => updateField("footerEyebrowLabel", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_FOOTER_EYEBROW_LABEL}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Copyright template</label>
                        <input
                          type="text"
                          value={settings.footerCopyrightTemplate}
                          onChange={(event) => updateField("footerCopyrightTemplate", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_FOOTER_COPYRIGHT_TEMPLATE}
                        />
                        <p className="text-[11px] leading-5 text-slate-500">
                          You can use <code>{"{{year}}"}</code> and <code>{"{{platformName}}"}</code>.
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-slate-200/60 bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">2. Section titles</p>
                      <p className="mt-1 text-xs text-slate-500">Names of the footer columns: General, Legal, and Contact.</p>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">General section title</label>
                        <input
                          type="text"
                          value={settings.footerGeneralTitle}
                          onChange={(event) => updateField("footerGeneralTitle", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_FOOTER_GENERAL_TITLE}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Legal section title</label>
                        <input
                          type="text"
                          value={settings.footerLegalTitle}
                          onChange={(event) => updateField("footerLegalTitle", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_FOOTER_LEGAL_TITLE}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Contact section title</label>
                        <input
                          type="text"
                          value={settings.footerContactTitle}
                          onChange={(event) => updateField("footerContactTitle", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_FOOTER_CONTACT_TITLE}
                        />
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-slate-200/60 bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">3. Main navigation links</p>
                      <p className="mt-1 text-xs text-slate-500">Labels and routes for links like Home, About, Contact, and Plans.</p>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Home label</label>
                        <input
                          type="text"
                          value={settings.footerHomeLabel}
                          onChange={(event) => updateField("footerHomeLabel", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_FOOTER_HOME_LABEL}
                        />
                        <label className="text-xs font-semibold text-slate-600">Home route</label>
                        <input
                          type="text"
                          value={settings.footerHomeHref}
                          onChange={(event) => updateField("footerHomeHref", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_FOOTER_HOME_HREF}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">About label</label>
                        <input
                          type="text"
                          value={settings.footerAboutLabel}
                          onChange={(event) => updateField("footerAboutLabel", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_FOOTER_ABOUT_LABEL}
                        />
                        <label className="text-xs font-semibold text-slate-600">About route</label>
                        <input
                          type="text"
                          value={settings.footerAboutHref}
                          onChange={(event) => updateField("footerAboutHref", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_FOOTER_ABOUT_HREF}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Contact link label</label>
                        <input
                          type="text"
                          value={settings.footerContactLinkLabel}
                          onChange={(event) => updateField("footerContactLinkLabel", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_FOOTER_CONTACT_LINK_LABEL}
                        />
                        <label className="text-xs font-semibold text-slate-600">Contact route</label>
                        <input
                          type="text"
                          value={settings.footerContactHref}
                          onChange={(event) => updateField("footerContactHref", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_FOOTER_CONTACT_HREF}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Plans label</label>
                        <input
                          type="text"
                          value={settings.footerPlansLabel}
                          onChange={(event) => updateField("footerPlansLabel", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_FOOTER_PLANS_LABEL}
                        />
                        <label className="text-xs font-semibold text-slate-600">Plans route</label>
                        <input
                          type="text"
                          value={settings.footerPlansHref}
                          onChange={(event) => updateField("footerPlansHref", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_FOOTER_PLANS_HREF}
                        />
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-slate-200/60 bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">4. Legal links</p>
                      <p className="mt-1 text-xs text-slate-500">Labels and routes for Privacy Policy, Terms, and Cookies.</p>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Privacy label</label>
                        <input
                          type="text"
                          value={settings.footerPrivacyLabel}
                          onChange={(event) => updateField("footerPrivacyLabel", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_FOOTER_PRIVACY_LABEL}
                        />
                        <label className="text-xs font-semibold text-slate-600">Privacy route</label>
                        <input
                          type="text"
                          value={settings.footerPrivacyHref}
                          onChange={(event) => updateField("footerPrivacyHref", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_FOOTER_PRIVACY_HREF}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Terms label</label>
                        <input
                          type="text"
                          value={settings.footerTermsLabel}
                          onChange={(event) => updateField("footerTermsLabel", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_FOOTER_TERMS_LABEL}
                        />
                        <label className="text-xs font-semibold text-slate-600">Terms route</label>
                        <input
                          type="text"
                          value={settings.footerTermsHref}
                          onChange={(event) => updateField("footerTermsHref", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_FOOTER_TERMS_HREF}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Cookies label</label>
                        <input
                          type="text"
                          value={settings.footerCookiesLabel}
                          onChange={(event) => updateField("footerCookiesLabel", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_FOOTER_COOKIES_LABEL}
                        />
                        <label className="text-xs font-semibold text-slate-600">Cookies route</label>
                        <input
                          type="text"
                          value={settings.footerCookiesHref}
                          onChange={(event) => updateField("footerCookiesHref", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_FOOTER_COOKIES_HREF}
                        />
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-slate-200/60 bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">5. Contact labels</p>
                      <p className="mt-1 text-xs text-slate-500">Words used inside the contact column and before phone or WhatsApp values.</p>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Support label</label>
                        <input
                          type="text"
                          value={settings.footerSupportLabel}
                          onChange={(event) => updateField("footerSupportLabel", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_FOOTER_SUPPORT_LABEL}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Direct contact label</label>
                        <input
                          type="text"
                          value={settings.footerDirectContactLabel}
                          onChange={(event) => updateField("footerDirectContactLabel", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_FOOTER_DIRECT_CONTACT_LABEL}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Phone prefix</label>
                        <input
                          type="text"
                          value={settings.footerPhoneLabel}
                          onChange={(event) => updateField("footerPhoneLabel", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_FOOTER_PHONE_LABEL}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">WhatsApp prefix</label>
                        <input
                          type="text"
                          value={settings.footerWhatsAppLabel}
                          onChange={(event) => updateField("footerWhatsAppLabel", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_FOOTER_WHATSAPP_LABEL}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                        <Image className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Logos, icons, and social share images</p>
                        <p className="mt-1 text-xs text-slate-500">Controls the images used for branding, browser icons, touch icon, and social previews.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Logo URL / path</label>
                        <p className="text-[11px] leading-5 text-slate-500">
                          Main brand image used in headers, navigation, auth screens, and general platform identity.
                        </p>
                        <input
                          type="text"
                          value={settings.logoUrl}
                          onChange={(event) => updateField("logoUrl", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={`${DEFAULT_PLATFORM_LOGO_PATH} or https://...`}
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-600">Favicon URL / path</label>
                          <p className="text-[11px] leading-5 text-slate-500">
                            Small browser tab icon shown in desktop browsers and bookmarks.
                          </p>
                          <input
                            type="text"
                            value={settings.faviconUrl}
                            onChange={(event) => updateField("faviconUrl", event.target.value)}
                            className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                            placeholder={DEFAULT_PLATFORM_FAVICON_PATH}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-600">Touch icon URL / path</label>
                          <p className="text-[11px] leading-5 text-slate-500">
                            Icon used when the app is saved to a phone or tablet home screen.
                          </p>
                          <input
                            type="text"
                            value={settings.touchIconUrl}
                            onChange={(event) => updateField("touchIconUrl", event.target.value)}
                            className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                            placeholder={DEFAULT_PLATFORM_TOUCH_ICON_PATH}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Share image URL / path</label>
                        <p className="text-[11px] leading-5 text-slate-500">
                          Preview image used when links to the platform are shared on social apps and messaging tools.
                        </p>
                        <input
                          type="text"
                          value={settings.shareImageUrl}
                          onChange={(event) => updateField("shareImageUrl", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_PLATFORM_SHARE_IMAGE_PATH}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                        <Mail className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Public contact details shown across the platform</p>
                        <p className="mt-1 text-xs text-slate-500">Defines the support emails, phone, and WhatsApp links shown in public and help-facing areas.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Support email</label>
                        <input
                          type="email"
                          value={settings.supportEmail}
                          onChange={(event) => updateField("supportEmail", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Contact email</label>
                        <input
                          type="email"
                          value={settings.contactEmail}
                          onChange={(event) => updateField("contactEmail", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Support phone</label>
                        <input
                          type="text"
                          value={settings.supportPhone}
                          onChange={(event) => updateField("supportPhone", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Support WhatsApp</label>
                        <input
                          type="text"
                          value={settings.supportWhatsApp}
                          onChange={(event) => updateField("supportWhatsApp", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </article>

              <div className="space-y-4">
                <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-slate-900">Settings Control Center</p>
                    <p className="text-xs text-slate-500">
                      Review the current configuration footprint and publish changes globally.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Brand assets
                          </p>
                        </div>
                        <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                          {configuredBrandAssetCount}/4 ready
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Support channels
                          </p>
                        </div>
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          {configuredSupportChannelCount}/4 set
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Policy status
                          </p>
                        </div>
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                          {enabledToggleCount}/{policyToggleItems.length} active
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Public messaging
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            hasAnnouncement
                              ? "border border-amber-200 bg-amber-50 text-amber-700"
                              : "border border-slate-200 bg-white text-slate-600"
                          }`}
                        >
                          {hasAnnouncement ? "Banner live" : "Banner empty"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={!canSave || saving}
                      onClick={handleSave}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {saving ? "Saving..." : "Save settings"}
                    </button>
                    <button
                      type="button"
                      onClick={handleReset}
                      className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Reset defaults
                    </button>
                    {settings.maintenanceMode ? (
                      <Link
                        to="/maintenance?preview=1"
                        className="inline-flex w-full items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                      >
                        Open maintenance preview
                      </Link>
                    ) : null}
                  </div>

                  <div className="mt-3 space-y-1">
                    {!canSave ? (
                      <p className="text-xs text-rose-600">Valid support and contact emails are required.</p>
                    ) : null}
                    {isDirty ? (
                      <p className="text-xs text-slate-500">Pending changes. Save to publish updates platform-wide.</p>
                    ) : (
                      <p className="text-xs text-slate-500">Everything is synced with the current platform configuration.</p>
                    )}
                  </div>
                </article>

                <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Operational Defaults</p>
                    </div>
                    <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      4 fields
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600">Starter response hours</label>
                      <input
                        type="number"
                        min={1}
                        max={240}
                        value={settings.defaultResponseHoursStarter}
                        onChange={(event) =>
                          updateField("defaultResponseHoursStarter", Number(event.target.value) || 0)
                        }
                        className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600">Priority response hours</label>
                      <input
                        type="number"
                        min={1}
                        max={240}
                        value={settings.defaultResponseHoursPriority}
                        onChange={(event) =>
                          updateField("defaultResponseHoursPriority", Number(event.target.value) || 0)
                        }
                        className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600">Default onboarding months</label>
                      <input
                        type="number"
                        min={1}
                        max={24}
                        value={settings.defaultOnboardingMonths}
                        onChange={(event) =>
                          updateField("defaultOnboardingMonths", Number(event.target.value) || 0)
                        }
                        className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600">Student limit per course</label>
                      <input
                        type="number"
                        min={5}
                        max={500}
                        value={settings.defaultStudentPerCourseLimit}
                        onChange={(event) =>
                          updateField("defaultStudentPerCourseLimit", Number(event.target.value) || 0)
                        }
                        className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                      />
                    </div>
                  </div>
                </article>

                <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Policy Toggles</p>
                    </div>
                    <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {enabledToggleCount}/{policyToggleItems.length} active
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    {policyToggleItems.map((item) => (
                      <div
                        key={item.key}
                        className={`rounded-xl border px-3 py-2 text-left transition ${
                          item.value
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200/60 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold tracking-wide">{item.label}</p>
                            <p className="mt-1 text-xs text-slate-600">{item.description}</p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={item.value}
                              onClick={() => updateField(item.key, !item.value)}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full border transition focus:outline-none focus:ring-2 focus:ring-sky-200 ${
                                item.value
                                  ? "border-emerald-300 bg-emerald-500"
                                  : "border-slate-300 bg-slate-300"
                              }`}
                            >
                              <span
                                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
                                  item.value ? "translate-x-5" : "translate-x-0.5"
                                }`}
                              />
                            </button>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                item.value ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {item.value ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Announcements & Maintenance</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        hasAnnouncement
                          ? "border border-amber-200 bg-amber-50 text-amber-700"
                          : "border border-slate-200/60 bg-slate-50 text-slate-600"
                      }`}
                    >
                      {hasAnnouncement ? "Banner active" : "No banner"}
                    </span>
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                          <Megaphone className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Shown on public views and signed-in dashboards</p>
                        </div>
                      </div>
                      <label className="block space-y-1.5">
                        <span className="text-xs font-semibold text-slate-600">Announcement text</span>
                        <textarea
                          value={settings.globalBannerText}
                          onChange={(event) => updateField("globalBannerText", event.target.value)}
                          rows={4}
                          className="w-full resize-none rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder="Example: {{platformName}} will have scheduled maintenance on Saturday at 8:00 PM."
                        />
                      </label>
                    </div>

                    <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                          <Wrench className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Preview text used in auth and maintenance views</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        <label className="space-y-1.5">
                          <span className="text-xs font-semibold text-slate-600">Maintenance CTA label</span>
                          <input
                            type="text"
                            value={settings.maintenanceCtaLabel}
                            onChange={(event) => updateField("maintenanceCtaLabel", event.target.value)}
                            className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                            placeholder="Request support"
                          />
                        </label>

                        <label className="space-y-1.5">
                          <span className="text-xs font-semibold text-slate-600">Maintenance CTA path</span>
                          <input
                            type="text"
                            value={settings.maintenanceCtaHref}
                            onChange={(event) => updateField("maintenanceCtaHref", event.target.value)}
                            className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                            placeholder="/contact"
                          />
                        </label>
                      </div>

                      <label className="mt-3 block space-y-1.5">
                        <span className="text-xs font-semibold text-slate-600">Maintenance title</span>
                        <input
                          type="text"
                          value={settings.maintenanceTitle}
                          onChange={(event) => updateField("maintenanceTitle", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder="{{platformName}} is temporarily under maintenance"
                        />
                      </label>

                      <label className="mt-3 block space-y-1.5">
                        <span className="text-xs font-semibold text-slate-600">Maintenance message</span>
                        <textarea
                          value={settings.maintenanceMessage}
                          onChange={(event) => updateField("maintenanceMessage", event.target.value)}
                          rows={3}
                          className="w-full resize-none rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder="Student and teacher workspaces are temporarily paused while the admin team applies updates."
                        />
                      </label>

                      <label className="mt-3 block space-y-1.5">
                        <span className="text-xs font-semibold text-slate-600">Teacher self-request disabled message</span>
                        <textarea
                          value={settings.teacherSelfRequestMessage}
                          onChange={(event) => updateField("teacherSelfRequestMessage", event.target.value)}
                          rows={3}
                          className="w-full resize-none rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder="Teacher self-registration is currently disabled..."
                        />
                      </label>

                      {settings.maintenanceMode ? (
                        <div className="mt-3">
                          <Link
                            to="/maintenance?preview=1"
                            className="inline-flex h-9 items-center rounded-lg border border-slate-200/60 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                          >
                            Open maintenance page preview
                          </Link>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                          <BarChart3 className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Edit counts and stats shown in marketing pages</p>
                          <p className="mt-1 text-xs text-slate-500">Lets you control the public-facing counters and the tone used for global announcements.</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-600">Public active users count</label>
                          <input
                            type="number"
                            min={0}
                            value={settings.publicActiveUsersCount}
                            onChange={(event) =>
                              updateField("publicActiveUsersCount", Number(event.target.value) || 0)
                            }
                            className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-600">Announcement tone</label>
                          <select
                            value={settings.publicAnnouncementTone}
                            onChange={(event) =>
                              updateField(
                                "publicAnnouncementTone",
                                event.target.value as AdminPlatformSettings["publicAnnouncementTone"],
                              )
                            }
                            className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          >
                            <option value="info">Info</option>
                            <option value="warning">Warning</option>
                            <option value="critical">Critical</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              </div>
            </section>

            <section>
              <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Public Experience & SEO</p>
                    <p className="text-xs text-slate-500">Control canonical base URL, public meta copy, and marketing counters.</p>
                  </div>
                  <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    3 groups
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-cyan-700">
                        <Globe className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">SEO basics</p>
                        <p className="text-sm font-semibold text-slate-900">Base domain and default metadata</p>
                        <p className="mt-1 text-xs text-slate-500">Defines the canonical site URL plus the default description and keywords used by public pages.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Public site URL</label>
                        <input
                          type="text"
                          value={settings.siteUrl}
                          onChange={(event) => updateField("siteUrl", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_SITE_URL}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Default meta description</label>
                        <textarea
                          rows={3}
                          value={settings.siteDescription}
                          onChange={(event) => updateField("siteDescription", event.target.value)}
                          className="w-full resize-none rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_SITE_DESCRIPTION}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Default meta keywords</label>
                        <textarea
                          rows={3}
                          value={settings.siteKeywords}
                          onChange={(event) => updateField("siteKeywords", event.target.value)}
                          className="w-full resize-none rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_SITE_KEYWORDS}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                        <Settings2 className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Edit install name, background color, and shortcut labels</p>
                        <p className="mt-1 text-xs text-slate-500">Updates the installable app manifest used for PWA name, background color, and home screen shortcuts.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">PWA short name</label>
                        <input
                          type="text"
                          value={settings.pwaShortName}
                          onChange={(event) => updateField("pwaShortName", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_PWA_SHORT_NAME}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">PWA background color</label>
                        <input
                          type="text"
                          value={settings.pwaBackgroundColor}
                          onChange={(event) => updateField("pwaBackgroundColor", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_PWA_BACKGROUND_COLOR}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Courses shortcut label</label>
                        <input
                          type="text"
                          value={settings.pwaCoursesShortcutLabel}
                          onChange={(event) => updateField("pwaCoursesShortcutLabel", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_PWA_COURSES_LABEL}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Grades shortcut label</label>
                        <input
                          type="text"
                          value={settings.pwaGradesShortcutLabel}
                          onChange={(event) => updateField("pwaGradesShortcutLabel", event.target.value)}
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={DEFAULT_PWA_GRADES_LABEL}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            </section>

          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
