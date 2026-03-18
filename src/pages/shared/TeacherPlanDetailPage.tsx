import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Home,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Layers3,
  LineChart,
  Sparkles,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  MAX_STUDENTS_PER_COURSE,
  TEACHER_PLAN_OPTIONS,
  getTeacherPlanPath,
  resolveTeacherPlanId,
} from "@/lib/services/teacherPlanService";
import { useAdminPlatformSettings } from "@/lib/services/adminSettingsService";
import { SeoHead } from "@/components/common/SeoHead";
import { PublicTopNav } from "@/components/common/PublicTopNav";
import { PublicFooter } from "@/components/common/PublicFooter";

const formatCop = (value: number) => `$${value.toLocaleString("es-CO")} COP`;
const dashboardShellClassName =
  "relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6";
const cardClassName = "rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm";

export default function TeacherPlanDetailPage() {
  const { settings } = useAdminPlatformSettings();
  const platformName = String(settings.platformName || "").trim() || "Socrattica";
  const navigate = useNavigate();
  const { planId } = useParams<{ planId: string }>();
  const resolvedPlanId = useMemo(() => resolveTeacherPlanId(planId), [planId]);

  const selectedPlan = useMemo(
    () => TEACHER_PLAN_OPTIONS.find((plan) => plan.id === resolvedPlanId) || null,
    [resolvedPlanId],
  );

  if (!selectedPlan) {
    return (
      <div className="relative min-h-screen overflow-x-hidden bg-slate-100 px-4 py-5 sm:px-6 lg:px-8">
        <SeoHead
          title="Teacher plan not found"
          description={`The requested ${platformName} teacher plan could not be found. Review the available annual plans.`}
          canonicalPath="/plans/starter-annual"
          robots="noindex, follow"
        />
        <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
        <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />

        <section className="relative mx-auto mb-8 w-full max-w-[1200px]">
          <div className={dashboardShellClassName}>
            <div className={cardClassName}>
              <p className="text-sm font-semibold text-slate-900">Plan not found</p>
              <p className="mt-1 text-sm text-slate-600">
                The requested plan does not exist. Select one of the available plans.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 ">
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300/60 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  <Home className="h-4 w-4" />
                 Home
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/auth")}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-sky-500 bg-gradient-to-b from-sky-500 to-sky-600 px-4 text-sm font-semibold text-white transition hover:from-sky-600 hover:to-sky-700"
                >
                  Go to auth
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-100 px-4 py-5 sm:px-6 lg:px-8">
      <SeoHead
        title={selectedPlan.label}
        description={`${selectedPlan.label} for ${platformName}: ${selectedPlan.summary} Supports up to ${selectedPlan.courseLimit} active courses and ${selectedPlan.studentLimit} students.`}
        canonicalPath={getTeacherPlanPath(selectedPlan.id)}
        keywords={`${selectedPlan.label.toLowerCase()}, academic plans, teacher annual plan, LMS pricing, ${platformName}`}
        structuredData={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: selectedPlan.label,
          description: selectedPlan.summary,
          brand: {
            "@type": "Brand",
            name: platformName,
          },
          category: "Educational software subscription",
          url: `https://socrattica.web.app${getTeacherPlanPath(selectedPlan.id)}`,
          offers: {
            "@type": "Offer",
            price: String(selectedPlan.priceCop),
            priceCurrency: "COP",
            availability: "https://schema.org/InStock",
            url: `https://socrattica.web.app${getTeacherPlanPath(selectedPlan.id)}`,
          },
        }}
      />
      <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
      <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />

      <div className="relative mx-auto w-full max-w-[1200px]">
        <PublicTopNav />
        <div className={dashboardShellClassName}>
          <div className="space-y-4 pb-1">
            <section className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
              <div className="pointer-events-none absolute -left-16 -top-20 h-40 w-40 rounded-full bg-sky-200/20" />
              <div className="pointer-events-none absolute -bottom-24 -right-20 h-48 w-48 rounded-full bg-indigo-200/20" />

              <div className="relative space-y-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1">
                      <Layers3 className="h-3.5 w-3.5 text-sky-700" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                        Plan Workspace
                      </span>
                    </div>
                    <h1 className="mt-2 text-xl font-extrabold text-slate-900 sm:text-2xl">{selectedPlan.label}</h1>
                    <p className="mt-1 max-w-3xl text-sm text-slate-600">{selectedPlan.summary}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Annual pricing is designed for stable academic operations and scalable growth.
                    </p>
                  </div>

                  <div className="w-full lg:w-auto lg:min-w-[330px]">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-slate-200/60 bg-white px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Annual price</p>
                        <p className="text-lg font-extrabold text-slate-900">{formatCop(selectedPlan.priceCop)}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200/60 bg-white px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Monthly equivalent</p>
                        <p className="text-lg font-extrabold text-slate-900">
                          {formatCop(selectedPlan.monthlyEquivalentCop)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200/60 bg-white px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Courses</p>
                        <p className="text-lg font-extrabold text-slate-900">{selectedPlan.courseLimit}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200/60 bg-white px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Students</p>
                        <p className="text-lg font-extrabold text-slate-900">{selectedPlan.studentLimit}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-xs text-slate-600">
                  Estimated average: ~{MAX_STUDENTS_PER_COURSE} students per course (real usage can be higher).
                </div>
              </div>
            </section>

          

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_320px]">
              <article className={cardClassName}>
                <p className="text-sm font-semibold text-slate-900">Everything included</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  {selectedPlan.benefits.join(". ")}.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  In practical terms, this plan gives your teaching operation enough capacity to manage up to{" "}
                  <span className="font-semibold text-slate-900">{selectedPlan.courseLimit} active courses</span>{" "}
                  and up to{" "}
                  <span className="font-semibold text-slate-900">{selectedPlan.studentLimit} students</span> in one
                  structured environment, with a consistent workflow for class setup, grading, and follow-up.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  Your team also gets{" "}
                  <span className="font-semibold text-slate-900">{selectedPlan.analyticsLabel.toLowerCase()}</span>{" "}
                  to monitor academic performance and{" "}
                  <span className="font-semibold text-slate-900">{selectedPlan.supportLabel.toLowerCase()}</span> to
                  keep operations stable when questions or issues appear.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  The annual structure is built for predictable planning and long-term execution, with an equivalent
                  monthly investment of{" "}
                  <span className="font-semibold text-slate-900">
                    {formatCop(selectedPlan.monthlyEquivalentCop)}
                  </span>
                  . As your operation grows, you can move to the next tier without rebuilding your processes.
                </p>
              </article>

              <aside className="space-y-3">
                <article className={cardClassName}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Recommended for
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{selectedPlan.idealFor}</p>
                </article>

                <article className={cardClassName}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Activation flow
                  </p>
                  <div className="mt-2 space-y-1.5">
                    <p className="inline-flex items-start gap-1.5 text-xs text-slate-600">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-600" />
                      Submit your teacher request with institution details.
                    </p>
                    <p className="inline-flex items-start gap-1.5 text-xs text-slate-600">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-600" />
                      Admin reviews and confirms your plan assignment.
                    </p>
                    <p className="inline-flex items-start gap-1.5 text-xs text-slate-600">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-600" />
                      Teacher tools are enabled after payment validation.
                    </p>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    You can upgrade to a higher annual plan at any time as your teaching operation grows.
                  </p>
                </article>

                <article className={cardClassName}>
                  <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <LineChart className="h-3.5 w-3.5 text-slate-500" />
                    Analytics
                  </p>
                  <p className="mt-1 text-sm text-slate-700">{selectedPlan.analyticsLabel}</p>
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <ShieldCheck className="h-3.5 w-3.5 text-slate-500" />
                    Support
                  </p>
                  <p className="mt-1 text-sm text-slate-700">{selectedPlan.supportLabel}</p>
                </article>
              </aside>
            </section>

            <section className={cardClassName}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Compare annual plans</p>
                  <p className="text-xs text-slate-500">
                    Choose the tier that matches your expected operational load.
                  </p>
                </div>
                <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  3 annual offers
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                {TEACHER_PLAN_OPTIONS.map((plan) => (
                  <article
                    key={plan.id}
                    className={`rounded-xl border p-3 transition-colors ${
                      plan.id === selectedPlan.id
                        ? "border-sky-300 bg-sky-50"
                        : "border-slate-200/60 bg-white hover:border-slate-300/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{plan.label}</p>
                        <p className="mt-1 text-lg font-bold text-slate-900">{formatCop(plan.priceCop)}</p>
                        <p className="text-xs text-slate-500">{plan.durationLabel}</p>
                      </div>
                      {plan.isPopular ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                          <BadgeCheck className="h-3 w-3" />
                          Popular
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 space-y-1 text-xs text-slate-600">
                      <p className="inline-flex items-center gap-1.5">
                        <CalendarClock className="h-3.5 w-3.5 text-slate-500" />
                        {plan.billingLabel}
                      </p>
                      <p className="inline-flex items-center gap-1.5">
                        <LineChart className="h-3.5 w-3.5 text-slate-500" />
                        {plan.analyticsLabel}
                      </p>
                      <p className="inline-flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-slate-500" />
                        {plan.studentLimit} students
                      </p>
                    </div>

                    {plan.id !== selectedPlan.id ? (
                      <button
                        type="button"
                        onClick={() => navigate(getTeacherPlanPath(plan.id))}
                        className="mt-3 inline-flex h-8 items-center rounded-lg border border-slate-300/60 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        View
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>

          </div>
        </div>
        <PublicFooter summary={`Review annual plans with the same operational structure used across the ${platformName} workspace.`} />
      </div>
    </div>
  );
}
