import { Cookie, Settings2, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { SeoHead } from "@/components/common/SeoHead";
import { PublicTopNav } from "@/components/common/PublicTopNav";
import { PublicFooter } from "@/components/common/PublicFooter";
import {
  DEFAULT_PLATFORM_NAME,
  useAdminPlatformSettings,
} from "@/lib/services/adminSettingsService";

const LAST_UPDATED = "March 15, 2026";

type CookieCategory = {
  name: string;
  required: "Required" | "Optional";
  purpose: string;
  examples: string;
  retention: string;
};

const categories: CookieCategory[] = [
  {
    name: "Strictly Necessary",
    required: "Required",
    purpose:
      "Keeps core product operations working, including identity continuity, consent state, and critical workspace behavior.",
    examples:
      "Consent state (socrattica.cookieConsent), selected course context, and security-related flow guards.",
    retention: "Session to persistent, depending on the feature lifecycle.",
  },
  {
    name: "Preferences",
    required: "Optional",
    purpose:
      "Stores interface and experience choices so users do not need to reconfigure recurring settings on every visit.",
    examples:
      "Landing audience preference cache and user-level dashboard/workspace preference values.",
    retention: "Usually persisted until changed by the user or manually cleared.",
  },
  {
    name: "Analytics",
    required: "Optional",
    purpose:
      "Helps understand feature adoption and product quality trends in order to improve usability and operational reliability.",
    examples:
      "Usage-pattern flags and lightweight state entries tied to notification and workspace interaction tracking.",
    retention: "Varies by feature implementation and browser cleanup events.",
  },
  {
    name: "Marketing & Communications",
    required: "Optional",
    purpose:
      "Supports communication-measurement workflows for announcements and campaign-style messaging when enabled by users.",
    examples:
      "Marketing consent flag in cookie settings and related communication-preference storage.",
    retention: "Persisted until preference update or browser data reset.",
  },
];

export default function CookiesPolicyPage() {
  const { settings } = useAdminPlatformSettings();
  const platformName = String(settings.platformName || "").trim() || DEFAULT_PLATFORM_NAME;
  const supportEmail = String(settings.supportEmail || "").trim() || "rcroman20@gmail.com";

  return (
    <div className="relative min-h-screen  bg-slate-100 px-4 py-5 sm:px-6 lg:px-8">
      <SeoHead
        title="Cookies Policy"
        description={`Learn how ${platformName} uses essential and optional cookies to support security, preferences, and analytics.`}
        canonicalPath="/cookies-policy"
        robots="index, follow"
        keywords="cookies policy, essential cookies, analytics cookies, preferences cookies, education platform"
      />

      <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-emerald-100/45 blur-[80px]" />
      <div className="pointer-events-none absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-sky-100/45 blur-[80px]" />

      <div className="relative mx-auto w-full max-w-[1200px]">
        <PublicTopNav />

        <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <section className="mb-6 rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50 to-emerald-50 p-5 shadow-sm lg:p-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              <Sparkles className="h-3.5 w-3.5" />
              Legal
            </span>
            <h1 className="mt-3 text-xl font-extrabold text-slate-900 sm:text-2xl">Cookies Policy</h1>
            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-600">
              This policy explains how {platformName} uses cookies and similar browser storage technologies (including
              local storage) to operate core academic workflows, save your settings, and improve platform reliability.
            </p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Last updated: {LAST_UPDATED}</p>
          </section>

          <section className="mb-4 grid gap-4 md:grid-cols-3">
            <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-semibold text-slate-900">Necessary Cookies</h2>
              <p className="mt-1 text-sm text-slate-600">Required for authentication, session continuity, and security controls.</p>
            </article>

            <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                <Settings2 className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-semibold text-slate-900">Preference Cookies</h2>
              <p className="mt-1 text-sm text-slate-600">Store user choices to improve navigation and interface consistency.</p>
            </article>

            <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <Cookie className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-semibold text-slate-900">Analytics & Marketing</h2>
              <p className="mt-1 text-sm text-slate-600">Optional categories activated according to your consent choices.</p>
            </article>
          </section>

          <section className="space-y-4">
            <article className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
              <h3 className="text-base font-bold text-slate-900">1. Technologies covered by this policy</h3>
              <p className="mt-2 text-sm text-slate-600">
                In this document, the term “cookies” includes browser mechanisms such as first-party cookies and local
                storage entries used by the web app. Some are strictly required for platform operation, while others are
                optional and controlled by consent.
              </p>
            </article>

            <article className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
              <h3 className="text-base font-bold text-slate-900">2. Cookie categories and practical use</h3>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200/60 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-2 font-semibold">Category</th>
                      <th className="px-2 py-2 font-semibold">Type</th>
                      <th className="px-2 py-2 font-semibold">Purpose</th>
                      <th className="px-2 py-2 font-semibold">Examples</th>
                      <th className="px-2 py-2 font-semibold">Retention</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((item) => (
                      <tr key={item.name} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-2 py-2 font-semibold text-slate-900">{item.name}</td>
                        <td className="px-2 py-2 text-slate-600">{item.required}</td>
                        <td className="px-2 py-2 text-slate-600">{item.purpose}</td>
                        <td className="px-2 py-2 text-slate-600">{item.examples}</td>
                        <td className="px-2 py-2 text-slate-600">{item.retention}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
              <h3 className="text-base font-bold text-slate-900">3. Real storage examples used by the app</h3>
              <p className="mt-2 text-sm text-slate-600">
                {platformName} uses role-aware and user-aware storage keys. Not every key appears for every user. The
                following examples reflect actual patterns in platform modules:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                <li>
                  <code>socrattica.cookieConsent</code> stores cookie-consent version and category choices.
                </li>
                <li>
                  <code>global:selectedCourse:&lt;role&gt;:&lt;userId&gt;</code> stores the current workspace course context.
                </li>
                <li>
                  <code>socrattica:landing-audience:v1</code> stores temporary landing personalization state.
                </li>
                <li>
                  <code>notifications:*</code> keys support notification automations, preferences, and duplicate-delivery guards.
                </li>
                <li>
                  <code>exerciseBank:activeQuiz:*</code> and related guard keys help protect active quiz sessions.
                </li>
                <li>
                  <code>socrattica:extra-admin-emails</code> and <code>socrattica:admin-delegated-permissions:v1</code>{" "}
                  support delegated admin access continuity.
                </li>
              </ul>
            </article>

            <article className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
              <h3 className="text-base font-bold text-slate-900">4. Consent controls and changes</h3>
              <p className="mt-2 text-sm text-slate-600">
                Cookie preferences are managed in the cookie settings panel. Necessary technologies remain active because
                they are required for core functionality. Optional categories can be accepted, rejected, or customized.
                Updated choices overwrite prior consent records.
              </p>
            </article>

            <article className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
              <h3 className="text-base font-bold text-slate-900">5. Browser controls and deletion</h3>
              <p className="mt-2 text-sm text-slate-600">
                You can clear cookies and local storage using browser settings at any time. Doing so may reset selected
                course context, consent settings, preference values, and other continuity features. Blocking necessary
                storage can prevent login persistence and key product operations.
              </p>
            </article>

            <article className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
              <h3 className="text-base font-bold text-slate-900">6. Third-party services</h3>
              <p className="mt-2 text-sm text-slate-600">
                Core platform services rely on Firebase infrastructure for authentication, database, and hosted app
                delivery. Some storage behavior may be required by those infrastructure components to maintain secure
                sessions and normal platform operation.
              </p>
            </article>

            <article className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
              <h3 className="text-base font-bold text-slate-900">7. Policy updates</h3>
              <p className="mt-2 text-sm text-slate-600">
                We may update this policy when product behavior, legal obligations, or governance controls change. Updated
                versions become effective once published with a revised date.
              </p>
            </article>
          </section>

          <section className="mt-4 rounded-2xl border border-slate-200/60 bg-slate-50 p-4 text-sm text-slate-600">
            Cookie policy questions can be sent to{" "}
            <a href={`mailto:${supportEmail}`} className="font-semibold text-sky-700 hover:text-sky-800">
              {supportEmail}
            </a>{" "}
            or through the{" "}
            <Link to="/contact" className="font-semibold text-sky-700 hover:text-sky-800">
              contact page
            </Link>
            .
          </section>

          <PublicFooter summary={`Understand cookie categories, consent options, and control settings used by ${platformName}.`} />
        </div>
      </div>
    </div>
  );
}
