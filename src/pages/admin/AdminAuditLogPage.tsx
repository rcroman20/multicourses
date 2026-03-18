import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  FileSearch,
  Loader2,
  Search,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  getAdminAuditLogEntries,
  type AdminAuditCategory,
  type AdminAuditLogEntry,
} from "@/lib/services/adminAuditLogService";

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

const getCategoryClassName = (category: AdminAuditCategory): string => {
  if (category === "approval") return "border-violet-200 bg-violet-50 text-violet-700";
  if (category === "billing") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (category === "course") return "border-indigo-200 bg-indigo-50 text-indigo-700";
  if (category === "deletion") return "border-rose-200 bg-rose-50 text-rose-700";
  if (category === "inbox") return "border-sky-200 bg-sky-50 text-sky-700";
  if (category === "notification") return "border-amber-200 bg-amber-50 text-amber-700";
  if (category === "institution") return "border-cyan-200 bg-cyan-50 text-cyan-700";
  if (category === "backup") return "border-orange-200 bg-orange-50 text-orange-700";
  if (category === "announcement") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200/60 bg-slate-50 text-slate-700";
};

export default function AdminAuditLogPage() {
  const [entries, setEntries] = useState<AdminAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const loadEntries = async () => {
      setLoading(true);
      setErrorMessage("");
      try {
        setEntries(await getAdminAuditLogEntries(250));
      } catch {
        setEntries([]);
        setErrorMessage("Could not load admin audit log.");
      } finally {
        setLoading(false);
      }
    };

    void loadEntries();
  }, []);

  const filteredEntries = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return entries;
    return entries.filter((entry) =>
      entry.actorName.toLowerCase().includes(term) ||
      entry.actorEmail.toLowerCase().includes(term) ||
      entry.action.toLowerCase().includes(term) ||
      entry.targetLabel.toLowerCase().includes(term) ||
      entry.detail.toLowerCase().includes(term),
    );
  }, [entries, searchTerm]);

  const todayCount = useMemo(() => {
    const today = new Date();
    return entries.filter((entry) => {
      if (!entry.createdAt) return false;
      return entry.createdAt.toDateString() === today.toDateString();
    }).length;
  }, [entries]);

  const uniqueActors = useMemo(
    () => new Set(entries.map((entry) => entry.actorEmail).filter(Boolean)).size,
    [entries],
  );

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
                  <FileSearch className="h-3.5 w-3.5" />
                  Admin Module
                </div>
                <div className="min-w-0">
                  <h1 className="mt-1 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                    Audit Log
                  </h1>
                  <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                    Administrative traceability. Review what changed, who executed it, and when it happened.
                  </p>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-slate-200/60 bg-white/90 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                        <FileSearch className="h-4 w-4" />
                      </div>
                      <p className="text-lg font-extrabold text-slate-900">{entries.length}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">Events indexed</p>
                  </div>
                  <div className="rounded-xl border border-slate-200/60 bg-white/90 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                        <ShieldCheck className="h-4 w-4" />
                      </div>
                      <p className="text-lg font-extrabold text-slate-900">{todayCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">Events today</p>
                  </div>
                  <div className="rounded-xl border border-slate-200/60 bg-white/90 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                        <UserCog className="h-4 w-4" />
                      </div>
                      <p className="text-lg font-extrabold text-slate-900">{uniqueActors}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">Admin actors</p>
                  </div>
                  <div className="rounded-xl border border-slate-200/60 bg-white/90 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700">
                        <Search className="h-4 w-4" />
                      </div>
                      <p className="text-lg font-extrabold text-slate-900">{filteredEntries.length}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">Visible events</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Event Stream</p>
                  <p className="text-xs text-slate-500">Search by actor, action, target, or detail.</p>
                </div>
                <div className="relative w-full max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search audit events..."
                    className="w-full rounded-xl border border-slate-200/60 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  />
                </div>
              </div>

              {loading ? (
                <div className="flex min-h-[280px] items-center justify-center">
                  <div className="space-y-2 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
                    <p className="text-base font-semibold text-slate-900">Loading audit log</p>
                    <p className="text-sm text-slate-600">Preparing administrative event history</p>
                  </div>
                </div>
              ) : errorMessage ? (
                <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
                  <AlertTriangle className="mx-auto h-9 w-9 text-slate-400" />
                  <p className="mt-2 text-sm font-medium text-slate-700">{errorMessage}</p>
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
                  <FileSearch className="mx-auto h-9 w-9 text-slate-400" />
                  <p className="mt-2 text-sm font-medium text-slate-700">No audit events recorded yet</p>
                  <p className="text-xs text-slate-500">Admin actions will appear here once they are executed.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredEntries.map((entry) => (
                    <article key={entry.id} className="rounded-xl border border-slate-200/60 bg-white p-3">
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">{entry.action}</p>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getCategoryClassName(entry.category)}`}>
                              {entry.category}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-600">
                            {entry.actorName || "Admin"} • {entry.actorEmail || "Unknown actor"}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {entry.targetType || "target"} • {entry.targetLabel || entry.targetId || "No target"}
                          </p>
                          {entry.detail ? (
                            <p className="mt-1 text-xs text-slate-500">{entry.detail}</p>
                          ) : null}
                        </div>
                        <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
                          {formatDateTime(entry.createdAt)}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
