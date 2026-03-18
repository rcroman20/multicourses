import { Link, NavLink } from "react-router-dom";
import { Sparkles } from "lucide-react";
import {
  resolvePlatformLogoUrl,
  useAdminPlatformSettings,
} from "@/lib/services/adminSettingsService";

type PublicTopNavProps = {
  activeKey?: "about" | "contact" | null;
  aboutHref?: string;
  aboutLabel?: string;
  contactHref?: string;
  contactLabel?: string;
  className?: string;
};

const baseLinkClassName =
  "inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700";

const activeLinkClassName =
  "border-sky-200 bg-sky-50 text-sky-700";

export function PublicTopNav({
  activeKey = null,
  aboutHref = "/about",
  aboutLabel = "About",
  contactHref = "/contact",
  contactLabel = "Contact",
  
  
  className = "",
}: PublicTopNavProps) {
  const { settings } = useAdminPlatformSettings();
  const platformName = String(settings.platformName || "Socrattica").trim() || "Socrattica";
  const brandLogo = resolvePlatformLogoUrl(settings.logoUrl);

  return (
    <div className={`mb-4 space-y-3 ${className}`.trim()}>
      <nav
        className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.35)]"
        aria-label="Public site navigation"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/" className="inline-flex w-fit items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              <img src={brandLogo} alt={`${platformName} logo`} className="h-7 w-7 object-contain" />
            </span>
            <span>
              <span className="block text-sm font-semibold leading-none text-slate-900">{platformName}</span>
              <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                <Sparkles className="h-3.5 w-3.5" />
                Public Workspace
              </span>
            </span>
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <NavLink
              to={aboutHref}
              className={`${baseLinkClassName} ${activeKey === "about" ? activeLinkClassName : ""}`.trim()}
            >
              {aboutLabel}
            </NavLink>
            <NavLink
              to={contactHref}
              className={`${baseLinkClassName} ${activeKey === "contact" ? activeLinkClassName : ""}`.trim()}
            >
              {contactLabel}
            </NavLink>
          </div>
        </div>
      </nav>
    </div>
  );
}
