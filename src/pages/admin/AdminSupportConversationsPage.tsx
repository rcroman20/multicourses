import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Archive,
  Building2,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { appendAdminAuditLog } from "@/lib/services/adminAuditLogService";
import { assertAdminPermission } from "@/lib/services/adminPermissionGuardService";
import {
  archiveContactMessage,
  deleteContactMessage,
  getContactMessages,
  markContactMessageResolved,
  restoreContactMessage,
  type ContactMessageRecord,
} from "@/lib/services/contactMessageService";
import {
  archivePricingContactRequest,
  deletePricingContactRequest,
  getPricingContactRequests,
  markPricingContactRequestResolved,
  restorePricingContactRequest,
  type PricingContactRequestRecord,
} from "@/lib/services/pricingContactService";
import { getPendingTeacherApprovalRequests } from "@/lib/services/teacherApprovalService";
import { getPendingAccountDeletionRequests } from "@/lib/services/accountDeletionService";

type SupportConversationItem =
  | ({ source: "contact" } & ContactMessageRecord)
  | ({ source: "pricing" } & PricingContactRequestRecord);

type SupportConversationThread = {
  key: string;
  email: string;
  name: string;
  institution: string;
  items: SupportConversationItem[];
  unresolvedCount: number;
  latestAt: Date | null;
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

const toDateValue = (item: SupportConversationItem): Date | null => item.createdAt;

const getItemInstitution = (item: SupportConversationItem): string =>
  item.source === "contact"
    ? item.institution || "No institution"
    : item.institutionName || "No institution";

const buildThreads = (
  contactMessages: ContactMessageRecord[],
  pricingRequests: PricingContactRequestRecord[],
  includeArchived: boolean,
): SupportConversationThread[] => {
  const grouped = new Map<string, SupportConversationThread>();
  const items: SupportConversationItem[] = [
    ...contactMessages.map((item) => ({ ...item, source: "contact" as const })),
    ...pricingRequests.map((item) => ({ ...item, source: "pricing" as const })),
  ];

  items.forEach((item) => {
    const isArchived = Boolean(item.archived);
    if (!includeArchived && isArchived) return;

    const email = item.email.trim().toLowerCase();
    const key = email || `${item.source}:${item.id}`;
    const institution = getItemInstitution(item);
    const current: SupportConversationThread =
      grouped.get(key) || {
        key,
        email,
        name: item.name || "Unknown contact",
        institution,
        items: [] as SupportConversationItem[],
        unresolvedCount: 0,
        latestAt: null,
      };

    current.items.push(item);
    if (item.status === "new" && !isArchived) current.unresolvedCount += 1;
    const createdAt = toDateValue(item);
    if (!current.latestAt || (createdAt?.getTime() || 0) > current.latestAt.getTime()) {
      current.latestAt = createdAt;
    }
    grouped.set(key, current);
  });

  return Array.from(grouped.values())
    .map((thread) => ({
      ...thread,
      items: [...thread.items].sort(
        (left, right) =>
          (toDateValue(right)?.getTime() || 0) - (toDateValue(left)?.getTime() || 0),
      ),
    }))
    .sort(
      (left, right) =>
        (right.latestAt?.getTime() || 0) - (left.latestAt?.getTime() || 0),
    );
};

export default function AdminSupportConversationsPage() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<SupportConversationThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedThreadKey, setSelectedThreadKey] = useState("");
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [pendingDeletionsCount, setPendingDeletionsCount] = useState(0);
  const [processingByActionKey, setProcessingByActionKey] = useState<Record<string, boolean>>({});

  const loadThreads = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setErrorMessage("");
      try {
        const [contactResult, pricingResult, approvalsResult, deletionsResult] =
          await Promise.allSettled([
            getContactMessages(),
            getPricingContactRequests(),
            getPendingTeacherApprovalRequests(),
            getPendingAccountDeletionRequests(),
          ]);

        const contactMessages: ContactMessageRecord[] =
          contactResult.status === "fulfilled" ? contactResult.value : [];
        const pricingRequests: PricingContactRequestRecord[] =
          pricingResult.status === "fulfilled" ? pricingResult.value : [];

        setPendingApprovalsCount(
          approvalsResult.status === "fulfilled" ? approvalsResult.value.length : 0,
        );
        setPendingDeletionsCount(
          deletionsResult.status === "fulfilled" ? deletionsResult.value.length : 0,
        );

        if (
          contactResult.status === "rejected" &&
          pricingResult.status === "rejected"
        ) {
          setThreads([]);
          setSelectedThreadKey("");
          setErrorMessage("Could not load support conversations.");
          return;
        }

        if (
          contactResult.status === "rejected" ||
          pricingResult.status === "rejected"
        ) {
          setErrorMessage("Some conversation sources could not be loaded.");
        }

      const nextThreads: SupportConversationThread[] = buildThreads(
        contactMessages,
        pricingRequests,
        showArchived,
      );
        setThreads(nextThreads);
        setSelectedThreadKey((prev) =>
          nextThreads.some((thread) => thread.key === prev)
            ? prev
            : nextThreads[0]?.key || "",
        );
      } catch {
        setThreads([]);
        setSelectedThreadKey("");
        setErrorMessage("Could not load support conversations.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [showArchived],
  );

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const filteredThreads: SupportConversationThread[] = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return threads;
    return threads.filter(
      (thread) =>
        thread.name.toLowerCase().includes(term) ||
        thread.email.toLowerCase().includes(term) ||
        thread.institution.toLowerCase().includes(term),
    );
  }, [searchTerm, threads]);

  const selectedThread: SupportConversationThread | null =
    filteredThreads.find((thread) => thread.key === selectedThreadKey) ||
    filteredThreads[0] ||
    null;

  const totalUnresolved = useMemo(
    () => threads.reduce((sum, thread) => sum + thread.unresolvedCount, 0),
    [threads],
  );

  const totalArchived = useMemo(
    () =>
      threads.reduce(
        (sum, thread) => sum + thread.items.filter((item) => Boolean(item.archived)).length,
        0,
      ),
    [threads],
  );

  const withActionLock = async (
    action: "resolve" | "archive" | "restore" | "delete",
    item: SupportConversationItem,
    callback: () => Promise<void>,
  ) => {
    const actionKey = `${action}:${item.source}:${item.id}`;
    setProcessingByActionKey((prev) => ({ ...prev, [actionKey]: true }));
    try {
      await callback();
    } finally {
      setProcessingByActionKey((prev) => ({ ...prev, [actionKey]: false }));
    }
  };

  const resolveItem = async (item: SupportConversationItem) => {
    if (item.status !== "new" || item.archived) return;

    await withActionLock("resolve", item, async () => {
      assertAdminPermission(
        "manageInbox",
        user?.email,
        "You do not have permission to resolve inbox items.",
      );

      const actor = user?.email || "admin";
      if (item.source === "contact") {
        await markContactMessageResolved(item.id, actor);
      } else {
        await markPricingContactRequestResolved(item.id, actor);
      }

      await appendAdminAuditLog({
        actorEmail: actor,
        actorName: user?.name || "Admin",
        action: "Resolved support inbox item",
        category: "inbox",
        targetType: item.source,
        targetId: item.id,
        targetLabel:
          item.source === "contact" ? item.subject : "Pricing and plan request",
        detail: `${item.name} • ${item.email}`,
      }).catch(() => undefined);

      await loadThreads(true);
      toast.success("Message marked as resolved.");
    }).catch((error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not update conversation status.",
      );
    });
  };

  const archiveItem = async (item: SupportConversationItem) => {
    if (item.archived) return;

    await withActionLock("archive", item, async () => {
      assertAdminPermission(
        "manageInbox",
        user?.email,
        "You do not have permission to archive inbox items.",
      );

      const actor = user?.email || "admin";
      if (item.source === "contact") {
        await archiveContactMessage(item.id, actor);
      } else {
        await archivePricingContactRequest(item.id, actor);
      }

      await appendAdminAuditLog({
        actorEmail: actor,
        actorName: user?.name || "Admin",
        action: "Archived support inbox item",
        category: "inbox",
        targetType: item.source,
        targetId: item.id,
        targetLabel:
          item.source === "contact" ? item.subject : "Pricing and plan request",
        detail: `${item.name} • ${item.email}`,
      }).catch(() => undefined);

      await loadThreads(true);
      toast.success("Message archived.");
    }).catch((error) => {
      toast.error(error instanceof Error ? error.message : "Could not archive message.");
    });
  };

  const restoreItem = async (item: SupportConversationItem) => {
    if (!item.archived) return;

    await withActionLock("restore", item, async () => {
      assertAdminPermission(
        "manageInbox",
        user?.email,
        "You do not have permission to restore inbox items.",
      );

      const actor = user?.email || "admin";
      if (item.source === "contact") {
        await restoreContactMessage(item.id);
      } else {
        await restorePricingContactRequest(item.id);
      }

      await appendAdminAuditLog({
        actorEmail: actor,
        actorName: user?.name || "Admin",
        action: "Restored support inbox item",
        category: "inbox",
        targetType: item.source,
        targetId: item.id,
        targetLabel:
          item.source === "contact" ? item.subject : "Pricing and plan request",
        detail: `${item.name} • ${item.email}`,
      }).catch(() => undefined);

      await loadThreads(true);
      toast.success("Message restored.");
    }).catch((error) => {
      toast.error(error instanceof Error ? error.message : "Could not restore message.");
    });
  };

  const deleteItem = async (item: SupportConversationItem) => {
    const confirmed = window.confirm(
      "Delete this message permanently? This action cannot be undone.",
    );
    if (!confirmed) return;

    await withActionLock("delete", item, async () => {
      assertAdminPermission(
        "manageInbox",
        user?.email,
        "You do not have permission to delete inbox items.",
      );

      const actor = user?.email || "admin";
      if (item.source === "contact") {
        await deleteContactMessage(item.id);
      } else {
        await deletePricingContactRequest(item.id);
      }

      await appendAdminAuditLog({
        actorEmail: actor,
        actorName: user?.name || "Admin",
        action: "Deleted support inbox item",
        category: "inbox",
        targetType: item.source,
        targetId: item.id,
        targetLabel:
          item.source === "contact" ? item.subject : "Pricing and plan request",
        detail: `${item.name} • ${item.email}`,
      }).catch(() => undefined);

      await loadThreads(true);
      toast.success("Message deleted.");
    }).catch((error) => {
      toast.error(error instanceof Error ? error.message : "Could not delete message.");
    });
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
                  <MessageSquare className="h-3.5 w-3.5" />
                  Admin Module
                </div>
                <div className="min-w-0">
                  <h1 className="mt-1 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                    Support Conversations
                  </h1>
                  <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                    Threaded follow-up for contact and pricing requests, with archive and delete controls.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">
                    {totalUnresolved} new messages
                  </span>
                  {showArchived ? (
                    <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2.5 py-1 font-semibold text-slate-700">
                      {totalArchived} archived visible
                    </span>
                  ) : null}
                  <Link
                    to="/admin/teacher-approvals"
                    className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 font-semibold text-violet-700 transition hover:bg-violet-100"
                  >
                    {pendingApprovalsCount} teacher approvals
                  </Link>
                  <Link
                    to="/admin/deletions"
                    className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 font-semibold text-rose-700 transition hover:bg-rose-100"
                  >
                    {pendingDeletionsCount} deletion requests
                  </Link>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Conversation List</p>
                    <p className="text-xs text-slate-500">Grouped by sender email.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowArchived((prev) => !prev)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                        showArchived
                          ? "border-slate-300/60 bg-slate-100 text-slate-700"
                          : "border-slate-200/60 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {showArchived ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                        {showArchived ? "archived" : "archived"}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label="Refresh conversations"
                      title="Refresh conversations"
                      disabled={loading}
                      onClick={() => void loadThreads()}
                      className="rounded-lg border border-slate-200/60 bg-white p-1.5 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                </div>
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search conversations..."
                    className="w-full rounded-xl border border-slate-200/60 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  />
                </div>
                {loading ? (
                  <div className="flex min-h-[220px] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
                  </div>
                ) : errorMessage && threads.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
                    <AlertTriangle className="mx-auto h-9 w-9 text-slate-400" />
                    <p className="mt-2 text-sm font-medium text-slate-700">{errorMessage}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredThreads.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
                        <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" />
                        <p className="mt-2 text-sm font-medium text-slate-700">
                          No conversations found
                        </p>
                      </div>
                    ) : (
                      filteredThreads.map((thread: SupportConversationThread) => (
                        <button
                          key={thread.key}
                          type="button"
                          onClick={() => setSelectedThreadKey(thread.key)}
                          className={`w-full rounded-xl border p-3 text-left transition-colors ${
                            selectedThread?.key === thread.key
                              ? "border-sky-300 bg-sky-50 shadow-sm"
                              : "border-slate-200/60 bg-white hover:border-slate-300/60 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {thread.name}
                              </p>
                              <p className="truncate text-xs text-slate-500">{thread.email}</p>
                            </div>
                            {thread.unresolvedCount > 0 ? (
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                {thread.unresolvedCount} new
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-slate-600">{thread.institution}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {thread.items.length} messages • {formatDateTime(thread.latestAt)}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </article>

              <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                {selectedThread ? (
                  <>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {selectedThread.name}
                        </p>
                        <p className="text-xs text-slate-500">{selectedThread.email}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={`mailto:${selectedThread.email}`}
                          className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5" />
                            Reply
                          </span>
                        </a>
                      </div>
                    </div>
                    <div className="mb-4 rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Organization
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {selectedThread.institution}
                      </p>
                    </div>
                    {errorMessage ? (
                      <div className="mb-3 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-700">
                        {errorMessage}
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      {selectedThread.items.map((item: SupportConversationItem) => {
                        const baseActionKey = `${item.source}:${item.id}`;
                        const isResolving = Boolean(
                          processingByActionKey[`resolve:${baseActionKey}`],
                        );
                        const isArchiving = Boolean(
                          processingByActionKey[`archive:${baseActionKey}`],
                        );
                        const isRestoring = Boolean(
                          processingByActionKey[`restore:${baseActionKey}`],
                        );
                        const isDeleting = Boolean(
                          processingByActionKey[`delete:${baseActionKey}`],
                        );
                        const institution = getItemInstitution(item);

                        return (
                          <article
                            key={baseActionKey}
                            className="rounded-xl border border-slate-200/60 bg-white p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                    {item.source}
                                  </span>
                                  <p className="text-sm font-semibold text-slate-900">
                                    {item.source === "contact"
                                      ? item.subject
                                      : "Pricing and plan request"}
                                  </p>
                                  {item.archived ? (
                                    <span className="rounded-full border border-slate-300/60 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                      Archived
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-1 text-xs text-slate-600">
                                  {item.source === "contact"
                                    ? item.message
                                    : item.message ||
                                      `Requested ${item.desiredCourses} courses and ${item.desiredStudents} students.`}
                                </p>
                              </div>
                              <ChevronRight className="h-4 w-4 text-slate-400" />
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <span>{formatDateTime(item.createdAt)}</span>
                              <span>•</span>
                              <span>{item.status === "resolved" ? "Resolved" : "Pending"}</span>
                              <span>•</span>
                              <span>{institution}</span>
                              {item.source === "pricing" ? (
                                <>
                                  <span>•</span>
                                  <span>{item.interestedPlanId || "No plan selected"}</span>
                                </>
                              ) : null}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {!item.archived && item.status === "new" ? (
                                <button
                                  type="button"
                                  disabled={isResolving}
                                  onClick={() => void resolveItem(item)}
                                  className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isResolving ? "Saving..." : "Mark resolved"}
                                </button>
                              ) : null}
                              {!item.archived ? (
                                <button
                                  type="button"
                                  disabled={isArchiving}
                                  onClick={() => void archiveItem(item)}
                                  className="rounded-lg border border-slate-200/60 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <span className="inline-flex items-center gap-1">
                                    <Archive className="h-3.5 w-3.5" />
                                    {isArchiving ? "Archiving..." : "Archive"}
                                  </span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isRestoring}
                                  onClick={() => void restoreItem(item)}
                                  className="rounded-lg border border-slate-200/60 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <span className="inline-flex items-center gap-1">
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    {isRestoring ? "Restoring..." : "Restore"}
                                  </span>
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => void deleteItem(item)}
                                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <span className="inline-flex items-center gap-1">
                                  <Trash2 className="h-3.5 w-3.5" />
                                  {isDeleting ? "Deleting..." : "Delete"}
                                </span>
                              </button>
                              {item.status === "resolved" ? (
                                <span className="text-[11px] text-emerald-700">
                                  Resolved by {item.resolvedBy || "admin"} on{" "}
                                  {formatDateTime(item.resolvedAt || null)}
                                </span>
                              ) : null}
                              {item.archived ? (
                                <span className="text-[11px] text-slate-600">
                                  Archived by {item.archivedBy || "admin"} on{" "}
                                  {formatDateTime(item.archivedAt || null)}
                                </span>
                              ) : null}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
                    <Building2 className="mx-auto h-9 w-9 text-slate-400" />
                    <p className="mt-2 text-sm font-medium text-slate-700">
                      No conversation selected
                    </p>
                    <p className="text-xs text-slate-500">
                      Choose a sender on the left to review the thread.
                    </p>
                  </div>
                )}
              </article>
            </section>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
