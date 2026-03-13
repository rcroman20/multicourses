import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
  Search,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  getContactMessages,
  type ContactMessageRecord,
} from "@/lib/services/contactMessageService";
import {
  getPricingContactRequests,
  type PricingContactRequestRecord,
} from "@/lib/services/pricingContactService";

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

const toDateValue = (item: SupportConversationItem): Date | null =>
  item.source === "contact" ? item.createdAt : item.createdAt;

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

export default function AdminSupportConversationsPage() {
  const [threads, setThreads] = useState<SupportConversationThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedThreadKey, setSelectedThreadKey] = useState("");

  useEffect(() => {
    const loadThreads = async () => {
      setLoading(true);
      setErrorMessage("");
      try {
        const [contactMessages, pricingRequests] = await Promise.all([
          getContactMessages(),
          getPricingContactRequests(),
        ]);

        const grouped = new Map<string, SupportConversationThread>();
        const items: SupportConversationItem[] = [
          ...contactMessages.map((item) => ({ ...item, source: "contact" as const })),
          ...pricingRequests.map((item) => ({ ...item, source: "pricing" as const })),
        ];

        items.forEach((item) => {
          const email = item.email.trim().toLowerCase();
          const key = email || `${item.source}:${item.id}`;
          const institution =
            item.source === "contact"
              ? item.institution || "No institution"
              : item.institutionName || "No institution";
          const current = grouped.get(key) || {
            key,
            email,
            name: item.name || "Unknown contact",
            institution,
            items: [],
            unresolvedCount: 0,
            latestAt: null,
          };

          current.items.push(item);
          if (item.status === "new") current.unresolvedCount += 1;
          const createdAt = toDateValue(item);
          if (!current.latestAt || ((createdAt?.getTime() || 0) > current.latestAt.getTime())) {
            current.latestAt = createdAt;
          }
          grouped.set(key, current);
        });

        const nextThreads = Array.from(grouped.values())
          .map((thread) => ({
            ...thread,
            items: [...thread.items].sort(
              (left, right) => (toDateValue(right)?.getTime() || 0) - (toDateValue(left)?.getTime() || 0),
            ),
          }))
          .sort((left, right) => (right.latestAt?.getTime() || 0) - (left.latestAt?.getTime() || 0));

        setThreads(nextThreads);
        setSelectedThreadKey(nextThreads[0]?.key || "");
      } catch {
        setThreads([]);
        setErrorMessage("Could not load support conversations.");
      } finally {
        setLoading(false);
      }
    };

    void loadThreads();
  }, []);

  const filteredThreads = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return threads;
    return threads.filter((thread) =>
      thread.name.toLowerCase().includes(term) ||
      thread.email.toLowerCase().includes(term) ||
      thread.institution.toLowerCase().includes(term),
    );
  }, [searchTerm, threads]);

  const selectedThread = filteredThreads.find((thread) => thread.key === selectedThreadKey) || filteredThreads[0] || null;

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
                  <MessageSquare className="h-3.5 w-3.5" />
                  Admin Module
                </div>
                <div className="min-w-0">
                  <h1 className="mt-1 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                    Support Conversations
                  </h1>
                  <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                    Threaded request follow-up. Review grouped contact and pricing conversations by sender.
                  </p>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3">
                  <p className="text-sm font-semibold text-slate-900">Conversation List</p>
                  <p className="text-xs text-slate-500">Grouped by sender email.</p>
                </div>
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search conversations..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  />
                </div>
                {loading ? (
                  <div className="flex min-h-[220px] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
                  </div>
                ) : errorMessage ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                    <AlertTriangle className="mx-auto h-9 w-9 text-slate-400" />
                    <p className="mt-2 text-sm font-medium text-slate-700">{errorMessage}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredThreads.map((thread) => (
                      <button
                        key={thread.key}
                        type="button"
                        onClick={() => setSelectedThreadKey(thread.key)}
                        className={`w-full rounded-xl border p-3 text-left transition-colors ${
                          selectedThread?.key === thread.key
                            ? "border-sky-300 bg-sky-50 shadow-sm"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{thread.name}</p>
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
                    ))}
                  </div>
                )}
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                {selectedThread ? (
                  <>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{selectedThread.name}</p>
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
                        <Link
                          to="/admin/inbox"
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <Inbox className="h-3.5 w-3.5" />
                            Open inbox
                          </span>
                        </Link>
                      </div>
                    </div>
                    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Organization</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{selectedThread.institution}</p>
                    </div>
                    <div className="space-y-2">
                      {selectedThread.items.map((item) => (
                        <article key={`${item.source}:${item.id}`} className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                  {item.source}
                                </span>
                                <p className="text-sm font-semibold text-slate-900">
                                  {item.source === "contact" ? item.subject : "Pricing and plan request"}
                                </p>
                              </div>
                              <p className="mt-1 text-xs text-slate-600">
                                {item.source === "contact"
                                  ? item.message
                                  : item.message || `Requested ${item.desiredCourses} courses and ${item.desiredStudents} students.`}
                              </p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-slate-400" />
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span>{formatDateTime(item.createdAt)}</span>
                            <span>•</span>
                            <span>{item.status === "resolved" ? "Resolved" : "Pending"}</span>
                            {item.source === "pricing" ? (
                              <>
                                <span>•</span>
                                <span>{item.interestedPlanId || "No plan selected"}</span>
                              </>
                            ) : null}
                            {item.source === "contact" && item.institution ? (
                              <>
                                <span>•</span>
                                <span>{item.institution}</span>
                              </>
                            ) : null}
                            {item.source === "pricing" && item.institutionName ? (
                              <>
                                <span>•</span>
                                <span>{item.institutionName}</span>
                              </>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                    <Building2 className="mx-auto h-9 w-9 text-slate-400" />
                    <p className="mt-2 text-sm font-medium text-slate-700">No conversation selected</p>
                    <p className="text-xs text-slate-500">Choose a sender on the left to review the thread.</p>
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
