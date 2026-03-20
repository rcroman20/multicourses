import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  Loader2,
  Mail,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { firebaseDB } from "@/lib/firebase";
import { appendAdminAuditLog } from "@/lib/services/adminAuditLogService";
import { assertAdminPermission } from "@/lib/services/adminPermissionGuardService";
import {
  getAdminApprovalRequests,
  type TeacherApprovalRequestRecord,
} from "@/lib/services/teacherApprovalService";
import {
  getPricingContactRequests,
  markPricingContactRequestResolved,
  type PricingContactRequestRecord,
} from "@/lib/services/pricingContactService";
import {
  getTeacherPlanDefinition,
  getTeacherPlanExpiryDate,
  resolveTeacherPlanId,
  TEACHER_PLAN_OPTIONS,
  type TeacherPlanId,
} from "@/lib/services/teacherPlanService";
import {
  getInstitutionPlanDefinition,
  getInstitutionPlanExpiryDate,
  resolveInstitutionPlanId,
  type InstitutionPlanId,
} from "@/lib/services/institutionPlanService";

type BillingPlanRow = {
  userId: string;
  accountType: "teacher" | "institution";
  name: string;
  email: string;
  planId: TeacherPlanId | InstitutionPlanId | null;
  planLabel: string;
  planPriceCop: number;
  planStatus: "payment_pending" | "active" | "expired" | "unknown";
  paymentMethod: string;
  paymentRequestedAt: Date | null;
  assignedAt: Date | null;
  expiresAt: Date | null;
};

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateTime = (value: Date | null): string => {
  if (!value) return "Not available";
  return value.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatShortDate = (value: Date | null): string => {
  if (!value) return "Not set";
  return value.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatCurrencyCop = (value: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);

const getDayDifference = (target: Date | null, base: Date = new Date()): number | null => {
  if (!target) return null;
  const targetDate = new Date(target);
  const baseDate = new Date(base);
  targetDate.setHours(12, 0, 0, 0);
  baseDate.setHours(12, 0, 0, 0);
  return Math.round((targetDate.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
};

const getPendingDaysLabel = (requestedAt: Date | null): string => {
  const dayDifference = getDayDifference(requestedAt);
  if (dayDifference === null) return "No request date";
  const daysPending = Math.max(0, Math.abs(dayDifference));
  if (daysPending === 0) return "Requested today";
  if (daysPending === 1) return "1 day pending";
  return `${daysPending} days pending`;
};

const getExpiryDaysLabel = (expiresAt: Date | null): string => {
  const dayDifference = getDayDifference(expiresAt);
  if (dayDifference === null) return "No expiry date";
  if (dayDifference === 0) return "Expires today";
  if (dayDifference > 0) return dayDifference === 1 ? "1 day left" : `${dayDifference} days left`;
  const expiredDays = Math.abs(dayDifference);
  return expiredDays === 1 ? "Expired 1 day ago" : `Expired ${expiredDays} days ago`;
};

const getPaymentStatusClassName = (status: BillingPlanRow["planStatus"]): string => {
  if (status === "payment_pending") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "expired") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "active") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200/60 bg-slate-50 text-slate-700";
};

const getPaymentStatusLabel = (status: BillingPlanRow["planStatus"]): string => {
  if (status === "payment_pending") return "Payment pending";
  if (status === "expired") return "Expired";
  if (status === "active") return "Active";
  return "Unknown";
};

const mapPricingRole = (role: PricingContactRequestRecord["role"]): string => {
  if (role === "organization") return "Organization";
  if (role === "admin_team") return "Admin team";
  return "Teacher";
};

export default function AdminBillingPage() {
  const { user } = useAuth();
  const [approvalRequests, setApprovalRequests] = useState<TeacherApprovalRequestRecord[]>([]);
  const [pricingRequests, setPricingRequests] = useState<PricingContactRequestRecord[]>([]);
  const [billingRows, setBillingRows] = useState<BillingPlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [resolvingPricingById, setResolvingPricingById] = useState<Record<string, boolean>>({});

  const loadBillingData = async () => {
    setLoading(true);
    setErrorMessage("");

    const [approvalsResult, pricingResult, usersResult] = await Promise.allSettled([
      getAdminApprovalRequests(),
      getPricingContactRequests(),
      getDocs(collection(firebaseDB, "usuarios")),
    ]);

    setApprovalRequests(approvalsResult.status === "fulfilled" ? approvalsResult.value : []);
    setPricingRequests(pricingResult.status === "fulfilled" ? pricingResult.value : []);

    if (usersResult.status === "fulfilled") {
      const now = Date.now();
      const mapped: BillingPlanRow[] = usersResult.value.docs
        .map((docSnap) => {
          const data = (docSnap.data() || {}) as Record<string, unknown>;
          const role = String(data.role || data.requestedRole || "").trim().toLowerCase();
          const approval = String(data.teacherApprovalStatus || "").trim().toLowerCase();
          const institutionPlanStatusRaw = String(data.institutionPlanStatus || "").trim().toLowerCase();
          const institutionId = String(data.institutionId || "").trim();
          const isTeacher = ["docente", "teacher", "profesor", "instructor"].includes(role);
          const isInstitution = ["institucion", "institution", "organization"].includes(role);

          if (!isTeacher && !isInstitution) return null;
          if (isTeacher && approval && approval !== "approved") return null;
          if (isTeacher && institutionId) return null;

          if (isTeacher) {
            const planId =
              resolveTeacherPlanId(
                String(data.teacherPlanId || data.teacherInterestedPlan || "").trim(),
              ) || null;
            const planDefinition = getTeacherPlanDefinition(planId);
            const planLabel = planId ? planDefinition.label : "Not specified";

            const assignedAt = toDate(data.teacherPlanAssignedAt);
            const expiresAtRaw = toDate(data.teacherPlanExpiresAt);
            const expiresAt =
              expiresAtRaw ||
              (planId && assignedAt ? getTeacherPlanExpiryDate(planId, assignedAt) : null);
            const planStatusRaw = String(data.teacherPlanStatus || "").trim().toLowerCase();

            let planStatus: BillingPlanRow["planStatus"] = "unknown";
            if (planStatusRaw === "pending_payment") {
              planStatus = "payment_pending";
            } else if (expiresAt && expiresAt.getTime() < now) {
              planStatus = "expired";
            } else if (planStatusRaw === "active" || planStatusRaw === "approved" || planStatusRaw === "paid") {
              planStatus = "active";
            } else if (!planStatusRaw && expiresAt && expiresAt.getTime() >= now) {
              planStatus = "active";
            }

            return {
              userId: docSnap.id,
              accountType: "teacher",
              name: String(data.name || "").trim() || "Teacher",
              email: String(data.email || "").trim(),
              planId,
              planLabel,
              planPriceCop: planId ? planDefinition.priceCop : 0,
              planStatus,
              paymentMethod: String(data.teacherPaymentMethod || "").trim() || "Not set",
              paymentRequestedAt: toDate(data.teacherPaymentRequestedAt),
              assignedAt,
              expiresAt,
            } satisfies BillingPlanRow;
          }

          if (!institutionPlanStatusRaw) return null;
          const institutionPlanId =
            resolveInstitutionPlanId(String(data.institutionRequestedPlanId || "").trim()) || null;
          const institutionPlanDefinition = getInstitutionPlanDefinition(institutionPlanId);
          const institutionName =
            String(data.institutionName || data.institution || data.name || "").trim() || "Institution";
          const institutionPrice =
            Number(data.institutionRequestedPriceCop ?? data.institutionPlanPriceCop) ||
            institutionPlanDefinition?.priceCop ||
            0;
          const institutionAssignedAt =
            toDate(data.institutionPlanAssignedAt) || toDate(data.updatedAt) || null;
          const institutionExpiresAt =
            toDate(data.institutionPlanExpiresAt) ||
            (institutionPlanId && institutionAssignedAt
              ? getInstitutionPlanExpiryDate(institutionPlanId, institutionAssignedAt)
              : null);

          let planStatus: BillingPlanRow["planStatus"] = "unknown";
          if (institutionPlanStatusRaw === "pending_payment") {
            planStatus = "payment_pending";
          } else if (institutionExpiresAt && institutionExpiresAt.getTime() < now) {
            planStatus = "expired";
          } else if (institutionPlanStatusRaw === "active") {
            planStatus = "active";
          }

          return {
            userId: docSnap.id,
            accountType: "institution",
            name: institutionName,
            email: String(data.email || "").trim(),
            planId: institutionPlanId,
            planLabel:
              institutionPlanDefinition?.label ||
              String(data.institutionPlanName || "").trim() ||
              "Institution plan",
            planPriceCop: institutionPrice,
            planStatus,
            paymentMethod: String(data.institutionPaymentMethod || "").trim() || "Not set",
            paymentRequestedAt: toDate(data.institutionPaymentRequestedAt),
            assignedAt: institutionAssignedAt,
            expiresAt: institutionExpiresAt,
          } satisfies BillingPlanRow;
        })
        .filter((row): row is BillingPlanRow => row !== null)
        .sort((a, b) => {
          const left = a.name.toLowerCase();
          const right = b.name.toLowerCase();
          return left.localeCompare(right);
        });

      setBillingRows(mapped);
    } else {
      setBillingRows([]);
    }

    if (
      approvalsResult.status === "rejected" &&
      pricingResult.status === "rejected" &&
      usersResult.status === "rejected"
    ) {
      setErrorMessage("Could not load billing data.");
    } else if (
      approvalsResult.status === "rejected" ||
      pricingResult.status === "rejected" ||
      usersResult.status === "rejected"
    ) {
      setErrorMessage("Some billing sections could not be loaded.");
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadBillingData();
  }, []);

  const paymentPendingRequests = useMemo(
    () => approvalRequests.filter((request) => request.status === "approved"),
    [approvalRequests],
  );
  const paymentPendingCount = paymentPendingRequests.length;
  const activePlansCount = useMemo(
    () => billingRows.filter((row) => row.planStatus === "active").length,
    [billingRows],
  );
  const expiringSoonCount = useMemo(() => {
    const now = Date.now();
    const nextThirtyDays = now + 30 * 24 * 60 * 60 * 1000;
    return billingRows.filter((row) => {
      if (!row.expiresAt) return false;
      const expiresAt = row.expiresAt.getTime();
      return expiresAt >= now && expiresAt <= nextThirtyDays;
    }).length;
  }, [billingRows]);
  const pipelineValueCop = useMemo(
    () =>
      paymentPendingRequests.reduce((accumulator, request) => {
        const planId =
          resolveTeacherPlanId(
            String(request.teacherPlanId || request.interestedPlan || "").trim(),
          ) || "starter";
        return accumulator + getTeacherPlanDefinition(planId).priceCop;
      }, 0),
    [paymentPendingRequests],
  );
  const newPricingCount = useMemo(
    () => pricingRequests.filter((request) => request.status === "new").length,
    [pricingRequests],
  );

  const planMix = useMemo(() => {
    const base: Record<TeacherPlanId, number> = { starter: 0, growth: 0, scale: 0 };
    billingRows.forEach((row) => {
      if (row.accountType !== "teacher") return;
      if (!row.planId) return;
      base[row.planId as TeacherPlanId] += 1;
    });
    return base;
  }, [billingRows]);

  const handleResolvePricing = async (request: PricingContactRequestRecord) => {
    setResolvingPricingById((prev) => ({ ...prev, [request.id]: true }));
    try {
      assertAdminPermission(
        "manageBilling",
        user?.email,
        "You do not have permission to resolve pricing requests.",
      );
      const actor = user?.email || "admin";
      await markPricingContactRequestResolved(request.id, actor);
      setPricingRequests((prev) =>
        prev.map((entry) =>
          entry.id === request.id
            ? {
                ...entry,
                status: "resolved",
                resolvedAt: new Date(),
                resolvedBy: actor,
              }
            : entry,
        ),
      );
      await appendAdminAuditLog({
        actorEmail: actor,
        actorName: user?.name || "Admin",
        action: "Resolved pricing request",
        category: "billing",
        targetType: "pricing_request",
        targetId: request.id,
        targetLabel: request.name,
        detail: `${request.institutionName || "No institution"} • ${request.interestedPlanId || "No plan"}`,
      }).catch(() => undefined);
      toast.success("Pricing request marked as resolved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update pricing request.");
    } finally {
      setResolvingPricingById((prev) => ({ ...prev, [request.id]: false }));
    }
  };

  return (
    <DashboardLayout contentClassName="pt-0 lg:pt-1">
      <div className="relative overflow-x-hidden">
        <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
        <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />

        <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <section className="space-y-4">
            <section className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
              <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-sky-200/35" />
              <div className="pointer-events-none absolute -right-24 -bottom-24 h-64 w-64 rounded-full bg-indigo-200/35" />

              <div className="relative space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                  <CreditCard className="h-3.5 w-3.5" />
                  Admin Module
                </div>

                <div className="min-w-0">
                  <h1 className="mt-1 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                    Billing
                  </h1>
                  <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                    Plan and payment control. Monitor pending collections, active plans, and pricing intake.
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                        <Clock3 className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{paymentPendingCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Payment pending</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                        <BadgeCheck className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{activePlansCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Active plans</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <p className="truncate text-sm font-bold text-slate-900">{formatCurrencyCop(pipelineValueCop)}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Collection pipeline</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700">
                        <Mail className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{newPricingCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">New pricing requests</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm lg:col-span-2">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Payment Queue</p>
                    <p className="text-xs text-slate-500">Teacher plans waiting for payment confirmation.</p>
                  </div>
                  <Link
                    to="/admin/teacher-approvals"
                    className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                  >
                    Open approvals
                  </Link>
                </div>

                {loading ? (
                  <div className="flex min-h-[220px] items-center justify-center">
                    <div className="space-y-2 text-center">
                      <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
                      <p className="text-base font-semibold text-slate-900">Loading payment queue</p>
                      <p className="text-sm text-slate-600">Preparing billing requests and plan records</p>
                    </div>
                  </div>
                ) : paymentPendingRequests.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
                    <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" />
                    <p className="mt-2 text-sm font-medium text-slate-700">No pending payments</p>
                    <p className="text-xs text-slate-500">All teacher plan requests are clear right now.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {paymentPendingRequests.map((request) => {
                      const planId =
                        resolveTeacherPlanId(
                          String(request.teacherPlanId || request.interestedPlan || "").trim(),
                        ) || "starter";
                      const plan = getTeacherPlanDefinition(planId);
                      return (
                        <article
                          key={request.userId}
                          className="rounded-xl border border-slate-200/60 bg-white p-3 transition-colors hover:border-slate-300/60 hover:bg-slate-50"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-semibold text-slate-900">{request.name}</p>
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                  Payment pending
                                </span>
                                <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                  {request.requestType === "institution" ? "Institution" : "Teacher"}
                                </span>
                                <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                                  {request.requestType === "institution"
                                    ? request.interestedPlan || request.institutionName || "Institution plan"
                                    : plan.label}
                                </span>
                              </div>
                              <p className="mt-1 truncate text-xs text-slate-600">{request.email}</p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                Method: {(request.requestType === "institution" ? request.institutionPaymentMethod : request.paymentMethod) || "Not set"} • Requested:{" "}
                                {formatDateTime(
                                  (request.requestType === "institution"
                                    ? request.institutionPaymentRequestedAt
                                    : request.paymentRequestedAt) || request.requestedAt,
                                )}
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                  Due {formatCurrencyCop(
                                    request.requestType === "institution"
                                      ? request.institutionRequestedPriceCop || 0
                                      : plan.priceCop,
                                  )}
                                </span>
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                  {getPendingDaysLabel(
                                    (request.requestType === "institution"
                                      ? request.institutionPaymentRequestedAt
                                      : request.paymentRequestedAt) || request.requestedAt,
                                  )}
                                </span>
                              </div>
                            </div>
                            <p className="text-sm font-bold text-slate-900">
                              {formatCurrencyCop(
                                request.requestType === "institution"
                                  ? request.institutionRequestedPriceCop || 0
                                  : plan.priceCop,
                              )}
                            </p>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </article>

              <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Plan Mix</p>
                    <p className="text-xs text-slate-500">Distribution of active teacher plans.</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {TEACHER_PLAN_OPTIONS.map((plan) => (
                    <div
                      key={plan.id}
                      className="rounded-xl border border-slate-200/60 bg-slate-50 p-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{plan.label}</p>
                        <p className="text-sm font-bold text-slate-900">{planMix[plan.id]}</p>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Limit: {plan.courseLimit} courses / {plan.studentLimit} students
                      </p>
                    </div>
                  ))}
                  <div className="rounded-xl border border-slate-200/60 bg-white p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Expiring in 30d</p>
                      <p className="text-sm font-bold text-slate-900">{expiringSoonCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Proactively renew plans close to expiration.
                    </p>
                  </div>
                </div>
              </article>
            </section>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Pricing Intake</p>
                    <p className="text-xs text-slate-500">Inbound plan requests from contact channels.</p>
                  </div>
                </div>

                {pricingRequests.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-5 text-center">
                    <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" />
                    <p className="mt-2 text-sm font-medium text-slate-700">No pricing requests</p>
                    <p className="text-xs text-slate-500">New inbound pricing messages will appear here.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pricingRequests.slice(0, 8).map((request) => {
                      const isResolving = Boolean(resolvingPricingById[request.id]);
                      return (
                        <article
                          key={request.id}
                          className="rounded-xl border border-slate-200/60 bg-white p-3 transition-colors hover:border-slate-300/60 hover:bg-slate-50"
                        >
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-semibold text-slate-900">{request.name}</p>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                  request.status === "new"
                                    ? "border-amber-200 bg-amber-50 text-amber-700"
                                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                }`}
                              >
                                {request.status === "new" ? "New" : "Resolved"}
                              </span>
                            </div>
                            <p className="truncate text-xs text-slate-600">{request.email}</p>
                            <p className="text-xs text-slate-500">
                              {mapPricingRole(request.role)} • {request.institutionName || "No institution"}
                            </p>
                            <p className="text-xs text-slate-500">
                              Demand: {request.desiredCourses} courses / {request.desiredStudents} students
                            </p>
                            {request.status === "new" ? (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={isResolving}
                                  onClick={() => void handleResolvePricing(request)}
                                  className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isResolving ? "Saving..." : "Mark resolved"}
                                </button>
                                <a
                                  href={`mailto:${request.email}`}
                                  className="rounded-lg border border-slate-200/60 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                                >
                                  Reply
                                </a>
                              </div>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </article>

              <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Plan Registry</p>
                    <p className="text-xs text-slate-500">Current teacher plan status and expiration.</p>
                  </div>
                </div>

                {billingRows.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-5 text-center">
                    <AlertTriangle className="mx-auto h-9 w-9 text-slate-400" />
                    <p className="mt-2 text-sm font-medium text-slate-700">No billing records found</p>
                    <p className="text-xs text-slate-500">Teacher and institution plans will appear in this panel.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {billingRows.slice(0, 8).map((row) => (
                      <article
                        key={row.userId}
                        className="rounded-xl border border-slate-200/60 bg-white p-3 transition-colors hover:border-slate-300/60 hover:bg-slate-50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold text-slate-900">{row.name}</p>
                              <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                {row.accountType === "institution" ? "Institution" : "Teacher"}
                              </span>
                            </div>
                            <p className="truncate text-xs text-slate-600">{row.email || "No email"}</p>
                          </div>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getPaymentStatusClassName(row.planStatus)}`}
                          >
                            {getPaymentStatusLabel(row.planStatus)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {row.planLabel} • Expires {formatShortDate(row.expiresAt)}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                            Value {formatCurrencyCop(row.planPriceCop)}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                              row.planStatus === "expired"
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : row.planStatus === "active"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-slate-200/60 bg-slate-50 text-slate-700"
                            }`}
                          >
                            {row.planStatus === "payment_pending"
                              ? getPendingDaysLabel(row.paymentRequestedAt)
                              : getExpiryDaysLabel(row.expiresAt)}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </article>
            </section>

            {errorMessage ? (
              <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-700">
                {errorMessage}
              </div>
            ) : null}

            <Link to="/admin/teacher-approvals" className="block">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/60 bg-white px-3 py-2.5 transition-colors hover:border-sky-300 hover:bg-sky-50/50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-violet-100">
                      <BadgeCheck className="h-3.5 w-3.5 text-violet-700" />
                    </div>
                    <p className="truncate text-sm font-semibold text-slate-900">Manage payment status in approvals</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Confirm payments and finalize teacher activation from the approvals workflow.
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-500" />
              </div>
            </Link>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
