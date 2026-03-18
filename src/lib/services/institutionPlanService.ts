export type InstitutionPlanId =
  | "institution-basic"
  | "institution-growth"
  | "institution-enterprise"
  | "institution-custom";

export interface InstitutionPlanDefinition {
  id: InstitutionPlanId;
  label: string;
  priceCop: number | null;
  monthlyEquivalentCop: number | null;
  durationMonths: number;
  durationLabel: string;
  billingLabel: string;
  courseLimit: number | null;
  studentLimit: number | null;
  teacherLimit: number | null;
  supportLabel: string;
  idealFor: string;
  summary: string;
  estimatedOperatingCostCopRange: string;
  benefits: string[];
  requiresQuote?: boolean;
}

export interface InstitutionPlanQuote {
  requestPlanId: InstitutionPlanId;
  requestPlanLabel: string;
  billingPlanId: InstitutionPlanId | null;
  billingPlanLabel: string;
  priceCop: number | null;
  monthlyEquivalentCop: number | null;
  courseLimit: number;
  studentLimit: number;
  teacherLimit: number | null;
  isCustom: boolean;
}

const annualToMonthly = (priceCop: number | null): number | null =>
  typeof priceCop === "number" && Number.isFinite(priceCop)
    ? Math.round(priceCop / 12)
    : null;

// Institutions are also student-weighted because student activity is the main
// multiplier of operational traffic across course access, submissions, grading, and notifications.
const INSTITUTION_PLAN_BASE_PRICE_COP = 550000;
const INSTITUTION_PLAN_PRICE_PER_COURSE_COP = 25000;
const INSTITUTION_PLAN_PRICE_PER_STUDENT_COP = 1900;
const roundQuoteCop = (value: number): number => Math.ceil(value / 10000) * 10000;

export const getInstitutionAnnualPriceQuote = (input: {
  courseLimit?: number | null;
  studentLimit?: number | null;
}): number => {
  const courseLimit = Math.max(0, Number(input.courseLimit) || 0);
  const studentLimit = Math.max(0, Number(input.studentLimit) || 0);
  const annualPrice =
    INSTITUTION_PLAN_BASE_PRICE_COP +
    courseLimit * INSTITUTION_PLAN_PRICE_PER_COURSE_COP +
    studentLimit * INSTITUTION_PLAN_PRICE_PER_STUDENT_COP;

  return roundQuoteCop(annualPrice);
};

const BASIC_PRICE_COP = getInstitutionAnnualPriceQuote({
  courseLimit: 25,
  studentLimit: 500,
});
const GROWTH_PRICE_COP = getInstitutionAnnualPriceQuote({
  courseLimit: 75,
  studentLimit: 1500,
});
const ENTERPRISE_PRICE_COP = getInstitutionAnnualPriceQuote({
  courseLimit: 200,
  studentLimit: 5000,
});

export const INSTITUTION_PLAN_DEFINITIONS: Record<InstitutionPlanId, InstitutionPlanDefinition> =
  {
    "institution-basic": {
      id: "institution-basic",
      label: "Institution Basic",
      priceCop: BASIC_PRICE_COP,
      monthlyEquivalentCop: annualToMonthly(BASIC_PRICE_COP),
      durationMonths: 12,
      durationLabel: "12 months access",
      billingLabel: "Annual billing",
      courseLimit: 25,
      studentLimit: 500,
      teacherLimit: null,
      supportLabel: "Priority email support (24h)",
      idealFor: "Small schools, bilingual centers, and coordinated academic teams",
      summary:
        "Entry institutional plan for schools that need centralized teacher management and shared academic control.",
      estimatedOperatingCostCopRange: "",
      benefits: [
        "Up to 25 institution-owned courses",
        "Up to 500 students under institutional scope",
        "Unlimited linked teachers",
        "Institution dashboard, approvals, and course assignment flow",
        "Priority email support with 24-hour response target",
      ],
    },
    "institution-growth": {
      id: "institution-growth",
      label: "Institution Growth",
      priceCop: GROWTH_PRICE_COP,
      monthlyEquivalentCop: annualToMonthly(GROWTH_PRICE_COP),
      durationMonths: 12,
      durationLabel: "12 months access",
      billingLabel: "Annual billing",
      courseLimit: 75,
      studentLimit: 1500,
      teacherLimit: null,
      supportLabel: "Priority support + onboarding follow-up",
      idealFor: "Growing schools, networks, and multi-campus academic operations",
      summary:
        "Mid-scale institutional plan for schools that need larger enrollment capacity and broader teacher coordination.",
      estimatedOperatingCostCopRange: "",
      benefits: [
        "Up to 75 institution-owned courses",
        "Up to 1,500 students under institutional scope",
        "Unlimited linked teachers",
        "Faster operational support and rollout assistance",
        "Designed for sustained multi-grade or multi-program growth",
      ],
    },
    "institution-enterprise": {
      id: "institution-enterprise",
      label: "Institution Enterprise",
      priceCop: ENTERPRISE_PRICE_COP,
      monthlyEquivalentCop: annualToMonthly(ENTERPRISE_PRICE_COP),
      durationMonths: 12,
      durationLabel: "12 months access",
      billingLabel: "Annual billing",
      courseLimit: 200,
      studentLimit: 5000,
      teacherLimit: null,
      supportLabel: "Priority support + onboarding + operational follow-up",
      idealFor: "Large institutions, academic groups, and high-volume school networks",
      summary:
        "High-capacity institutional plan for broad multi-team deployment with stronger operational headroom.",
      estimatedOperatingCostCopRange: "",
      benefits: [
        "Up to 200 institution-owned courses",
        "Up to 5,000 students under institutional scope",
        "Unlimited linked teachers",
        "Expanded operational support for large-scale rollout",
        "Built for multi-campus or district-level coordination",
      ],
    },
    "institution-custom": {
      id: "institution-custom",
      label: "Custom Institution Plan",
      priceCop: null,
      monthlyEquivalentCop: null,
      durationMonths: 12,
      durationLabel: "Custom annual agreement",
      billingLabel: "Custom quote",
      courseLimit: null,
      studentLimit: null,
      teacherLimit: null,
      supportLabel: "Custom support agreement",
      idealFor: "Institutions that exceed standard operational tiers",
      summary:
        "Custom institutional agreement for organizations that need pricing beyond the standard capacity matrix.",
      estimatedOperatingCostCopRange: "",
      benefits: [
        "Custom capacity planning",
        "Custom billing and onboarding flow",
        "Negotiated support and rollout scope",
      ],
      requiresQuote: true,
    },
  };

export const INSTITUTION_PLAN_OPTIONS: InstitutionPlanDefinition[] = [
  INSTITUTION_PLAN_DEFINITIONS["institution-basic"],
  INSTITUTION_PLAN_DEFINITIONS["institution-growth"],
  INSTITUTION_PLAN_DEFINITIONS["institution-enterprise"],
  INSTITUTION_PLAN_DEFINITIONS["institution-custom"],
];

const normalizeInstitutionPlanId = (value?: string | null): InstitutionPlanId | null => {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "institution-basic" ||
    normalized === "institution-growth" ||
    normalized === "institution-enterprise" ||
    normalized === "institution-custom"
  ) {
    return normalized;
  }
  return null;
};

export const resolveInstitutionPlanId = (value?: string | null): InstitutionPlanId | null =>
  normalizeInstitutionPlanId(value);

export const getInstitutionPlanDefinition = (
  planId?: string | null,
): InstitutionPlanDefinition | null => {
  const resolvedPlanId = normalizeInstitutionPlanId(planId);
  return resolvedPlanId ? INSTITUTION_PLAN_DEFINITIONS[resolvedPlanId] : null;
};

const toPositiveWholeNumber = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
};

export const getInstitutionPlanQuote = (input: {
  planId?: string | null;
  courseLimit?: unknown;
  studentLimit?: unknown;
  teacherLimit?: unknown;
}): InstitutionPlanQuote | null => {
  const selectedPlan = getInstitutionPlanDefinition(input.planId);
  if (!selectedPlan) return null;

  const requestedCourseLimit = toPositiveWholeNumber(input.courseLimit);
  const requestedStudentLimit = toPositiveWholeNumber(input.studentLimit);

  if (!selectedPlan.requiresQuote) {
    return {
      requestPlanId: selectedPlan.id,
      requestPlanLabel: selectedPlan.label,
      billingPlanId: selectedPlan.id,
      billingPlanLabel: selectedPlan.label,
      priceCop: selectedPlan.priceCop,
      monthlyEquivalentCop: selectedPlan.monthlyEquivalentCop,
      courseLimit: selectedPlan.courseLimit || 0,
      studentLimit: selectedPlan.studentLimit || 0,
      teacherLimit: selectedPlan.teacherLimit,
      isCustom: false,
    };
  }

  if (requestedCourseLimit <= 0 || requestedStudentLimit <= 0) {
    return {
      requestPlanId: selectedPlan.id,
      requestPlanLabel: selectedPlan.label,
      billingPlanId: null,
      billingPlanLabel: selectedPlan.label,
      priceCop: null,
      monthlyEquivalentCop: null,
      courseLimit: requestedCourseLimit,
      studentLimit: requestedStudentLimit,
      teacherLimit: null,
      isCustom: true,
    };
  }

  const fixedPlans = INSTITUTION_PLAN_OPTIONS.filter((plan) => !plan.requiresQuote);
  const matchingStandardPlan =
    fixedPlans.find(
      (plan) =>
        requestedCourseLimit <= (plan.courseLimit || 0) &&
        requestedStudentLimit <= (plan.studentLimit || 0),
    ) || null;

  if (matchingStandardPlan) {
    return {
      requestPlanId: selectedPlan.id,
      requestPlanLabel: selectedPlan.label,
      billingPlanId: matchingStandardPlan.id,
      billingPlanLabel: matchingStandardPlan.label,
      priceCop: matchingStandardPlan.priceCop,
      monthlyEquivalentCop: matchingStandardPlan.monthlyEquivalentCop,
      courseLimit: requestedCourseLimit,
      studentLimit: requestedStudentLimit,
      teacherLimit: null,
      isCustom: true,
    };
  }

  const annualQuote = getInstitutionAnnualPriceQuote({
    courseLimit: requestedCourseLimit,
    studentLimit: requestedStudentLimit,
  });
  const monthlyQuote = roundQuoteCop(annualQuote / 12);

  return {
    requestPlanId: selectedPlan.id,
    requestPlanLabel: selectedPlan.label,
    billingPlanId: null,
    billingPlanLabel: selectedPlan.label,
    priceCop: annualQuote,
    monthlyEquivalentCop: monthlyQuote,
    courseLimit: requestedCourseLimit,
    studentLimit: requestedStudentLimit,
    teacherLimit: null,
    isCustom: true,
  };
};
