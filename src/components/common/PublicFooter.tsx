import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  resolvePlatformLogoUrl,
  useAdminPlatformSettings,
} from "@/lib/services/adminSettingsService";

type PublicFooterProps = {
  summary: string;
  className?: string;
};

type FooterLinkItem = {
  label: string;
  to: string;
};

type FooterSection = {
  title: string;
  links: FooterLinkItem[];
};

export function PublicFooter({
  summary,
  className = "",
}: PublicFooterProps) {
  const { pathname } = useLocation();
  const { settings } = useAdminPlatformSettings();
  const platformName = String(settings.platformName || "Socrattica").trim() || "Socrattica";
  const resolvedSummary = useMemo(
    () => String(summary || "").replace(/Socrattica/g, platformName),
    [summary, platformName],
  );
  const brandLogo = resolvePlatformLogoUrl(settings.logoUrl);
  const supportEmail = settings.supportEmail || "rcroman20@gmail.com";
  const contactEmail = settings.contactEmail || supportEmail;
  const supportPhone = String(settings.supportPhone || "").trim();
  const supportWhatsApp = String(settings.supportWhatsApp || "").trim();
  const normalizedWhatsApp = supportWhatsApp.replace(/\D/g, "");
  const hasDistinctContactEmail =
    contactEmail.trim().toLowerCase() !== supportEmail.trim().toLowerCase();
  const scrollPageToTop = () => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    const mainElement = document.querySelector("main");
    if (mainElement instanceof HTMLElement) {
      mainElement.scrollTop = 0;
    }
  };

  const aboutPath = pathname.startsWith("/acerca-de") ? "/acerca-de" : "/about";

  const footerSections = useMemo<FooterSection[]>(() => {
    const sharedLinks: FooterLinkItem[] = [
      { label: "Home", to: "/" },
      { label: "About", to: aboutPath },
      { label: "Contact", to: "/contact" },
      { label: "Plans", to: "/plans/starter-annual" },
    ];

    const sharedSection: FooterSection = {
      title: "General",
      links: sharedLinks,
    };

    const legalSection: FooterSection = {
      title: "Legal",
      links: [
        { label: "Privacy Policy", to: "/privacy-policy" },
        { label: "Terms & Conditions", to: "/terms-and-conditions" },
        { label: "Cookies Policy", to: "/cookies-policy" },
      ],
    };

    return [sharedSection, legalSection];
  }, [aboutPath]);

  return (
    <footer
      className={`rounded-2xl mt-2 overflow-hidden border border-slate-800 bg-[#050505] px-4 py-7 text-white shadow-[0_24px_60px_-36px_rgba(0,0,0,0.78)] sm:px-6 sm:py-8 lg:px-8 ${className}`.trim()}
    >
      <div className="relative grid gap-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start lg:gap-10">
        <div className="max-w-lg">
          <Link to="/" className="inline-flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-white sm:h-10 sm:w-10">
              <img
                src={brandLogo}
                alt={`${platformName} logo`}
                className="h-7 w-7 object-contain sm:h-8 sm:w-8"
              />
            </span>
            <span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Platform
              </span>
              <span className="block text-[13px] font-semibold uppercase tracking-[0.16em] text-white sm:text-sm sm:tracking-[0.18em]">
                {platformName}
              </span>
            </span>
          </Link>
          <p className="mt-4 max-w-lg text-sm leading-6 text-slate-300 sm:text-[15px]">
            {resolvedSummary}
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {footerSections.map((section) => (
            <div key={section.title}>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {section.title}
              </h3>
              <div className="mt-3 flex flex-col gap-2.5 text-sm leading-6 text-slate-300">
                {section.links.map((item) => {
                  const isActive =
                    pathname === item.to ||
                    (item.to !== "/" && pathname.startsWith(`${item.to}/`));

                  return (
                    <Link
                      key={`${section.title}-${item.to}`}
                      to={item.to}
                      onClick={scrollPageToTop}
                      className={`transition ${
                        isActive ? "text-white" : "text-slate-300 hover:text-white"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Contact
            </h3>
            <div className="mt-3 flex flex-col gap-2.5 text-sm leading-6">
              <a
                href={`mailto:${supportEmail}`}
                className="text-slate-300 transition hover:text-white"
              >
                Support
              </a>

              {hasDistinctContactEmail ? (
                <a
                  href={`mailto:${contactEmail}`}
                  className="text-slate-300 transition hover:text-white"
                >
                  Contact
                </a>
              ) : null}

              {supportPhone ? (
                <a
                  href={`tel:${supportPhone}`}
                  className="break-words text-slate-300 transition hover:text-white"
                >
                  <span className="font-medium text-slate-400">Phone:</span> {supportPhone}
                </a>
              ) : null}

              {normalizedWhatsApp ? (
                <a
                  href={`https://wa.me/${normalizedWhatsApp}`}
                  target="_blank"
                  rel="noreferrer"
                  className="break-words text-slate-300 transition hover:text-white"
                >
                  <span className="font-medium text-slate-400">WhatsApp:</span> {supportWhatsApp}
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2 border-t border-slate-800 pt-4 text-center text-sm leading-6 text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:text-left">
        <p>© {new Date().getFullYear()} {platformName}. All rights reserved.</p>
        <p className="max-w-xl sm:text-right">
          Built for teachers, students, institutions, and academic operations.
        </p>
      </div>
    </footer>
  );
}
