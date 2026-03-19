import { Database, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { SeoHead } from "@/components/common/SeoHead";
import { PublicTopNav } from "@/components/common/PublicTopNav";
import { PublicFooter } from "@/components/common/PublicFooter";
import {
  DEFAULT_PLATFORM_NAME,
  useAdminPlatformSettings,
} from "@/lib/services/adminSettingsService";

const LAST_UPDATED = "March 15, 2026";

type PrivacySection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

type DataMapRow = {
  area: string;
  examples: string;
  purpose: string;
};

const sections: PrivacySection[] = [
  {
    title: "1. Scope and roles",
    paragraphs: [
      "This Privacy Policy applies to the public site, authentication flows, student workspace, teacher workspace, and administrative modules of the platform.",
      "Depending on context, data can be provided by students, teachers, institutions, delegated administrators, or owner administrators. Each role has different feature access and therefore different data processing paths.",
    ],
  },
  {
    title: "2. Information you provide directly",
    paragraphs: [
      "When creating an account, users may provide personal and operational data such as full name, email, ID document, WhatsApp number, institution, and selected role.",
      "When requesting teacher access, users may provide additional approval-related fields, including plan interest, institution ownership/type, payment method, and custom plan notes used by admin review workflows.",
      "If you contact support from the public site, we may collect contact forms and pricing-estimator records, including subject/message fields and institution context.",
    ],
  },
  {
    title: "3. Information generated through platform usage",
    paragraphs: [
      "The platform processes academic and operational data generated while features are used. This includes course structures, enrollments, assessments, grade sheets, classroom files, and scheduling metadata.",
      "Administrative and governance modules process status fields such as approval state, plan status, delegated access rules, and operational logs needed for institutional oversight.",
    ],
    bullets: [
      "Course and classroom records, including ownership and enrolled users",
      "Assessments, grade-sheet activity, and publication states",
      "File/document metadata and educational resource references",
      "Teacher approval lifecycle states (pending, approved, rejected, payment pending, expired)",
      "Backup snapshot metadata for restore and retention controls",
    ],
  },
  {
    title: "4. Data sources and technical systems",
    paragraphs: [
      "Authentication is handled through Firebase Authentication, and application records are handled through Cloud Firestore collections and documents used by role-based product modules.",
      "Examples include but are not limited to user profile collections, courses, assessments, grade sheets, support messages, pricing requests, backup snapshots, institutions, settings, and admin governance records.",
      "Some feature preferences are persisted in browser local storage to improve continuity (for example cookie consent state, selected course context, and limited workspace preferences).",
    ],
  },
  {
    title: "5. Why we process data",
    paragraphs: [
      "Data is processed to provide account access, run academic workflows, protect platform integrity, and support institutional governance.",
      "Operational use cases include enrollment continuity, grade visibility, teacher-access approval controls, support ticket handling, and backup/recovery operations.",
    ],
    bullets: [
      "Provide and secure sign-in, authorization, and role-based access",
      "Run learning workflows (courses, assessments, grades, materials, calendar context)",
      "Enable admin modules (approvals, institutions, reports, settings, permissions, backups)",
      "Respond to user support and pricing contact requests",
      "Maintain abuse prevention, accountability, and operational continuity",
    ],
  },
  {
    title: "6. Data sharing and subprocessors",
    paragraphs: [
      "The platform does not sell user data. Data may be processed by infrastructure providers required to deliver core functionality, such as authentication, database, and hosting components.",
      "Data may be disclosed when required by applicable law, legal process, or to protect rights, safety, and platform integrity.",
    ],
  },
  {
    title: "7. Retention, deletion, and account lifecycle",
    paragraphs: [
      "Records are retained for active operations, institutional continuity, and governance needs. Retention can vary by module and legal obligation.",
      "The platform includes structured deletion workflows. Depending on role and request type, account deletion may involve staged processing, profile cleanup, enrollment detachment, and deleted-account markers used to prevent ghost reactivation.",
      "Backup snapshots may be retained for recovery workflows and can be cleaned according to operational settings and policy controls.",
    ],
  },
  {
    title: "8. Security and access controls",
    paragraphs: [
      "Role-based routing, approval states, and delegated permissions are used to reduce unauthorized access to protected modules.",
      "Administrative actions are monitored through governance modules and operational logs designed to improve traceability and reduce accidental misuse.",
      "No system is guaranteed to be risk-free; users and institutions should also apply strong credential hygiene and access governance.",
    ],
  },
  {
    title: "9. Your choices and rights",
    paragraphs: [
      "Users may request account-profile updates, institutional field corrections, or account deletion according to platform flows and applicable law.",
      "Cookie and browser-storage preferences can be managed through consent controls and browser settings. Disabling necessary storage can limit core functionality.",
    ],
  },
  {
    title: "10. Policy updates",
    paragraphs: [
      "This policy may be updated to reflect product changes, legal requirements, or governance improvements. Updated versions become effective when published with a new date.",
    ],
  },
];

const dataMap: DataMapRow[] = [
  {
    area: "Identity and account",
    examples: "name, email, role, requestedRole, approval status",
    purpose: "authentication, role routing, governance controls",
  },
  {
    area: "Institution and onboarding",
    examples: "institutionName, teacherInstitutionName, ownership, plan intent",
    purpose: "institution mapping, teacher-access review, admin operations",
  },
  {
    area: "Academic workflow",
    examples: "courses, assessments, grade sheets, periods, files",
    purpose: "learning delivery, grading, reporting, continuity",
  },
  {
    area: "Support and contact",
    examples: "contact messages, pricing requests, response metadata",
    purpose: "customer support and institutional onboarding follow-up",
  },
  {
    area: "Governance and protection",
    examples: "permissions, admin audit records, backup snapshots",
    purpose: "security posture, recoverability, accountability",
  },
];

export default function PrivacyPolicyPage() {
  const { settings } = useAdminPlatformSettings();
  const platformName = String(settings.platformName || "").trim() || DEFAULT_PLATFORM_NAME;
  const supportEmail = String(settings.supportEmail || "").trim() || "rcroman20@gmail.com";

  return (
    <div className="relative min-h-screen  bg-slate-100 px-4 py-5 sm:px-6 lg:px-8">
      <SeoHead
        title="Privacy Policy"
        description={`Detailed privacy and data-handling terms for ${platformName} across student, teacher, and admin workflows.`}
        canonicalPath="/privacy-policy"
        robots="index, follow"
        keywords="privacy policy, education data governance, student data, teacher approvals, admin controls"
      />

      <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-sky-100/50 blur-[80px]" />
      <div className="pointer-events-none absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-emerald-100/50 blur-[80px]" />

      <div className="relative mx-auto w-full max-w-[1200px]">
        <PublicTopNav />

        <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <section className="mb-6 rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-5 shadow-sm lg:p-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
              <Sparkles className="h-3.5 w-3.5" />
              Legal
            </span>
            <h1 className="mt-3 text-xl font-extrabold text-slate-900 sm:text-2xl">Privacy Policy</h1>
            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-600">
              This document describes how <b>{platformName}</b> collects, uses, stores, and protects personal and academic
              information in real platform workflows. It is designed to explain product behavior in plain operational terms.
            </p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Last updated: {LAST_UPDATED}</p>
          </section>

          <section className="mb-4 grid gap-4 md:grid-cols-3">
            <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                <Database className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-semibold text-slate-900">Data Categories</h2>
              <p className="mt-1 text-sm text-slate-600">Identity, institution, academic, support, and governance records.</p>
            </article>

            <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-semibold text-slate-900">Purpose</h2>
              <p className="mt-1 text-sm text-slate-600">Service delivery, safety controls, and institutional operations.</p>
            </article>

            <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                <Lock className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-semibold text-slate-900">Protection</h2>
              <p className="mt-1 text-sm text-slate-600">Role-based permissions, approval states, and security workflows.</p>
            </article>
          </section>

          <section className="mb-4 rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-900">Operational data map</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200/60 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2 font-semibold">Area</th>
                    <th className="px-2 py-2 font-semibold">Examples</th>
                    <th className="px-2 py-2 font-semibold">Primary purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {dataMap.map((row) => (
                    <tr key={row.area} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-2 py-2 font-semibold text-slate-900">{row.area}</td>
                      <td className="px-2 py-2 text-slate-600">{row.examples}</td>
                      <td className="px-2 py-2 text-slate-600">{row.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

          <section className="mt-4 rounded-2xl border border-slate-200/60 bg-slate-50 p-4 text-sm text-slate-600">
            For privacy requests or clarifications, contact{" "}
            <a href={`mailto:${supportEmail}`} className="font-semibold text-sky-700 hover:text-sky-800">
              {supportEmail}
            </a>{" "}
            or use the public{" "}
            <Link to="/contact" className="font-semibold text-sky-700 hover:text-sky-800">
              contact page
            </Link>
            .
          </section>

          <PublicFooter summary={`Review detailed privacy, security, and governance practices applied across the ${platformName} workspace.`} />
        </div>
      </div>
    </div>
  );
}
