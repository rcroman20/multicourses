import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { appendAdminAuditLog } from "@/lib/services/adminAuditLogService";
import { assertAdminPermission } from "@/lib/services/adminPermissionGuardService";
import {
  getContactMessages,
  markContactMessageResolved,
  type ContactMessageRecord,
} from "@/lib/services/contactMessageService";
import {
  getPricingContactRequests,
  markPricingContactRequestResolved,
  type PricingContactRequestRecord,
} from "@/lib/services/pricingContactService";
import { getPendingTeacherApprovalRequests } from "@/lib/services/teacherApprovalService";
import { getPendingAccountDeletionRequests } from "@/lib/services/accountDeletionService";

type InboxFilter = "all" | "new" | "resolved" | "contact" | "pricing";

type InboxItem = {
  id: string;
  source: "contact" | "pricing";
  status: "new" | "resolved";
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: Date | null;
  resolvedAt: Date | null;
  resolvedBy: string;
  roleLabel: string;
  institutionLabel: string;
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

const mapContactRoleLabel = (role: ContactMessageRecord["role"]): string => {
  if (role === "teacher") return "Teacher";
  if (role === "student") return "Student";
  if (role === "admin") return "Admin";
  if (role === "organization") return "Organization";
  return "Other";
};

const mapPricingRoleLabel = (role: PricingContactRequestRecord["role"]): string => {
  if (role === "organization") return "Organization";
  if (role === "admin_team") return "Admin team";
  return "Teacher";
};

const toInboxItems = (
  contactMessages: ContactMessageRecord[],
  pricingRequests: PricingContactRequestRecord[],
): InboxItem[] => {
  const contactItems: InboxItem[] = contactMessages.map((item) => ({
    id: item.id,
    source: "contact",
    status: item.status,
    name: item.name || "Unknown user",
    email: item.email || "",
    subject: item.subject || "Contact request",
    message: item.message || "",
    createdAt: item.createdAt,
    resolvedAt: item.resolvedAt || null,
    resolvedBy: item.resolvedBy || "",
    roleLabel: mapContactRoleLabel(item.role),
    institutionLabel: item.institution || "No institution",
  }));

  const pricingItems: InboxItem[] = pricingRequests.map((item) => ({
    id: item.id,
    source: "pricing",
    status: item.status,
    name: item.name || "Unknown user",
    email: item.email || "",
    subject: "Pricing and plan request",
    message:
      item.message ||
      `Requested ${item.desiredCourses} courses and ${item.desiredStudents} students.`,
    createdAt: item.createdAt,
    resolvedAt: item.resolvedAt || null,
    resolvedBy: item.resolvedBy || "",
    roleLabel: mapPricingRoleLabel(item.role),
    institutionLabel: item.institutionName || "No institution",
  }));

  return [...contactItems, ...pricingItems].sort((a, b) => {
    const left = a.createdAt?.getTime() || 0;
    const right = b.createdAt?.getTime() || 0;
    return right - left;
  });
};

export default function AdminAccessInboxPage() {
  const { user } = useAuth();
  const [contactMessages, setContactMessages] = useState<ContactMessageRecord[]>([]);
  const [pricingRequests, setPricingRequests] = useState<PricingContactRequestRecord[]>([]);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [pendingDeletionsCount, setPendingDeletionsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeFilter, setActiveFilter] = useState<InboxFilter>("all");
  const [resolvingByKey, setResolvingByKey] = useState<Record<string, boolean>>({});

  const loadInboxData = async () => {
    setLoading(true);
    setErrorMessage("");

    const [contactResult, pricingResult, approvalsResult, deletionsResult] = await Promise.allSettled([
      getContactMessages(),
      getPricingContactRequests(),
      getPendingTeacherApprovalRequests(),
      getPendingAccountDeletionRequests(),
    ]);

    const contactFailed = contactResult.status === "rejected";
    const pricingFailed = pricingResult.status === "rejected";

    setContactMessages(contactResult.status === "fulfilled" ? contactResult.value : []);
    setPricingRequests(pricingResult.status === "fulfilled" ? pricingResult.value : []);
    setPendingApprovalsCount(approvalsResult.status === "fulfilled" ? approvalsResult.value.length : 0);
    setPendingDeletionsCount(deletionsResult.status === "fulfilled" ? deletionsResult.value.length : 0);

    if (contactFailed && pricingFailed) {
      setErrorMessage("Could not load inbox requests.");
    } else if (contactFailed || pricingFailed) {
      setErrorMessage("Some inbox sources could not be loaded.");
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadInboxData();
  }, []);

  const inboxItems = useMemo(
    () => toInboxItems(contactMessages, pricingRequests),
    [contactMessages, pricingRequests],
  );

  const totalCount = inboxItems.length;
  const newCount = useMemo(
    () => inboxItems.filter((item) => item.status === "new").length,
    [inboxItems],
  );
  const resolvedCount = useMemo(
    () => inboxItems.filter((item) => item.status === "resolved").length,
    [inboxItems],
  );
  const contactCount = contactMessages.length;
  const pricingCount = pricingRequests.length;

  const filteredItems = useMemo(() => {
    if (activeFilter === "all") return inboxItems;
    if (activeFilter === "new") return inboxItems.filter((item) => item.status === "new");
    if (activeFilter === "resolved") return inboxItems.filter((item) => item.status === "resolved");
    return inboxItems.filter((item) => item.source === activeFilter);
  }, [activeFilter, inboxItems]);

  const handleResolve = async (item: InboxItem) => {
    const actionKey = `${item.source}:${item.id}`;
    setResolvingByKey((prev) => ({ ...prev, [actionKey]: true }));
    try {
      assertAdminPermission(
        "manageInbox",
        user?.email,
        "You do not have permission to resolve inbox items.",
      );
      const actor = user?.email || "admin";
      if (item.source === "contact") {
        await markContactMessageResolved(item.id, actor);
        setContactMessages((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  status: "resolved",
                  resolvedAt: new Date(),
                  resolvedBy: actor,
                }
              : entry,
          ),
        );
      } else {
        await markPricingContactRequestResolved(item.id, actor);
        setPricingRequests((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  status: "resolved",
                  resolvedAt: new Date(),
                  resolvedBy: actor,
                }
              : entry,
          ),
        );
      }
      await appendAdminAuditLog({
        actorEmail: actor,
        actorName: user?.name || "Admin",
        action: "Resolved support inbox item",
        category: "inbox",
        targetType: item.source,
        targetId: item.id,
        targetLabel: item.subject,
        detail: `${item.name} • ${item.email}`,
      }).catch(() => undefined);
      toast.success("Inbox item marked as resolved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update inbox item.");
    } finally {
      setResolvingByKey((prev) => ({ ...prev, [actionKey]: false }));
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
                  <Inbox className="h-3.5 w-3.5" />
                  Admin Module
                </div>

                <div className="min-w-0">
                  <h1 className="mt-1 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                    Admin Inbox
                  </h1>
                  <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                    Inbound requests and follow-up. Resolve messages, track pending queues, and act quickly.
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                        <MessageSquare className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{totalCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Total inbound</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                        <Clock3 className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{newCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">New requests</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                        <BadgeCheck className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{pendingApprovalsCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Teacher approvals pending</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{pendingDeletionsCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Deletion queue</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Inbound Requests</p>
                  <p className="text-xs text-slate-500">Contact and pricing requests with resolution workflow.</p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadInboxData()}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Refresh
                </button>
              </div>

              <div className="mb-3 flex flex-wrap gap-1.5">
                {([
                  { key: "all", label: "All", count: totalCount },
                  { key: "new", label: "New", count: newCount },
                  { key: "resolved", label: "Resolved", count: resolvedCount },
                  { key: "contact", label: "Contact", count: contactCount },
                  { key: "pricing", label: "Pricing", count: pricingCount },
                ] as const).map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setActiveFilter(filter.key)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                      activeFilter === filter.key
                        ? "border-sky-200 bg-sky-50 text-sky-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {filter.label} ({filter.count})
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="flex min-h-[260px] items-center justify-center">
                  <div className="space-y-2 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
                    <p className="text-base font-semibold text-slate-900">Loading inbox</p>
                    <p className="text-sm text-slate-600">Preparing inbound requests and follow-up queue</p>
                  </div>
                </div>
              ) : totalCount === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                  <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" />
                  <p className="mt-2 text-sm font-medium text-slate-700">No inbound requests</p>
                  <p className="text-xs text-slate-500">New contact and pricing messages will appear here.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {errorMessage ? (
                    <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-700">
                      {errorMessage}
                    </div>
                  ) : null}

                  {filteredItems.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
                      <p className="text-sm font-medium text-slate-700">No items for this filter</p>
                      <p className="text-xs text-slate-500">Try another filter to review inbound requests.</p>
                    </div>
                  ) : (
                    filteredItems.map((item) => {
                      const actionKey = `${item.source}:${item.id}`;
                      const isResolving = Boolean(resolvingByKey[actionKey]);
                      const sourceTone =
                        item.source === "contact"
                          ? "border-cyan-200 bg-cyan-50 text-cyan-700"
                          : "border-violet-200 bg-violet-50 text-violet-700";
                      const sourceIconTone =
                        item.source === "contact"
                          ? "bg-cyan-100 text-cyan-700"
                          : "bg-violet-100 text-violet-700";

                      return (
                        <article
                          key={actionKey}
                          className="rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-slate-300 hover:bg-slate-50"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${sourceIconTone}`}>
                                  {item.source === "contact" ? (
                                    <Mail className="h-3.5 w-3.5" />
                                  ) : (
                                    <Building2 className="h-3.5 w-3.5" />
                                  )}
                                </div>
                                <p className="truncate text-sm font-semibold text-slate-900">{item.subject}</p>
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${sourceTone}`}>
                                  {item.source === "contact" ? "Contact" : "Pricing"}
                                </span>
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                    item.status === "new"
                                      ? "border-amber-200 bg-amber-50 text-amber-700"
                                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  }`}
                                >
                                  {item.status === "new" ? "New" : "Resolved"}
                                </span>
                              </div>

                              <p className="mt-1 text-xs text-slate-600">
                                {item.name} ({item.email || "No email"}) • {item.roleLabel}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {item.institutionLabel} • Created {formatDateTime(item.createdAt)}
                              </p>
                              <p className="mt-2 text-xs text-slate-600">{item.message}</p>

                              {item.status === "resolved" ? (
                                <p className="mt-1 text-[11px] text-emerald-700">
                                  Resolved by {item.resolvedBy || "admin"} on {formatDateTime(item.resolvedAt)}
                                </p>
                              ) : null}
                            </div>

                            <div className="flex items-center gap-2">
                              {item.email ? (
                                <a
                                  href={`mailto:${item.email}`}
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                                >
                                  Reply
                                </a>
                              ) : null}
                              {item.status === "new" ? (
                                <button
                                  type="button"
                                  disabled={isResolving}
                                  onClick={() => void handleResolve(item)}
                                  className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isResolving ? "Saving..." : "Mark resolved"}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              )}
            </section>

            <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Link to="/admin/teacher-approvals" className="block">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:border-sky-300 hover:bg-sky-50/50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-violet-100">
                        <BadgeCheck className="h-3.5 w-3.5 text-violet-700" />
                      </div>
                      <p className="truncate text-sm font-semibold text-slate-900">Teacher approvals queue</p>
                      <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                        {pendingApprovalsCount} pending
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">Follow up on pending access requests.</p>
                  </div>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-500" />
                </div>
              </Link>

              <Link to="/admin/deletions" className="block">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:border-sky-300 hover:bg-sky-50/50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-rose-100">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-700" />
                      </div>
                      <p className="truncate text-sm font-semibold text-slate-900">Deletion queue</p>
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                        {pendingDeletionsCount} pending
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">Review account removal requests that need action.</p>
                  </div>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-500" />
                </div>
              </Link>
            </section>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
