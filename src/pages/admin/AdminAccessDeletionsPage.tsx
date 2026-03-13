import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { appendAdminAuditLog } from "@/lib/services/adminAuditLogService";
import { assertAdminPermission } from "@/lib/services/adminPermissionGuardService";
import {
  getPendingAccountDeletionRequests,
  processAccountDeletionRequest,
  processDueAccountDeletionRequests,
  type AccountDeletionRequestRecord,
} from "@/lib/services/accountDeletionService";

const formatDateTime = (value?: Date | null): string => {
  if (!value) return "Not available";
  return value.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getDueBadgeClassName = (scheduledDeletionAt?: Date | null): string => {
  if (!scheduledDeletionAt) return "border-slate-200 bg-slate-50 text-slate-700";
  const now = Date.now();
  const dueAt = scheduledDeletionAt.getTime();
  if (dueAt <= now) return "border-rose-200 bg-rose-50 text-rose-700";
  if (dueAt - now <= 3 * 24 * 60 * 60 * 1000) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
};

const getDueLabel = (scheduledDeletionAt?: Date | null): string => {
  if (!scheduledDeletionAt) return "No due date";
  const now = Date.now();
  const dueAt = scheduledDeletionAt.getTime();
  if (dueAt <= now) return "Due now";
  const daysLeft = Math.ceil((dueAt - now) / (24 * 60 * 60 * 1000));
  return `Due in ${daysLeft}d`;
};

export default function AdminAccessDeletionsPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<AccountDeletionRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [processingByUserId, setProcessingByUserId] = useState<Record<string, boolean>>({});
  const [processingDueNow, setProcessingDueNow] = useState(false);

  const loadRequests = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await getPendingAccountDeletionRequests();
      setRequests(result);
    } catch {
      setErrorMessage("Could not load account deletion requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRequests();
  }, []);

  const dueNowCount = useMemo(
    () => requests.filter((request) => request.scheduledDeletionAt && request.scheduledDeletionAt.getTime() <= Date.now()).length,
    [requests],
  );
  const teacherRequestsCount = useMemo(
    () => requests.filter((request) => request.role === "docente").length,
    [requests],
  );
  const studentRequestsCount = useMemo(
    () => requests.filter((request) => request.role === "estudiante").length,
    [requests],
  );
  const queueCount = requests.length;

  const handleProcessOne = async (request: AccountDeletionRequestRecord) => {
    setProcessingByUserId((prev) => ({ ...prev, [request.userId]: true }));
    try {
      assertAdminPermission(
        "manageDeletions",
        user?.email,
        "You do not have permission to process account deletions.",
      );
      await processAccountDeletionRequest(request.userId, user?.email || "admin");
      await appendAdminAuditLog({
        actorEmail: user?.email || "admin",
        actorName: user?.name || "Admin",
        action: "Processed deletion request",
        category: "deletion",
        targetType: "account_deletion",
        targetId: request.userId,
        targetLabel: request.name,
        detail: request.email,
      }).catch(() => undefined);
      toast.success(`Deletion processed for ${request.name}.`);
      await loadRequests();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not process deletion request.");
    } finally {
      setProcessingByUserId((prev) => ({ ...prev, [request.userId]: false }));
    }
  };

  const handleProcessDueNow = async () => {
    setProcessingDueNow(true);
    try {
      assertAdminPermission(
        "manageDeletions",
        user?.email,
        "You do not have permission to process due deletion requests.",
      );
      const result = await processDueAccountDeletionRequests(user?.email || "admin");
      await appendAdminAuditLog({
        actorEmail: user?.email || "admin",
        actorName: user?.name || "Admin",
        action: "Processed due deletion queue",
        category: "deletion",
        targetType: "account_deletion_batch",
        targetLabel: "Due now queue",
        detail: `${result.processed} request(s) processed`,
      }).catch(() => undefined);
      toast.success(`Processed ${result.processed} due deletion request(s).`);
      await loadRequests();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not process due deletion requests.");
    } finally {
      setProcessingDueNow(false);
    }
  };

  return (
    <DashboardLayout contentClassName="pt-0 lg:pt-1">
      <div className="relative overflow-x-hidden">
        <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
        <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />

        <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <section className="space-y-4">
            <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
              <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-sky-200/35" />
              <div className="pointer-events-none absolute -right-24 -bottom-24 h-64 w-64 rounded-full bg-indigo-200/35" />

              <div className="relative space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                  <Trash2 className="h-3.5 w-3.5" />
                  Admin Module
                </div>

                <div className="min-w-0">
                  <h1 className="mt-1 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                    Deletion Requests
                  </h1>
                  <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                    Account removal control. Review scheduled removals and execute owner-only deletion actions.
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                        <ShieldCheck className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{queueCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Pending queue</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{dueNowCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Due now</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                        <Users className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{teacherRequestsCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Teacher requests</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                        <UserCheck className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{studentRequestsCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Student requests</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Deletion Queue</p>
                  <p className="text-xs text-slate-500">Review and process account removal requests.</p>
                </div>
                <button
                  type="button"
                  disabled={processingDueNow || dueNowCount === 0}
                  onClick={() => void handleProcessDueNow()}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {processingDueNow ? "Processing..." : "Process due now"}
                </button>
              </div>

              {loading ? (
                <div className="flex min-h-[260px] items-center justify-center">
                  <div className="space-y-2 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
                    <p className="text-base font-semibold text-slate-900">Loading deletion queue</p>
                    <p className="text-sm text-slate-600">Preparing account removal requests</p>
                  </div>
                </div>
              ) : errorMessage ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                  <AlertTriangle className="mx-auto h-9 w-9 text-slate-400" />
                  <p className="mt-2 text-sm font-medium text-slate-700">{errorMessage}</p>
                  <button
                    type="button"
                    onClick={() => void loadRequests()}
                    className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Retry
                  </button>
                </div>
              ) : requests.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                  <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" />
                  <p className="mt-2 text-sm font-medium text-slate-700">No pending deletion requests</p>
                  <p className="text-xs text-slate-500">Queue is clear. New requests will appear here.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {requests.map((request) => {
                    const isProcessing = Boolean(processingByUserId[request.userId]);
                    return (
                      <article
                        key={request.userId}
                        className="rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-slate-300 hover:bg-slate-50"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-rose-100">
                                <Trash2 className="h-3.5 w-3.5 text-rose-700" />
                              </div>
                              <p className="truncate text-sm font-semibold text-slate-900">{request.name}</p>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getDueBadgeClassName(request.scheduledDeletionAt)}`}
                              >
                                {getDueLabel(request.scheduledDeletionAt)}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-xs text-slate-600">{request.email || "No email"}</p>
                            <div className="mt-1 grid grid-cols-1 gap-1 text-xs text-slate-500 sm:grid-cols-3">
                              <p>
                                Role:{" "}
                                <span className="font-semibold text-slate-700">
                                  {request.role === "docente" ? "Teacher" : "Student"}
                                </span>
                              </p>
                              <p>
                                Requested:{" "}
                                <span className="font-semibold text-slate-700">{formatDateTime(request.requestedAt)}</span>
                              </p>
                              <p>
                                Scheduled:{" "}
                                <span className="font-semibold text-slate-700">{formatDateTime(request.scheduledDeletionAt)}</span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => void handleProcessOne(request)}
                              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isProcessing ? "Processing..." : "Delete Now"}
                            </button>
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
    </DashboardLayout>
  );
}
