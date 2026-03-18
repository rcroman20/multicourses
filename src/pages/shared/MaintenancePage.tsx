import { AlertTriangle, ShieldCheck, Wrench } from "lucide-react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { PublicFooter } from "@/components/common/PublicFooter";
import { PublicTopNav } from "@/components/common/PublicTopNav";
import { useAdminPlatformSettings } from "@/lib/services/adminSettingsService";
import { isAdminEmail } from "@/lib/services/adminAccessService";

const resolveHomePath = (role?: string): string => {
  if (role === "docente") return "/teacher";
  if (role === "admin") return "/admin/dashboard";
  return "/student";
};

export default function MaintenancePage() {
  const { search } = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { settings } = useAdminPlatformSettings();
  const platformName = String(settings.platformName || "Socrattica").trim() || "Socrattica";
  const maintenanceMode = settings.maintenanceMode === true;
  const maintenanceCtaLabel = String(settings.maintenanceCtaLabel || "").trim() || "Request support";
  const maintenanceCtaHref = String(settings.maintenanceCtaHref || "").trim() || "/contact";
  const isAdmin = user?.role === "admin" || isAdminEmail(user?.email);
  const isPreviewMode = new URLSearchParams(search).get("preview") === "1";

  if (isPreviewMode && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (isAdmin && !isPreviewMode) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  if (!maintenanceMode && !isPreviewMode) {
    if (isAuthenticated) {
      return <Navigate to={resolveHomePath(user?.role)} replace />;
    }
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col">
        <PublicTopNav />

        <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
              <Wrench className="h-3.5 w-3.5" />
              Maintenance mode
            </div>

            <h1 className="mt-3 text-2xl font-extrabold text-slate-900 sm:text-3xl">
              {platformName} is temporarily under maintenance
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-700 sm:text-base">
              Student and teacher workspaces are temporarily paused while the admin team applies updates.
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200/70 bg-white p-3">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <AlertTriangle className="h-4 w-4 text-amber-700" />
                  Access limited
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Learning routes are paused until maintenance is disabled in platform settings.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/70 bg-white p-3">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  Your data is safe
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Courses, grades, files, and profile data remain stored and available when operations resume.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {maintenanceCtaHref.startsWith("http") ? (
                <a
                  href={maintenanceCtaHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center rounded-xl border border-sky-300 bg-sky-50 px-4 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                >
                  {maintenanceCtaLabel}
                </a>
              ) : (
                <Link
                  to={maintenanceCtaHref}
                  className="inline-flex h-10 items-center rounded-xl border border-sky-300 bg-sky-50 px-4 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                >
                  {maintenanceCtaLabel}
                </Link>
              )}
              <Link
                to="/"
                className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Back to public site
              </Link>
            </div>
          </section>
        </div>

        <PublicFooter summary="Maintenance updates keep Socrattica stable, secure, and ready for day-to-day academic operations." />
      </div>
    </div>
  );
}
