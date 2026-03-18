import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  Mail,
  MessageCircle,
  ShieldCheck,
  UserCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { firebaseDB } from "@/lib/firebase";
import { appendAdminAuditLog } from "@/lib/services/adminAuditLogService";
import { assertAdminPermission } from "@/lib/services/adminPermissionGuardService";
import {
  approveInstitutionApprovalRequest,
  approveTeacherApprovalRequest,
  getAdminApprovalRequests,
  rejectInstitutionApprovalRequest,
  rejectTeacherApprovalRequest,
  setInstitutionPaymentPendingRequest,
  setTeacherPaymentPendingRequest,
  type TeacherApprovalRequestRecord,
} from "@/lib/services/teacherApprovalService";
import {
  TEACHER_PLAN_OPTIONS,
  resolveTeacherPlanId,
  type TeacherPlanId,
} from "@/lib/services/teacherPlanService";
import {
  getInstitutionPlanDefinition,
  getInstitutionPlanQuote,
} from "@/lib/services/institutionPlanService";

type ApprovalFilter = "all" | "pending" | "payment" | "rejected";
type TeacherProfile = { avatarUrl: string; avatarEmoji: string };

type ActiveModal =
  | { type: "reject"; request: TeacherApprovalRequestRecord }
  | { type: "payment"; request: TeacherApprovalRequestRecord }
  | null;

const DEFAULT_PLAN_ID: TeacherPlanId = "starter";

const formatDateTime = (value?: Date | null): string => {
  if (!value) return "No date";
  return value.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getStatusLabel = (request: TeacherApprovalRequestRecord): string => {
  if (request.requestType === "institution" && request.status === "approved") return "Payment pending";
  if (request.requestType === "institution") return "Institution pending";
  if (request.status === "approved") return "Payment pending";
  if (request.status === "rejected") return "Rejected";
  return "Pending review";
};

const getStatusClassName = (request: TeacherApprovalRequestRecord): string => {
  if (request.requestType === "institution" && request.status === "approved") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (request.requestType === "institution") return "border-violet-200 bg-violet-50 text-violet-700";
  if (request.status === "approved") return "border-sky-200 bg-sky-50 text-sky-700";
  if (request.status === "rejected") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
};

const getInitials = (name: string): string => {
  const tokens = name
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 2);
  if (tokens.length === 0) return "T";
  return tokens.map((token) => token.charAt(0).toUpperCase()).join("");
};

const getPlanLabelById = (planId: TeacherPlanId): string =>
  TEACHER_PLAN_OPTIONS.find((plan) => plan.id === planId)?.label || planId;

const formatCurrencyCop = (value?: number | null): string =>
  value && value > 0 ? `$${value.toLocaleString("es-CO")} COP` : "Custom quote";

const getRequestedPlanPresentation = (request: TeacherApprovalRequestRecord): {
  label: string;
  detail: string;
  tone: string;
} => {
  if (request.requestType === "institution") {
    const institutionPlan =
      getInstitutionPlanDefinition(request.institutionRequestedPlanId || "") || null;
    const institutionQuote = getInstitutionPlanQuote({
      planId: request.institutionRequestedPlanId,
      courseLimit: request.institutionRequestedCourseLimit,
      studentLimit: request.institutionRequestedStudentLimit,
    });
    const priceText = `${formatCurrencyCop(
      request.institutionRequestedPriceCop || institutionQuote?.priceCop || institutionPlan?.priceCop || null,
    )} / year`;
    return {
      label: institutionPlan?.label || request.interestedPlan?.trim() || "Institution Plan",
      detail:
        request.status === "approved"
          ? `${priceText}. Payment instructions sent. Activate the institution only after payment confirmation.`
          : `${priceText}. Review the requested plan and send payment instructions before activation.`,
      tone:
        request.status === "approved"
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-violet-200 bg-violet-50 text-violet-700",
    };
  }

  if (request.needsCustomPlan) {
    return {
      label: "Custom plan request",
      detail:
        request.customPlanNotes?.trim() ||
        "Teacher requested a larger custom plan in the onboarding form.",
      tone: "border-violet-200 bg-violet-50 text-violet-700",
    };
  }

  const rawInterestedPlan = String(request.interestedPlan || "").trim();
  const resolvedInterestedPlan = resolveTeacherPlanId(rawInterestedPlan);
  if (resolvedInterestedPlan) {
    return {
      label: getPlanLabelById(resolvedInterestedPlan),
      detail: "",
      tone: "border-sky-200 bg-sky-50 text-sky-700",
    };
  }

  return {
    label: "Not specified",
    detail: "No plan was selected by the teacher. Use the selector to define one.",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  };
};

export default function AdminAccessTeacherApprovalsPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<TeacherApprovalRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeFilter, setActiveFilter] = useState<ApprovalFilter>("all");
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [actionLoadingByUserId, setActionLoadingByUserId] = useState<Record<string, boolean>>({});
  const [selectedPlanByUserId, setSelectedPlanByUserId] = useState<Record<string, TeacherPlanId>>({});
  const [teacherProfileByUserId, setTeacherProfileByUserId] = useState<Record<string, TeacherProfile>>({});
  const [rejectionReason, setRejectionReason] = useState("");
  const [paymentInstructions, setPaymentInstructions] = useState("");

  const loadRequests = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const records = await getAdminApprovalRequests();
      setRequests(records);
      setSelectedPlanByUserId((prev) => {
        const next = { ...prev };
        records.forEach((record) => {
          if (record.requestType === "institution") return;
          if (next[record.userId]) return;
          const resolved =
            resolveTeacherPlanId(record.interestedPlan || record.teacherPlanId || "") || DEFAULT_PLAN_ID;
          next[record.userId] = resolved;
        });
        return next;
      });
    } catch {
      setErrorMessage("Could not load teacher approval requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRequests();
  }, []);

  useEffect(() => {
    let isMounted = true;
    const userIds = Array.from(new Set(requests.map((request) => request.userId).filter(Boolean)));
    if (userIds.length === 0) {
      setTeacherProfileByUserId({});
      return;
    }

    const loadTeacherProfiles = async () => {
      const entries = await Promise.all(
        userIds.map(async (userId) => {
          const [userSnapResult, studentSnapResult] = await Promise.allSettled([
            getDoc(doc(firebaseDB, "usuarios", userId)),
            getDoc(doc(firebaseDB, "estudiantes", userId)),
          ]);

          const userData =
            userSnapResult.status === "fulfilled" && userSnapResult.value.exists()
              ? (userSnapResult.value.data() as Record<string, unknown>)
              : {};
          const studentData =
            studentSnapResult.status === "fulfilled" && studentSnapResult.value.exists()
              ? (studentSnapResult.value.data() as Record<string, unknown>)
              : {};
          const merged = { ...studentData, ...userData };

          return [
            userId,
            {
              avatarUrl: String(merged.avatarUrl || merged.photoURL || merged.photoUrl || "").trim(),
              avatarEmoji: String(merged.avatarEmoji || "").trim(),
            },
          ] as const;
        }),
      );

      if (!isMounted) return;
      setTeacherProfileByUserId(Object.fromEntries(entries));
    };

    void loadTeacherProfiles();

    return () => {
      isMounted = false;
    };
  }, [requests]);

  const pendingCount = useMemo(
    () => requests.filter((request) => request.status === "pending").length,
    [requests],
  );
  const paymentPendingCount = useMemo(
    () => requests.filter((request) => request.status === "approved").length,
    [requests],
  );
  const rejectedCount = useMemo(
    () => requests.filter((request) => request.status === "rejected").length,
    [requests],
  );
  const totalCount = requests.length;

  const filteredRequests = useMemo(() => {
    if (activeFilter === "all") return requests;
    if (activeFilter === "pending") return requests.filter((request) => request.status === "pending");
    if (activeFilter === "payment") return requests.filter((request) => request.status === "approved");
    return requests.filter((request) => request.status === "rejected");
  }, [activeFilter, requests]);

  const withActionLoading = async (userId: string, task: () => Promise<void>) => {
    setActionLoadingByUserId((prev) => ({ ...prev, [userId]: true }));
    try {
      await task();
    } finally {
      setActionLoadingByUserId((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const handleApprove = async (request: TeacherApprovalRequestRecord) => {
    const isInstitutionRequest = request.requestType === "institution";
    const planId = selectedPlanByUserId[request.userId] || DEFAULT_PLAN_ID;
    await withActionLoading(request.userId, async () => {
      try {
        assertAdminPermission(
          "manageTeacherApprovals",
          user?.email,
          isInstitutionRequest
            ? "You do not have permission to activate institution requests."
            : "You do not have permission to approve teacher requests.",
        );
        if (isInstitutionRequest) {
          await approveInstitutionApprovalRequest(request.userId, user?.email || "admin");
        } else {
          await approveTeacherApprovalRequest(request.userId, user?.email || "admin", planId);
        }
        await appendAdminAuditLog({
          actorEmail: user?.email || "admin",
          actorName: user?.name || "Admin",
          action: isInstitutionRequest ? "Activated institution request" : "Approved teacher request",
          category: "approval",
          targetType: isInstitutionRequest ? "institution_approval" : "teacher_approval",
          targetId: request.userId,
          targetLabel: request.name,
          detail: isInstitutionRequest
            ? `${request.institutionName || request.name} institution activated`
            : `${planId} plan assigned`,
        }).catch(() => undefined);
        toast.success(
          isInstitutionRequest
            ? `Activated ${request.institutionName || request.name}.`
            : `Approved ${request.name} with ${planId} plan.`,
        );
        await loadRequests();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : isInstitutionRequest
              ? "Could not activate institution request."
              : "Could not approve teacher request.",
        );
      }
    });
  };

  const openRejectModal = (request: TeacherApprovalRequestRecord) => {
    setRejectionReason("");
    setActiveModal({ type: "reject", request });
  };

  const openPaymentModal = (request: TeacherApprovalRequestRecord) => {
    setPaymentInstructions("");
    setActiveModal({ type: "payment", request });
  };

  const closeModal = () => {
    setActiveModal(null);
    setRejectionReason("");
    setPaymentInstructions("");
  };

  const submitReject = async () => {
    if (!activeModal || activeModal.type !== "reject") return;
    const request = activeModal.request;
    const isInstitutionRequest = request.requestType === "institution";
    await withActionLoading(request.userId, async () => {
      try {
        assertAdminPermission(
          "manageTeacherApprovals",
          user?.email,
          isInstitutionRequest
            ? "You do not have permission to reject institution requests."
            : "You do not have permission to reject teacher requests.",
        );
        if (isInstitutionRequest) {
          await rejectInstitutionApprovalRequest(
            request.userId,
            user?.email || "admin",
            rejectionReason.trim(),
          );
        } else {
          await rejectTeacherApprovalRequest(
            request.userId,
            user?.email || "admin",
            rejectionReason.trim(),
          );
        }
        await appendAdminAuditLog({
          actorEmail: user?.email || "admin",
          actorName: user?.name || "Admin",
          action: isInstitutionRequest ? "Rejected institution request" : "Rejected teacher request",
          category: "approval",
          targetType: isInstitutionRequest ? "institution_approval" : "teacher_approval",
          targetId: request.userId,
          targetLabel: request.name,
          detail: rejectionReason.trim(),
        }).catch(() => undefined);
        toast.success(`Rejected ${request.name}.`);
        closeModal();
        await loadRequests();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not reject teacher request.");
      }
    });
  };

  const submitPaymentPending = async () => {
    if (!activeModal || activeModal.type !== "payment") return;
    const request = activeModal.request;
    const isInstitutionRequest = request.requestType === "institution";
    const planId = selectedPlanByUserId[request.userId] || DEFAULT_PLAN_ID;
    await withActionLoading(request.userId, async () => {
      try {
        assertAdminPermission(
          "manageTeacherApprovals",
          user?.email,
          isInstitutionRequest
            ? "You do not have permission to update institution payment status."
            : "You do not have permission to update teacher payment status.",
        );
        if (isInstitutionRequest) {
          await setInstitutionPaymentPendingRequest(
            request.userId,
            user?.email || "admin",
            paymentInstructions.trim(),
          );
        } else {
          await setTeacherPaymentPendingRequest(
            request.userId,
            user?.email || "admin",
            paymentInstructions.trim(),
            planId,
          );
        }
        await appendAdminAuditLog({
          actorEmail: user?.email || "admin",
          actorName: user?.name || "Admin",
          action: isInstitutionRequest ? "Set institution payment pending" : "Set teacher payment pending",
          category: "approval",
          targetType: isInstitutionRequest ? "institution_approval" : "teacher_approval",
          targetId: request.userId,
          targetLabel: request.name,
          detail: isInstitutionRequest
            ? `${request.interestedPlan || "Institution Plan"} • ${paymentInstructions.trim() || "No instructions"}`
            : `${planId} plan • ${paymentInstructions.trim() || "No instructions"}`,
        }).catch(() => undefined);
        toast.success(
          isInstitutionRequest
            ? `Institution payment pending set for ${request.name}.`
            : `Payment pending set for ${request.name}.`,
        );
        closeModal();
        await loadRequests();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : isInstitutionRequest
              ? "Could not request institution payment setup."
              : "Could not request payment setup.",
        );
      }
    });
  };

  const isModalActionLoading =
    activeModal?.request?.userId ? Boolean(actionLoadingByUserId[activeModal.request.userId]) : false;

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
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Admin Module
                </div>

                <div className="min-w-0">
                  <h1 className="mt-1 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                    Access Approvals
                  </h1>
                  <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                    Teacher and institution access review, payment workflow routing, and activation decisions.
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                        <Clock3 className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{pendingCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Pending review</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                        <BadgeCheck className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{paymentPendingCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Payment pending</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{rejectedCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Rejected</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{totalCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Total requests</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Access Approval Queue</p>
                  <p className="text-xs text-slate-500">Review teacher and institution requests, payment states, and rejected submissions.</p>
                </div>
                <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  {filteredRequests.length} visible
                </span>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { key: "all", label: "All" },
                    { key: "pending", label: "Pending" },
                    { key: "payment", label: "Payment pending" },
                    { key: "rejected", label: "Rejected" },
                  ] as Array<{ key: ApprovalFilter; label: string }>
                ).map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setActiveFilter(filter.key)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                      activeFilter === filter.key
                        ? "border-sky-200 bg-sky-50 text-sky-700"
                        : "border-slate-200/60 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="flex min-h-[220px] items-center justify-center">
                  <div className="space-y-2 text-center">
                    <Clock3 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
                    <p className="text-base font-semibold text-slate-900">Loading approvals</p>
                    <p className="text-sm text-slate-600">Preparing teacher and institution request details</p>
                  </div>
                </div>
              ) : errorMessage ? (
                <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
                  <AlertTriangle className="mx-auto h-9 w-9 text-slate-400" />
                  <p className="mt-2 text-sm font-medium text-slate-700">{errorMessage}</p>
                  <button
                    type="button"
                    onClick={() => void loadRequests()}
                    className="mt-3 rounded-lg border border-slate-200/60 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Retry
                  </button>
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
                  <UserCheck className="mx-auto h-9 w-9 text-slate-400" />
                  <p className="mt-2 text-sm font-medium text-slate-700">No approval requests in this filter</p>
                  <p className="text-xs text-slate-500">Switch filter or check back later for new submissions.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredRequests.map((request) => {
                    const isPending = request.status === "pending";
                    const isInstitutionRequest = request.requestType === "institution";
                    const isRowLoading = Boolean(actionLoadingByUserId[request.userId]);
                    const selectedPlan = selectedPlanByUserId[request.userId] || DEFAULT_PLAN_ID;
                    const requestedPlan = getRequestedPlanPresentation(request);
                    const teacherProfile = teacherProfileByUserId[request.userId];
                    const avatarUrl = teacherProfile?.avatarUrl || "";
                    const avatarEmoji = teacherProfile?.avatarEmoji || "";
                    return (
                      <article
                        key={request.userId}
                        className="rounded-xl border border-slate-200/60 bg-white p-3 transition-colors hover:border-slate-300/60 hover:bg-slate-50"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-slate-200/60 bg-sky-100 text-[11px] font-bold text-sky-700">
                                  {avatarUrl ? (
                                    <img
                                      src={avatarUrl}
                                      alt={`${request.name} avatar`}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <span>{avatarEmoji || getInitials(request.name)}</span>
                                  )}
                                </div>
                                <p className="truncate text-sm font-semibold text-slate-900">{request.name}</p>
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getStatusClassName(request)}`}>
                                {getStatusLabel(request)}
                              </span>
                            </div>
                            <div className="mt-1 space-y-0.5">
                              <p className="truncate text-xs text-slate-600">
                                <Mail className="mr-1 inline h-3 w-3 text-slate-500" />
                                {request.email || "No email"}
                              </p>
                              <p className="truncate text-xs text-slate-600">
                                <MessageCircle className="mr-1 inline h-3 w-3 text-emerald-600" />
                                {request.whatsApp || "No WhatsApp"}
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                Requested: {formatDateTime(request.requestedAt)}
                              </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                    isInstitutionRequest
                                      ? "border-violet-200 bg-violet-50 text-violet-700"
                                      : "border-slate-200/60 bg-slate-50 text-slate-600"
                                  }`}
                                >
                                  {isInstitutionRequest ? "Account: Institution" : "Account: Teacher"}
                                </span>
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${requestedPlan.tone}`}>
                                  Requested plan: {requestedPlan.label}
                                </span>
                                {isInstitutionRequest ? (
                                  <>
                                    <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                      Courses: {request.institutionRequestedCourseLimit || 0}
                                    </span>
                                    <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                      Students: {request.institutionRequestedStudentLimit || 0}
                                    </span>
                                    <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                      Teachers: Unlimited
                                    </span>
                                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                      Amount: {formatCurrencyCop(request.institutionRequestedPriceCop || null)}
                                    </span>
                                  </>
                                ) : null}
                              </div>
                              {requestedPlan.detail ? (
                                <p className="truncate text-[10px] text-slate-500">{requestedPlan.detail}</p>
                              ) : null}
                              {isInstitutionRequest && request.institutionPaymentMethod ? (
                                <p className="truncate text-[10px] text-slate-500">
                                  Payment method: {request.institutionPaymentMethod}
                                </p>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex w-full flex-col gap-2 lg:w-[340px]">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-2 py-1">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">ID</p>
                                <p className="truncate text-xs font-semibold text-slate-700">
                                  {request.idNumber || "Not provided"}
                                </p>
                              </div>
                              <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-2 py-1">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Attempts</p>
                                <p className="text-xs font-semibold text-slate-700">{request.requestCount || 1}</p>
                              </div>
                            </div>

                            {isInstitutionRequest ? (
                              <div className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-1.5 text-xs text-violet-700">
                                Review requested capacity and collect{" "}
                                <span className="font-semibold">
                                  {formatCurrencyCop(request.institutionRequestedPriceCop || null)}
                                </span>{" "}
                                before activating the institution workspace.
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <label className="text-xs font-semibold text-slate-600" htmlFor={`plan-${request.userId}`}>
                                  Plan
                                </label>
                                <select
                                  id={`plan-${request.userId}`}
                                  value={selectedPlan}
                                  onChange={(event) =>
                                    setSelectedPlanByUserId((prev) => ({
                                      ...prev,
                                      [request.userId]: event.target.value as TeacherPlanId,
                                    }))
                                  }
                                  className="w-full rounded-lg border border-slate-200/60 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                                >
                                  {TEACHER_PLAN_OPTIONS.map((plan) => (
                                    <option key={plan.id} value={plan.id}>
                                      {plan.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {isPending ? (
                              isInstitutionRequest ? (
                                <div className="grid grid-cols-2 gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isRowLoading}
                                    onClick={() => openPaymentModal(request)}
                                    className="rounded-xl border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Payment
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isRowLoading}
                                    onClick={() => openRejectModal(request)}
                                    className="rounded-xl border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Reject
                                  </button>
                                </div>
                              ) : (
                                <div className="grid grid-cols-3 gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isRowLoading}
                                    onClick={() => void handleApprove(request)}
                                    className="rounded-xl border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isRowLoading}
                                    onClick={() => openPaymentModal(request)}
                                    className="rounded-xl border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Payment
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isRowLoading}
                                    onClick={() => openRejectModal(request)}
                                    className="rounded-xl border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Reject
                                  </button>
                                </div>
                              )
                            ) : (
                              isInstitutionRequest && request.status === "approved" ? (
                                <div className="grid grid-cols-1 gap-1.5">
                                  <div className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs text-sky-700">
                                    {request.institutionPaymentInstructions ||
                                      "Payment instructions sent. Activate this institution once payment is confirmed."}
                                  </div>
                                  <button
                                    type="button"
                                    disabled={isRowLoading}
                                    onClick={() => void handleApprove(request)}
                                    className="rounded-xl border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Activate Institution
                                  </button>
                                </div>
                              ) : (
                                <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
                                  {request.status === "approved"
                                    ? "Payment instructions in progress for this teacher request."
                                    : request.rejectionReason || "This request was rejected in a previous review."}
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </section>
        </div>
      </div>

      {activeModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
            <div className="flex items-center justify-between border-b border-slate-200/60 bg-slate-50 px-5 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {activeModal.type === "reject"
                    ? activeModal.request.requestType === "institution"
                      ? "Reject Institution Request"
                      : "Reject Teacher Request"
                    : activeModal.request.requestType === "institution"
                      ? "Set Institution Payment Pending"
                      : "Set Payment Pending"}
                </h3>
                <p className="text-sm text-slate-600">{activeModal.request.name}</p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-white/80 hover:text-slate-700"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

              <div className="space-y-4 p-5">
              {activeModal.request.requestType === "institution" ? (
                <div className="grid grid-cols-1 gap-2 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-800 sm:grid-cols-2">
                  <p><span className="font-semibold">Plan:</span> {getInstitutionPlanDefinition(activeModal.request.institutionRequestedPlanId || "")?.label || activeModal.request.interestedPlan || "Institution Plan"}</p>
                  <p><span className="font-semibold">Annual price:</span> {formatCurrencyCop(activeModal.request.institutionRequestedPriceCop || null)}</p>
                  <p><span className="font-semibold">Courses:</span> {activeModal.request.institutionRequestedCourseLimit || 0}</p>
                  <p><span className="font-semibold">Students:</span> {activeModal.request.institutionRequestedStudentLimit || 0}</p>
                  <p><span className="font-semibold">Teachers:</span> Unlimited</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="modal-plan-select">
                    Selected plan
                  </label>
                  <select
                    id="modal-plan-select"
                    value={selectedPlanByUserId[activeModal.request.userId] || DEFAULT_PLAN_ID}
                    onChange={(event) =>
                      setSelectedPlanByUserId((prev) => ({
                        ...prev,
                        [activeModal.request.userId]: event.target.value as TeacherPlanId,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200/60 bg-white px-4 py-2.5 text-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  >
                    {TEACHER_PLAN_OPTIONS.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {activeModal.type === "reject" ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="rejection-reason-input">
                    Rejection reason
                  </label>
                  <textarea
                    id="rejection-reason-input"
                    value={rejectionReason}
                    onChange={(event) => setRejectionReason(event.target.value)}
                    rows={4}
                    placeholder="Explain why this request is being rejected..."
                    className="w-full rounded-xl border border-slate-200/60 bg-white px-4 py-2.5 text-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  />
                  <p className="text-xs text-slate-500">Minimum 8 characters.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="payment-instructions-input">
                    {activeModal.request.requestType === "institution"
                      ? "Institution payment instructions"
                      : "Payment instructions"}
                  </label>
                  <textarea
                    id="payment-instructions-input"
                    value={paymentInstructions}
                    onChange={(event) => setPaymentInstructions(event.target.value)}
                    rows={4}
                    placeholder={
                      activeModal.request.requestType === "institution"
                        ? "Share transfer, invoice, contract, or payment confirmation instructions for this institution..."
                        : "Share transfer, invoice, or payment confirmation instructions..."
                    }
                    className="w-full rounded-xl border border-slate-200/60 bg-white px-4 py-2.5 text-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  />
                  <p className="text-xs text-slate-500">Minimum 12 characters.</p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-slate-200/60 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isModalActionLoading}
                  onClick={() => void (activeModal.type === "reject" ? submitReject() : submitPaymentPending())}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    activeModal.type === "reject"
                      ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                      : "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                  }`}
                >
                  {activeModal.type === "reject"
                    ? "Confirm reject"
                    : activeModal.request.requestType === "institution"
                      ? "Save institution payment"
                      : "Save payment pending"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardLayout>
  );
}
