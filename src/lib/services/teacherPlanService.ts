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

export const TEACHER_PLAN_DEFINITIONS: Record<TeacherPlanId, TeacherPlanDefinition> = {
  starter: {
    id: "starter",
    slug: "starter-annual",
    label: "Starter Annual",
    priceCop: 990000,
    monthlyEquivalentCop: 83000,
    durationMonths: 12,
    durationLabel: "12 months access",
    billingLabel: "Annual billing",
    courseLimit: 8,
    studentLimit: 8 * MAX_STUDENTS_PER_COURSE,
    analyticsLabel: "Core analytics",
    supportLabel: "Email support (48h)",
    idealFor: "Independent teachers and small academic teams",
    summary:
      "Annual entry plan with enough capacity to launch a professional teacher workspace.",
    estimatedOperatingCostCopRange: "Estimated operating cost range: COP $300k - $850k/year",
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
    priceCop: 1990000,
    monthlyEquivalentCop: 166000,
    durationMonths: 12,
    durationLabel: "12 months access",
    billingLabel: "Annual billing",
    courseLimit: 25,
    studentLimit: 25 * MAX_STUDENTS_PER_COURSE,
    analyticsLabel: "Advanced analytics",
    supportLabel: "Priority support (24h)",
    idealFor: "Schools and academies with multiple cohorts",
    summary:
      "Balanced annual plan for institutions that need stronger control and mid-scale growth.",
    estimatedOperatingCostCopRange: "Estimated operating cost range: COP $850k - $2.1M/year",
    benefits: [
      "Up to 25 active courses",
      "Up to 875 unique students",
      "Advanced analytics with operational trend visibility",
      "Priority support with 24-hour response target",
      "Best fit for sustained multi-group delivery",
    ],
  },
  scale: {
    id: "scale",
    slug: "scale-annual",
    label: "Scale Annual",
    priceCop: 3990000,
    monthlyEquivalentCop: 333000,
    durationMonths: 12,
    durationLabel: "12 months access",
    billingLabel: "Annual billing",
    courseLimit: 70,
    studentLimit: 70 * MAX_STUDENTS_PER_COURSE,
    analyticsLabel: "Full analytics, exports, and planning insights",
    supportLabel: "Priority support + onboarding",
    idealFor: "High-volume institutions and network programs",
    summary:
      "Premium annual plan for high-throughput operations that need deep analytics and support.",
    estimatedOperatingCostCopRange: "Estimated operating cost range: COP $2.1M - $4.8M+/year",
    benefits: [
      "Up to 70 active courses",
      "Up to 2,450 unique students",
      "Complete analytics suite with export-ready reports",
      "Priority support plus onboarding guidance",
      "Designed for high-throughput teacher operations",
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
