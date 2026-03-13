import { type ComponentType, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { SeoHead } from "@/components/common/SeoHead";
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
  "relative rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-8";

const cardClassName = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
const softCardClassName = "rounded-2xl border border-slate-200 bg-slate-50/70 p-5 shadow-sm";
const statPillClassName =
  "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600";
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
    <div className="relative min-h-screen overflow-x-hidden bg-slate-50">
      <SeoHead
        title="Academic platform for teachers and students"
        description="MultiCourses helps teachers run courses, students follow academic progress, and institutions manage approvals, plans, and operational control in one platform."
        canonicalPath="/"
        keywords="academic platform, LMS, teacher tools, student dashboard, course management, institutional education software"
      />
      {/* Background decorative elements */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-sky-100/50 blur-[80px]" />
        <div className="absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-emerald-100/50 blur-[80px]" />
        <div className="absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-indigo-100/30 blur-[100px]" />
      </div>

      <div
        className={`relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 transition ${
          audience ? "" : "pointer-events-none select-none blur-[1px]"
        }`}
      >
        {/* Navigation */}
        <nav className="mb-8 flex items-center justify-between">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-4 py-2 backdrop-blur-sm">
            <Sparkles className="h-4 w-4 text-sky-700" />
            <span className="text-xs font-semibold uppercase tracking-wide text-sky-700">
              MultiCourses
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/about")}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-sky-700"
            >
              About
            </button>
            <button
              type="button"
              onClick={() => navigate("/contact")}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-sky-700"
            >
              Contact
            </button>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="mb-12 rounded-3xl border border-slate-200 bg-white/80 p-8 backdrop-blur-sm shadow-xl">
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
            <div>
              <div className="mb-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleAudienceChange("teacher")}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    isTeacherView
                      ? "border-sky-300 bg-sky-100 text-sky-800"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <GraduationCap className="h-4 w-4" />
                  For Teachers
                </button>
                <button
                  type="button"
                  onClick={() => handleAudienceChange("student")}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    !isTeacherView
                      ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <BookOpen className="h-4 w-4" />
                  For Students
                </button>
              </div>

              <h1 className="mb-4 text-4xl font-bold tracking-tight text-slate-900 lg:text-5xl">
                {isTeacherView ? (
                  <>
                    Teach, evaluate,
                    <br />
                    <span className="text-sky-600">scale your academic operation</span>
                  </>
                ) : (
                  <>
                    Learn, track your grades,
                    <br />
                    <span className="text-emerald-600">stay on top of courses</span>
                  </>
                )}
              </h1>

              <p className="mb-6 text-lg text-slate-600">
                {isTeacherView
                  ? "Configure classes, monitor student performance, and apply plan limits with an admin-controlled flow."
                  : "Get a cleaner study experience with course context, grade visibility, and direct access to your learning materials."}
              </p>

              <div className="flex flex-wrap gap-4">
                <button
                  type="button"
                  onClick={handlePrimaryAction}
                  className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-6 text-sm font-semibold text-white shadow-lg shadow-sky-200 transition hover:from-sky-600 hover:to-sky-700"
                >
                  {ctaPrimary}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              {/* Trust badges */}
              <div className="mt-8 flex flex-wrap gap-2">
                {trustedInstitutions.map((name) => (
                  <span
                    key={name}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>

            {/* Snapshot cards */}
            <div className="grid grid-cols-2 gap-4">
              {heroSnapshotCards.map((snapshot) => (
                <div
                  key={snapshot.label}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <p className="text-xs uppercase tracking-wide text-slate-500">{snapshot.label}</p>
                  <p className="text-xl font-bold text-slate-900">{snapshot.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="mb-12">
          <div className="mb-6 text-center">
            <span className={statPillClassName}>Features</span>
            <h2 className="mt-3 text-3xl font-bold text-slate-900">
              {isTeacherView ? "Everything you need to teach effectively" : "Everything you need to learn effectively"}
            </h2>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {featureCards.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md"
                >
                  <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${feature.tone}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-slate-900">{feature.title}</h3>
                  <p className="text-sm text-slate-600">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Roadmap Section */}
        <section className="mb-12 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 text-center">
            <span className={statPillClassName}>4-step path</span>
            <h2 className="mt-3 text-3xl font-bold text-slate-900">
              {isTeacherView ? "How teacher onboarding works" : "How student success flow works"}
            </h2>
            <p className="mt-2 text-slate-600">
              {isTeacherView
                ? "Clear steps from request to monetized classroom operation."
                : "Simple onboarding from account creation to consistent academic progress."}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {roadmap.map((item, index) => (
              <div key={item.step} className="relative">
                {index < roadmap.length - 1 && (
                  <div className="absolute left-1/2 top-8 hidden w-full lg:block">
                    <div className="border-t-2 border-dashed border-slate-200" />
                  </div>
                )}
                <div className="relative rounded-xl border border-slate-200 bg-white p-4">
                  <span className="text-xs font-semibold uppercase tracking-wide text-sky-600">{item.step}</span>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Value Pillars */}
        <section className="mb-12">
          <div className="mb-6 text-center">
            <span className={statPillClassName}>Why choose us</span>
            <h2 className="mt-3 text-3xl font-bold text-slate-900">
              {isTeacherView ? "Built for professional educators" : "Designed for student success"}
            </h2>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            {valuePillars.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <div key={pillar.title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${pillar.tone}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-slate-900">{pillar.title}</h3>
                  <p className="text-sm text-slate-600">{pillar.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Teacher Plans Section (conditionally rendered) */}
        {isTeacherView && (
          <section className="mb-12 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-6 text-center">
              <span className={statPillClassName}>Pricing</span>
              <h2 className="mt-3 text-3xl font-bold text-slate-900">Simple, transparent annual plans</h2>
              <p className="mt-2 text-slate-600">Choose the tier that fits your institution's needs</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {TEACHER_PLAN_OPTIONS.map((plan) => (
                <div
                  key={plan.id}
                  className={`relative rounded-xl border p-6 ${
                    plan.isPopular
                      ? "border-emerald-300 bg-gradient-to-b from-emerald-50 to-white shadow-lg"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  {plan.isPopular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
                      <BadgeCheck className="mr-1 inline h-3 w-3" />
                      Most Popular
                    </span>
                  )}

                  <h3 className="text-xl font-bold text-slate-900">{plan.label}</h3>
                  <div className="mt-4">
                    <span className="text-3xl font-bold text-slate-900">{formatCop(plan.priceCop)}</span>
                    <span className="text-sm text-slate-500">/{plan.durationLabel}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{formatCop(plan.monthlyEquivalentCop)}/mo equivalent</p>

                  <div className="mt-6 space-y-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Courses</span>
                      <span className="font-semibold text-slate-900">{plan.courseLimit}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Students</span>
                      <span className="font-semibold text-slate-900">{plan.studentLimit}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Analytics</span>
                      <span className="font-semibold text-slate-900">{plan.analyticsLabel}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Support</span>
                      <span className="font-semibold text-slate-900">{plan.supportLabel}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate(getTeacherPlanPath(plan.id))}
                    className="mt-6 w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    View plan details
                  </button>
                </div>
              ))}
            </div>

            {/* Need Estimator */}
            <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-6">
              <div className="flex flex-col items-center justify-between gap-4 lg:flex-row">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Need more capacity?</h3>
                  <p className="text-sm text-slate-600">
                    If your institution needs more scale, calculate your recommended annual plan.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNeedEstimator(!showNeedEstimator)}
                  className="rounded-lg bg-sky-600 px-6 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  {showNeedEstimator ? "Hide calculator" : "Calculate here"}
                </button>
              </div>

              {showNeedEstimator && (
                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Courses needed</label>
                      <input
                        type="number"
                        min={0}
                        value={estimatorCourses}
                        onChange={(event) => setEstimatorCourses(event.target.value)}
                        className={inputClassName}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Total students needed</label>
                      <input
                        type="number"
                        min={0}
                        value={estimatorStudents}
                        onChange={(event) => setEstimatorStudents(event.target.value)}
                        className={inputClassName}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-6">
                    {estimatedPlan ? (
                      <div>
                        <h4 className="font-semibold text-slate-900">Recommended: {estimatedPlan.label}</h4>
                        <div className="mt-4 space-y-2">
                          <p className="text-sm text-slate-600">Annual price: {formatCop(estimatedPlan.priceCop)}</p>
                          <p className="text-sm text-slate-600">Monthly equivalent: {formatCop(estimatedPlan.monthlyEquivalentCop)}</p>
                          <p className="text-sm text-slate-600">Capacity: {estimatedPlan.courseLimit} courses / {estimatedPlan.studentLimit} students</p>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <h4 className="font-semibold text-slate-900">Custom enterprise quote</h4>
                        <div className="mt-4 space-y-2">
                          <p className="text-sm text-slate-600">Estimated annual from: {formatCop(estimatedCustomPriceCop)}</p>
                          <p className="text-sm text-slate-600">Monthly from: {formatCop(estimatedCustomMonthlyCop)}</p>
                          <p className="text-sm text-slate-500">Your needs exceed current top tier.</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Contact Form */}
                  <div className="lg:col-span-2">
                    <div className="rounded-lg border border-slate-200 bg-white p-6">
                      <h4 className="mb-4 text-lg font-semibold text-slate-900">Request a callback</h4>
                      <div className="grid gap-4 sm:grid-cols-2">
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
                          placeholder="Institution"
                          className={inputClassName}
                        />
                        <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                          Teacher
                        </div>
                        <div className="sm:col-span-2">
                          <textarea
                            value={leadMessage}
                            onChange={(event) => setLeadMessage(event.target.value)}
                            rows={3}
                            placeholder="Optional message"
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <button
                            type="button"
                            onClick={handleLeadSubmit}
                            disabled={submittingLead}
                            className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                          >
                            {submittingLead ? "Sending..." : "Send contact request"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Segments Section */}
        <section className="mb-12 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 text-center">
            <span className={statPillClassName}>Who it's for</span>
            <h2 className="mt-3 text-3xl font-bold text-slate-900">
              {isTeacherView ? "Perfect for educators and institutions" : "Designed for every type of learner"}
            </h2>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            {segments.map((segment) => {
              const Icon = segment.icon;
              return (
                <div key={segment.title} className="rounded-xl border border-slate-200 bg-white p-6">
                  <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${segment.tone}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-slate-900">{segment.title}</h3>
                  <p className="text-sm text-slate-600">{segment.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Comparison Section */}
        <section className="mb-12 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 text-center">
            <span className={statPillClassName}>Before & After</span>
            <h2 className="mt-3 text-3xl font-bold text-slate-900">The MultiCourses difference</h2>
          </div>

          <div className="space-y-4">
            {comparisonRows.map((row, index) => (
              <div key={index} className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-rose-700">Before</p>
                  <p className="text-slate-800">{row.before}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">With MultiCourses</p>
                  <p className="text-slate-800">{row.after}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Metrics Section */}
        <section className="mb-12 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 text-center">
            <span className={statPillClassName}>By the numbers</span>
            <h2 className="mt-3 text-3xl font-bold text-slate-900">Key metrics at a glance</h2>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {salesMetrics.map((metric) => (
              <div key={metric.label} className="text-center">
                <p className="text-3xl font-bold text-slate-900">{metric.value}</p>
                <p className="mt-1 text-sm font-medium text-slate-600">{metric.label}</p>
                <p className="mt-1 text-xs text-slate-500">{metric.hint}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ Section */}
        <section className="mb-12 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 text-center">
            <span className={statPillClassName}>FAQ</span>
            <h2 className="mt-3 text-3xl font-bold text-slate-900">Frequently asked questions</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-4">
              <h3 className="mb-2 font-semibold text-slate-900">
                {isTeacherView ? "When do teacher features get enabled?" : "How do I follow one course at a time?"}
              </h3>
              <p className="text-sm text-slate-600">
                {isTeacherView
                  ? "After admin approval and plan assignment. If payment or plan status changes, access updates safely."
                  : "Select a course as active context. Dashboard cards and metrics align to that selected course."}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
              <h3 className="mb-2 font-semibold text-slate-900">
                {isTeacherView ? "Can I scale to more students later?" : "Can I see pending tasks quickly?"}
              </h3>
              <p className="text-sm text-slate-600">
                {isTeacherView
                  ? "Yes. Upgrade plan tiers to increase course and student capacity without losing your data."
                  : "Yes. Pending work and progress indicators are exposed directly in your workspace cards."}
              </p>
            </div>
          </div>
        </section>

        {/* Donation Campaign */}
        <section className="mb-12 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-8 shadow-sm">
          <div className="grid gap-6 lg:grid-cols-2 lg:gap-12">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700">
                <span>🐄</span>
                Support our mission
              </span>
              <h2 className="mt-4 text-3xl font-bold text-slate-900">Help us reach more schools</h2>
              <p className="mt-4 text-lg text-slate-600">
                We're raising <span className="font-semibold">$5,000,000 COP</span> to bring our academic platform to 
                institutions that need it, completely free of charge.
              </p>
              <div className="mt-6 flex gap-4">
                <div className="rounded-lg border border-emerald-200 bg-white p-4">
                  <Target className="mb-2 h-5 w-5 text-emerald-600" />
                  <p className="text-sm font-medium text-slate-600">Goal</p>
                  <p className="text-xl font-bold text-slate-900">$5,000,000 COP</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-white p-4">
                  <HeartPulse className="mb-2 h-5 w-5 text-emerald-600" />
                  <p className="text-sm font-medium text-slate-600">Impact</p>
                  <p className="text-xl font-bold text-slate-900">Free access</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center rounded-xl border border-emerald-200 bg-white p-8 text-center">
              <Rocket className="mb-4 h-12 w-12 text-emerald-600" />
              <h3 className="mb-2 text-xl font-bold text-slate-900">Make a difference today</h3>
              <p className="mb-6 text-slate-600">Every contribution helps us reach more students and teachers.</p>
              <a
                href={VAKI_PAGE_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-8 text-sm font-semibold text-white shadow-lg shadow-emerald-200 hover:from-emerald-600 hover:to-emerald-700"
              >
                <span>🐄</span>
                DONATE NOW
              </a>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 p-12 text-center text-white shadow-xl">
          <h2 className="mb-4 text-3xl font-bold">
            {isTeacherView ? "Ready to transform your teaching?" : "Ready to excel in your studies?"}
          </h2>
          <p className="mb-8 text-lg text-white/90">
            {isTeacherView
              ? "Join hundreds of educators already using MultiCourses"
              : "Join thousands of students staying organized with MultiCourses"}
          </p>
          <button
            type="button"
            onClick={handlePrimaryAction}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-8 text-sm font-semibold text-sky-600 shadow-lg transition hover:bg-slate-100"
          >
            {ctaPrimary}
            <ArrowRight className="h-4 w-4" />
          </button>
        </section>

        {/* Footer */}
        <footer className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-8 text-sm text-slate-500">
          <p>© {new Date().getFullYear()} MultiCourses. All rights reserved.</p>
          <p className="inline-flex items-center gap-2">
            <Users2 className="h-4 w-4" />
            {isTeacherView
              ? "Built for teachers, institutions, and administrators"
              : "Built for students, classes, and academic follow-up"}
          </p>
        </footer>
      </div>

      {/* Audience Selection Modal */}
      {!audience && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2">
              <Sparkles className="h-4 w-4 text-sky-700" />
              <span className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                Welcome to MultiCourses
              </span>
            </div>
            
            <h2 className="mb-2 text-3xl font-bold text-slate-900">How will you use MultiCourses?</h2>
            <p className="mb-6 text-slate-600">Choose your role to see the right experience for you.</p>

            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => handleAudienceChange("teacher")}
                className="group rounded-xl border-2 border-sky-200 bg-sky-50 p-6 text-left transition hover:border-sky-300 hover:bg-sky-100"
              >
                <GraduationCap className="mb-4 h-8 w-8 text-sky-700" />
                <h3 className="mb-2 text-xl font-bold text-sky-800 group-hover:text-sky-900">I'm a Teacher</h3>
                <p className="text-sm text-slate-700">
                  Manage courses, assessments, and track student progress with professional tools.
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleAudienceChange("student")}
                className="group rounded-xl border-2 border-emerald-200 bg-emerald-50 p-6 text-left transition hover:border-emerald-300 hover:bg-emerald-100"
              >
                <BookOpen className="mb-4 h-8 w-8 text-emerald-700" />
                <h3 className="mb-2 text-xl font-bold text-emerald-800 group-hover:text-emerald-900">I'm a Student</h3>
                <p className="text-sm text-slate-700">
                  Follow courses, track grades, access materials, and never miss a deadline.
                </p>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
