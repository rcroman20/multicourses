import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, getDocs } from "firebase/firestore";
import {
  AlertTriangle,
  ArchiveRestore,
  CheckCircle2,
  Download,
  Loader2,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { firebaseDB } from "@/lib/firebase";
import { appendAdminAuditLog } from "@/lib/services/adminAuditLogService";
import { assertAdminPermission } from "@/lib/services/adminPermissionGuardService";
import { useAdminPlatformSettings } from "@/lib/services/adminSettingsService";
import {
  courseBackupService,
  type CourseBackupPayload,
} from "@/lib/services/courseBackupService";

type AdminBackupSnapshot = {
  id: string;
  teacherId: string;
  teacherName: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  createdAt: Date | null;
  exportedAt: string;
  payload: CourseBackupPayload | null;
};

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

const getAgeLabel = (value: Date | null): string => {
  if (!value) return "Unknown age";
  const diffMs = Date.now() - value.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1 day old";
  return `${diffDays} days old`;
};

const getAgeBadgeClassName = (value: Date | null): string => {
  if (!value) return "border-slate-200/60 bg-slate-50 text-slate-700";
  const diffDays = Math.max(0, Math.floor((Date.now() - value.getTime()) / (24 * 60 * 60 * 1000)));
  if (diffDays >= 30) return "border-rose-200 bg-rose-50 text-rose-700";
  if (diffDays >= 14) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
};

export default function AdminBackupsPage() {
  const { user } = useAuth();
  const { settings } = useAdminPlatformSettings();
  const allowBackupDeletionByAdmin = settings.allowBackupDeletionByAdmin !== false;
  const [snapshots, setSnapshots] = useState<AdminBackupSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [deletingById, setDeletingById] = useState<Record<string, boolean>>({});

  const loadSnapshots = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const snapshot = await getDocs(collection(firebaseDB, "courseBackups"));
      const cutoffMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const staleDocs = snapshot.docs.filter((docSnap) => {
        const data = (docSnap.data() || {}) as Record<string, unknown>;
        const createdAt = toDate(data.createdAt);
        return createdAt ? createdAt.getTime() < cutoffMs : false;
      });

      if (allowBackupDeletionByAdmin && staleDocs.length > 0 && user?.email) {
        try {
          assertAdminPermission(
            "manageBackups",
            user.email,
            "You do not have permission to clean stale backup snapshots.",
          );
          await Promise.all(staleDocs.map((docSnap) => deleteDoc(docSnap.ref)));
          toast.success(`${staleDocs.length} stale backup snapshot(s) removed.`);
        } catch {
          // Keep rendering current data even if cleanup fails.
        }
      }

      const rows = snapshot.docs
        .map((docSnap) => {
          const data = (docSnap.data() || {}) as Record<string, unknown>;
          return {
            id: docSnap.id,
            teacherId: String(data.teacherId || "").trim(),
            teacherName: String(data.teacherName || "").trim() || "Teacher",
            courseId: String(data.courseId || "").trim(),
            courseCode: String(data.courseCode || "").trim() || "COURSE",
            courseName: String(data.courseName || "").trim() || "Course backup",
            createdAt: toDate(data.createdAt),
            exportedAt: String(data.exportedAt || "").trim(),
            payload: (data.payload || null) as CourseBackupPayload | null,
          } satisfies AdminBackupSnapshot;
        })
        .filter((row) => !row.createdAt || row.createdAt.getTime() >= cutoffMs)
        .sort((left, right) => {
          const leftTime = left.createdAt?.getTime() || 0;
          const rightTime = right.createdAt?.getTime() || 0;
          return rightTime - leftTime;
        });
      setSnapshots(rows);
    } catch {
      setSnapshots([]);
      setErrorMessage("Could not load backup snapshots.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSnapshots();
  }, [allowBackupDeletionByAdmin, user?.email]);

  const filteredSnapshots = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return snapshots;
    return snapshots.filter((snapshot) =>
      snapshot.teacherName.toLowerCase().includes(term) ||
      snapshot.courseName.toLowerCase().includes(term) ||
      snapshot.courseCode.toLowerCase().includes(term),
    );
  }, [searchTerm, snapshots]);

  const totalCount = snapshots.length;
  const teacherCoverageCount = useMemo(
    () => new Set(snapshots.map((snapshot) => snapshot.teacherId).filter(Boolean)).size,
    [snapshots],
  );
  const staleCount = useMemo(
    () =>
      snapshots.filter((snapshot) => {
        if (!snapshot.createdAt) return false;
        return Date.now() - snapshot.createdAt.getTime() >= 30 * 24 * 60 * 60 * 1000;
      }).length,
    [snapshots],
  );
  const latestSnapshot = snapshots[0] || null;

  const handleDownload = (snapshot: AdminBackupSnapshot) => {
    try {
      assertAdminPermission(
        "manageBackups",
        user?.email,
        "You do not have permission to download backup snapshots.",
      );
      if (!snapshot.payload) {
        toast.error("This snapshot does not include a downloadable payload.");
        return;
      }
      courseBackupService.downloadBackupFile(snapshot.payload);
      toast.success(`Backup downloaded for ${snapshot.courseCode}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download backup.");
    }
  };

  const handleDelete = async (snapshot: AdminBackupSnapshot) => {
    if (!allowBackupDeletionByAdmin) {
      toast.error("Backup deletion is currently disabled in platform settings.");
      return;
    }

    const confirmed = window.confirm(`Delete backup snapshot for ${snapshot.courseCode}?`);
    if (!confirmed) return;

    setDeletingById((prev) => ({ ...prev, [snapshot.id]: true }));
    try {
      assertAdminPermission(
        "manageBackups",
        user?.email,
        "You do not have permission to delete backup snapshots.",
      );
      await deleteDoc(doc(firebaseDB, "courseBackups", snapshot.id));
      await appendAdminAuditLog({
        actorEmail: user?.email || "admin",
        actorName: user?.name || "Admin",
        action: "Deleted backup snapshot",
        category: "backup",
        targetType: "course_backup",
        targetId: snapshot.id,
        targetLabel: snapshot.courseCode,
        detail: snapshot.courseName,
      }).catch(() => undefined);
      setSnapshots((prev) => prev.filter((item) => item.id !== snapshot.id));
      toast.success("Backup snapshot deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete backup snapshot.");
    } finally {
      setDeletingById((prev) => ({ ...prev, [snapshot.id]: false }));
    }
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
                  <ArchiveRestore className="h-3.5 w-3.5" />
                  Admin Module
                </div>

                <div className="min-w-0">
                  <h1 className="mt-1 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                    Backups
                  </h1>
                  <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                    Snapshot monitoring. Review backup coverage, stale snapshots, and downloadable course recovery files.
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 text-orange-700">
                        <ArchiveRestore className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{totalCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Snapshots indexed</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                        <UserCog className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{teacherCoverageCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Teachers covered</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{staleCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Older than 30d</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                      <p className="truncate text-xs font-semibold text-slate-900">
                        {latestSnapshot?.courseCode || "No snapshots"}
                      </p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">
                      {latestSnapshot ? `Latest ${getAgeLabel(latestSnapshot.createdAt)}` : "Latest snapshot"}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Snapshot Registry</p>
                  <p className="text-xs text-slate-500">Search by teacher, course code, or course name.</p>
                </div>
                <div className="relative w-full max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search backups..."
                    className="w-full rounded-xl border border-slate-200/60 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  />
                </div>
              </div>

              {loading ? (
                <div className="flex min-h-[280px] items-center justify-center">
                  <div className="space-y-2 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
                    <p className="text-base font-semibold text-slate-900">Loading backups</p>
                    <p className="text-sm text-slate-600">Preparing snapshot registry</p>
                  </div>
                </div>
              ) : errorMessage ? (
                <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
                  <AlertTriangle className="mx-auto h-9 w-9 text-slate-400" />
                  <p className="mt-2 text-sm font-medium text-slate-700">{errorMessage}</p>
                  <button
                    type="button"
                    onClick={() => void loadSnapshots()}
                    className="mt-3 rounded-lg border border-slate-200/60 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Retry
                  </button>
                </div>
              ) : filteredSnapshots.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
                  <ArchiveRestore className="mx-auto h-9 w-9 text-slate-400" />
                  <p className="mt-2 text-sm font-medium text-slate-700">No backup snapshots found</p>
                  <p className="text-xs text-slate-500">Snapshots will appear here after teachers export course backups.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredSnapshots.map((snapshot) => (
                    <article
                      key={snapshot.id}
                      className="rounded-xl border border-slate-200/60 bg-white p-3 transition-colors hover:border-slate-300/60 hover:bg-slate-50"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {snapshot.courseCode} • {snapshot.courseName}
                            </p>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getAgeBadgeClassName(snapshot.createdAt)}`}
                            >
                              {getAgeLabel(snapshot.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-600">
                            {snapshot.teacherName} • Exported {formatDateTime(snapshot.createdAt)}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Course ID {snapshot.courseId || "Not set"} • Teacher ID {snapshot.teacherId || "Not set"}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDownload(snapshot)}
                            className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <Download className="h-3.5 w-3.5" />
                              Download
                            </span>
                          </button>
                          <button
                            type="button"
                            disabled={!allowBackupDeletionByAdmin || Boolean(deletingById[snapshot.id])}
                            onClick={() => void handleDelete(snapshot)}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <Trash2 className="h-3.5 w-3.5 text-rose-700" />
                              {deletingById[snapshot.id] ? "Deleting..." : "Delete"}
                            </span>
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200/60 bg-slate-50/70 p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Operational Notes</p>
                  <p className="text-xs text-slate-500">What the backup registry is telling you right now.</p>
                </div>
                <span className="rounded-full border border-slate-200/60 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                  {filteredSnapshots.length} visible
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
                <div className="rounded-xl border border-slate-200/60 bg-white p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Coverage</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {teacherCoverageCount > 0
                      ? "Teachers already have recovery points available."
                      : "No teacher backup coverage detected yet."}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/60 bg-white p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Retention</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {staleCount > 0
                      ? `${staleCount} snapshots are older than 30 days and may need cleanup review.`
                      : "No stale backup snapshots detected."}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/60 bg-white p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Access</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    Download actions follow delegated backup permissions. Deletion is currently {allowBackupDeletionByAdmin ? "enabled" : "disabled"} in platform settings.
                  </p>
                </div>
              </div>
            </section>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
