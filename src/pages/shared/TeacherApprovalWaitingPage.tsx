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
import {
  INSTITUTION_PLAN_OPTIONS,
  getInstitutionPlanDefinition,
  getInstitutionPlanQuote,
} from "@/lib/services/institutionPlanService";
import { purgeUserDataInSparkMode } from "@/lib/services/accountDeletionService";
import { useAdminPlatformSettings } from "@/lib/services/adminSettingsService";
import { PublicTopNav } from "@/components/common/PublicTopNav";
import { PublicFooter } from "@/components/common/PublicFooter";

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
  const { settings } = useAdminPlatformSettings();
  const platformName = String(settings.platformName || "Socrattica").trim() || "Socrattica";
  const supportEmail = settings.supportEmail || "rcroman20@gmail.com";
  const contactEmail = settings.contactEmail || supportEmail;
  const allowTeacherSelfRequest = settings.allowTeacherSelfRequest !== false;
  const teacherSelfRequestMessage =
    String(settings.teacherSelfRequestMessage || "").trim() ||
    "Teacher self-registration is currently disabled. Please contact the admin team to request access.";
  const supportWhatsApp = String(settings.supportWhatsApp || "").trim();
  const normalizedWhatsApp = supportWhatsApp.replace(/\D/g, "");
  const starterResponseHours = Math.max(1, Number(settings.defaultResponseHoursStarter) || 48);
  const onboardingMonths = Math.max(1, Number(settings.defaultOnboardingMonths) || 2);
  const [isReapplying, setIsReapplying] = useState(false);
  const [isRequestingInstitutionReactivation, setIsRequestingInstitutionReactivation] =
    useState(false);
  const [reapplyMessage, setReapplyMessage] = useState("");
  const [reapplyError, setReapplyError] = useState("");
  const [showRequestDetailsForm, setShowRequestDetailsForm] = useState(false);
  const [hasSavedRequestDetails, setHasSavedRequestDetails] = useState(false);
  const [hasEditedAfterCurrentRejection, setHasEditedAfterCurrentRejection] =
    useState(false);
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
  const [institutionRequestedCourseLimit, setInstitutionRequestedCourseLimit] =
    useState("");
  const [institutionRequestedStudentLimit, setInstitutionRequestedStudentLimit] =
    useState("");
  const [institutionPlanNotes, setInstitutionPlanNotes] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const institutionRequestLabel =
    String(user?.institutionName || user?.teacherInstitutionName || "").trim() || "your institution";
  const isInstitutionAccount = user?.role === "institucion";
  const isInstitutionTeacherRequest =
    user?.requestedRole === "docente" &&
    Boolean(user?.institutionId) &&
    user?.role !== "institucion";

  const isRejected =
    user?.requestedRole === "docente" &&
    user?.teacherApprovalStatus === "rejected" &&
    user?.role !== "docente";

  const reasonFromQuery = new URLSearchParams(location.search).get("reason");
  const isExpiredFromQuery = reasonFromQuery === "plan-expired";
  const isPaymentPendingFromQuery = reasonFromQuery === "payment-pending";
  const isInstitutionPaymentPendingFromQuery = reasonFromQuery === "institution-payment-pending";
  const isInstitutionInactiveFromQuery = reasonFromQuery === "institution-plan-inactive";

  const isPlanExpired =
    (!isInstitutionAccount && isExpiredFromQuery) ||
    isTeacherPlanExpired({
      role: user?.role,
      teacherPlanStatus: user?.teacherPlanStatus,
      teacherPlanExpiresAt: user?.teacherPlanExpiresAt,
    });
  const institutionPlanStatus = String(user?.institutionPlanStatus || "").trim().toLowerCase();
  const isInstitutionPaymentPending =
    isInstitutionAccount &&
    (isInstitutionPaymentPendingFromQuery || institutionPlanStatus === "pending_payment");
  const isInstitutionPlanInactive =
    isInstitutionAccount &&
    (isInstitutionInactiveFromQuery || institutionPlanStatus === "inactive");
  const isPaymentPending =
    (!isInstitutionAccount && isPaymentPendingFromQuery) ||
    (user?.requestedRole === "docente" &&
      user?.teacherApprovalStatus === "approved" &&
      String(user?.teacherPlanStatus || "").trim().toLowerCase() ===
        "pending_payment");

  const statusType: StatusType = isRejected
    ? "rejected"
    : isPaymentPending || isInstitutionPaymentPending
      ? "paymentPending"
      : isPlanExpired || isInstitutionPlanInactive
      ? "expired"
      : "pending";

  const statusConfig = STATUS_CONFIG[statusType];
  const StatusIcon = statusConfig.icon;
  const statusTitle =
    isInstitutionAccount && statusType === "paymentPending"
      ? "Your institution account is pending plan activation."
      : isInstitutionAccount && statusType === "expired"
        ? "Institution plan inactive."
      : statusType === "pending" && isInstitutionTeacherRequest
      ? "Your institution is reviewing your teacher access."
      : statusConfig.title;
  const statusDescription =
    isInstitutionAccount && statusType === "paymentPending"
      ? "Complete the institution plan purchase so your workspace can be activated."
      : isInstitutionAccount && statusType === "expired"
        ? "Your institution plan is inactive. Renew or complete payment to unlock the institutional workspace."
      : statusType === "pending" && isInstitutionTeacherRequest
      ? `Your teacher request is waiting for approval from ${institutionRequestLabel}.`
      : statusConfig.description;
  const statusHelperText =
    isInstitutionAccount && statusType === "paymentPending"
      ? "After payment confirmation, the institution dashboard, teacher approvals, and institution-owned courses will be enabled."
      : isInstitutionAccount && statusType === "expired"
        ? "Your institution data stays intact while access is paused."
      : statusType === "pending" && isInstitutionTeacherRequest
      ? "Teacher tools will unlock as soon as your institution admin approves your request."
      : statusConfig.helperText;
  const canEditAfterRejection = !isInstitutionAccount && isRejected && !hasEditedAfterCurrentRejection;
  const canEditRequestDetails = isInstitutionAccount ? true : !hasSavedRequestDetails || canEditAfterRejection;
  const requestDetailsLockedReason = isRejected
    ? "You already used your single edit after rejection. Reapply to continue."
    : "Details are locked after first submission to protect the review process.";

  const requestedAtText = useMemo(() => {
    const rawDate = isInstitutionAccount ? user?.createdAt : user?.teacherRequestedAt || user?.createdAt;
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
  }, [isInstitutionAccount, user?.teacherRequestedAt, user?.createdAt]);

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
    if (isInstitutionAccount) {
      const loaded = paymentInstructionsFromAdmin.trim();
      return (
        loaded ||
        "Admins are still preparing the institution payment instructions."
      );
    }
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
  }, [isInstitutionAccount, paymentInstructionsFromAdmin, user?.teacherPaymentInstructions]);
  const paymentRequestedBy = useMemo(() => {
    if (isInstitutionAccount) {
      const loaded = paymentRequestedByFromAdmin.trim();
      return loaded || "Admin";
    }
    const userValue =
      typeof user?.teacherPaymentRequestedBy === "string"
        ? user.teacherPaymentRequestedBy.trim()
        : "";
    const loaded = paymentRequestedByFromAdmin.trim();
    return loaded || userValue || "Admin";
  }, [isInstitutionAccount, paymentRequestedByFromAdmin, user?.teacherPaymentRequestedBy]);
  const paymentRequestedAtText = useMemo(() => {
    const loaded = paymentRequestedAtFromAdmin;
    const userValue = isInstitutionAccount
      ? null
      : toDateOrNull(user?.teacherPaymentRequestedAt);
    const date = loaded || userValue;
    if (!date) return "Not available";
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [isInstitutionAccount, paymentRequestedAtFromAdmin, user?.teacherPaymentRequestedAt]);

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

        if (isInstitutionAccount) {
          const loadedPlanId =
            typeof merged.institutionRequestedPlanId === "string"
              ? merged.institutionRequestedPlanId
              : typeof merged.institutionPlanName === "string"
                ? merged.institutionPlanName
                : "";
          const loadedPlanName =
            typeof merged.institutionPlanName === "string"
              ? merged.institutionPlanName
              : "";
          const normalizedInstitutionPlan =
            getInstitutionPlanDefinition(loadedPlanId)?.id ||
            INSTITUTION_PLAN_OPTIONS.find((plan) => plan.label === loadedPlanName)?.id ||
            "";
          const loadedCourseLimit = String(
            merged.institutionRequestedCourseLimit ??
              merged.institutionCourseLimit ??
              "",
          ).trim();
          const loadedStudentLimit = String(
            merged.institutionRequestedStudentLimit ??
              merged.institutionStudentLimit ??
              "",
          ).trim();
          const loadedPaymentMethod =
            typeof merged.institutionPaymentMethod === "string"
              ? merged.institutionPaymentMethod
              : "";
          const loadedPlanNotes =
            typeof merged.institutionPlanNotes === "string"
              ? merged.institutionPlanNotes
              : "";
          const loadedPaymentInstructions =
            typeof merged.institutionPaymentInstructions === "string"
              ? merged.institutionPaymentInstructions
              : "";
          const loadedPaymentRequestedBy =
            typeof merged.institutionPaymentRequestedBy === "string"
              ? merged.institutionPaymentRequestedBy
              : "";
          const loadedPaymentRequestedAt = toDateOrNull(
            merged.institutionPaymentRequestedAt,
          );
          const hasInstitutionDetails =
            normalizedInstitutionPlan.trim().length > 0 &&
            Number(loadedCourseLimit) > 0 &&
            Number(loadedStudentLimit) > 0 &&
            loadedPaymentMethod.trim().length > 0;

          setInterestedPlan(normalizedInstitutionPlan);
          setInstitutionRequestedCourseLimit(loadedCourseLimit);
          setInstitutionRequestedStudentLimit(loadedStudentLimit);
          setPaymentMethod(loadedPaymentMethod);
          setInstitutionPlanNotes(loadedPlanNotes);
          setPaymentInstructionsFromAdmin(loadedPaymentInstructions);
          setPaymentRequestedByFromAdmin(loadedPaymentRequestedBy);
          setPaymentRequestedAtFromAdmin(loadedPaymentRequestedAt);
          setHasSavedRequestDetails(hasInstitutionDetails);
          setHasEditedAfterCurrentRejection(false);
          setShowRequestDetailsForm(!hasInstitutionDetails);
          return;
        }

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
        const loadedEditedAfterRejectionAt = toDateOrNull(
          merged.teacherEditedAfterRejectionAt,
        );
        const loadedRejectedAt = toDateOrNull(
          merged.teacherRejectedAt ?? user?.teacherRejectedAt,
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
        const hasEditedAfterRejection =
          !!loadedEditedAfterRejectionAt &&
          (!loadedRejectedAt ||
            loadedEditedAfterRejectionAt.getTime() >= loadedRejectedAt.getTime());

        setHasSavedRequestDetails(loadedHasDetails);
        setHasEditedAfterCurrentRejection(hasEditedAfterRejection);
        setShowRequestDetailsForm(false);
      } catch {
        if (cancelled) return;
        setHasSavedRequestDetails(false);
        setHasEditedAfterCurrentRejection(false);
        setShowRequestDetailsForm(false);
      }
    };

    void loadSavedRequestDetails();

    return () => {
      cancelled = true;
    };
  }, [isInstitutionAccount, user?.id, user?.teacherRejectedAt]);

  const handleReapply = async () => {
    if (!user?.id || isReapplying || isInstitutionAccount) return;
    if (!allowTeacherSelfRequest && !isInstitutionTeacherRequest) {
      setReapplyError(teacherSelfRequestMessage);
      setReapplyMessage("");
      return;
    }

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

      setReapplyMessage(
        isInstitutionTeacherRequest
          ? "Request sent. Redirecting you to your institution review page..."
          : "Request sent. Redirecting you to the review page...",
      );
      window.location.replace("/teacher-approval-waiting");
    } catch {
      setReapplyError("We couldn't send your request right now. Please try again.");
    } finally {
      setIsReapplying(false);
    }
  };

  const handleSaveRequestDetails = async () => {
    if (!user?.id || isSavingRequestDetails) return;

    if (isInstitutionAccount) {
      const planValue = interestedPlan.trim();
      const paymentMethodValue = paymentMethod.trim();
      const notesValue = institutionPlanNotes.trim();
      const selectedInstitutionPlan = getInstitutionPlanDefinition(planValue);
      const isCustomInstitutionPlan = planValue === "institution-custom";
      const quote = getInstitutionPlanQuote({
        planId: planValue,
        courseLimit: institutionRequestedCourseLimit,
        studentLimit: institutionRequestedStudentLimit,
      });
      const courseLimitValue = quote?.courseLimit || 0;
      const studentLimitValue = quote?.studentLimit || 0;

      if (!planValue || !paymentMethodValue) {
        setRequestDetailsError("Please choose a plan and payment method before saving.");
        setRequestDetailsMessage("");
        return;
      }

      if (!selectedInstitutionPlan || !quote) {
        setRequestDetailsError("Please choose a valid institution plan before saving.");
        setRequestDetailsMessage("");
        return;
      }

      if (courseLimitValue <= 0 || studentLimitValue <= 0) {
        setRequestDetailsError("Please enter valid limits for courses and students.");
        setRequestDetailsMessage("");
        return;
      }

      if (isCustomInstitutionPlan && notesValue.length < 10) {
        setRequestDetailsError("Describe the custom institution plan you need (minimum 10 characters).");
        setRequestDetailsMessage("");
        return;
      }

      const planName = selectedInstitutionPlan?.label || "Institution Plan";

      setRequestDetailsError("");
      setRequestDetailsMessage("");
      setIsSavingRequestDetails(true);
      try {
        const payload = {
          institutionApprovalStatus: "pending",
          institutionPlanStatus: "pending_payment",
          institutionRequestedPlanId: planValue,
          institutionPlanName: planName,
          institutionRequestedCourseLimit: courseLimitValue,
          institutionRequestedStudentLimit: studentLimitValue,
          institutionRequestedTeacherLimit: null,
          institutionRequestedPriceCop: quote.priceCop,
          institutionRequestedMonthlyEquivalentCop: quote.monthlyEquivalentCop,
          institutionPlanPriceCop: quote.priceCop,
          institutionPlanMonthlyEquivalentCop: quote.monthlyEquivalentCop,
          institutionCourseLimit: courseLimitValue,
          institutionStudentLimit: studentLimitValue,
          institutionTeacherLimit: null,
          institutionPaymentMethod: paymentMethodValue,
          institutionPlanNotes: notesValue,
          updatedAt: serverTimestamp(),
        };

        await Promise.all([
          setDoc(doc(firebaseDB, "usuarios", user.id), payload, { merge: true }),
          setDoc(doc(firebaseDB, "estudiantes", user.id), payload, { merge: true }),
          setDoc(
            doc(firebaseDB, "instituciones", user.id),
            {
              name: institutionRequestLabel,
              ownerUserId: user.id,
              planStatus: "pending_payment",
              planName,
              priceCop: quote.priceCop,
              monthlyEquivalentCop: quote.monthlyEquivalentCop,
              courseLimit: courseLimitValue,
              studentLimit: studentLimitValue,
              teacherLimit: null,
              institutionPaymentMethod: paymentMethodValue,
              institutionPlanNotes: notesValue,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          ),
        ]);

        setRequestDetailsMessage("Institution request details saved successfully. Admins can now prepare your payment instructions.");
        setHasSavedRequestDetails(true);
        setShowRequestDetailsForm(false);
      } catch {
        setRequestDetailsError("Could not save institution details right now. Please try again.");
      } finally {
        setIsSavingRequestDetails(false);
      }
      return;
    }

    if (hasSavedRequestDetails && !canEditRequestDetails) {
      setRequestDetailsError(requestDetailsLockedReason);
      setRequestDetailsMessage("");
      setShowRequestDetailsForm(false);
      return;
    }

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
        ...(isRejected ? { teacherEditedAfterRejectionAt: serverTimestamp() } : {}),
        updatedAt: serverTimestamp(),
      };

      await Promise.all([
        setDoc(doc(firebaseDB, "usuarios", user.id), payload, { merge: true }),
        setDoc(doc(firebaseDB, "estudiantes", user.id), payload, { merge: true }),
      ]);

      setRequestDetailsMessage("Details saved successfully. Admins can now review this information.");
      setHasSavedRequestDetails(true);
      if (isRejected) {
        setHasEditedAfterCurrentRejection(true);
      }
      setShowRequestDetailsForm(false);
    } catch {
      setRequestDetailsError("Could not save details right now. Please try again.");
    } finally {
      setIsSavingRequestDetails(false);
    }
  };

  const handleInstitutionReactivationRequest = async () => {
    if (!user?.id || !isInstitutionAccount || isRequestingInstitutionReactivation) return;

    setReapplyError("");
    setReapplyMessage("");
    setIsRequestingInstitutionReactivation(true);

    try {
      const payload = {
        role: "institucion",
        institutionApprovalStatus: "pending",
        institutionPlanStatus: "pending_payment",
        institutionPaymentInstructions: null,
        institutionPaymentRequestedAt: null,
        institutionPaymentRequestedBy: null,
        updatedAt: serverTimestamp(),
      };

      await Promise.all([
        setDoc(doc(firebaseDB, "usuarios", user.id), payload, { merge: true }),
        setDoc(doc(firebaseDB, "estudiantes", user.id), payload, { merge: true }),
        setDoc(
          doc(firebaseDB, "instituciones", user.id),
          {
            planStatus: "pending_payment",
            institutionPaymentInstructions: null,
            institutionPaymentRequestedAt: null,
            institutionPaymentRequestedBy: null,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        ),
      ]);

      setReapplyMessage(
        "Institution reactivation request sent. Redirecting you to the payment review page...",
      );
      window.location.replace("/teacher-approval-waiting?reason=institution-payment-pending");
    } catch {
      setReapplyError(
        "We couldn't send the institution reactivation request right now. Please try again.",
      );
    } finally {
      setIsRequestingInstitutionReactivation(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user?.id || isDeletingAccount) return;

    setDeleteAccountError("");
    setIsDeletingAccount(true);

    try {
      await purgeUserDataInSparkMode(user.id, user.email);

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
      } else if (code.includes("permission-denied")) {
        setDeleteAccountError(
          "This account cannot be deleted from here right now. Please contact support if the problem continues.",
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
    if (isInstitutionAccount) {
      return getInstitutionPlanDefinition(value)?.label || "Institution Plan";
    }
    return getTeacherPlanDefinition(value).label;
  }, [interestedPlan, isInstitutionAccount]);

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

  const selectedInstitutionPlan = useMemo(
    () => (isInstitutionAccount ? getInstitutionPlanDefinition(interestedPlan) : null),
    [interestedPlan, isInstitutionAccount],
  );
  const isCustomInstitutionPlanSelected = interestedPlan === "institution-custom";
  const institutionQuote = useMemo(
    () =>
      isInstitutionAccount
        ? getInstitutionPlanQuote({
            planId: interestedPlan,
            courseLimit: institutionRequestedCourseLimit,
            studentLimit: institutionRequestedStudentLimit,
          })
        : null,
    [
      interestedPlan,
      institutionRequestedCourseLimit,
      institutionRequestedStudentLimit,
      isInstitutionAccount,
    ],
  );

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-100 px-4 py-5 sm:px-6 lg:px-8 lg:py-4">
      <div className="pointer-events-none absolute -left-16 top-10 h-44 w-44 rounded-full bg-sky-100/70 blur-[44px]" />
      <div className="pointer-events-none absolute -right-16 bottom-10 h-52 w-52 rounded-full bg-slate-200/60 blur-[52px]" />

      <div className="relative mx-auto w-full max-w-[1080px]">
        <PublicTopNav />
        <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <div className="space-y-4">
            <section className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm lg:p-5">
              <div className="pointer-events-none absolute -left-10 top-0 h-28 w-28 rounded-full bg-sky-200/30 blur-sm" />
              <div className="pointer-events-none absolute -bottom-12 -right-8 h-36 w-36 rounded-full bg-indigo-200/25 blur-sm" />

              <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                    <Sparkles className="h-3.5 w-3.5" />
                    {isInstitutionAccount ? "Institution Account Status" : "Teacher Account Status"}
                  </span>
                  <h1 className="text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                    {statusTitle}
                  </h1>
                  <p className="max-w-3xl text-sm text-slate-700">
                    {statusDescription}
                  </p>
                  <p className="max-w-3xl text-sm text-slate-500">
                    {statusHelperText}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => logout().catch(() => undefined)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200/60 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <article className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <CalendarClock className="h-3.5 w-3.5 text-slate-500" />
                  Request date
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{requestedAtText}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {isInstitutionAccount
                    ? "Date when your institution account was created."
                    : isInstitutionTeacherRequest
                    ? "Date when your institution teacher request was submitted."
                    : "Date when your teacher application was submitted."}
                </p>
              </article>

              <article className={`rounded-xl border p-4 ${statusConfig.containerTone}`}>
                <p className={`inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${statusConfig.textTone}`}>
                  <StatusIcon className="h-3.5 w-3.5" />
                  Current application status
                </p>
                <p className={`mt-1 text-sm font-semibold ${statusConfig.textTone}`}>
                  {statusConfig.statusText}
                </p>
                <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusConfig.badgeTone}`}>
                  {statusType === "pending"
                    ? isInstitutionTeacherRequest
                      ? "Waiting for institution review"
                      : isInstitutionAccount
                        ? "Waiting for payment"
                        : "Waiting for admin review"
                    : statusType === "rejected"
                      ? "Not approved"
                      : statusType === "paymentPending"
                        ? "Approved • waiting for payment"
                        : "Plan payment required"}
                </span>
                <p className="mt-2 text-xs opacity-80">
                  {statusType === "pending"
                    ? isInstitutionTeacherRequest
                      ? `${institutionRequestLabel} needs to approve this request before teacher access is enabled.`
                      : isInstitutionAccount
                        ? "Complete payment to activate the institution workspace."
                        : "Your request is in queue."
                    : statusType === "rejected"
                      ? "You can submit a new request after reviewing the feedback."
                      : statusType === "paymentPending"
                        ? "Your access unlocks right after payment confirmation."
                        : "Access unlocks again once payment is confirmed."}
                </p>
              </article>

              {isRejected && (
                <article className="md:col-span-2 rounded-xl border border-rose-200 bg-rose-50 p-4">
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
                    <span className="font-semibold">Next step:</span>{" "}
                    {isInstitutionTeacherRequest
                      ? "Update your info and send the request again to your institution admin."
                      : "Update your info and submit a new request."}
                  </p>
                </article>
              )}

              {isInstitutionTeacherRequest && statusType === "pending" && (
                <article className="md:col-span-2 rounded-xl border border-sky-200 bg-sky-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                    Institution review
                  </p>
                  <p className="mt-1 text-sm text-sky-900">
                    This request is being reviewed by {institutionRequestLabel}. Once approved, your
                    teacher tools will be enabled under that institution.
                  </p>
                  <p className="mt-2 text-xs text-sky-700/90">
                    <span className="font-semibold">Institution:</span> {institutionRequestLabel}
                  </p>
                </article>
              )}

              {isInstitutionAccount && statusType === "paymentPending" && (
                <article className="md:col-span-2 rounded-xl border border-sky-200 bg-sky-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                    Institution plan activation
                  </p>
                  <p className="mt-1 text-sm text-sky-900">
                    Your institution account was created successfully, but the workspace stays locked until the plan purchase is confirmed.
                  </p>
                  <p className="mt-2 text-xs text-sky-700/90">
                    <span className="font-semibold">Institution:</span> {institutionRequestLabel}
                  </p>
                  <p className="mt-2 text-xs text-sky-700/90">
                    <span className="font-semibold">Instructions:</span> {paymentInstructions}
                  </p>
                  <p className="mt-2 text-xs text-sky-700/90">
                    <span className="font-semibold">Sent on:</span> {paymentRequestedAtText}
                    {paymentRequestedBy ? ` • by ${paymentRequestedBy}` : ""}
                  </p>
                </article>
              )}

              {isInstitutionAccount && statusType === "expired" && (
                <article className="md:col-span-2 rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                    Institution plan status
                  </p>
                  <p className="mt-1 text-sm text-rose-800">
                    Your institution plan is inactive right now. Complete payment or contact support to reactivate the workspace.
                  </p>
                </article>
              )}

              {isPaymentPending && !isRejected && !isInstitutionTeacherRequest && !isInstitutionAccount && (
                <article className="md:col-span-2 rounded-xl border border-sky-200 bg-sky-50 p-4">
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

              {isPlanExpired && !isRejected && !isPaymentPending && !isInstitutionTeacherRequest && !isInstitutionAccount && (
                <article className="md:col-span-2 rounded-xl border border-rose-200 bg-rose-50 p-4">
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

            {isInstitutionAccount ? (
              hasSavedRequestDetails ? (
                <section className="-mt-1 rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-300 bg-white text-emerald-700 shadow-sm">
                        <CheckCircle2 className="h-4 w-4" />
                      </span>
                      Institution request summary saved
                    </p>
                    <span className="inline-flex h-9 items-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-800">
                      Locked for admin review
                    </span>
                  </div>

                  <p className="mt-3 text-xs text-slate-600">
                    The institution request is now locked to prevent plan or capacity changes before the admin reviews payment.
                  </p>

                  <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-700 sm:grid-cols-2">
                    <p className="rounded-lg border border-slate-200/60 bg-white px-2.5 py-1.5">
                      <span className="font-semibold">Plan:</span> {planLabel}
                    </p>
                    <p className="rounded-lg border border-slate-200/60 bg-white px-2.5 py-1.5">
                      <span className="font-semibold">Annual price:</span>{" "}
                      {institutionQuote?.priceCop
                        ? `$${institutionQuote.priceCop.toLocaleString("es-CO")} COP`
                        : "Custom quote"}
                    </p>
                    <p className="rounded-lg border border-slate-200/60 bg-white px-2.5 py-1.5">
                      <span className="font-semibold">Payment method:</span> {paymentMethodLabel}
                    </p>
                    <p className="rounded-lg border border-slate-200/60 bg-white px-2.5 py-1.5">
                      <span className="font-semibold">Requested courses:</span> {institutionRequestedCourseLimit || "0"}
                    </p>
                    <p className="rounded-lg border border-slate-200/60 bg-white px-2.5 py-1.5">
                      <span className="font-semibold">Requested students:</span> {institutionRequestedStudentLimit || "0"}
                    </p>
                    <p className="rounded-lg border border-slate-200/60 bg-white px-2.5 py-1.5">
                      <span className="font-semibold">Teachers:</span> Unlimited
                    </p>
                    <p className="rounded-lg border border-slate-200/60 bg-white px-2.5 py-1.5">
                      <span className="font-semibold">Institution:</span> {institutionRequestLabel}
                    </p>
                  </div>
                  {institutionPlanNotes.trim() ? (
                    <p className="mt-2 rounded-lg border border-slate-200/60 bg-white px-2.5 py-1.5 text-xs text-slate-700">
                      <span className="font-semibold">Notes:</span> {institutionPlanNotes}
                    </p>
                  ) : null}
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
                        {hasSavedRequestDetails
                          ? "Update Institution Plan Request"
                          : "Institution Plan Request"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Choose the plan and capacity your institution needs so the admin can prepare the payment step.
                      </p>
                      <p className="mt-1 text-xs font-semibold text-amber-700">
                        Fill this out before payment confirmation.
                      </p>
                    </div>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/60 bg-white text-slate-600">
                      {showRequestDetailsForm ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </span>
                  </button>

                  {showRequestDetailsForm && (
                    <div className="mt-4 space-y-3 border-t border-slate-200/60 pt-4">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <label className="space-y-1.5">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            1. Institution plan
                          </span>
                          <select
                            value={interestedPlan}
                            onChange={(event) => {
                              const value = event.target.value;
                              const selectedPlan = getInstitutionPlanDefinition(value);
                              setInterestedPlan(value);
                              if (selectedPlan?.courseLimit) {
                                setInstitutionRequestedCourseLimit(String(selectedPlan.courseLimit));
                              }
                              if (selectedPlan?.studentLimit) {
                                setInstitutionRequestedStudentLimit(String(selectedPlan.studentLimit));
                              }
                            }}
                            className="h-10 w-full rounded-xl border border-slate-300/60 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                          >
                            <option value="">Select an institution plan</option>
                            {INSTITUTION_PLAN_OPTIONS.map((plan) => (
                              <option key={plan.id} value={plan.id}>
                                {plan.priceCop
                                  ? `${plan.label} ($${plan.priceCop.toLocaleString("es-CO")} COP / year)`
                                  : plan.label}
                              </option>
                            ))}
                          </select>
                          {!isCustomInstitutionPlanSelected && selectedInstitutionPlan ? (
                            <p className="text-[11px] text-slate-500">
                              Standard plan capacities are fixed and locked to the selected plan.
                            </p>
                          ) : null}
                        </label>

                        <label className="space-y-1.5">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            2. Payment method
                          </span>
                          <select
                            value={paymentMethod}
                            onChange={(event) => setPaymentMethod(event.target.value)}
                            className="h-10 w-full rounded-xl border border-slate-300/60 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                          >
                            <option value="">Select payment method</option>
                            <option value="bre-b">Bre-B</option>
                            <option value="card">Credit Card</option>
                            <option value="bank-transfer-colombia">Bank transfer (Colombia)</option>
                          </select>
                        </label>

                        <label className="space-y-1.5">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            3. Requested courses
                          </span>
                          <input
                            type="number"
                            min="1"
                            value={institutionRequestedCourseLimit}
                            onChange={(event) => setInstitutionRequestedCourseLimit(event.target.value)}
                            disabled={!isCustomInstitutionPlanSelected}
                            className="h-10 w-full rounded-xl border border-slate-300/60 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                            placeholder="25"
                          />
                        </label>

                        <label className="space-y-1.5">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            4. Requested students
                          </span>
                          <input
                            type="number"
                            min="1"
                            value={institutionRequestedStudentLimit}
                            onChange={(event) => setInstitutionRequestedStudentLimit(event.target.value)}
                            disabled={!isCustomInstitutionPlanSelected}
                            className="h-10 w-full rounded-xl border border-slate-300/60 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                            placeholder="500"
                          />
                        </label>

                        <label className="space-y-1.5">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            5. Teacher access
                          </span>
                          <div className="flex h-10 items-center rounded-xl border border-slate-300/60 bg-slate-50 px-3 text-sm font-medium text-slate-700">
                            Unlimited linked teachers included
                          </div>
                        </label>

                        {isCustomInstitutionPlanSelected ? (
                          <div className="space-y-1.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 md:col-span-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                              Estimated payment
                            </span>
                            <p className="text-lg font-extrabold text-emerald-900">
                              {institutionQuote?.priceCop
                                ? `$${institutionQuote.priceCop.toLocaleString("es-CO")} COP`
                                : "Complete the required fields"}
                            </p>
                            <p className="text-xs text-emerald-700">
                              {institutionQuote?.monthlyEquivalentCop
                                ? `Monthly equivalent: $${institutionQuote.monthlyEquivalentCop.toLocaleString("es-CO")} COP`
                                : "The annual estimate will appear here once the request is complete."}
                            </p>
                            <p className="text-xs text-emerald-700">
                              {institutionQuote?.billingPlanId
                                ? `This custom request currently fits the ${institutionQuote.billingPlanLabel} billing band.`
                                : "This estimate is calculated from the requested course and student capacity."}
                            </p>
                          </div>
                        ) : null}

                        <label className="space-y-1.5 md:col-span-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            6. Notes for the admin
                          </span>
                          <textarea
                            value={institutionPlanNotes}
                            onChange={(event) => setInstitutionPlanNotes(event.target.value)}
                            rows={3}
                            className="w-full resize-none rounded-xl border border-slate-300/60 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                            placeholder="Share anything relevant about your institution plan, rollout, or purchasing flow."
                          />
                        </label>
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
                        {isSavingRequestDetails ? "Saving..." : "Save institution request"}
                      </button>
                    </div>
                  )}
                </section>
              )
            ) : null}

            {!isInstitutionAccount && !isInstitutionTeacherRequest && hasSavedRequestDetails && !showRequestDetailsForm ? (
              <section className="-mt-1 rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-300 bg-white text-emerald-700 shadow-sm">
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                    Submission summary sent to admins
                  </p>
                  {canEditAfterRejection && (
                    <button
                      type="button"
                      onClick={() => {
                        setRequestDetailsError("");
                        setRequestDetailsMessage("");
                        setShowRequestDetailsForm(true);
                      }}
                      className="inline-flex h-9 items-center rounded-lg border border-slate-300/60 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Edit details
                    </button>
                  )}
                </div>
                {!canEditAfterRejection && (
                  <p className="mt-3 text-xs font-semibold text-amber-700">
                    Details locked after submission. If rejected, you can edit one time before reapplying.
                  </p>
                )}

                <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-700 sm:grid-cols-2">
                  <p className="rounded-lg border border-slate-200/60 bg-white px-2.5 py-1.5">
                    <span className="font-semibold">Plan:</span>{" "}
                    {needsExtraPlan === "yes" ? "Custom plan request" : planLabel}
                  </p>
                  <p className="rounded-lg border border-slate-200/60 bg-white px-2.5 py-1.5">
                    <span className="font-semibold">Institution:</span>{" "}
                    {institutionName || "Not provided"}
                  </p>
                  <p className="rounded-lg border border-slate-200/60 bg-white px-2.5 py-1.5">
                    <span className="font-semibold">Ownership:</span> {ownershipLabel}
                  </p>
                  <p className="rounded-lg border border-slate-200/60 bg-white px-2.5 py-1.5">
                    <span className="font-semibold">Type:</span> {institutionTypeLabel}
                  </p>
                  <p className="rounded-lg border border-slate-200/60 bg-white px-2.5 py-1.5">
                    <span className="font-semibold">Payment method:</span> {paymentMethodLabel}
                  </p>
                  <p className="rounded-lg border border-slate-200/60 bg-white px-2.5 py-1.5">
                    <span className="font-semibold">Needs custom plan:</span>{" "}
                    {needsExtraPlan === "yes" ? "Yes" : "No"}
                  </p>
                </div>
                {needsExtraPlan === "yes" && (
                  <p className="mt-2 rounded-lg border border-slate-200/60 bg-white px-2.5 py-1.5 text-xs text-slate-700">
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
            ) : !isInstitutionAccount && !isInstitutionTeacherRequest ? (
            <section className="-mt-1 rounded-2xl border border-sky-200/70 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
              <button
                type="button"
                onClick={() => {
                  if (!canEditRequestDetails) {
                    setRequestDetailsError(requestDetailsLockedReason);
                    setRequestDetailsMessage("");
                    return;
                  }
                  setShowRequestDetailsForm((previous) => !previous);
                }}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-sky-300 bg-white text-sky-700 shadow-sm">
                      <Building2 className="h-4 w-4" />
                    </span>
                    {hasSavedRequestDetails
                      ? "Update Institution & Plan Details"
                      : "Institution & Plan Details"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {hasSavedRequestDetails
                      ? "Update your details and save again so admins review the latest information."
                      : "Click to complete the details admins need to evaluate your teacher request."}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-amber-700">
                    {hasSavedRequestDetails
                      ? "Important: save your changes before sending a new request."
                      : "Important: complete this form to improve your chances of approval."}
                  </p>
                </div>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/60 bg-white text-slate-600">
                  {showRequestDetailsForm ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </span>
              </button>

              {showRequestDetailsForm && (
                <div className="mt-4 space-y-3 border-t border-slate-200/60 pt-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        1. Interested plan
                      </span>
                      <select
                        value={interestedPlan}
                        onChange={(event) => setInterestedPlan(event.target.value)}
                        disabled={needsExtraPlan === "yes"}
                        className="h-10 w-full rounded-xl border border-slate-300/60 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
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
                              className="inline-flex items-center rounded-full border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
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
                        className="w-full resize-none rounded-xl border border-slate-300/60 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
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
                        className="h-10 w-full rounded-xl border border-slate-300/60 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
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
                        className="h-10 w-full rounded-xl border border-slate-300/60 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
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
                        className="h-10 w-full rounded-xl border border-slate-300/60 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
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
                        className="h-10 w-full rounded-xl border border-slate-300/60 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
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
                          className="w-full resize-none rounded-xl border border-slate-300/60 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
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
            ) : null}

            <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <h3 className="inline-flex items-center gap-2 text-base font-bold text-slate-900">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-700">
                  <Sparkles className="h-4 w-4" />
                </span>
                What you can do now
              </h3>

              {statusType === "rejected" && (
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-slate-600">
                    Submit a new teacher request when you are ready.
                  </p>
                  {!allowTeacherSelfRequest ? (
                    <p className="rounded-lg border border-slate-200/60 bg-slate-50 px-2.5 py-2 text-xs text-slate-700">
                      {teacherSelfRequestMessage}
                    </p>
                  ) : null}
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
                    {isInstitutionAccount
                      ? "The institution workspace is blocked because the plan is inactive."
                      : "Teacher tools are blocked because your plan expired."}
                  </p>
                </div>
              )}

              {statusType === "paymentPending" && (
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-sky-800">
                    {isInstitutionAccount
                      ? "Complete the institution plan payment to unlock the institutional workspace."
                      : "Your request is approved. Complete payment to re-enable teacher tools."}
                  </p>
                  <p className="text-xs text-sky-700/90">{paymentInstructions}</p>
                  {isInstitutionAccount ? (
                    <p className="text-xs text-sky-700/90">
                      Requested capacity: {institutionRequestedCourseLimit || "0"} courses,{" "}
                      {institutionRequestedStudentLimit || "0"} students, unlimited linked teachers.
                    </p>
                  ) : null}
                </div>
              )}

              {statusType === "pending" && (
                <div className="mt-3 space-y-2">
                  <p className="text-sm text-slate-600">
                    {isInstitutionAccount
                      ? "Complete the institution request details so the admin can send payment instructions."
                      : isInstitutionTeacherRequest
                      ? `${institutionRequestLabel} is reviewing your request.`
                      : "An administrator is reviewing your request."}
                  </p>
                  <p className="text-xs text-slate-500">
                    Typical response target: up to {starterResponseHours} hours. Onboarding access windows are configured for {onboardingMonths} month{onboardingMonths === 1 ? "" : "s"}.
                  </p>
                </div>
              )}

              <div className="mt-4 space-y-3 border-t border-slate-200/60 pt-4">
                {statusType === "rejected" && (
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={handleReapply}
                      disabled={isReapplying || (!allowTeacherSelfRequest && !isInstitutionTeacherRequest)}
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
                    {isInstitutionAccount ? (
                      <button
                        type="button"
                        onClick={handleInstitutionReactivationRequest}
                        disabled={isRequestingInstitutionReactivation}
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-sky-300 bg-white px-4 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <MessageSquare className={`h-4 w-4 ${isRequestingInstitutionReactivation ? "animate-pulse" : ""}`} />
                        {isRequestingInstitutionReactivation
                          ? "Sending request..."
                          : "Reactivate institution plan"}
                      </button>
                    ) : (
                      <a
                        href={`mailto:${supportEmail}?subject=${isInstitutionAccount ? "Institution%20Plan%20Reactivation%20Request" : "Teacher%20Plan%20Reactivation%20Request"}&body=Hello,%20I%20need%20to%20reactivate%20my%20${isInstitutionAccount ? "institution" : "teacher"}%20plan.%20My%20account%20email%20is:%20${user?.email}`}
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-sky-300 bg-white px-4 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
                      >
                        <MessageSquare className="h-4 w-4" />
                        {isInstitutionAccount ? "Reactivate institution plan" : "Reactivate my plan"}
                      </a>
                    )}
                    <p className="text-xs text-slate-500">
                      {isInstitutionAccount
                        ? "This sends the institution request back to the admin payment queue."
                        : "Support replies within 24 business hours."}
                    </p>
                  </div>
                )}

                {statusType === "paymentPending" && (
                  <div className="space-y-1.5">
                    <a
                      href={`mailto:${supportEmail}?subject=${isInstitutionAccount ? "Institution%20Payment%20Confirmation" : "Teacher%20Payment%20Confirmation"}&body=Hello,%20I%20want%20to%20confirm%20${isInstitutionAccount ? "the institution plan" : "my teacher request"}%20payment.%20My%20account%20email%20is:%20${user?.email}`}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-sky-300 bg-white px-4 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
                    >
                      <MessageSquare className="h-4 w-4" />
                      {isInstitutionAccount ? "Confirm institution payment" : "Confirm payment with admin"}
                    </a>
                    <p className="text-xs text-slate-500">
                      {isInstitutionAccount
                        ? "The institution workspace will be enabled right after payment confirmation."
                        : "Access will be enabled right after payment confirmation."}
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
                        className="inline-flex h-9 items-center rounded-lg border border-slate-300/60 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
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

            <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <h3 className="inline-flex items-center gap-2 text-base font-bold text-slate-900">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-700">
                  <Mail className="h-4 w-4" />
                </span>
                Need help?
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Contact the {platformName} team if you need help with review status, payment, or account issues. Current response target: {starterResponseHours} hours.
              </p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a
                  href={`mailto:${supportEmail}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                >
                  <Mail className="h-4 w-4" />
                  {supportEmail}
                </a>
                <a
                  href={`mailto:${contactEmail}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                >
                  <Mail className="h-4 w-4" />
                  {contactEmail}
                </a>
                {normalizedWhatsApp ? (
                  <a
                    href={`https://wa.me/${normalizedWhatsApp}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <MessageSquare className="h-4 w-4" />
                    WhatsApp support
                  </a>
                ) : null}
              </div>
            </section>
          </div>
        </div>
        <PublicFooter summary={`Keep your teacher application moving with one place for review status, payment guidance, onboarding timing, and ${platformName} support contact.`} />
      </div>
    </div>
  );
}
 
