import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
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
  DEFAULT_PLATFORM_TAGLINE,
  DEFAULT_PUBLIC_FOOTER_TAGLINE,
  DEFAULT_PLATFORM_NAME,
  applyPlatformNameTemplate,
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
  const platformName =
    String(settings.platformName || DEFAULT_PLATFORM_NAME).trim() || DEFAULT_PLATFORM_NAME;
  const resolvedSummary = useMemo(
    () => applyPlatformNameTemplate(summary, platformName),
    [summary, platformName],
  );
  const platformTagline =
    String(settings.platformTagline || DEFAULT_PLATFORM_TAGLINE).trim() || DEFAULT_PLATFORM_TAGLINE;
  const footerTagline = useMemo(
    () =>
      applyPlatformNameTemplate(
        settings.publicFooterTagline || DEFAULT_PUBLIC_FOOTER_TAGLINE,
        platformName,
      ) || DEFAULT_PUBLIC_FOOTER_TAGLINE,
    [platformName, settings.publicFooterTagline],
  );
  const footerEyebrowLabel =
    String(settings.footerEyebrowLabel || DEFAULT_FOOTER_EYEBROW_LABEL).trim() ||
    DEFAULT_FOOTER_EYEBROW_LABEL;
  const footerContactTitle =
    String(settings.footerContactTitle || DEFAULT_FOOTER_CONTACT_TITLE).trim() ||
    DEFAULT_FOOTER_CONTACT_TITLE;
  const footerSupportLabel =
    String(settings.footerSupportLabel || DEFAULT_FOOTER_SUPPORT_LABEL).trim() ||
    DEFAULT_FOOTER_SUPPORT_LABEL;
  const footerDirectContactLabel =
    String(settings.footerDirectContactLabel || DEFAULT_FOOTER_DIRECT_CONTACT_LABEL).trim() ||
    DEFAULT_FOOTER_DIRECT_CONTACT_LABEL;
  const footerPhoneLabel =
    String(settings.footerPhoneLabel || DEFAULT_FOOTER_PHONE_LABEL).trim() ||
    DEFAULT_FOOTER_PHONE_LABEL;
  const footerWhatsAppLabel =
    String(settings.footerWhatsAppLabel || DEFAULT_FOOTER_WHATSAPP_LABEL).trim() ||
    DEFAULT_FOOTER_WHATSAPP_LABEL;
  const footerCopyright = useMemo(
    () =>
      applyPlatformNameTemplate(
        String(settings.footerCopyrightTemplate || DEFAULT_FOOTER_COPYRIGHT_TEMPLATE).replace(
          /\{\{year\}\}/g,
          String(new Date().getFullYear()),
        ),
        platformName,
      ) || DEFAULT_FOOTER_COPYRIGHT_TEMPLATE.replace(/\{\{year\}\}/g, String(new Date().getFullYear())),
    [platformName, settings.footerCopyrightTemplate],
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
    const homeHref = settings.footerHomeHref || DEFAULT_FOOTER_HOME_HREF;
    const aboutHref = settings.footerAboutHref || aboutPath || DEFAULT_FOOTER_ABOUT_HREF;
    const contactHref = settings.footerContactHref || DEFAULT_FOOTER_CONTACT_HREF;
    const plansHref = settings.footerPlansHref || DEFAULT_FOOTER_PLANS_HREF;
    const privacyHref = settings.footerPrivacyHref || DEFAULT_FOOTER_PRIVACY_HREF;
    const termsHref = settings.footerTermsHref || DEFAULT_FOOTER_TERMS_HREF;
    const cookiesHref = settings.footerCookiesHref || DEFAULT_FOOTER_COOKIES_HREF;

    const sharedLinks: FooterLinkItem[] = [
      {
        label: String(settings.footerHomeLabel || DEFAULT_FOOTER_HOME_LABEL).trim() || DEFAULT_FOOTER_HOME_LABEL,
        to: homeHref,
      },
      {
        label: String(settings.footerAboutLabel || DEFAULT_FOOTER_ABOUT_LABEL).trim() || DEFAULT_FOOTER_ABOUT_LABEL,
        to: aboutHref,
      },
      {
        label:
          String(settings.footerContactLinkLabel || DEFAULT_FOOTER_CONTACT_LINK_LABEL).trim() ||
          DEFAULT_FOOTER_CONTACT_LINK_LABEL,
        to: contactHref,
      },
      {
        label: String(settings.footerPlansLabel || DEFAULT_FOOTER_PLANS_LABEL).trim() || DEFAULT_FOOTER_PLANS_LABEL,
        to: plansHref,
      },
    ];

    const sharedSection: FooterSection = {
      title:
        String(settings.footerGeneralTitle || DEFAULT_FOOTER_GENERAL_TITLE).trim() ||
        DEFAULT_FOOTER_GENERAL_TITLE,
      links: sharedLinks,
    };

    const legalSection: FooterSection = {
      title:
        String(settings.footerLegalTitle || DEFAULT_FOOTER_LEGAL_TITLE).trim() ||
        DEFAULT_FOOTER_LEGAL_TITLE,
      links: [
        {
          label:
            String(settings.footerPrivacyLabel || DEFAULT_FOOTER_PRIVACY_LABEL).trim() ||
            DEFAULT_FOOTER_PRIVACY_LABEL,
          to: privacyHref,
        },
        {
          label: String(settings.footerTermsLabel || DEFAULT_FOOTER_TERMS_LABEL).trim() || DEFAULT_FOOTER_TERMS_LABEL,
          to: termsHref,
        },
        {
          label:
            String(settings.footerCookiesLabel || DEFAULT_FOOTER_COOKIES_LABEL).trim() ||
            DEFAULT_FOOTER_COOKIES_LABEL,
          to: cookiesHref,
        },
      ],
    };

    return [sharedSection, legalSection];
  }, [
    aboutPath,
    settings.footerAboutLabel,
    settings.footerAboutHref,
    settings.footerContactLinkLabel,
    settings.footerContactHref,
    settings.footerCookiesLabel,
    settings.footerCookiesHref,
    settings.footerGeneralTitle,
    settings.footerHomeLabel,
    settings.footerHomeHref,
    settings.footerLegalTitle,
    settings.footerPlansLabel,
    settings.footerPlansHref,
    settings.footerPrivacyLabel,
    settings.footerPrivacyHref,
    settings.footerTermsLabel,
    settings.footerTermsHref,
  ]);

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
                {footerEyebrowLabel}
              </span>
              <span className="block text-[13px] font-semibold uppercase tracking-[0.16em] text-white sm:text-sm sm:tracking-[0.18em]">
                {platformName}
              </span>
              <span className="mt-1 block text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                {platformTagline}
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
              {footerContactTitle}
            </h3>
            <div className="mt-3 flex flex-col gap-2.5 text-sm leading-6">
              <a
                href={`mailto:${supportEmail}`}
                className="text-slate-300 transition hover:text-white"
              >
                {footerSupportLabel}
              </a>

              {hasDistinctContactEmail ? (
                <a
                  href={`mailto:${contactEmail}`}
                  className="text-slate-300 transition hover:text-white"
                >
                  {footerDirectContactLabel}
                </a>
              ) : null}

              {supportPhone ? (
                <a
                  href={`tel:${supportPhone}`}
                  className="break-words text-slate-300 transition hover:text-white"
                >
                  <span className="font-medium text-slate-400">{footerPhoneLabel}:</span> {supportPhone}
                </a>
              ) : null}

              {normalizedWhatsApp ? (
                <a
                  href={`https://wa.me/${normalizedWhatsApp}`}
                  target="_blank"
                  rel="noreferrer"
                  className="break-words text-slate-300 transition hover:text-white"
                >
                  <span className="font-medium text-slate-400">{footerWhatsAppLabel}:</span> {supportWhatsApp}
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2 border-t border-slate-800 pt-4 text-center text-sm leading-6 text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:text-left">
        <p>{footerCopyright}</p>
        <p className="max-w-xl sm:text-right">
          {footerTagline}
        </p>
      </div>
    </footer>
  );
}
