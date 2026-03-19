import { AlertTriangle, Gavel, Scale, ShieldCheck, Sparkles, UserCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { SeoHead } from "@/components/common/SeoHead";
import { PublicTopNav } from "@/components/common/PublicTopNav";
import { PublicFooter } from "@/components/common/PublicFooter";
import {
  DEFAULT_PLATFORM_NAME,
  useAdminPlatformSettings,
} from "@/lib/services/adminSettingsService";

const LAST_UPDATED = "March 15, 2026";

type TermsSection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

const sections: TermsSection[] = [
  {
    title: "1. Acceptance and platform scope",
    paragraphs: [
      "These Terms & Conditions govern access to the public site, account registration, and all authenticated modules of the platform, including student, teacher, and admin workflows.",
      "By accessing or using the platform, you agree to follow these terms and all applicable operational policies published inside the product.",
    ],
  },
  {
    title: "2. Eligibility and account responsibility",
    paragraphs: [
      "Users must provide accurate registration details and keep account information updated. You are responsible for maintaining credential security and for activity performed through your account.",
      "Impersonation, fake profile creation, unauthorized account sharing, and attempts to bypass role controls are prohibited.",
    ],
    bullets: [
      "Provide truthful identity and contact information",
      "Protect your credentials and device access",
      "Notify support if you suspect unauthorized account use",
    ],
  },
  {
    title: "3. Role-based access and teacher approval",
    paragraphs: [
      "Platform functionality is role-based. Students, teachers, and admins see different modules and permissions.",
      "Teacher access may require administrator approval before teacher features are enabled. Approval outcomes can include pending, approved, rejected, or payment-related states depending on governance configuration.",
    ],
  },
  {
    title: "4. Academic operations and content ownership",
    paragraphs: [
      "Teachers and institutions are responsible for the legality, quality, and suitability of the educational content they upload or publish.",
      "The platform provides operational tools for course delivery, evaluations, grade sheets, schedules, and materials; however, instructional decisions and classroom outcomes remain the responsibility of educators and institutions.",
    ],
    bullets: [
      "Only upload materials you are authorized to use",
      "Respect copyright, privacy, and academic integrity standards",
      "Avoid uploading harmful, abusive, or unlawful content",
    ],
  },
  {
    title: "5. Assessments, grades, and publication behavior",
    paragraphs: [
      "Grade visibility depends on publication and workflow state. Draft values, pending evaluations, or late updates can affect what is shown across student and teacher views.",
      "Teachers and admins are responsible for validating grade-sheet setup, assessment weighting, and publication timing before communicating final outcomes.",
    ],
  },
  {
    title: "6. Plans, billing signals, and institutional scale",
    paragraphs: [
      "Teacher plans may define operational thresholds such as course capacity, student capacity guidance, and support response expectations.",
      "Plan assignment and payment-state handling can influence which advanced teacher features are active. Pricing details and institutional onboarding information may be collected through dedicated forms.",
    ],
  },
  {
    title: "7. Availability, maintenance mode, and backups",
    paragraphs: [
      "Service availability can be modified for maintenance, upgrades, emergency mitigation, or governance interventions.",
      "Backup and restore features are operational controls intended to support continuity. They do not replace each institution's own academic governance, export routines, or compliance obligations.",
    ],
  },
  {
    title: "8. Acceptable use and prohibited behavior",
    paragraphs: [
      "You may not misuse the platform, interfere with normal operations, attempt unauthorized data access, or deploy abusive automation against platform services.",
    ],
    bullets: [
      "No exploitation of security vulnerabilities",
      "No harassment, hate, or abusive conduct",
      "No fraudulent use of approvals, plans, or role permissions",
      "No attempts to corrupt, scrape, or destroy operational data",
    ],
  },
  {
    title: "9. Suspension, restriction, and termination",
    paragraphs: [
      "The platform may suspend or restrict accounts when there is evidence of policy violations, security risk, fraud, legal exposure, or operational abuse.",
      "Account or feature termination can include access revocation, role rollback, and workflow restrictions while investigations or governance actions are completed.",
    ],
  },
  {
    title: "10. Data lifecycle and deletion workflows",
    paragraphs: [
      "Account deletion requests may be processed through staged workflows that include record cleanup, enrollment detachment, and operational history markers required to prevent data inconsistency.",
      "Some records may be retained where required for legal compliance, security response, audit continuity, or institutional governance.",
    ],
  },
  {
    title: "11. Disclaimers and limitation of liability",
    paragraphs: [
      "The platform is provided on an \"as available\" basis. While we work to maintain reliability and data integrity, uninterrupted or error-free operation cannot be guaranteed in all conditions.",
      "To the maximum extent permitted by applicable law, platform operators are not liable for indirect, incidental, special, or consequential losses arising from misuse, outages, third-party failures, or policy violations by user accounts.",
    ],
  },
  {
    title: "12. Changes to these terms",
    paragraphs: [
      "These terms may be updated to reflect product evolution, regulatory obligations, or institutional-governance improvements.",
      "Continued use of the platform after updates are published constitutes acceptance of the revised terms.",
    ],
  },
];

export default function TermsConditionsPage() {
  const { settings } = useAdminPlatformSettings();
  const platformName = String(settings.platformName || "").trim() || DEFAULT_PLATFORM_NAME;
  const supportEmail = String(settings.supportEmail || "").trim() || "rcroman20@gmail.com";

  return (
    <div className="relative min-h-screen  bg-slate-100 px-4 py-5 sm:px-6 lg:px-8">
      <SeoHead
        title="Terms & Conditions"
        description={`Terms and operational conditions for ${platformName}, including role access, governance, and academic workflow responsibilities.`}
        canonicalPath="/terms-and-conditions"
        robots="index, follow"
        keywords="terms and conditions, educational platform terms, role access terms, teacher approval terms"
      />

      <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-indigo-100/45 blur-[80px]" />
      <div className="pointer-events-none absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-amber-100/45 blur-[80px]" />

      <div className="relative mx-auto w-full max-w-[1200px]">
        <PublicTopNav />

        <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <section className="mb-6 rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50 to-indigo-50 p-5 shadow-sm lg:p-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
              <Sparkles className="h-3.5 w-3.5" />
              Legal
            </span>
            <h1 className="mt-3 text-xl font-extrabold text-slate-900 sm:text-2xl">Terms & Conditions</h1>
            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-600">
              These terms define the operational agreement between users and {platformName}, including account use,
              role-based access, academic workflow responsibilities, and governance controls.
            </p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Last updated: {LAST_UPDATED}</p>
          </section>

          <section className="mb-4 grid gap-4 md:grid-cols-3">
            <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                <UserCheck className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-semibold text-slate-900">Account Conduct</h2>
              <p className="mt-1 text-sm text-slate-600">Accurate registration data and responsible account use are required.</p>
            </article>

            <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-semibold text-slate-900">Governance Controls</h2>
              <p className="mt-1 text-sm text-slate-600">Role permissions, approval states, and policy toggles guide access.</p>
            </article>

            <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <Gavel className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-semibold text-slate-900">Legal Framework</h2>
              <p className="mt-1 text-sm text-slate-600">Use is conditioned on compliance with laws and these terms.</p>
            </article>
          </section>

          <section className="space-y-4">
            {sections.map((section) => (
              <article key={section.title} className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
                <h3 className="text-base font-bold text-slate-900">{section.title}</h3>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="mt-2 text-sm leading-relaxed text-slate-600">
                    {paragraph}
                  </p>
                ))}
                {section.bullets ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </section>

          <section className="mt-4 rounded-2xl border border-amber-200/70 bg-amber-50/70 p-4 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                If you do not agree with these terms, do not use the platform. For account, legal, or governance
                clarifications, contact{" "}
                <a href={`mailto:${supportEmail}`} className="font-semibold text-amber-900 underline decoration-amber-500/70">
                  {supportEmail}
                </a>{" "}
                or visit{" "}
                <Link to="/contact" className="font-semibold text-amber-900 underline decoration-amber-500/70">
                  Contact
                </Link>
                .
              </p>
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-slate-200/60 bg-slate-50 p-4 text-sm text-slate-600">
            These terms should be read together with the{" "}
            <Link to="/privacy-policy" className="font-semibold text-sky-700 hover:text-sky-800">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link to="/cookies-policy" className="font-semibold text-sky-700 hover:text-sky-800">
              Cookies Policy
            </Link>
            .
          </section>

          <section className="mt-4 rounded-2xl border border-slate-200/60 bg-white p-4 text-sm text-slate-600">
            <div className="flex items-start gap-2">
              <Scale className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <p>
                Nothing in these terms limits rights that cannot be waived under applicable law. If any clause is held
                unenforceable, remaining clauses stay in effect to the extent legally permitted.
              </p>
            </div>
          </section>

          <PublicFooter summary={`Review the legal terms that govern account use, role permissions, and institutional operations in ${platformName}.`} />
        </div>
      </div>
    </div>
  );
}
