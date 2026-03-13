import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Building2,
  Loader2,
  School,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { appendAdminAuditLog } from "@/lib/services/adminAuditLogService";
import { assertAdminPermission } from "@/lib/services/adminPermissionGuardService";
import AdminInstitutionAssignmentModal from "@/pages/admin/AdminInstitutionAssignmentModal";
import {
  getAdminDirectoryDataset,
  getInstitutionKey,
  type AdminDirectoryUserRecord,
} from "@/lib/services/adminDirectoryService";
import {
  getInstitutionSuggestions,
  saveUserInstitution,
} from "@/lib/services/institutionProfileService";

const getRoleLabel = (role: AdminDirectoryUserRecord["role"]): string => {
  if (role === "docente") return "Teacher";
  if (role === "admin") return "Admin";
  return "Student";
};

export default function AdminInstitutionDetailPage() {
  const { user } = useAuth();
  const { institutionKey = "" } = useParams<{ institutionKey: string }>();
  const [users, setUsers] = useState<AdminDirectoryUserRecord[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminDirectoryUserRecord | null>(null);
  const [savingInstitution, setSavingInstitution] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const [dataset, suggestionRows] = await Promise.all([
        getAdminDirectoryDataset(),
        getInstitutionSuggestions(),
      ]);
      setUsers(dataset.users);
      setSuggestions(suggestionRows);
    } catch {
      setUsers([]);
      setSuggestions([]);
      setErrorMessage("Could not load institution detail.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const institutionUsers = useMemo(
    () => users.filter((entry) => getInstitutionKey(entry.institutionName) === institutionKey),
    [institutionKey, users],
  );
  const institutionLabel = institutionUsers[0]?.institutionName || "Institution";
  const teacherCount = institutionUsers.filter((entry) => entry.role === "docente").length;
  const studentCount = institutionUsers.filter((entry) => entry.role === "estudiante").length;
  const adminCount = institutionUsers.filter((entry) => entry.role === "admin").length;
  const pendingCount = institutionUsers.filter((entry) => entry.teacherApprovalStatus === "pending").length;
  const activeCoursesCount = institutionUsers.reduce((sum, entry) => sum + entry.activeCoursesCount, 0);

  const handleAssignInstitution = async (institutionName: string) => {
    if (!selectedUser) return;
    setSavingInstitution(true);
    try {
      assertAdminPermission(
        "manageInstitutions",
        user?.email,
        "You do not have permission to update institution assignments.",
      );
      await saveUserInstitution({
        userId: selectedUser.userId,
        role: selectedUser.institutionWriteRole,
        email: selectedUser.email,
        name: selectedUser.name,
        institutionName,
      });
      await appendAdminAuditLog({
        actorEmail: user?.email || "admin",
        actorName: user?.name || "Admin",
        action: "Updated institution assignment",
        category: "institution",
        targetType: "institution_member",
        targetId: selectedUser.userId,
        targetLabel: selectedUser.name,
        detail: institutionName,
      }).catch(() => undefined);
      toast.success(`Institution updated for ${selectedUser.name}.`);
      setSelectedUser(null);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update institution.");
    } finally {
      setSavingInstitution(false);
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
                <Link
                  to="/admin/institutions"
                  className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to institutions
                </Link>
                <div className="min-w-0">
                  <h1 className="mt-1 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                    Institution Detail View
                  </h1>
                  <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                    Review organization coverage, member composition, and pending academic operations.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                  <Building2 className="h-3.5 w-3.5 text-sky-700" />
                  {institutionLabel}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-xl border border-slate-200 bg-white/90 p-3"><p className="text-lg font-extrabold text-slate-900">{institutionUsers.length}</p><p className="text-[11px] font-semibold text-slate-500">Users</p></div>
                  <div className="rounded-xl border border-slate-200 bg-white/90 p-3"><p className="text-lg font-extrabold text-slate-900">{teacherCount}</p><p className="text-[11px] font-semibold text-slate-500">Teachers</p></div>
                  <div className="rounded-xl border border-slate-200 bg-white/90 p-3"><p className="text-lg font-extrabold text-slate-900">{studentCount}</p><p className="text-[11px] font-semibold text-slate-500">Students</p></div>
                  <div className="rounded-xl border border-slate-200 bg-white/90 p-3"><p className="text-lg font-extrabold text-slate-900">{pendingCount}</p><p className="text-[11px] font-semibold text-slate-500">Pending approvals</p></div>
                  <div className="rounded-xl border border-slate-200 bg-white/90 p-3"><p className="text-lg font-extrabold text-slate-900">{activeCoursesCount}</p><p className="text-[11px] font-semibold text-slate-500">Active courses</p></div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Institution Members</p>
                  <p className="text-xs text-slate-500">Teachers, students, and admins linked to this organization.</p>
                </div>
              </div>
              {loading ? (
                <div className="flex min-h-[240px] items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
                </div>
              ) : errorMessage ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                  <AlertTriangle className="mx-auto h-9 w-9 text-slate-400" />
                  <p className="mt-2 text-sm font-medium text-slate-700">{errorMessage}</p>
                </div>
              ) : institutionUsers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                  <School className="mx-auto h-9 w-9 text-slate-400" />
                  <p className="mt-2 text-sm font-medium text-slate-700">Institution not found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {institutionUsers.map((entry) => (
                    <article key={entry.userId} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{entry.name}</p>
                          <p className="truncate text-xs text-slate-500">{entry.email}</p>
                        </div>
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                          {getRoleLabel(entry.role)}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Courses</p>
                          <p className="text-sm font-bold text-slate-900">{entry.activeCoursesCount}</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Enrollments</p>
                          <p className="text-sm font-bold text-slate-900">{entry.enrolledCoursesCount}</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Status</p>
                          <p className="text-sm font-bold text-slate-900">{entry.teacherApprovalStatus || "Ready"}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setSelectedUser(entry)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          Reassign institution
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
        </div>

        <AdminInstitutionAssignmentModal
          open={Boolean(selectedUser)}
          user={selectedUser}
          suggestions={suggestions}
          saving={savingInstitution}
          onClose={() => setSelectedUser(null)}
          onSubmit={handleAssignInstitution}
        />
      </div>
    </DashboardLayout>
  );
}
