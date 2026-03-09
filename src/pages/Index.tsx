import { type ComponentType, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Building2,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  Clock3,
  GraduationCap,
  HeartPulse,
  Layers3,
  LineChart,
  Mail,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Users2,
} from "lucide-react";
import {
  TEACHER_PLAN_OPTIONS,
  getTeacherPlanPath,
  type TeacherPlanId,
} from "@/lib/services/teacherPlanService";
import { submitPricingContactRequest } from "@/lib/services/pricingContactService";

type LandingAudience = "teacher" | "student";

type FeatureCard = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  tone: string;
};

type SnapshotCard = {
  label: string;
  value: string;
};

type ValuePillar = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  tone: string;
};

type RoadmapStep = {
  step: string;
  title: string;
  description: string;
};

type SalesMetric = {
  label: string;
  value: string;
  hint: string;
};

type SegmentCard = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  tone: string;
};

type ComparisonRow = {
  before: string;
  after: string;
};

type PricingMatrixRow = {
  feature: string;
  values: Record<TeacherPlanId, string>;
};

const formatCop = (value: number) => `$${value.toLocaleString("es-CO")}`;
const VAKI_PAGE_URL =
  "https://vaki.co/es/vaki/nxpVm2CxyuYoqLcEestb?utm_source=copy&utm_medium=share-dialog&utm_campaign=v4";
const AUDIENCE_CACHE_KEY = "multicourses:landing-audience:v1";
const AUDIENCE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type AudienceCachePayload = {
  value: LandingAudience;
  expiresAt: number;
};

const readCachedAudience = (): LandingAudience | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUDIENCE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AudienceCachePayload>;
    const value = parsed.value;
    const expiresAt = Number(parsed.expiresAt || 0);
    const validValue = value === "teacher" || value === "student";
    if (!validValue || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      window.localStorage.removeItem(AUDIENCE_CACHE_KEY);
      return null;
    }
    return value;
  } catch {
    return null;
  }
};

const cacheAudience = (value: LandingAudience): void => {
  if (typeof window === "undefined") return;
  try {
    const payload: AudienceCachePayload = {
      value,
      expiresAt: Date.now() + AUDIENCE_CACHE_TTL_MS,
    };
    window.localStorage.setItem(AUDIENCE_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore cache write issues on restricted browsers.
  }
};

const dashboardShellClassName =
  "relative rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6";

const cardClassName = "rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4";
const softCardClassName = "rounded-2xl border border-slate-200 bg-slate-50/70 p-3 shadow-sm sm:p-4";
const statPillClassName =
  "rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600";
const inputClassName =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

const teacherFeatureCards: FeatureCard[] = [
  {
    icon: BookOpen,
    title: "Course Builder",
    description: "Create, structure, and scale course content with full control.",
    tone: "bg-sky-100 text-sky-700",
  },
  {
    icon: HeartPulse,
    title: "Grade Monitoring",
    description: "Track approvals, pending work, and class health in real time.",
    tone: "bg-emerald-100 text-emerald-700",
  },
  {
    icon: CalendarClock,
    title: "Schedule Clarity",
    description: "Manage weekly classes, deadlines, and workload from one view.",
    tone: "bg-indigo-100 text-indigo-700",
  },
  {
    icon: ShieldCheck,
    title: "Plan Enforcement",
    description: "Apply plan limits and admin approval with a controlled workflow.",
    tone: "bg-amber-100 text-amber-700",
  },
];

const studentFeatureCards: FeatureCard[] = [
  {
    icon: BookOpen,
    title: "Course Tracking",
    description: "Keep every active class organized in a single dashboard context.",
    tone: "bg-sky-100 text-sky-700",
  },
  {
    icon: LineChart,
    title: "Progress Insights",
    description: "Follow your current grade and pending activities with less friction.",
    tone: "bg-emerald-100 text-emerald-700",
  },
  {
    icon: CalendarDays,
    title: "Weekly Visibility",
    description: "See upcoming deadlines and sessions to avoid late submissions.",
    tone: "bg-indigo-100 text-indigo-700",
  },
  {
    icon: Sparkles,
    title: "Materials Access",
    description: "Open learning resources and assignments quickly from one place.",
    tone: "bg-amber-100 text-amber-700",
  },
];

const teacherRoadmap: RoadmapStep[] = [
  {
    step: "Step 1",
    title: "Request teacher access",
    description: "Submit your teacher profile and institution details.",
  },
  {
    step: "Step 2",
    title: "Admin review",
    description: "Admins evaluate your request and validate your setup.",
  },
  {
    step: "Step 3",
    title: "Plan assignment",
    description: "Select the best plan based on course and student capacity.",
  },
  {
    step: "Step 4",
    title: "Launch operations",
    description: "Start publishing courses, grading, and monitoring progress.",
  },
];

const studentRoadmap: RoadmapStep[] = [
  {
    step: "Step 1",
    title: "Sign in",
    description: "Create your account and access the student workspace.",
  },
  {
    step: "Step 2",
    title: "Open your courses",
    description: "Switch course context and track each class clearly.",
  },
  {
    step: "Step 3",
    title: "Follow progress",
    description: "Review grades, pending tasks, and course health instantly.",
  },
  {
    step: "Step 4",
    title: "Stay on schedule",
    description: "Use calendar and materials to avoid late submissions.",
  },
];

const trustedInstitutions = [
  "English Grammar Blog",
  "English Pro Lab",
  "Colegio Horizon",
  "Academia Nova",
  "STEM Center",
];

const teacherSalesMetrics: SalesMetric[] = [
  { label: "Teacher approval flow", value: "100%", hint: "Centralized review pipeline" },
  { label: "Plan options", value: "3", hint: "Three annual tiers" },
  { label: "Max tier capacity", value: "2450", hint: "Students on Scale Annual" },
  { label: "Operational modules", value: "7+", hint: "Courses, grades, students, stats and more" },
];

const studentSalesMetrics: SalesMetric[] = [
  { label: "Learning context", value: "Per course", hint: "Focused dashboard experience" },
  { label: "Progress visibility", value: "Real-time", hint: "Grades and pending tasks connected" },
  { label: "Academic modules", value: "Core flow", hint: "Courses, materials, calendar, grades" },
  { label: "Weekly planning", value: "Always on", hint: "Clear timeline for classes and deadlines" },
];

const teacherSegments: SegmentCard[] = [
  {
    icon: GraduationCap,
    title: "Independent Teachers",
    description: "Run professional class operations with plan-based growth.",
    tone: "bg-sky-100 text-sky-700",
  },
  {
    icon: Building2,
    title: "Schools & Academies",
    description: "Control teacher approval, consistency, and operational quality.",
    tone: "bg-emerald-100 text-emerald-700",
  },
  {
    icon: ShieldCheck,
    title: "Academic Admin Teams",
    description: "Supervise access, payment status, and governance from one place.",
    tone: "bg-indigo-100 text-indigo-700",
  },
];

const studentSegments: SegmentCard[] = [
  {
    icon: BookOpen,
    title: "K-12 Students",
    description: "Keep classes, tasks, and materials in a simple daily workflow.",
    tone: "bg-sky-100 text-sky-700",
  },
  {
    icon: Trophy,
    title: "University Students",
    description: "Track progress and reduce missed deadlines across multiple courses.",
    tone: "bg-emerald-100 text-emerald-700",
  },
  {
    icon: Users2,
    title: "Academic Cohorts",
    description: "Use consistent dashboards and language across student groups.",
    tone: "bg-indigo-100 text-indigo-700",
  },
];

const teacherComparisonRows: ComparisonRow[] = [
  {
    before: "Manual teacher approval through chat or email",
    after: "Centralized approval with status and full traceability",
  },
  {
    before: "No commercial structure for teacher access",
    after: "Defined plans with limits and clear monetization",
  },
  {
    before: "Fragmented monitoring across different tools",
    after: "Single dashboard for courses, students, and performance",
  },
];

const studentComparisonRows: ComparisonRow[] = [
  {
    before: "Scattered links, files, and class updates",
    after: "Single student workspace with course-focused context",
  },
  {
    before: "Unclear grade and pending-task visibility",
    after: "Live progress view tied to active course data",
  },
  {
    before: "Late submissions caused by poor visibility",
    after: "Calendar + pending flow that keeps deadlines visible",
  },
];

const teacherPricingMatrixRows: PricingMatrixRow[] = [
  {
    feature: "Annual billing",
    values: { starter: "Included", growth: "Included", scale: "Included" },
  },
  {
    feature: "Course limit",
    values: { starter: "8", growth: "25", scale: "70" },
  },
  {
    feature: "Student limit",
    values: { starter: "280", growth: "875", scale: "2450" },
  },
  {
    feature: "Estimated students per course",
    values: { starter: "~35", growth: "~35", scale: "~35" },
  },
  {
    feature: "Analytics",
    values: {
      starter: "Core",
      growth: "Advanced",
      scale: "Full + exports",
    },
  },
  {
    feature: "Support",
    values: {
      starter: "Email (48h)",
      growth: "Priority (24h)",
      scale: "Priority + onboarding",
    },
  },
];

export default function Index() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const resolveHomePath = (role?: string): string => {
    if (role === "docente") return "/teacher";
    if (role === "admin") return "/admin/dashboard";
    return "/student";
  };
  const [audience, setAudience] = useState<LandingAudience | null>(() => readCachedAudience());
  const [estimatorCourses, setEstimatorCourses] = useState("10");
  const [estimatorStudents, setEstimatorStudents] = useState("300");
  const [leadName, setLeadName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadInstitution, setLeadInstitution] = useState("");
  const [leadMessage, setLeadMessage] = useState("");
  const [submittingLead, setSubmittingLead] = useState(false);
  const [showNeedEstimator, setShowNeedEstimator] = useState(false);

  const activeAudience: LandingAudience = audience || "student";
  const isTeacherView = activeAudience === "teacher";

  const heroSnapshotCards = useMemo<SnapshotCard[]>(
    () =>
      isTeacherView
        ? [
            { label: "Workspace", value: "Teacher" },
            { label: "Plans", value: "3 annual tiers" },
            { label: "Approval", value: "Admin-controlled" },
            { label: "Monetization", value: "Plan-based" },
          ]
        : [
            { label: "Workspace", value: "Student" },
            { label: "Focus", value: "Learning path" },
            { label: "Calendar", value: "Weekly context" },
            { label: "Tracking", value: "Grade progress" },
          ],
    [isTeacherView],
  );

  const featureCards = isTeacherView ? teacherFeatureCards : studentFeatureCards;
  const valuePillars = useMemo<ValuePillar[]>(
    () =>
      isTeacherView
        ? [
            {
              icon: Building2,
              title: "Institution-ready",
              description: "Role-based access and structured approval workflows for schools and academies.",
              tone: "bg-sky-100 text-sky-700",
            },
            {
              icon: Target,
              title: "Revenue model built-in",
              description: "Plan tiers, limits, and lifecycle controls to monetize teacher operations cleanly.",
              tone: "bg-emerald-100 text-emerald-700",
            },
            {
              icon: ShieldCheck,
              title: "Controlled growth",
              description: "Keep compliance and visibility while scaling courses and student capacity.",
              tone: "bg-indigo-100 text-indigo-700",
            },
          ]
        : [
            {
              icon: Trophy,
              title: "Academic focus",
              description: "Students stay aligned with deadlines, grades, and active course context.",
              tone: "bg-sky-100 text-sky-700",
            },
            {
              icon: CheckCircle2,
              title: "Less friction",
              description: "A cleaner workflow reduces confusion and keeps learning momentum steady.",
              tone: "bg-emerald-100 text-emerald-700",
            },
            {
              icon: Clock3,
              title: "Faster execution",
              description: "Find materials and pending work quickly without jumping across modules.",
              tone: "bg-indigo-100 text-indigo-700",
            },
          ],
    [isTeacherView],
  );
  const roadmap = isTeacherView ? teacherRoadmap : studentRoadmap;
  const salesMetrics = isTeacherView ? teacherSalesMetrics : studentSalesMetrics;
  const segments = isTeacherView ? teacherSegments : studentSegments;
  const comparisonRows = isTeacherView ? teacherComparisonRows : studentComparisonRows;
  const highestTierPlan = TEACHER_PLAN_OPTIONS[TEACHER_PLAN_OPTIONS.length - 1] || null;
  const desiredCourses = Math.max(0, Number(estimatorCourses) || 0);
  const desiredStudents = Math.max(0, Number(estimatorStudents) || 0);

  const estimatedPlan = useMemo(
    () =>
      TEACHER_PLAN_OPTIONS.find(
        (plan) => plan.courseLimit >= desiredCourses && plan.studentLimit >= desiredStudents,
      ) || null,
    [desiredCourses, desiredStudents],
  );

  const estimatedCustomPriceCop = useMemo(() => {
    const topPlan = TEACHER_PLAN_OPTIONS[TEACHER_PLAN_OPTIONS.length - 1];
    if (!topPlan) return 0;
    const coursesFactor = desiredCourses > 0 ? desiredCourses / topPlan.courseLimit : 1;
    const studentsFactor = desiredStudents > 0 ? desiredStudents / topPlan.studentLimit : 1;
    const factor = Math.max(1, coursesFactor, studentsFactor);
    const raw = topPlan.priceCop * factor;
    return Math.ceil(raw / 50000) * 50000;
  }, [desiredCourses, desiredStudents]);
  const estimatedCustomMonthlyCop = Math.ceil(estimatedCustomPriceCop / 12);

  const ctaPrimary = useMemo(() => {
    if (!isAuthenticated || !user) {
      return isTeacherView ? "Request teacher access" : "Start as student";
    }
    return user.role === "docente"
      ? "Open teacher dashboard"
      : user.role === "admin"
        ? "Open admin dashboard"
        : "Open student dashboard";
  }, [isAuthenticated, isTeacherView, user]);

  const handlePrimaryAction = () => {
    if (!isAuthenticated || !user) {
      navigate("/auth");
      return;
    }
    navigate(resolveHomePath(user.role));
  };

  const handleAudienceChange = (nextAudience: LandingAudience) => {
    setAudience(nextAudience);
    cacheAudience(nextAudience);
  };

  const handleLeadSubmit = async () => {
    if (submittingLead) return;

    setSubmittingLead(true);
    try {
      await submitPricingContactRequest({
        name: leadName,
        email: leadEmail,
        institutionName: leadInstitution,
        role: "teacher",
        desiredCourses,
        desiredStudents,
        interestedPlanId: estimatedPlan?.id,
        message: leadMessage,
      });

      toast.success("Request sent. Our team will contact you soon.");
      setLeadMessage("");
      setLeadName("");
      setLeadEmail("");
      setLeadInstitution("");
    } catch (error: unknown) {
      const reason =
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof (error as { message?: unknown }).message === "string"
          ? (error as { message: string }).message
          : "Could not send your request right now.";
      toast.error(reason);
    } finally {
      setSubmittingLead(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-100 px-4 py-2 sm:px-6 lg:px-2">
      <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
      <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />

      <div
        className={`relative mx-auto w-full max-w-[1200px] transition ${
          audience ? "" : "pointer-events-none select-none blur-[1px]"
        }`}
      >
        <div className={dashboardShellClassName}>
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-2.5 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1">
                  <Sparkles className="h-3.5 w-3.5 text-sky-700" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                    MultiCourses
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate("/about")}
                    className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                  >
                    About
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/contact")}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Contact
                  </button>
                </div>
              </div>
            </section>

            <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm">
              <div className="pointer-events-none absolute -left-16 -top-20 h-40 w-40 rounded-full bg-sky-200/20" />
              <div className="pointer-events-none absolute -bottom-24 -right-20 h-48 w-48 rounded-full bg-indigo-200/20" />

              <div className="relative space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1">
                    <Layers3 className="h-3.5 w-3.5 text-sky-700" />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                      {isTeacherView ? "Teacher Control Center" : "Student Success Workspace"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAudienceChange("teacher")}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                        isTeacherView
                          ? "border-sky-300 bg-sky-100 text-sky-800"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <GraduationCap className="h-3.5 w-3.5" />
                      Teacher view
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAudienceChange("student")}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                        !isTeacherView
                          ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      Student view
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
                      {isTeacherView
                        ? "Teach, evaluate, and scale your academic operation"
                        : "Learn, track your grades, and stay on top of courses"}
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm text-slate-600">
                      {isTeacherView
                        ? "Configure classes, monitor student performance, and apply plan limits with an admin-controlled flow."
                        : "Get a cleaner study experience with course context, grade visibility, and direct access to your learning materials."}
                    </p>
                  </div>

                  <div className="w-full lg:w-auto lg:min-w-[320px]">
                    <div className="grid grid-cols-2 gap-2">
                      {heroSnapshotCards.map((snapshot) => (
                        <div
                          key={snapshot.label}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                        >
                          <p className="text-[11px] uppercase tracking-wide text-slate-500">{snapshot.label}</p>
                          <p className="text-sm font-bold leading-tight text-slate-900">{snapshot.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handlePrimaryAction}
                    className="inline-flex h-11 items-center gap-2 rounded-xl border border-sky-500 bg-gradient-to-b from-sky-500 to-sky-600 px-5 text-sm font-semibold text-white shadow-[0_14px_24px_-16px_rgba(2,132,199,0.9)] transition hover:from-sky-600 hover:to-sky-700"
                  >
                    {ctaPrimary}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm">
              <div className="flex flex-col gap-3">
                <div className="min-w-0">
                  <p className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                    <Sparkles className="h-3.5 w-3.5" />
                    Ready to start
                  </p>
                  <h2 className="mt-2 text-xl font-bold text-slate-900">
                    {isTeacherView
                      ? "Turn your teaching workflow into a scalable operation"
                      : "Stay focused and never lose track of your academic progress"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {isTeacherView
                      ? "Submit your request, get approved, and unlock teacher features by plan."
                      : "Sign in and start using your student dashboard with cleaner context."}
                  </p>
                </div>
                <p className="text-xs text-slate-500">
                  Use the main action buttons above to continue.
                </p>
              </div>
            </section>

            <section className={softCardClassName}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {isTeacherView ? "How teacher onboarding works" : "How student success flow works"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {isTeacherView
                      ? "Clear steps from request to monetized classroom operation."
                      : "Simple onboarding from account creation to consistent academic progress."}
                  </p>
                </div>
                <span className={statPillClassName}>
                  4-step path
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {roadmap.map((item) => (
                  <article key={item.step} className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{item.step}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-600">{item.description}</p>
                  </article>
                ))}
              </div>
            </section>

            {isTeacherView && (
              <section className={cardClassName}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Teacher Plans</p>
                    <p className="text-xs text-slate-500">
                      Pick your tier and activate teacher features with admin approval.
                    </p>
                  </div>
                  <span className={statPillClassName}>
                    {TEACHER_PLAN_OPTIONS.length} options
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
                  <article className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 p-3 xl:col-span-3 xl:order-2 xl:self-start">
                    <div className="pointer-events-none absolute -right-12 -top-10 h-24 w-24 rounded-full bg-sky-200/30" />
                    <div className="pointer-events-none absolute -bottom-12 -left-10 h-24 w-24 rounded-full bg-emerald-200/25" />
                    {!showNeedEstimator ? (
                      <div className="relative space-y-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Need more capacity?</p>
                          <p className="mt-1 text-xs text-slate-500">
                            If your institution needs more scale, calculate your recommended annual plan.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                            Annual plans
                          </span>
                          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                            Custom quotes
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowNeedEstimator(true)}
                          className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-sky-500 bg-gradient-to-b from-sky-500 to-sky-600 px-3 text-sm font-semibold text-white transition hover:from-sky-600 hover:to-sky-700"
                        >
                          Calculate here
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">Need-based price estimator</p>
                          <button
                            type="button"
                            onClick={() => setShowNeedEstimator(false)}
                            className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                          >
                            Hide
                          </button>
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-2">
                          <label className="space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              Courses needed
                            </span>
                            <input
                              type="number"
                              min={0}
                              value={estimatorCourses}
                              onChange={(event) => setEstimatorCourses(event.target.value)}
                              className={inputClassName}
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              Total students needed
                            </span>
                            <input
                              type="number"
                              min={0}
                              value={estimatorStudents}
                              onChange={(event) => setEstimatorStudents(event.target.value)}
                              className={inputClassName}
                            />
                          </label>
                        </div>

                        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                          {estimatedPlan ? (
                            <div className="space-y-1 text-xs text-slate-700">
                              <p className="font-semibold text-slate-900">Recommended: {estimatedPlan.label}</p>
                              <p>Estimated annual price: {formatCop(estimatedPlan.priceCop)}</p>
                              <p>Equivalent monthly: {formatCop(estimatedPlan.monthlyEquivalentCop)}</p>
                              <p>
                                Capacity: {estimatedPlan.courseLimit} courses / {estimatedPlan.studentLimit} students
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-1 text-xs text-slate-700">
                              <p className="font-semibold text-slate-900">Custom enterprise quote</p>
                              <p>Estimated annual price from: {formatCop(estimatedCustomPriceCop)}</p>
                              <p>Equivalent monthly from: {formatCop(estimatedCustomMonthlyCop)}</p>
                              <p>
                                Your needs exceed current top tier ({highestTierPlan?.label || "Scale Annual"}).
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                          <p className="text-sm font-semibold text-slate-900">
                            Need a callback from our team?
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Send your details and we will contact your institution with a plan recommendation.
                          </p>

                          <div className="mt-3 grid grid-cols-1 gap-2">
                            <input
                              type="text"
                              value={leadName}
                              onChange={(event) => setLeadName(event.target.value)}
                              placeholder="Full name"
                              className={inputClassName}
                            />
                            <input
                              type="email"
                              value={leadEmail}
                              onChange={(event) => setLeadEmail(event.target.value)}
                              placeholder="Work email"
                              className={inputClassName}
                            />
                            <input
                              type="text"
                              value={leadInstitution}
                              onChange={(event) => setLeadInstitution(event.target.value)}
                              placeholder="Institution or organization"
                              className={inputClassName}
                            />
                            <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                              Teacher
                            </div>
                            <textarea
                              value={leadMessage}
                              onChange={(event) => setLeadMessage(event.target.value)}
                              rows={3}
                              placeholder="Optional message (program size, timeline, extra requirements)"
                              className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                            />
                            <button
                              type="button"
                              onClick={handleLeadSubmit}
                              disabled={submittingLead}
                              className="inline-flex h-10 items-center justify-center rounded-lg border border-sky-500 bg-gradient-to-b from-sky-500 to-sky-600 px-3 text-sm font-semibold text-white transition hover:from-sky-600 hover:to-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {submittingLead ? "Sending..." : "Send contact request"}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </article>

                  <div className="xl:col-span-9 xl:order-1">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {TEACHER_PLAN_OPTIONS.map((plan) => (
                        <article
                          key={plan.id}
                          className={`relative flex h-full flex-col rounded-xl border p-3 text-left transition-colors ${
                            plan.isPopular
                              ? "border-emerald-300 bg-gradient-to-b from-emerald-50 to-white"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-sky-50/60"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                {plan.label}
                              </p>
                              <p className="mt-1 text-2xl font-extrabold text-slate-900">
                                {formatCop(plan.priceCop)}
                              </p>
                              <p className="text-xs text-slate-500">
                                {plan.durationLabel} · {plan.billingLabel}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {formatCop(plan.monthlyEquivalentCop)} / month equivalent
                              </p>
                            </div>
                            {plan.isPopular ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                <BadgeCheck className="h-3 w-3" />
                                Popular
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-1.5">
                            <p className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-center text-[11px] font-semibold text-slate-700">
                              Courses
                              <span className="block text-sm text-slate-900">{plan.courseLimit}</span>
                            </p>
                            <p className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-center text-[11px] font-semibold text-slate-700">
                              Students
                              <span className="block text-sm text-slate-900">{plan.studentLimit}</span>
                            </p>
                          </div>

                          <div className="mt-2 space-y-1 border-t border-slate-200 pt-2 text-[11px] text-slate-600">
                            <p>{plan.analyticsLabel}</p>
                            <p>{plan.supportLabel}</p>
                            <p>Estimated average: ~35 students per course</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => navigate(getTeacherPlanPath(plan.id))}
                            className="mt-auto inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                          >
                            View plan details
                          </button>
                        </article>
                      ))}
                    </div>
                  </div>
                </div>

                <article className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <p className="text-sm font-semibold text-slate-900">Pricing matrix</p>
                  <p className="text-xs text-slate-500">
                    Compare all annual tiers feature by feature.
                  </p>
                  <div className="mt-3 space-y-2 md:hidden">
                    {teacherPricingMatrixRows.map((row) => (
                      <article key={row.feature} className="rounded-lg border border-slate-200 bg-white p-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          {row.feature}
                        </p>
                        <div className="mt-1 grid grid-cols-1 gap-1">
                          {TEACHER_PLAN_OPTIONS.map((plan) => (
                            <p
                              key={`${row.feature}-${plan.id}-mobile`}
                              className="inline-flex items-center gap-1 text-xs text-slate-600"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              <span className="font-semibold text-slate-700">{plan.label}:</span>
                              {row.values[plan.id]}
                            </p>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>

                  <div className="mt-3 hidden md:block">
                    <div className="grid grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))] gap-1">
                      <div className="rounded-md bg-white px-2 py-2 text-xs font-semibold text-slate-700">Feature</div>
                      {TEACHER_PLAN_OPTIONS.map((plan) => (
                        <div
                          key={`${plan.id}-header`}
                          className="rounded-md bg-white px-2 py-2 text-xs font-semibold text-slate-700"
                        >
                          {plan.label}
                        </div>
                      ))}
                    </div>
                    <div className="mt-1 space-y-1">
                      {teacherPricingMatrixRows.map((row) => (
                        <div
                          key={row.feature}
                          className="grid grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))] gap-1"
                        >
                          <div className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700">
                            {row.feature}
                          </div>
                          {TEACHER_PLAN_OPTIONS.map((plan) => (
                            <div
                              key={`${row.feature}-${plan.id}-desktop`}
                              className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs text-slate-600"
                            >
                              <span className="inline-flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                {row.values[plan.id]}
                              </span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              </section>
            )}

            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {featureCards.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article
                    key={feature.title}
                    className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Feature</p>
                        <p className="mt-1.5 text-sm font-bold text-slate-900">{feature.title}</p>
                      </div>
                      <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${feature.tone}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-600">{feature.description}</p>
                  </article>
                );
              })}
            </section>
    <section className={softCardClassName}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {isTeacherView ? "Why institutions choose MultiCourses" : "Why students stay with MultiCourses"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {isTeacherView
                      ? "Built to sell, operate, and scale teacher workflows with control."
                      : "Built to keep learners organized, focused, and accountable every week."}
                  </p>
                </div>
                <span className={statPillClassName}>
                  Professional value
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {valuePillars.map((pillar) => {
                  const Icon = pillar.icon;
                  return (
                    <article key={pillar.title} className="rounded-xl border border-slate-200 bg-white p-3">
                      <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${pillar.tone}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{pillar.title}</p>
                      <p className="mt-1 text-xs text-slate-600">{pillar.description}</p>
                    </article>
                  );
                })}
              </div>
            </section>     <section className={cardClassName}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {isTeacherView ? "Who should use this landing" : "Who benefits most from this workspace"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {isTeacherView
                      ? "Position the product clearly for educators and institutions."
                      : "Show how the product supports different student profiles."}
                  </p>
                </div>
                <span className={statPillClassName}>
                  Core segments
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {segments.map((segment) => {
                  const Icon = segment.icon;
                  return (
                    <article key={segment.title} className="rounded-xl border border-slate-200 bg-white p-3">
                      <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${segment.tone}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{segment.title}</p>
                      <p className="mt-1 text-xs text-slate-600">{segment.description}</p>
                    </article>
                  );
                })}
              </div>
            </section>
            <section className={cardClassName}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Trusted by academic teams</p>
                  <p className="text-xs text-slate-500">
                    {isTeacherView
                      ? "Built to operate and sell teacher workflows professionally."
                      : "Built to improve student consistency and class follow-up."}
                  </p>
                </div>
                <span className={statPillClassName}>
                  Production-ready
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Institutions and teams
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {trustedInstitutions.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {salesMetrics.map((metric) => (
                    <article
                      key={metric.label}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                    >
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">{metric.label}</p>
                      <p className="text-lg font-bold text-slate-900">{metric.value}</p>
                      <p className="text-[11px] text-slate-500">{metric.hint}</p>
                    </article>
                  ))}
                </div>
              </div>
            </section>

        

       

            <section className={cardClassName}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Before vs After MultiCourses</p>
                  <p className="text-xs text-slate-500">
                    {isTeacherView
                      ? "Communicate operational ROI for decision makers."
                      : "Communicate learning clarity for students and families."}
                  </p>
                </div>
                <span className={statPillClassName}>
                  Clear outcomes
                </span>
              </div>

              <div className="space-y-2">
                {comparisonRows.map((row, index) => (
                  <article key={`${row.before}-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Before</p>
                      <p className="text-sm text-rose-800">{row.before}</p>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">With MultiCourses</p>
                      <p className="text-sm text-emerald-800">{row.after}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>

       

            {!isTeacherView && (
              <section className={cardClassName}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Student Experience</p>
                    <p className="text-xs text-slate-500">
                      Everything students need to stay focused and up to date.
                    </p>
                  </div>
                  <span className={statPillClassName}>
                    Academic flow
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  <article className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Courses</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">Switch context per class</p>
                    <p className="mt-1 text-xs text-slate-600">
                      Open a specific course and keep dashboard data aligned to that class.
                    </p>
                  </article>
                  <article className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Grades</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">Understand your current status</p>
                    <p className="mt-1 text-xs text-slate-600">
                      Quickly review progress and pending submissions before deadlines.
                    </p>
                  </article>
                  <article className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Materials</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">Open resources faster</p>
                    <p className="mt-1 text-xs text-slate-600">
                      Access files, slides, and activities from a cleaner, central workflow.
                    </p>
                  </article>
                </div>
              </section>
            )}

            <section className={softCardClassName}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">FAQ</p>
                  <p className="text-xs text-slate-500">
                    {isTeacherView
                      ? "Answers for plan, approval, and access lifecycle."
                      : "Answers for learning workflow and student experience."}
                  </p>
                </div>
                <span className={statPillClassName}>
                  Quick answers
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <article className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-sm font-semibold text-slate-900">
                    {isTeacherView ? "When do teacher features get enabled?" : "How do I follow one course at a time?"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {isTeacherView
                      ? "After admin approval and plan assignment. If payment or plan status changes, access updates safely."
                      : "Select a course as active context. Dashboard cards and metrics align to that selected course."}
                  </p>
                </article>
                <article className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-sm font-semibold text-slate-900">
                    {isTeacherView ? "Can I scale to more students later?" : "Can I see pending tasks quickly?"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {isTeacherView
                      ? "Yes. Upgrade plan tiers to increase course and student capacity without losing your data."
                      : "Yes. Pending work and progress indicators are exposed directly in your workspace cards."}
                  </p>
                </article>
              </div>

              <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Rocket className="h-3.5 w-3.5 text-slate-500" />
                  Sales-ready message
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  {isTeacherView
                    ? "Sell a managed, plan-based teacher workspace with clear limits, approval governance, and scalable operations."
                    : "Offer students a focused academic cockpit where progress, deadlines, and materials stay in sync."}
                </p>
              </div>
            </section>

            <section className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-white via-emerald-50/40 to-sky-50 p-4 shadow-sm">
              <div className="pointer-events-none absolute -left-14 -top-16 h-36 w-36 rounded-full bg-emerald-200/30" />
              <div className="pointer-events-none absolute -bottom-20 -right-16 h-40 w-40 rounded-full bg-sky-200/30" />

              <div className="relative grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.2fr)_280px]">
                <div>
                  <p className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-100/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                    <span aria-hidden="true">🐄</span>
                    Donation campaign
                  </p>
                  <h3 className="mt-2 text-xl font-bold text-slate-900">Support MultiCourses</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">
                    We are raising <span className="font-semibold">$5,000,000 COP</span> to bring our academic
                    platform to institutions that need it, free of charge.
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">
                    Your support helps more schools access a modern, engaging, and simple way to manage education.
                  </p>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2.5">
                      <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                        <Target className="h-3.5 w-3.5" />
                        Goal
                      </p>
                      <p className="text-sm font-bold text-slate-900">$5,000,000 COP</p>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2.5">
                      <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                        <HeartPulse className="h-3.5 w-3.5" />
                        Impact
                      </p>
                      <p className="text-sm font-bold text-slate-900">Free access for schools</p>
                    </div>
                  </div>
                </div>

                <aside className="rounded-xl border border-emerald-200 bg-white/90 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Take action</p>
                  <p className="mt-1 text-sm text-slate-700">
                    Every contribution helps us reach more students and teachers.
                  </p> <br />
                  <p className="mt-1 text-sm text-slate-700">
                    Thanks for your contribution
                  </p>
                  <a
                    href={VAKI_PAGE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-emerald-500 bg-gradient-to-b from-emerald-500 to-emerald-600 px-5 text-sm font-semibold text-white shadow-[0_14px_28px_-16px_rgba(5,150,105,0.9)] transition hover:from-emerald-600 hover:to-emerald-700"
                  >
                    <span aria-hidden="true">🐄</span>
                    DONATE
                  </a>
                </aside>
              </div>
            </section>

            <footer className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500">
              <p>© {new Date().getFullYear()} MultiCourses</p>
              <p className="inline-flex items-center gap-1.5">
                <Users2 className="h-3.5 w-3.5" />
                {isTeacherView
                  ? "Built for teachers, institutions, and administrators"
                  : "Built for students, classes, and academic follow-up"}
              </p>
            </footer>
          </div>
        </div>
      </div>

      {!audience && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-[760px] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_24px_55px_-28px_rgba(15,23,42,0.65)] sm:p-5">
            <p className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
              <Sparkles className="h-3.5 w-3.5" />
              Welcome to MultiCourses
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">You are...</h2>
            <p className="mt-1 text-sm text-slate-600">
              Choose your role to open the right landing experience.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => handleAudienceChange("teacher")}
                className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-left transition hover:border-sky-300 hover:bg-sky-100/70"
              >
                <p className="inline-flex items-center gap-2 text-sm font-bold text-sky-800">
                  <GraduationCap className="h-4 w-4" />
                  Teacher
                </p>
                <p className="mt-1 text-xs text-slate-700">
                  I want to manage courses, assessments, and teacher plan access.
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleAudienceChange("student")}
                className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left transition hover:border-emerald-300 hover:bg-emerald-100/70"
              >
                <p className="inline-flex items-center gap-2 text-sm font-bold text-emerald-800">
                  <BookOpen className="h-4 w-4" />
                  Student
                </p>
                <p className="mt-1 text-xs text-slate-700">
                  I want to follow courses, grades, materials, and deadlines.
                </p>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
