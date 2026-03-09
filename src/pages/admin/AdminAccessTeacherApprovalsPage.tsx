import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, MessageSquare } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { notificationService } from "@/lib/services/notificationService";
import {
  approveTeacherApprovalRequest,
  getTeacherApprovalRequests,
  rejectTeacherApprovalRequest,
  setTeacherPaymentPendingRequest,
  type TeacherApprovalRequestRecord,
} from "@/lib/services/teacherApprovalService";
import {
  DEFAULT_TEACHER_PLAN_ID,
  TEACHER_PLAN_OPTIONS,
  getTeacherPlanDefinition,
  resolveTeacherPlanId,
  type TeacherPlanId,
} from "@/lib/services/teacherPlanService";
import {
  getOwnerAdminEmail,
  isOwnerAdminEmail,
  normalizeAdminEmail,
} from "@/lib/services/adminAccessService";
import { AdminWorkspaceShell } from "@/pages/admin/components/AdminWorkspaceShell";
import { useAdminWorkspaceCounts } from "@/pages/admin/hooks/useAdminWorkspaceCounts";
import { AdminSectionHeader } from "@/pages/admin/components/common/AdminSectionHeader";
import { AdminLoadingState } from "@/pages/admin/components/common/AdminLoadingState";
import { AdminEmptyState } from "@/pages/admin/components/common/AdminEmptyState";

const DEFAULT_REJECTION_REASON = "The request did not meet the current verification criteria.";
const DEFAULT_PAYMENT_INSTRUCTIONS =
  "Your request is approved and now pending payment. Please contact rcroman20@gmail.com to receive the payment steps and confirmation.";

export default function AdminAccessTeacherApprovalsPage() {
  const { user } = useAuth();
  const { counts, refreshCounts } = useAdminWorkspaceCounts();
  const [teacherApprovalRequests, setTeacherApprovalRequests] = useState<TeacherApprovalRequestRecord[]>([]);
  const [teacherPlanSelections, setTeacherPlanSelections] = useState<Record<string, TeacherPlanId>>({});
  const [loadingTeacherApprovals, setLoadingTeacherApprovals] = useState(false);
  const [processingTeacherRequestId, setProcessingTeacherRequestId] = useState<string | null>(null);
  const [teacherApprovalTab, setTeacherApprovalTab] = useState<"all" | "pending" | "rejected">("all");
  const [rejectModalRequest, setRejectModalRequest] = useState<TeacherApprovalRequestRecord | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState(DEFAULT_REJECTION_REASON);
  const [rejectionReasonError, setRejectionReasonError] = useState("");
  const [paymentModalRequest, setPaymentModalRequest] = useState<TeacherApprovalRequestRecord | null>(null);
  const [paymentInstructionsInput, setPaymentInstructionsInput] = useState(DEFAULT_PAYMENT_INSTRUCTIONS);
  const [paymentInstructionsError, setPaymentInstructionsError] = useState("");

  const ownerEmail = getOwnerAdminEmail();
  const normalizedUserEmail = normalizeAdminEmail(user?.email);
  const canModerateTeacherApprovals = isOwnerAdminEmail(user?.email);

  const pendingTeacherApprovalRequests = useMemo(
    () =>
      teacherApprovalRequests.filter(
        (request) =>
          request.status === "pending" ||
          (request.status === "approved" && request.teacherPlanStatus === "pending_payment"),
      ),
    [teacherApprovalRequests],
  );
  const rejectedTeacherApprovalRequests = useMemo(
    () => teacherApprovalRequests.filter((request) => request.status === "rejected"),
    [teacherApprovalRequests],
  );
  const visibleTeacherApprovalRequests = useMemo(() => {
    if (teacherApprovalTab === "pending") return pendingTeacherApprovalRequests;
    if (teacherApprovalTab === "rejected") return rejectedTeacherApprovalRequests;
    return teacherApprovalRequests;
  }, [
    pendingTeacherApprovalRequests,
    rejectedTeacherApprovalRequests,
    teacherApprovalRequests,
    teacherApprovalTab,
  ]);

  const loadTeacherApprovalRequests = async () => {
    setLoadingTeacherApprovals(true);
    try {
      const requests = await getTeacherApprovalRequests();
      setTeacherApprovalRequests(requests);
      setTeacherPlanSelections((previous) => {
        const next = { ...previous };
        for (const request of requests) {
          if (request.status === "rejected") continue;
          const normalizedPlan = resolveTeacherPlanId(request.teacherPlanId) || DEFAULT_TEACHER_PLAN_ID;
          if (!next[request.userId]) next[request.userId] = normalizedPlan;
        }
        return next;
      });
    } catch {
      toast.error("Could not load teacher approval requests.");
    } finally {
      setLoadingTeacherApprovals(false);
    }
  };

  useEffect(() => {
    void loadTeacherApprovalRequests();
  }, []);

  const handleApproveTeacher = async (
    request: TeacherApprovalRequestRecord,
    selectedPlanId: TeacherPlanId,
  ) => {
    if (!canModerateTeacherApprovals) {
      toast.error(`Only ${ownerEmail} can approve teacher requests.`);
      return;
    }
    if (!normalizedUserEmail) return;
    setProcessingTeacherRequestId(request.userId);
    try {
      const selectedPlan = getTeacherPlanDefinition(selectedPlanId);
      await approveTeacherApprovalRequest(request.userId, normalizedUserEmail, selectedPlan.id);
      try {
        await notificationService.createNotification(request.userId, {
          title: "Teacher request approved",
          message: `Your teacher access was approved with the ${selectedPlan.label} plan (${selectedPlan.durationLabel}).`,
          type: "success",
          link: "/teacher",
          dedupeKey: `teacher-request-approved:${request.userId}:${Date.now()}`,
        });
      } catch {
        toast.warning("Teacher approved, but the user notification could not be sent.");
      }
      toast.success(`${request.name} approved with ${selectedPlan.label} plan.`);
      await Promise.all([loadTeacherApprovalRequests(), refreshCounts()]);
    } catch (error: any) {
      const reason =
        typeof error?.message === "string" && error.message.trim().length > 0
          ? error.message
          : "Could not approve teacher request.";
      toast.error(reason);
    } finally {
      setProcessingTeacherRequestId(null);
    }
  };

  const handleRejectTeacher = async (
    request: TeacherApprovalRequestRecord,
    rejectionReason: string,
  ) => {
    if (!canModerateTeacherApprovals) {
      toast.error(`Only ${ownerEmail} can reject teacher requests.`);
      return;
    }
    if (!normalizedUserEmail) return;

    setProcessingTeacherRequestId(request.userId);
    try {
      await rejectTeacherApprovalRequest(request.userId, normalizedUserEmail, rejectionReason);
      try {
        const rejectedAtLabel = new Date().toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        await notificationService.createNotification(request.userId, {
          title: "Teacher request rejected",
          message: `Your teacher request was rejected on ${rejectedAtLabel}. Reason: ${rejectionReason}`,
          type: "warning",
          link: "/teacher-approval-rejected",
          dedupeKey: `teacher-request-rejected:${request.userId}:${Date.now()}`,
        });
      } catch {
        toast.warning("Request was rejected, but the user notification could not be sent.");
      }

      toast.success(`Teacher request rejected for ${request.name}.`);
      setRejectModalRequest(null);
      await Promise.all([loadTeacherApprovalRequests(), refreshCounts()]);
    } catch (error: any) {
      const reason =
        typeof error?.message === "string" && error.message.trim().length > 0
          ? error.message
          : "Could not reject teacher request.";
      toast.error(reason);
    } finally {
      setProcessingTeacherRequestId(null);
    }
  };

  const handlePaymentPendingTeacher = async (
    request: TeacherApprovalRequestRecord,
    paymentInstructions: string,
    selectedPlanId: TeacherPlanId,
  ) => {
    if (!canModerateTeacherApprovals) {
      toast.error(`Only ${ownerEmail} can send payment instructions.`);
      return;
    }
    if (!normalizedUserEmail) return;
    setProcessingTeacherRequestId(request.userId);
    try {
      const selectedPlan = getTeacherPlanDefinition(selectedPlanId);
      await setTeacherPaymentPendingRequest(
        request.userId,
        normalizedUserEmail,
        paymentInstructions,
        selectedPlan.id,
      );
      try {
        await notificationService.createNotification(request.userId, {
          title: "Teacher request approved (payment pending)",
          message: `Your request was approved with ${selectedPlan.label}. Payment is required before access is enabled. Check your instructions in the approval waiting page.`,
          type: "warning",
          link: "/teacher-approval-waiting?reason=payment-pending",
          dedupeKey: `teacher-request-payment-pending:${request.userId}:${Date.now()}`,
        });
      } catch {
        toast.warning("Payment pending saved, but user notification could not be sent.");
      }
      toast.success(`Payment instructions saved for ${request.name}.`);
      setPaymentModalRequest(null);
      await Promise.all([loadTeacherApprovalRequests(), refreshCounts()]);
    } catch (error: any) {
      const reason =
        typeof error?.message === "string" && error.message.trim().length > 0
          ? error.message
          : "Could not save payment instructions.";
      toast.error(reason);
    } finally {
      setProcessingTeacherRequestId(null);
    }
  };

  return (
    <DashboardLayout contentClassName="pt-0 lg:pt-1">
      <AdminWorkspaceShell activeTab="teacherApprovals" counts={counts}>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <AdminSectionHeader
            icon={BadgeCheck}
            iconClassName="border-violet-200 bg-violet-50 text-violet-700"
            title="Teacher Approval Requests"
            description="Teachers must be approved here before teacher features are enabled."
          />

          {!canModerateTeacherApprovals && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              You can view requests, but only <span className="font-semibold">{ownerEmail}</span> can approve or reject them.
            </div>
          )}

          <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-1.5">
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              {[
                ["all", "All", teacherApprovalRequests.length],
                ["pending", "Pending", pendingTeacherApprovalRequests.length],
                ["rejected", "Rejected", rejectedTeacherApprovalRequests.length],
              ].map(([key, label, total]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTeacherApprovalTab(key as "all" | "pending" | "rejected")}
                  className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition ${
                    teacherApprovalTab === key
                      ? key === "rejected"
                        ? "border-rose-300 bg-rose-50 text-rose-800"
                        : key === "pending"
                          ? "border-amber-300 bg-amber-50 text-amber-800"
                          : "border-violet-300 bg-violet-50 text-violet-800"
                      : "border-transparent bg-white text-slate-600 hover:border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {label}
                  <span className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] leading-none text-slate-600">
                    {total}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {loadingTeacherApprovals ? (
            <AdminLoadingState message="Loading requests..." />
          ) : visibleTeacherApprovalRequests.length === 0 ? (
            <AdminEmptyState message="No teacher requests for this filter." />
          ) : (
            <div className="space-y-2">
              {visibleTeacherApprovalRequests.map((request) => {
                const isProcessing = processingTeacherRequestId === request.userId;
                const selectedPlanId = teacherPlanSelections[request.userId] || DEFAULT_TEACHER_PLAN_ID;
                const selectedPlan = getTeacherPlanDefinition(selectedPlanId);
                const isRejectedRequest = request.status === "rejected";
                const isPaymentPendingRequest =
                  request.status === "approved" && request.teacherPlanStatus === "pending_payment";
                const requestCount = request.requestCount || 1;
                const requestedAtText = request.requestedAt
                  ? request.requestedAt.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Unknown date";

                return (
                  <div key={request.userId} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{request.name}</p>
                        <p className="text-xs text-slate-600">{request.email}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                            isRejectedRequest
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : isPaymentPendingRequest
                                ? "border-sky-200 bg-sky-50 text-sky-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                          }`}
                        >
                          {isRejectedRequest
                            ? "Rejected"
                            : isPaymentPendingRequest
                              ? "Approved • Payment pending"
                              : "Pending"}
                        </span>
                        {requestCount > 1 && (
                          <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                            Repeated: {requestCount} attempts
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-600 sm:grid-cols-4">
                      <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">ID: {request.idNumber || "No ID"}</p>
                      <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">WhatsApp: {request.whatsApp || "No number"}</p>
                      <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">Requested: {requestedAtText}</p>
                      <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">Attempts: {requestCount}</p>
                    </div>

                    {isRejectedRequest ? (
                      <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">
                        <p>
                          <span className="font-semibold">Reason:</span>{" "}
                          {request.rejectionReason || "No reason provided."}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50 p-2.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">Assign Teacher Plan</p>
                          <div className="mt-2 grid grid-cols-1 gap-1.5 md:grid-cols-3">
                            {TEACHER_PLAN_OPTIONS.map((plan) => {
                              const selected = selectedPlanId === plan.id;
                              return (
                                <button
                                  key={plan.id}
                                  type="button"
                                  onClick={() =>
                                    setTeacherPlanSelections((previous) => ({
                                      ...previous,
                                      [request.userId]: plan.id,
                                    }))
                                  }
                                  className={`rounded-lg border px-2 py-2 text-left transition ${
                                    selected
                                      ? "border-sky-400 bg-white shadow-sm"
                                      : "border-sky-200 bg-white/70 hover:border-sky-300"
                                  }`}
                                >
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{plan.label}</p>
                                  <p className="mt-0.5 text-sm font-bold text-slate-900">
                                    ${plan.priceCop.toLocaleString("es-CO")}
                                  </p>
                                  <p className="text-[11px] text-slate-600">
                                    {plan.courseLimit} courses / {plan.studentLimit} students
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handleApproveTeacher(request, selectedPlan.id)}
                            disabled={isProcessing || !canModerateTeacherApprovals}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <BadgeCheck className="h-3.5 w-3.5" />
                            {isProcessing ? "Processing..." : "Approve with plan"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPaymentModalRequest(request);
                              setPaymentInstructionsInput(DEFAULT_PAYMENT_INSTRUCTIONS);
                              setPaymentInstructionsError("");
                            }}
                            disabled={isProcessing || !canModerateTeacherApprovals}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-sky-300 bg-white px-2.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            Payment pending
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectModalRequest(request);
                              setRejectionReasonInput(DEFAULT_REJECTION_REASON);
                              setRejectionReasonError("");
                            }}
                            disabled={isProcessing || !canModerateTeacherApprovals}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Reject
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {rejectModalRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
            <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-xl lg:p-5">
              <h3 className="text-base font-bold text-slate-900">Reject Teacher Request</h3>
              <p className="mt-1 text-sm text-slate-600">
                Add a clear reason. This will be shown to{" "}
                <span className="font-semibold text-slate-800">{rejectModalRequest.name}</span>.
              </p>
              <label className="mt-3 block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rejection reason</span>
                <textarea
                  value={rejectionReasonInput}
                  onChange={(event) => {
                    setRejectionReasonInput(event.target.value);
                    if (rejectionReasonError) setRejectionReasonError("");
                  }}
                  rows={4}
                  className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                />
              </label>
              {rejectionReasonError && <p className="mt-2 text-xs font-semibold text-rose-700">{rejectionReasonError}</p>}
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectModalRequest(null)}
                  disabled={processingTeacherRequestId === rejectModalRequest.userId}
                  className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const normalizedReason = rejectionReasonInput.trim();
                    if (normalizedReason.length < 8) {
                      setRejectionReasonError("Please provide a clear rejection reason (minimum 8 characters).");
                      return;
                    }
                    void handleRejectTeacher(rejectModalRequest, normalizedReason);
                  }}
                  disabled={processingTeacherRequestId === rejectModalRequest.userId}
                  className="inline-flex h-9 items-center rounded-lg border border-rose-300 bg-rose-50 px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {processingTeacherRequestId === rejectModalRequest.userId ? "Rejecting..." : "Confirm reject"}
                </button>
              </div>
            </div>
          </div>
        )}

        {paymentModalRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
            <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-xl lg:p-5">
              <h3 className="text-base font-bold text-slate-900">Approve and Request Payment</h3>
              <p className="mt-1 text-sm text-slate-600">
                Write payment instructions for{" "}
                <span className="font-semibold text-slate-800">{paymentModalRequest.name}</span>.
              </p>
              <label className="mt-3 block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment instructions</span>
                <textarea
                  value={paymentInstructionsInput}
                  onChange={(event) => {
                    setPaymentInstructionsInput(event.target.value);
                    if (paymentInstructionsError) setPaymentInstructionsError("");
                  }}
                  rows={5}
                  className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                />
              </label>
              {paymentInstructionsError && (
                <p className="mt-2 text-xs font-semibold text-rose-700">{paymentInstructionsError}</p>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentModalRequest(null)}
                  disabled={processingTeacherRequestId === paymentModalRequest.userId}
                  className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const normalizedInstructions = paymentInstructionsInput.trim();
                    if (normalizedInstructions.length < 12) {
                      setPaymentInstructionsError(
                        "Please provide clear payment instructions (minimum 12 characters).",
                      );
                      return;
                    }
                    const selectedPlanId =
                      teacherPlanSelections[paymentModalRequest.userId] || DEFAULT_TEACHER_PLAN_ID;
                    void handlePaymentPendingTeacher(paymentModalRequest, normalizedInstructions, selectedPlanId);
                  }}
                  disabled={processingTeacherRequestId === paymentModalRequest.userId}
                  className="inline-flex h-9 items-center rounded-lg border border-sky-300 bg-sky-50 px-3 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {processingTeacherRequestId === paymentModalRequest.userId ? "Saving..." : "Save instructions"}
                </button>
              </div>
            </div>
          </div>
        )}
      </AdminWorkspaceShell>
    </DashboardLayout>
  );
}
