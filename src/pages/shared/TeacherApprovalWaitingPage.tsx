import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  LogOut,
  Mail,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  UserX,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "react-router-dom";
import { deleteUser } from "firebase/auth";
import {
  deleteDoc,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { firebaseAuth, firebaseDB } from "@/lib/firebase";
import {
  isTeacherPlanExpired,
  toDateOrNull,
} from "@/lib/services/teacherPlanAccessService";
import {
  TEACHER_PLAN_OPTIONS,
  getTeacherPlanDefinition,
  getTeacherPlanPath,
  resolveTeacherPlanId,
} from "@/lib/services/teacherPlanService";

const SUPPORT_EMAIL = "rcroman20@gmail.com";

type StatusType = "pending" | "rejected" | "expired" | "paymentPending";

type StatusConfig = {
  icon: typeof ShieldAlert;
  title: string;
  description: string;
  statusText: string;
  containerTone: string;
  textTone: string;
  badgeTone: string;
  helperText: string;
};

const STATUS_CONFIG: Record<StatusType, StatusConfig> = {
  pending: {
    icon: ShieldAlert,
    title: "You're almost there.",
    description: "Your teacher application is being reviewed by an admin.",
    statusText: "In review",
    containerTone: "border-amber-200 bg-amber-50",
    textTone: "text-amber-800",
    badgeTone: "border-amber-200 bg-amber-100 text-amber-700",
    helperText:
      "Typical response time is 1-2 business days. We'll notify you right away.",
  },
  rejected: {
    icon: XCircle,
    title: "Not approved yet.",
    description: "Your request needs a few updates before approval.",
    statusText: "Rejected",
    containerTone: "border-rose-200 bg-rose-50",
    textTone: "text-rose-700",
    badgeTone: "border-rose-200 bg-rose-100 text-rose-700",
    helperText:
      "Review the reason below, update your info, and reapply in one click.",
  },
  expired: {
    icon: AlertTriangle,
    title: "Plan expired. Access paused.",
    description: "Renew payment to keep using teacher tools.",
    statusText: "Payment required",
    containerTone: "border-rose-200 bg-rose-50",
    textTone: "text-rose-700",
    badgeTone: "border-rose-200 bg-rose-100 text-rose-700",
    helperText:
      "Your courses and student data stay safe and ready to continue.",
  },
  paymentPending: {
    icon: AlertTriangle,
    title: "Approved. Payment is pending.",
    description:
      "Your profile passed admin review, but access unlocks after payment confirmation.",
    statusText: "Approved pending payment",
    containerTone: "border-sky-200 bg-sky-50",
    textTone: "text-sky-800",
    badgeTone: "border-sky-200 bg-sky-100 text-sky-700",
    helperText:
      "Follow the payment instructions below. Once payment is confirmed, teacher tools will be enabled again.",
  },
};

export default function TeacherApprovalWaitingPage() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isReapplying, setIsReapplying] = useState(false);
  const [reapplyMessage, setReapplyMessage] = useState("");
  const [reapplyError, setReapplyError] = useState("");
  const [showRequestDetailsForm, setShowRequestDetailsForm] = useState(false);
  const [hasSavedRequestDetails, setHasSavedRequestDetails] = useState(false);
  const [isSavingRequestDetails, setIsSavingRequestDetails] = useState(false);
  const [requestDetailsMessage, setRequestDetailsMessage] = useState("");
  const [requestDetailsError, setRequestDetailsError] = useState("");
  const [interestedPlan, setInterestedPlan] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [institutionOwnership, setInstitutionOwnership] = useState("");
  const [institutionType, setInstitutionType] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [needsExtraPlan, setNeedsExtraPlan] = useState("");
  const [extraPlanNotes, setExtraPlanNotes] = useState("");
  const [paymentInstructionsFromAdmin, setPaymentInstructionsFromAdmin] =
    useState("");
  const [paymentRequestedByFromAdmin, setPaymentRequestedByFromAdmin] =
    useState("");
  const [paymentRequestedAtFromAdmin, setPaymentRequestedAtFromAdmin] =
    useState<Date | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isRejected =
    user?.requestedRole === "docente" &&
    user?.teacherApprovalStatus === "rejected" &&
    user?.role !== "docente";

  const reasonFromQuery = new URLSearchParams(location.search).get("reason");
  const isExpiredFromQuery = reasonFromQuery === "plan-expired";
  const isPaymentPendingFromQuery = reasonFromQuery === "payment-pending";

  const isPlanExpired =
    isExpiredFromQuery ||
    isTeacherPlanExpired({
      role: user?.role,
      teacherPlanStatus: user?.teacherPlanStatus,
      teacherPlanExpiresAt: user?.teacherPlanExpiresAt,
    });
  const isPaymentPending =
    isPaymentPendingFromQuery ||
    (user?.requestedRole === "docente" &&
      user?.teacherApprovalStatus === "approved" &&
      String(user?.teacherPlanStatus || "").trim().toLowerCase() ===
        "pending_payment");

  const statusType: StatusType = isRejected
    ? "rejected"
    : isPaymentPending
      ? "paymentPending"
      : isPlanExpired
      ? "expired"
      : "pending";

  const statusConfig = STATUS_CONFIG[statusType];
  const StatusIcon = statusConfig.icon;

  const requestedAtText = useMemo(() => {
    const rawDate = user?.teacherRequestedAt || user?.createdAt;
    if (!rawDate) return "Recently";
    const date = rawDate instanceof Date ? rawDate : new Date(rawDate);
    if (Number.isNaN(date.getTime())) return "Recently";
    return date.toLocaleString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [user?.teacherRequestedAt, user?.createdAt]);

  const rejectedAtText = useMemo(() => {
    if (!user?.teacherRejectedAt) return "Not available";
    const date =
      user.teacherRejectedAt instanceof Date
        ? user.teacherRejectedAt
        : new Date(user.teacherRejectedAt);
    if (Number.isNaN(date.getTime())) return "Not available";
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [user?.teacherRejectedAt]);

  const planExpiredAtText = useMemo(() => {
    const date = toDateOrNull(user?.teacherPlanExpiresAt);
    if (!date) return "Not available";
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [user?.teacherPlanExpiresAt]);
  const rejectionReason = useMemo(() => {
    const value =
      typeof user?.teacherRejectionReason === "string"
        ? user.teacherRejectionReason.trim()
        : "";
    return value.length > 0
      ? value
      : "The request did not meet the current verification criteria.";
  }, [user?.teacherRejectionReason]);
  const paymentInstructions = useMemo(() => {
    const userValue =
      typeof user?.teacherPaymentInstructions === "string"
        ? user.teacherPaymentInstructions.trim()
        : "";
    const loaded = paymentInstructionsFromAdmin.trim();
    return (
      loaded ||
      userValue ||
      "Your request is approved, but payment instructions are still being prepared."
    );
  }, [paymentInstructionsFromAdmin, user?.teacherPaymentInstructions]);
  const paymentRequestedBy = useMemo(() => {
    const userValue =
      typeof user?.teacherPaymentRequestedBy === "string"
        ? user.teacherPaymentRequestedBy.trim()
        : "";
    const loaded = paymentRequestedByFromAdmin.trim();
    return loaded || userValue || "Admin";
  }, [paymentRequestedByFromAdmin, user?.teacherPaymentRequestedBy]);
  const paymentRequestedAtText = useMemo(() => {
    const loaded = paymentRequestedAtFromAdmin;
    const userValue = toDateOrNull(user?.teacherPaymentRequestedAt);
    const date = loaded || userValue;
    if (!date) return "Not available";
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [paymentRequestedAtFromAdmin, user?.teacherPaymentRequestedAt]);

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    const loadSavedRequestDetails = async () => {
      try {
        const [userSnap, studentSnap] = await Promise.all([
          getDoc(doc(firebaseDB, "usuarios", user.id)),
          getDoc(doc(firebaseDB, "estudiantes", user.id)),
        ]);
        if (cancelled) return;

        const userData = userSnap.exists()
          ? (userSnap.data() as Record<string, unknown>)
          : {};
        const studentData = studentSnap.exists()
          ? (studentSnap.data() as Record<string, unknown>)
          : {};
        const merged = { ...studentData, ...userData };

        const rawLoadedPlan =
          typeof merged.teacherInterestedPlan === "string"
            ? merged.teacherInterestedPlan
            : "";
        const loadedPlan = resolveTeacherPlanId(rawLoadedPlan) || "";
        const loadedInstitutionName =
          typeof merged.teacherInstitutionName === "string"
            ? merged.teacherInstitutionName
            : "";
        const loadedOwnership =
          typeof merged.teacherInstitutionOwnership === "string"
            ? merged.teacherInstitutionOwnership
            : "";
        const loadedType =
          typeof merged.teacherInstitutionType === "string"
            ? merged.teacherInstitutionType
            : "";
        const loadedPaymentMethod =
          typeof merged.teacherPaymentMethod === "string"
            ? merged.teacherPaymentMethod
            : "";
        const loadedNeedsExtraPlan =
          typeof merged.teacherNeedsCustomPlan === "boolean"
            ? (merged.teacherNeedsCustomPlan ? "yes" : "no")
            : "";
        const loadedNotes =
          typeof merged.teacherCustomPlanNotes === "string"
            ? merged.teacherCustomPlanNotes
            : "";
        const loadedPaymentInstructions =
          typeof merged.teacherPaymentInstructions === "string"
            ? merged.teacherPaymentInstructions
            : "";
        const loadedPaymentRequestedBy =
          typeof merged.teacherPaymentRequestedBy === "string"
            ? merged.teacherPaymentRequestedBy
            : "";
        const loadedPaymentRequestedAt = toDateOrNull(
          merged.teacherPaymentRequestedAt,
        );

        setInterestedPlan(loadedPlan);
        setInstitutionName(loadedInstitutionName);
        setInstitutionOwnership(loadedOwnership);
        setInstitutionType(loadedType);
        setPaymentMethod(loadedPaymentMethod);
        setNeedsExtraPlan(loadedNeedsExtraPlan);
        setExtraPlanNotes(loadedNotes);
        setPaymentInstructionsFromAdmin(loadedPaymentInstructions);
        setPaymentRequestedByFromAdmin(loadedPaymentRequestedBy);
        setPaymentRequestedAtFromAdmin(loadedPaymentRequestedAt);

        const loadedIsCustom = loadedNeedsExtraPlan === "yes";
        const loadedHasDetails =
          loadedInstitutionName.trim().length > 0 &&
          loadedOwnership.trim().length > 0 &&
          loadedType.trim().length > 0 &&
          loadedPaymentMethod.trim().length > 0 &&
          loadedNeedsExtraPlan.length > 0 &&
          (loadedIsCustom
            ? loadedNotes.trim().length >= 10
            : loadedPlan.trim().length > 0);

        setHasSavedRequestDetails(loadedHasDetails);
        setShowRequestDetailsForm(false);
      } catch {
        if (cancelled) return;
        setHasSavedRequestDetails(false);
        setShowRequestDetailsForm(false);
      }
    };

    void loadSavedRequestDetails();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleReapply = async () => {
    if (!user?.id || isReapplying) return;

    setReapplyError("");
    setReapplyMessage("");
    setIsReapplying(true);
    try {
      const payload = {
        requestedRole: "docente",
        teacherApprovalStatus: "pending",
        teacherRequestedAt: serverTimestamp(),
        teacherRequestCount: increment(1),
        teacherRejectedAt: null,
        teacherRejectedBy: null,
        teacherRejectionReason: null,
        updatedAt: serverTimestamp(),
      };

      await Promise.all([
        setDoc(doc(firebaseDB, "usuarios", user.id), payload, { merge: true }),
        setDoc(doc(firebaseDB, "estudiantes", user.id), payload, { merge: true }),
      ]);

      setReapplyMessage("Request sent. Redirecting you to the review page...");
      window.location.replace("/teacher-approval-waiting");
    } catch {
      setReapplyError("We couldn't send your request right now. Please try again.");
    } finally {
      setIsReapplying(false);
    }
  };

  const handleSaveRequestDetails = async () => {
    if (!user?.id || isSavingRequestDetails) return;

    const planValue = interestedPlan.trim();
    const institutionValue = institutionName.trim();
    const ownershipValue = institutionOwnership.trim();
    const typeValue = institutionType.trim();
    const paymentMethodValue = paymentMethod.trim();
    const needsExtraValue = needsExtraPlan.trim();
    const notesValue = extraPlanNotes.trim();
    const isCustomPlanRequest = needsExtraValue === "yes";

    if (
      !institutionValue ||
      !ownershipValue ||
      !typeValue ||
      !paymentMethodValue ||
      !needsExtraValue
    ) {
      setRequestDetailsError("Please complete all required fields before saving.");
      setRequestDetailsMessage("");
      return;
    }

    if (!isCustomPlanRequest && !planValue) {
      setRequestDetailsError("Please select a standard plan or choose a custom plan request.");
      setRequestDetailsMessage("");
      return;
    }

    if (needsExtraValue === "yes" && notesValue.length < 10) {
      setRequestDetailsError("Please describe the extra plan you need (minimum 10 characters).");
      setRequestDetailsMessage("");
      return;
    }

    setRequestDetailsError("");
    setRequestDetailsMessage("");
    setIsSavingRequestDetails(true);
    try {
      const payload = {
        teacherInterestedPlan: isCustomPlanRequest ? null : planValue,
        teacherInstitutionName: institutionValue,
        teacherInstitutionOwnership: ownershipValue,
        teacherInstitutionType: typeValue,
        teacherPaymentMethod: paymentMethodValue,
        teacherNeedsCustomPlan: isCustomPlanRequest,
        teacherCustomPlanNotes: notesValue,
        updatedAt: serverTimestamp(),
      };

      await Promise.all([
        setDoc(doc(firebaseDB, "usuarios", user.id), payload, { merge: true }),
        setDoc(doc(firebaseDB, "estudiantes", user.id), payload, { merge: true }),
      ]);

      setRequestDetailsMessage("Details saved successfully. Admins can now review this information.");
      setHasSavedRequestDetails(true);
      setShowRequestDetailsForm(false);
    } catch {
      setRequestDetailsError("Could not save details right now. Please try again.");
    } finally {
      setIsSavingRequestDetails(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user?.id || isDeletingAccount) return;

    setDeleteAccountError("");
    setIsDeletingAccount(true);

    try {
      await Promise.all([
        deleteDoc(doc(firebaseDB, "usuarios", user.id)).catch(() => undefined),
        deleteDoc(doc(firebaseDB, "estudiantes", user.id)).catch(() => undefined),
      ]);

      const currentUser = firebaseAuth.currentUser;
      if (!currentUser || currentUser.uid !== user.id) {
        throw new Error("auth/not-current-user");
      }

      await deleteUser(currentUser);
      window.location.replace("/auth");
    } catch (error: unknown) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : "";

      if (code.includes("auth/requires-recent-login")) {
        setDeleteAccountError(
          "For security, sign out and sign in again, then try deleting your account.",
        );
      } else {
        setDeleteAccountError(
          "We couldn't delete your account right now. Please try again later.",
        );
      }
    } finally {
      setIsDeletingAccount(false);
      setShowDeleteConfirm(false);
    }
  };

  const planLabel = useMemo(() => {
    const value = interestedPlan.trim().toLowerCase();
    if (!value) return "Not selected";
    return getTeacherPlanDefinition(value).label;
  }, [interestedPlan]);

  const ownershipLabel = useMemo(() => {
    if (institutionOwnership === "public") return "Public";
    if (institutionOwnership === "private") return "Private";
    return institutionOwnership || "Not provided";
  }, [institutionOwnership]);

  const institutionTypeLabel = useMemo(() => {
    if (institutionType === "university") return "University";
    if (institutionType === "school") return "School";
    if (institutionType === "organization") return "Organization";
    return institutionType || "Not provided";
  }, [institutionType]);

  const paymentMethodLabel = useMemo(() => {
    if (paymentMethod === "bre-b") return "Bre-B";
    if (paymentMethod === "card") return "Credit Card";
    if (paymentMethod === "bank-transfer-colombia") return "Bank transfer (Colombia)";
    return paymentMethod || "Not provided";
  }, [paymentMethod]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-100 via-sky-50 to-indigo-50 px-4 py-4 sm:px-6 lg:px-8 lg:py-4">
      <div className="pointer-events-none absolute -left-16 top-6 h-44 w-44 rounded-full bg-white/70 blur-[44px]" />
      <div className="pointer-events-none absolute -right-14 bottom-8 h-52 w-52 rounded-full bg-sky-200/60 blur-[52px]" />

      <div className="relative mx-auto w-full max-w-[1080px]">
        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.45)] backdrop-blur-sm lg:p-6">
          <div className="space-y-4">
            <section className="relative overflow-hidden rounded-2xl border border-slate-800/20 bg-gradient-to-br from-slate-900 via-slate-900 to-sky-900 p-4 shadow-sm lg:p-5">
              <div className="pointer-events-none absolute -left-10 top-0 h-28 w-28 rounded-full bg-white/10 blur-sm" />
              <div className="pointer-events-none absolute -bottom-12 -right-8 h-36 w-36 rounded-full bg-sky-300/20 blur-sm" />

              <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-100">
                    <Sparkles className="h-3.5 w-3.5" />
                    Teacher Account Status
                  </span>
                  <h1 className="text-2xl font-bold leading-tight text-white">
                    {statusConfig.title}
                  </h1>
                  <p className="max-w-3xl text-sm text-sky-100/90">
                    {statusConfig.description}
                  </p>
                  <p className="max-w-3xl text-sm text-slate-200/90">
                    {statusConfig.helperText}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => logout().catch(() => undefined)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <article className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 shadow-sm">
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <CalendarClock className="h-3.5 w-3.5 text-slate-500" />
                  Request date
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{requestedAtText}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Date when your teacher application was submitted.
                </p>
              </article>

              <article className={`rounded-xl border p-3.5 ${statusConfig.containerTone}`}>
                <p className={`inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${statusConfig.textTone}`}>
                  <StatusIcon className="h-3.5 w-3.5" />
                  Current application status
                </p>
                <p className={`mt-1 text-sm font-semibold ${statusConfig.textTone}`}>
                  {statusConfig.statusText}
                </p>
                <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusConfig.badgeTone}`}>
                  {statusType === "pending"
                    ? "Waiting for admin review"
                    : statusType === "rejected"
                      ? "Not approved"
                      : statusType === "paymentPending"
                        ? "Approved • waiting for payment"
                        : "Plan payment required"}
                </span>
                <p className="mt-2 text-xs opacity-80">
                  {statusType === "pending"
                    ? "Your request is in queue."
                    : statusType === "rejected"
                      ? "You can submit a new request after reviewing the feedback."
                      : statusType === "paymentPending"
                        ? "Your access unlocks right after payment confirmation."
                        : "Access unlocks again once payment is confirmed."}
                </p>
              </article>

              {isRejected && (
                <article className="md:col-span-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                    Rejection feedback
                  </p>
                  <p className="mt-1 text-sm text-rose-800">
                    <span className="font-semibold">Reason:</span> {rejectionReason}
                  </p>
                  <p className="mt-2 text-xs text-rose-700/90">
                    <span className="font-semibold">Rejection date:</span> {rejectedAtText}
                    {user?.teacherRejectedBy ? ` • Reviewed by: ${user.teacherRejectedBy}` : ""}
                  </p>
                  <p className="mt-2 text-xs text-rose-700/90">
                    <span className="font-semibold">Next step:</span> Update your info and submit a new request.
                  </p>
                </article>
              )}

              {isPaymentPending && !isRejected && (
                <article className="md:col-span-2 rounded-xl border border-sky-200 bg-sky-50 p-3.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                    Payment instructions
                  </p>
                  <p className="mt-1 text-sm text-sky-900">{paymentInstructions}</p>
                  <p className="mt-2 text-xs text-sky-700/90">
                    <span className="font-semibold">Sent on:</span> {paymentRequestedAtText}
                    {paymentRequestedBy ? ` • by ${paymentRequestedBy}` : ""}
                  </p>
                  <p className="mt-2 text-xs text-sky-700/90">
                    <span className="font-semibold">Access note:</span> Approved now, payment pending.
                    Once payment is confirmed, you can access teacher features again.
                  </p>
                </article>
              )}

              {isPlanExpired && !isRejected && !isPaymentPending && (
                <article className="md:col-span-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                    Plan status
                  </p>
                  <p className="mt-1 text-sm text-rose-800">
                    Your teacher plan has expired. Teaching tools are paused until payment is confirmed.
                  </p>
                  <p className="mt-2 text-xs text-rose-700/90">
                    <span className="font-semibold">Plan expired on:</span> {planExpiredAtText}
                  </p>
                  <p className="mt-2 text-xs text-rose-700/90">
                    <span className="font-semibold">To reactivate:</span> Contact support and share your account email.
                  </p>
                </article>
              )}
            </section>

            {hasSavedRequestDetails ? (
              <section className="-mt-1 rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-300 bg-white text-emerald-700 shadow-sm">
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                    Submission summary sent to admins
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-700 sm:grid-cols-2">
                  <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                    <span className="font-semibold">Plan:</span>{" "}
                    {needsExtraPlan === "yes" ? "Custom plan request" : planLabel}
                  </p>
                  <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                    <span className="font-semibold">Institution:</span>{" "}
                    {institutionName || "Not provided"}
                  </p>
                  <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                    <span className="font-semibold">Ownership:</span> {ownershipLabel}
                  </p>
                  <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                    <span className="font-semibold">Type:</span> {institutionTypeLabel}
                  </p>
                  <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                    <span className="font-semibold">Payment method:</span> {paymentMethodLabel}
                  </p>
                  <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                    <span className="font-semibold">Needs custom plan:</span>{" "}
                    {needsExtraPlan === "yes" ? "Yes" : "No"}
                  </p>
                </div>
                {needsExtraPlan === "yes" && (
                  <p className="mt-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700">
                    <span className="font-semibold">Custom plan notes:</span>{" "}
                    {extraPlanNotes || "Not provided"}
                  </p>
                )}
                {requestDetailsMessage && (
                  <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {requestDetailsMessage}
                  </p>
                )}
              </section>
            ) : (
            <section className="-mt-1 rounded-2xl border border-sky-200/70 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
              <button
                type="button"
                onClick={() => setShowRequestDetailsForm((previous) => !previous)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-sky-300 bg-white text-sky-700 shadow-sm">
                      <Building2 className="h-4 w-4" />
                    </span>
                    Institution & Plan Details
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Click to complete the details admins need to evaluate your teacher request.
                  </p>
                  <p className="mt-1 text-xs font-semibold text-amber-700">
                    Important: complete this form to improve your chances of approval.
                  </p>
                </div>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600">
                  {showRequestDetailsForm ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </span>
              </button>

              {showRequestDetailsForm && (
                <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        1. Interested plan
                      </span>
                      <select
                        value={interestedPlan}
                        onChange={(event) => setInterestedPlan(event.target.value)}
                        disabled={needsExtraPlan === "yes"}
                        className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                      >
                        <option value="">Select a plan</option>
                        {TEACHER_PLAN_OPTIONS.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.label} ({`$${plan.priceCop.toLocaleString("es-CO")} COP`} / year)
                          </option>
                        ))}
                      </select>
                      {needsExtraPlan === "yes" && (
                        <p className="text-[11px] text-slate-500">
                          Plan selection is skipped because you requested a custom plan.
                        </p>
                      )}
                      {needsExtraPlan !== "yes" && (
                        <div className="flex flex-wrap gap-1.5">
                          {TEACHER_PLAN_OPTIONS.map((plan) => (
                            <a
                              key={plan.id}
                              href={getTeacherPlanPath(plan.id)}
                              className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                            >
                              View {plan.label}
                            </a>
                          ))}
                        </div>
                      )}
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        2. Institution name
                      </span>
                      <textarea
                        value={institutionName}
                        onChange={(event) => setInstitutionName(event.target.value)}
                        rows={2}
                        className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                        placeholder="Example: Colegio San Martin"
                      />
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        3. Institution ownership
                      </span>
                      <select
                        value={institutionOwnership}
                        onChange={(event) => setInstitutionOwnership(event.target.value)}
                        className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                      >
                        <option value="">Select ownership</option>
                        <option value="public">Public</option>
                        <option value="private">Private</option>
                      </select>
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        4. Institution type
                      </span>
                      <select
                        value={institutionType}
                        onChange={(event) => setInstitutionType(event.target.value)}
                        className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                      >
                        <option value="">Select type</option>
                        <option value="university">University</option>
                        <option value="school">School</option>
                        <option value="organization">Organization</option>
                      </select>
                    </label>

                    <label className="space-y-1.5 md:col-span-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        5. Payment method you will use
                      </span>
                      <select
                        value={paymentMethod}
                        onChange={(event) => setPaymentMethod(event.target.value)}
                        className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                      >
                        <option value="">Select payment method</option>
                        <option value="bre-b">Bre-B</option>
                        <option value="card">Credit Card</option>
                        <option value="bank-transfer-colombia">
                          Bank transfer (if you are in Colombia)
                        </option>
                      </select>
                    </label>

                    <label className="space-y-1.5 md:col-span-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        6. Do you need a larger/custom plan?
                      </span>
                      <select
                        value={needsExtraPlan}
                        onChange={(event) => {
                          const value = event.target.value;
                          setNeedsExtraPlan(value);
                          if (value === "yes") {
                            setInterestedPlan("");
                          }
                        }}
                        className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                      >
                        <option value="">Select an option</option>
                        <option value="no">No, one of the standard plans works</option>
                        <option value="yes">Yes, I need a bigger/custom plan</option>
                      </select>
                    </label>

                    {needsExtraPlan === "yes" && (
                      <label className="space-y-1.5 md:col-span-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Custom plan details
                        </span>
                        <textarea
                          value={extraPlanNotes}
                          onChange={(event) => setExtraPlanNotes(event.target.value)}
                          rows={3}
                          className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                          placeholder="Tell us what limits/features you need (courses, students, support level, etc.)"
                        />
                      </label>
                    )}
                  </div>

                  {requestDetailsError && (
                    <p className="text-xs font-semibold text-rose-700">{requestDetailsError}</p>
                  )}
                  {requestDetailsMessage && (
                    <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {requestDetailsMessage}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={handleSaveRequestDetails}
                    disabled={isSavingRequestDetails}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-sky-500 bg-gradient-to-b from-sky-500 to-sky-600 px-4 text-sm font-semibold text-white shadow-[0_14px_26px_-16px_rgba(2,132,199,0.9)] transition hover:from-sky-600 hover:to-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSavingRequestDetails ? "Saving..." : "Save details"}
                  </button>
                </div>
              )}
            </section>
            )}

            <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm">
              <h3 className="text-base font-bold text-slate-900">What you can do now</h3>

              {statusType === "rejected" && (
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-slate-600">
                    Submit a new teacher request when you are ready.
                  </p>
                  {reapplyError && (
                    <p className="text-xs font-semibold text-rose-700">
                      <span className="block font-bold">Error:</span> {reapplyError}
                    </p>
                  )}
                  {reapplyMessage && (
                    <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {reapplyMessage}
                    </p>
                  )}
                </div>
              )}

              {statusType === "expired" && (
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-rose-700">
                    Teacher tools are blocked because your plan expired.
                  </p>
                </div>
              )}

              {statusType === "paymentPending" && (
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-sky-800">
                    Your request is approved. Complete payment to re-enable teacher tools.
                  </p>
                  <p className="text-xs text-sky-700/90">{paymentInstructions}</p>
                </div>
              )}

              {statusType === "pending" && (
                <div className="mt-3 space-y-2">
                  <p className="text-sm text-slate-600">
                    An administrator is reviewing your request.
                  </p>
                  <p className="text-xs text-slate-500">
                    Typical response time: 1-2 business days.
                  </p>
                </div>
              )}

              <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                {statusType === "rejected" && (
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={handleReapply}
                      disabled={isReapplying}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-sky-500 bg-gradient-to-b from-sky-500 to-sky-600 px-4 text-sm font-semibold text-white shadow-[0_14px_26px_-16px_rgba(2,132,199,0.9)] transition hover:from-sky-600 hover:to-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RefreshCw className={`h-4 w-4 ${isReapplying ? "animate-spin" : ""}`} />
                      {isReapplying ? "Submitting..." : "Reapply for teacher access"}
                    </button>
                    <p className="text-xs text-slate-500">This will replace your last rejected request.</p>
                  </div>
                )}

                {statusType === "expired" && (
                  <div className="space-y-1.5">
                    <a
                      href={`mailto:${SUPPORT_EMAIL}?subject=Teacher%20Plan%20Reactivation%20Request&body=Hello,%20I%20need%20to%20reactivate%20my%20teacher%20plan.%20My%20account%20email%20is:%20${user?.email}`}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-sky-300 bg-white px-4 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
                    >
                      <MessageSquare className="h-4 w-4" />
                      Reactivate my plan
                    </a>
                    <p className="text-xs text-slate-500">
                      Support replies within 24 business hours.
                    </p>
                  </div>
                )}

                {statusType === "paymentPending" && (
                  <div className="space-y-1.5">
                    <a
                      href={`mailto:${SUPPORT_EMAIL}?subject=Teacher%20Payment%20Confirmation&body=Hello,%20my%20teacher%20request%20was%20approved%20and%20I%20want%20to%20confirm%20payment.%20My%20account%20email%20is:%20${user?.email}`}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-sky-300 bg-white px-4 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
                    >
                      <MessageSquare className="h-4 w-4" />
                      Confirm payment with admin
                    </a>
                    <p className="text-xs text-slate-500">
                      Access will be enabled right after payment confirmation.
                    </p>
                  </div>
                )}

                {!showDeleteConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-rose-700 transition hover:text-rose-800"
                  >
                    <UserX className="h-4 w-4" />
                    Delete my account
                  </button>
                ) : (
                  <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
                    <p className="text-sm font-semibold text-rose-700">
                      Warning: This action cannot be undone
                    </p>
                    <p className="text-sm text-rose-800">
                      Deleting your account will:
                    </p>
                    <ul className="list-disc pl-5 text-xs text-rose-800 space-y-1">
                      <li>Remove all your personal information from our systems</li>
                      <li>Delete any courses, materials, or content you have created</li>
                      <li>Remove you from all student enrollments and grade sheets</li>
                      <li>Make your account and all associated data unrecoverable</li>
                    </ul>
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={handleDeleteAccount}
                        disabled={isDeletingAccount}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-300 bg-rose-600 px-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isDeletingAccount ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            Deleting...
                          </>
                        ) : (
                          "Yes, delete account"
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                    </div>
                    {deleteAccountError && (
                      <p className="text-xs font-semibold text-rose-700">{deleteAccountError}</p>
                    )}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-sky-50 p-4 shadow-sm">
              <h3 className="text-base font-bold text-slate-900">Need help?</h3>
              <p className="mt-1 text-sm text-slate-600">
                Contact support if you need help with review status, payment, or account issues.
              </p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                >
                  <Mail className="h-4 w-4" />
                  {SUPPORT_EMAIL}
                </a>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
