export type TeacherPlanId = "starter" | "growth" | "scale";
export type LegacyTeacherPlanId = "monthly" | "semiannual" | "annual";
export type TeacherPlanSlug = "starter-annual" | "growth-annual" | "scale-annual";

export interface TeacherPlanDefinition {
  id: TeacherPlanId;
  slug: TeacherPlanSlug;
  label: string;
  priceCop: number;
  monthlyEquivalentCop: number;
  durationMonths: number;
  durationLabel: string;
  billingLabel: string;
  courseLimit: number;
  studentLimit: number;
  analyticsLabel: string;
  supportLabel: string;
  idealFor: string;
  summary: string;
  estimatedOperatingCostCopRange: string;
  benefits: string[];
  isPopular?: boolean;
}

export const DEFAULT_TEACHER_PLAN_ID: TeacherPlanId = "starter";
export const MAX_STUDENTS_PER_COURSE = 35;

// Student capacity weighs more because each active student multiplies
// reads/writes across enrollment, submissions, grading, notifications, and progress views.
const TEACHER_PLAN_BASE_PRICE_COP = 120000;
const TEACHER_PLAN_PRICE_PER_COURSE_COP = 10000;
const TEACHER_PLAN_PRICE_PER_STUDENT_COP = 1300;

const roundPlanPriceCop = (value: number): number => Math.ceil(value / 10000) * 10000;

const annualToMonthly = (priceCop: number): number => Math.round(priceCop / 12);

export const getTeacherAnnualPriceQuote = (input: {
  courseLimit?: number | null;
  studentLimit?: number | null;
}): number => {
  const courseLimit = Math.max(0, Number(input.courseLimit) || 0);
  const studentLimit = Math.max(0, Number(input.studentLimit) || 0);
  const annualPrice =
    TEACHER_PLAN_BASE_PRICE_COP +
    courseLimit * TEACHER_PLAN_PRICE_PER_COURSE_COP +
    studentLimit * TEACHER_PLAN_PRICE_PER_STUDENT_COP;

  return roundPlanPriceCop(annualPrice);
};

const getTeacherMonthlyPriceQuote = (priceCop: number): number => annualToMonthly(priceCop);

const STARTER_PRICE_COP = getTeacherAnnualPriceQuote({
  courseLimit: 8,
  studentLimit: 8 * MAX_STUDENTS_PER_COURSE,
});
const GROWTH_PRICE_COP = getTeacherAnnualPriceQuote({
  courseLimit: 25,
  studentLimit: 25 * MAX_STUDENTS_PER_COURSE,
});
const SCALE_PRICE_COP = getTeacherAnnualPriceQuote({
  courseLimit: 70,
  studentLimit: 70 * MAX_STUDENTS_PER_COURSE,
});

export const TEACHER_PLAN_DEFINITIONS: Record<TeacherPlanId, TeacherPlanDefinition> = {
  starter: {
    id: "starter",
    slug: "starter-annual",
    label: "Starter Annual",
    priceCop: STARTER_PRICE_COP,
    monthlyEquivalentCop: getTeacherMonthlyPriceQuote(STARTER_PRICE_COP),
    durationMonths: 12,
    durationLabel: "12 months access",
    billingLabel: "Annual billing",
    courseLimit: 8,
    studentLimit: 8 * MAX_STUDENTS_PER_COURSE,
    analyticsLabel: "Core analytics",
    supportLabel: "Email support (48h)",
    idealFor: "Independent teachers, tutors, and small teaching practices",
    summary:
      "Annual entry plan with enough capacity to launch a professional teacher workspace without institutional overhead.",
    estimatedOperatingCostCopRange: "",
    benefits: [
      "Up to 8 active courses",
      "Up to 280 unique students under management",
      "Teacher approval and plan enforcement included",
      "Essential analytics and progress overview",
      "Email support response within 48 hours",
    ],
  },
  growth: {
    id: "growth",
    slug: "growth-annual",
    label: "Growth Annual",
    priceCop: GROWTH_PRICE_COP,
    monthlyEquivalentCop: getTeacherMonthlyPriceQuote(GROWTH_PRICE_COP),
    durationMonths: 12,
    durationLabel: "12 months access",
    billingLabel: "Annual billing",
    courseLimit: 25,
    studentLimit: 25 * MAX_STUDENTS_PER_COURSE,
    analyticsLabel: "Advanced analytics",
    supportLabel: "Priority support (24h)",
    idealFor: "Experienced teachers and coordinated teaching teams with multiple groups",
    summary:
      "Balanced annual plan for teacher-led operations that need stronger capacity and faster follow-up.",
    estimatedOperatingCostCopRange: "",
    benefits: [
      "Up to 25 active courses",
      "Up to 875 unique students",
      "Advanced analytics with operational trend visibility",
      "Priority support with 24-hour response target",
      "Best fit for sustained multi-group delivery led by a teacher or small team",
    ],
  },
  scale: {
    id: "scale",
    slug: "scale-annual",
    label: "Scale Annual",
    priceCop: SCALE_PRICE_COP,
    monthlyEquivalentCop: getTeacherMonthlyPriceQuote(SCALE_PRICE_COP),
    durationMonths: 12,
    durationLabel: "12 months access",
    billingLabel: "Annual billing",
    courseLimit: 70,
    studentLimit: 70 * MAX_STUDENTS_PER_COURSE,
    analyticsLabel: "Full analytics, exports, and planning insights",
    supportLabel: "Priority support + onboarding",
    idealFor: "Teacher departments, academies, and high-volume educator operations",
    summary:
      "Premium annual plan for high-throughput teacher operations that need deeper visibility and guided onboarding.",
    estimatedOperatingCostCopRange: "",
    benefits: [
      "Up to 70 active courses",
      "Up to 2,450 unique students",
      "Complete analytics suite with export-ready reports",
      "Priority support plus onboarding guidance",
      "Designed for high-throughput teacher operations outside the institutional ownership model",
    ],
    isPopular: true,
  },
};

export const TEACHER_PLAN_OPTIONS: TeacherPlanDefinition[] = [
  TEACHER_PLAN_DEFINITIONS.starter,
  TEACHER_PLAN_DEFINITIONS.growth,
  TEACHER_PLAN_DEFINITIONS.scale,
];

const LEGACY_PLAN_ID_TO_ID: Record<LegacyTeacherPlanId, TeacherPlanId> = {
  monthly: "starter",
  semiannual: "growth",
  annual: "scale",
};

const PLAN_SLUG_TO_ID: Record<TeacherPlanSlug, TeacherPlanId> = {
  "starter-annual": "starter",
  "growth-annual": "growth",
  "scale-annual": "scale",
};

const normalizeTeacherPlanId = (value?: string | null): TeacherPlanId | null => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "starter" || normalized === "growth" || normalized === "scale") {
    return normalized;
  }
  if (normalized === "monthly" || normalized === "semiannual" || normalized === "annual") {
    return LEGACY_PLAN_ID_TO_ID[normalized as LegacyTeacherPlanId];
  }
  if (
    normalized === "starter-annual" ||
    normalized === "growth-annual" ||
    normalized === "scale-annual"
  ) {
    return PLAN_SLUG_TO_ID[normalized];
  }
  return null;
};

export const resolveTeacherPlanId = (value?: string | null): TeacherPlanId | null =>
  normalizeTeacherPlanId(value);

export const getTeacherPlanDefinition = (planId?: string | null): TeacherPlanDefinition => {
  const resolvedPlanId = normalizeTeacherPlanId(planId);
  if (resolvedPlanId) return TEACHER_PLAN_DEFINITIONS[resolvedPlanId];
  return TEACHER_PLAN_DEFINITIONS[DEFAULT_TEACHER_PLAN_ID];
};

export const getTeacherPlanPath = (planId?: string | null): string => {
  const definition = getTeacherPlanDefinition(planId);
  return `/plans/${definition.slug}`;
};

export const getTeacherPlanExpiryDate = (
  planId: TeacherPlanId,
  assignedAt: Date = new Date(),
): Date => {
  const definition = TEACHER_PLAN_DEFINITIONS[planId];
  const expiresAt = new Date(assignedAt);
  expiresAt.setMonth(expiresAt.getMonth() + definition.durationMonths);
  return expiresAt;
};
