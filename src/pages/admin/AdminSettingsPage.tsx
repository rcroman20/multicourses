import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { appendAdminAuditLog } from "@/lib/services/adminAuditLogService";
import { assertAdminPermission } from "@/lib/services/adminPermissionGuardService";
import {
  DEFAULT_PLATFORM_LOGO_PATH,
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
        platformName: String(settings.platformName || "").trim() || "Socrattica",
        logoUrl: String(settings.logoUrl || "").trim() || DEFAULT_PLATFORM_LOGO_PATH,
        supportEmail: normalizeEmail(settings.supportEmail),
        contactEmail: normalizeEmail(settings.contactEmail),
        supportPhone: String(settings.supportPhone || "").trim(),
        supportWhatsApp: String(settings.supportWhatsApp || "").trim(),
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

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Branding & Contact</p>
                    <p className="text-xs text-slate-500">Public identity and support channels.</p>
                  </div>
                </div>
                <div className="space-y-3">
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
                    <label className="text-xs font-semibold text-slate-600">Logo URL / path</label>
                    <input
                      type="text"
                      value={settings.logoUrl}
                      onChange={(event) => updateField("logoUrl", event.target.value)}
                      className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                      placeholder={`${DEFAULT_PLATFORM_LOGO_PATH} or https://...`}
                    />
                  </div>
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
              </article>

              <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Operational Defaults</p>
                    <p className="text-xs text-slate-500">Limits and response windows for platform flows.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

            </section>

            <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Policy Toggles</p>
                  <p className="text-xs text-slate-500">Enable or disable core platform controls.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
                {policyToggleItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => updateField(item.key, !item.value)}
                    aria-pressed={item.value}
                    className={`rounded-xl border px-3 py-2 text-left transition ${
                      item.value
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200/60 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold tracking-wide">{item.label}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          item.value ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {item.value ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{item.description}</p>
                  </button>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Toggle messaging
                </p>

                <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
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
                  <span className="text-xs font-semibold text-slate-600">
                    Teacher self-request disabled message
                  </span>
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

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!canSave || saving}
                  onClick={handleSave}
                  className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Save className="h-3.5 w-3.5" />
                    {saving ? "Saving..." : "Save settings"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-lg border border-slate-200/60 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Reset defaults
                </button>
                {!canSave ? (
                  <span className="text-xs text-rose-600">Valid support and contact emails are required.</span>
                ) : null}
                {isDirty ? (
                  <span className="text-xs text-slate-500">Pending changes. Click Save settings to apply globally.</span>
                ) : null}
              </div>
            </section>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
