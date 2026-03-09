import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { firebaseDB } from "@/lib/firebase";
import {
  getTeacherPlanDefinition,
  getTeacherPlanExpiryDate,
  type TeacherPlanId,
} from "@/lib/services/teacherPlanService";
import {
  ensureTeacherOnboardingEnrollment,
  getTeacherOnboardingCourse,
} from "@/lib/services/teacherOnboardingService";

export type TeacherApprovalStatus = "pending" | "approved" | "rejected";

export interface TeacherApprovalRequestRecord {
  userId: string;
  email: string;
  name: string;
  idNumber: string;
  whatsApp: string;
  requestedAt: Date | null;
  status: TeacherApprovalStatus;
  rejectionReason?: string;
  rejectedAt?: Date | null;
  rejectedBy?: string;
  requestCount?: number;
  teacherPlanId?: string;
  interestedPlan?: string;
  institutionName?: string;
  institutionOwnership?: string;
  institutionType?: string;
  paymentMethod?: string;
  needsCustomPlan?: boolean;
  customPlanNotes?: string;
  teacherPlanStatus?: string;
  paymentInstructions?: string;
  paymentRequestedAt?: Date | null;
  paymentRequestedBy?: string;
}

const USERS_COLLECTION = "usuarios";
const STUDENTS_COLLECTION = "estudiantes";

const toText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
  }
  return 0;
};

const isPermissionDeniedError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof (error as { code?: unknown }).code === "string" &&
  String((error as { code: string }).code).includes("permission-denied");

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

export async function getPendingTeacherApprovalRequests(): Promise<TeacherApprovalRequestRecord[]> {
  let docsData: Array<{ id: string; data: Record<string, unknown> }> = [];

  try {
    const pendingSnap = await getDocs(
      query(collection(firebaseDB, USERS_COLLECTION), where("teacherApprovalStatus", "==", "pending")),
    );
    docsData = pendingSnap.docs.map((snap) => ({
      id: snap.id,
      data: (snap.data() || {}) as Record<string, unknown>,
    }));
  } catch {
    const fallbackSnap = await getDocs(collection(firebaseDB, USERS_COLLECTION));
    docsData = fallbackSnap.docs.map((snap) => ({
      id: snap.id,
      data: (snap.data() || {}) as Record<string, unknown>,
    }));
  }

  const items = docsData
    .filter(({ data }) => {
      const requestedRole = toText(data.requestedRole).toLowerCase();
      const status = toText(data.teacherApprovalStatus).toLowerCase();
      return requestedRole === "docente" && status === "pending";
    })
    .map(({ id, data }) => ({
      userId: id,
      email: toText(data.email),
      name: toText(data.name) || "User",
      idNumber: toText(data.idNumber),
      whatsApp: toText(data.whatsApp) || toText(data.whatsapp),
      requestedAt: toDate(data.teacherRequestedAt) || toDate(data.createdAt),
      status: "pending" as TeacherApprovalStatus,
    }));

  return items.sort((a, b) => {
    const left = a.requestedAt?.getTime() || Number.MAX_SAFE_INTEGER;
    const right = b.requestedAt?.getTime() || Number.MAX_SAFE_INTEGER;
    return left - right;
  });
}

export async function getTeacherApprovalRequests(): Promise<TeacherApprovalRequestRecord[]> {
  let docsData: Array<{ id: string; data: Record<string, unknown> }> = [];

  try {
    const roleSnap = await getDocs(
      query(collection(firebaseDB, USERS_COLLECTION), where("requestedRole", "==", "docente")),
    );
    docsData = roleSnap.docs.map((snap) => ({
      id: snap.id,
      data: (snap.data() || {}) as Record<string, unknown>,
    }));
  } catch {
    const fallbackSnap = await getDocs(collection(firebaseDB, USERS_COLLECTION));
    docsData = fallbackSnap.docs.map((snap) => ({
      id: snap.id,
      data: (snap.data() || {}) as Record<string, unknown>,
    }));
  }

  const items = docsData
    .filter(({ data }) => {
      const requestedRole = toText(data.requestedRole).toLowerCase();
      const status = toText(data.teacherApprovalStatus).toLowerCase();
      const planStatus = toText(data.teacherPlanStatus).toLowerCase();
      return (
        requestedRole === "docente" &&
        (
          status === "pending" ||
          status === "rejected" ||
          (status === "approved" && planStatus === "pending_payment")
        )
      );
    })
    .map(({ id, data }) => {
      const statusText = toText(data.teacherApprovalStatus).toLowerCase();
      const status: TeacherApprovalStatus =
        statusText === "rejected"
          ? "rejected"
          : statusText === "approved"
            ? "approved"
            : "pending";
      const requestCount = toNumber(data.teacherRequestCount);

      return {
        userId: id,
        email: toText(data.email),
        name: toText(data.name) || "User",
        idNumber: toText(data.idNumber),
        whatsApp: toText(data.whatsApp) || toText(data.whatsapp),
        requestedAt: toDate(data.teacherRequestedAt) || toDate(data.createdAt),
        status,
        rejectionReason:
          status === "rejected" ? toText(data.teacherRejectionReason) : "",
        rejectedAt: status === "rejected" ? toDate(data.teacherRejectedAt) : null,
        rejectedBy:
          status === "rejected" ? toText(data.teacherRejectedBy) : "",
        requestCount: requestCount > 0 ? requestCount : 1,
        teacherPlanId: toText(data.teacherPlanId),
        interestedPlan: toText(data.teacherInterestedPlan),
        institutionName: toText(data.teacherInstitutionName),
        institutionOwnership: toText(data.teacherInstitutionOwnership),
        institutionType: toText(data.teacherInstitutionType),
        paymentMethod: toText(data.teacherPaymentMethod),
        needsCustomPlan: Boolean(data.teacherNeedsCustomPlan),
        customPlanNotes: toText(data.teacherCustomPlanNotes),
        teacherPlanStatus: toText(data.teacherPlanStatus),
        paymentInstructions: toText(data.teacherPaymentInstructions),
        paymentRequestedAt: toDate(data.teacherPaymentRequestedAt),
        paymentRequestedBy: toText(data.teacherPaymentRequestedBy),
      };
    });

  return items.sort((a, b) => {
    if (a.status !== b.status) {
      const order: Record<TeacherApprovalStatus, number> = {
        pending: 0,
        approved: 1,
        rejected: 2,
      };
      return order[a.status] - order[b.status];
    }
    const left = a.requestedAt?.getTime() || 0;
    const right = b.requestedAt?.getTime() || 0;
    return right - left;
  });
}

export async function approveTeacherApprovalRequest(
  userId: string,
  adminEmail: string,
  planId: TeacherPlanId,
): Promise<void> {
  const normalizedAdmin = (adminEmail || "admin").trim().toLowerCase();
  const selectedPlan = getTeacherPlanDefinition(planId);
  const expiresAt = getTeacherPlanExpiryDate(selectedPlan.id);
  const onboardingCourse = await getTeacherOnboardingCourse();
  if (!onboardingCourse) {
    throw new Error(
      "Onboarding course MCT-ONB-101 not found. Create it before approving teachers.",
    );
  }
  const userRef = doc(firebaseDB, USERS_COLLECTION, userId);
  const studentRef = doc(firebaseDB, STUDENTS_COLLECTION, userId);

  await Promise.all([
    setDoc(
      userRef,
      {
        role: "docente",
        requestedRole: "docente",
        teacherApprovalStatus: "approved",
        teacherApprovedAt: serverTimestamp(),
        teacherApprovedBy: normalizedAdmin,
        teacherRejectedAt: null,
        teacherRejectedBy: null,
        teacherRejectionReason: null,
        teacherPlanId: selectedPlan.id,
        teacherPlanName: selectedPlan.label,
        teacherPlanPriceCop: selectedPlan.priceCop,
        teacherPlanDurationMonths: selectedPlan.durationMonths,
        teacherPlanDurationLabel: selectedPlan.durationLabel,
        teacherPlanCourseLimit: selectedPlan.courseLimit,
        teacherPlanStudentLimit: selectedPlan.studentLimit,
        teacherPlanAnalyticsLabel: selectedPlan.analyticsLabel,
        teacherPlanSupportLabel: selectedPlan.supportLabel,
        teacherPlanAssignedAt: serverTimestamp(),
        teacherPlanExpiresAt: expiresAt,
        teacherPlanStatus: "active",
        teacherPaymentInstructions: null,
        teacherPaymentRequestedAt: null,
        teacherPaymentRequestedBy: null,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    ),
    setDoc(
      studentRef,
      {
        role: "docente",
        teacherApprovalStatus: "approved",
        teacherRejectedAt: null,
        teacherRejectedBy: null,
        teacherRejectionReason: null,
        teacherPlanId: selectedPlan.id,
        teacherPlanName: selectedPlan.label,
        teacherPlanPriceCop: selectedPlan.priceCop,
        teacherPlanDurationMonths: selectedPlan.durationMonths,
        teacherPlanDurationLabel: selectedPlan.durationLabel,
        teacherPlanCourseLimit: selectedPlan.courseLimit,
        teacherPlanStudentLimit: selectedPlan.studentLimit,
        teacherPlanAnalyticsLabel: selectedPlan.analyticsLabel,
        teacherPlanSupportLabel: selectedPlan.supportLabel,
        teacherPlanAssignedAt: serverTimestamp(),
        teacherPlanExpiresAt: expiresAt,
        teacherPlanStatus: "active",
        teacherPaymentInstructions: null,
        teacherPaymentRequestedAt: null,
        teacherPaymentRequestedBy: null,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    ),
  ]);

  await ensureTeacherOnboardingEnrollment(userId, onboardingCourse);
}

export async function rejectTeacherApprovalRequest(
  userId: string,
  adminEmail: string,
  rejectionReason: string,
): Promise<void> {
  const normalizedAdmin = (adminEmail || "admin").trim().toLowerCase();
  const normalizedReason = (rejectionReason || "").trim();
  if (normalizedReason.length < 8) {
    throw new Error("Rejection reason must contain at least 8 characters.");
  }

  const userRef = doc(firebaseDB, USERS_COLLECTION, userId);
  const studentRef = doc(firebaseDB, STUDENTS_COLLECTION, userId);
  const userSnap = await getDoc(userRef);
  const currentRole = toText(userSnap.data()?.role).toLowerCase();

  if (currentRole === "docente") {
    throw new Error(
      "Active teacher accounts require manual review and cannot be auto-rejected.",
    );
  }

  // Critical write: request status in usuarios. This is the source of truth for approvals.
  try {
    await setDoc(
      userRef,
      {
        role: "estudiante",
        requestedRole: "docente",
        teacherApprovalStatus: "rejected",
        teacherRejectedAt: serverTimestamp(),
        teacherRejectedBy: normalizedAdmin,
        teacherRejectionReason: normalizedReason,
        teacherPaymentInstructions: null,
        teacherPaymentRequestedAt: null,
        teacherPaymentRequestedBy: null,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    if (!isPermissionDeniedError(error)) throw error;

    // Fallback for stricter rule sets that only allow status updates.
    await setDoc(
      userRef,
      {
        requestedRole: "docente",
        teacherApprovalStatus: "rejected",
        teacherRejectionReason: normalizedReason,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  // Best-effort sync in estudiantes; do not fail the whole action if this write is blocked.
  try {
    await setDoc(
      studentRef,
      {
        role: "estudiante",
        teacherApprovalStatus: "rejected",
        teacherRejectedAt: serverTimestamp(),
        teacherRejectedBy: normalizedAdmin,
        teacherRejectionReason: normalizedReason,
        teacherPaymentInstructions: null,
        teacherPaymentRequestedAt: null,
        teacherPaymentRequestedBy: null,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch {
    // Non-critical; user doc already reflects the final status.
  }
}

export async function setTeacherPaymentPendingRequest(
  userId: string,
  adminEmail: string,
  paymentInstructions: string,
  planId: TeacherPlanId,
): Promise<void> {
  const normalizedAdmin = (adminEmail || "admin").trim().toLowerCase();
  const normalizedInstructions = (paymentInstructions || "").trim();
  if (normalizedInstructions.length < 12) {
    throw new Error("Payment instructions must contain at least 12 characters.");
  }

  const selectedPlan = getTeacherPlanDefinition(planId);
  const userRef = doc(firebaseDB, USERS_COLLECTION, userId);
  const studentRef = doc(firebaseDB, STUDENTS_COLLECTION, userId);

  await Promise.all([
    setDoc(
      userRef,
      {
        role: "docente",
        requestedRole: "docente",
        teacherApprovalStatus: "approved",
        teacherApprovedAt: serverTimestamp(),
        teacherApprovedBy: normalizedAdmin,
        teacherRejectedAt: null,
        teacherRejectedBy: null,
        teacherRejectionReason: null,
        teacherPlanId: selectedPlan.id,
        teacherPlanName: selectedPlan.label,
        teacherPlanPriceCop: selectedPlan.priceCop,
        teacherPlanDurationMonths: selectedPlan.durationMonths,
        teacherPlanDurationLabel: selectedPlan.durationLabel,
        teacherPlanCourseLimit: selectedPlan.courseLimit,
        teacherPlanStudentLimit: selectedPlan.studentLimit,
        teacherPlanAnalyticsLabel: selectedPlan.analyticsLabel,
        teacherPlanSupportLabel: selectedPlan.supportLabel,
        teacherPlanAssignedAt: null,
        teacherPlanExpiresAt: null,
        teacherPlanStatus: "pending_payment",
        teacherPaymentInstructions: normalizedInstructions,
        teacherPaymentRequestedAt: serverTimestamp(),
        teacherPaymentRequestedBy: normalizedAdmin,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    ),
    setDoc(
      studentRef,
      {
        role: "docente",
        teacherApprovalStatus: "approved",
        teacherRejectedAt: null,
        teacherRejectedBy: null,
        teacherRejectionReason: null,
        teacherPlanId: selectedPlan.id,
        teacherPlanName: selectedPlan.label,
        teacherPlanPriceCop: selectedPlan.priceCop,
        teacherPlanDurationMonths: selectedPlan.durationMonths,
        teacherPlanDurationLabel: selectedPlan.durationLabel,
        teacherPlanCourseLimit: selectedPlan.courseLimit,
        teacherPlanStudentLimit: selectedPlan.studentLimit,
        teacherPlanAnalyticsLabel: selectedPlan.analyticsLabel,
        teacherPlanSupportLabel: selectedPlan.supportLabel,
        teacherPlanAssignedAt: null,
        teacherPlanExpiresAt: null,
        teacherPlanStatus: "pending_payment",
        teacherPaymentInstructions: normalizedInstructions,
        teacherPaymentRequestedAt: serverTimestamp(),
        teacherPaymentRequestedBy: normalizedAdmin,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    ),
  ]);
}
