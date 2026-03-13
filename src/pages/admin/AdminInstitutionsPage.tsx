import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  CheckCircle2,
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

type InstitutionSummary = {
  key: string;
  label: string;
  users: AdminDirectoryUserRecord[];
  totalUsers: number;
  teachers: number;
  students: number;
  pendingApprovals: number;
  activeCourses: number;
  ownership: string[];
  types: string[];
};

const getRoleLabel = (role: AdminDirectoryUserRecord["role"]): string => {
  if (role === "docente") return "Teacher";
  if (role === "admin") return "Admin";
  return "Student";
};

const getApprovalBadgeClassName = (
  status: AdminDirectoryUserRecord["teacherApprovalStatus"],
): string => {
  if (status === "pending") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "rejected") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
};

const getInitials = (name: string): string => {
  const tokens = name
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 2);
  if (tokens.length === 0) return "U";
  return tokens.map((token) => token.charAt(0).toUpperCase()).join("");
};

export default function AdminInstitutionsPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminDirectoryUserRecord[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selectedInstitutionKey, setSelectedInstitutionKey] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminDirectoryUserRecord | null>(null);
  const [savingInstitution, setSavingInstitution] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [datasetResult, suggestionsResult] = await Promise.allSettled([
      getAdminDirectoryDataset(),
      getInstitutionSuggestions(),
    ]);

    if (datasetResult.status === "fulfilled") {
      setUsers(datasetResult.value.users);
      setWarnings(datasetResult.value.warnings);
    } else {
      setUsers([]);
      setWarnings(["Could not load institution directory data."]);
    }

    if (suggestionsResult.status === "fulfilled") {
      setSuggestions(suggestionsResult.value);
    } else {
      setSuggestions([]);
      setWarnings((prev) =>
        prev.includes("Could not load institution suggestions.")
          ? prev
          : [...prev, "Could not load institution suggestions."],
      );
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const institutions = useMemo<InstitutionSummary[]>(() => {
    const grouped = new Map<string, InstitutionSummary>();

    users.forEach((user) => {
      if (user.institutionMissing || !user.institutionName) return;
      const key = getInstitutionKey(user.institutionName);
      const existing = grouped.get(key) || {
        key,
        label: user.institutionName,
        users: [],
        totalUsers: 0,
        teachers: 0,
        students: 0,
        pendingApprovals: 0,
        activeCourses: 0,
        ownership: [],
        types: [],
      };

      existing.users.push(user);
      existing.totalUsers += 1;
      if (user.role === "docente") existing.teachers += 1;
      if (user.role === "estudiante") existing.students += 1;
      if (user.teacherApprovalStatus === "pending") existing.pendingApprovals += 1;
      existing.activeCourses += user.activeCoursesCount;
      if (user.institutionOwnership && !existing.ownership.includes(user.institutionOwnership)) {
        existing.ownership.push(user.institutionOwnership);
      }
      if (user.institutionType && !existing.types.includes(user.institutionType)) {
        existing.types.push(user.institutionType);
      }

      grouped.set(key, existing);
    });

    return Array.from(grouped.values()).sort((left, right) => left.label.localeCompare(right.label));
  }, [users]);

  useEffect(() => {
    if (institutions.length === 0) {
      setSelectedInstitutionKey("");
      return;
    }
    const exists = institutions.some((institution) => institution.key === selectedInstitutionKey);
    if (!exists) {
      setSelectedInstitutionKey(institutions[0].key);
    }
  }, [institutions, selectedInstitutionKey]);

  const selectedInstitution =
    institutions.find((institution) => institution.key === selectedInstitutionKey) || null;
  const usersWithInstitution = users.filter((user) => !user.institutionMissing).length;
  const missingInstitutionUsers = users.filter((user) => user.institutionMissing);

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
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                  <Building2 className="h-3.5 w-3.5" />
                  Admin Module
                </div>

                <div className="min-w-0">
                  <h1 className="mt-1 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                    Institutions
                  </h1>
                  <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                    Organizations and cohorts. This release focuses on institution-level monitoring and assignment.
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700">
                        <School className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{institutions.length}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Organizations</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                        <Users className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{usersWithInstitution}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Users linked</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{missingInstitutionUsers.length}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Missing institution</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                        <BadgeCheck className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">
                        {institutions.reduce((sum, institution) => sum + institution.pendingApprovals, 0)}
                      </p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Pending approvals</p>
                  </div>
                </div>
              </div>
            </section>

            {warnings.length > 0 ? (
              <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-700">
                {warnings.join(" ")}
              </div>
            ) : null}

            {loading ? (
              <div className="flex min-h-[320px] items-center justify-center">
                <div className="space-y-2 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
                  <p className="text-base font-semibold text-slate-900">Loading institutions</p>
                  <p className="text-sm text-slate-600">Preparing organization metrics and assignment data</p>
                </div>
              </div>
            ) : institutions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <CheckCircle2 className="mx-auto h-9 w-9 text-slate-400" />
                <p className="mt-2 text-sm font-medium text-slate-700">No institutions detected</p>
                <p className="text-xs text-slate-500">Link users to an institution to populate this module.</p>
              </div>
            ) : (
              <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Organizations</p>
                      <p className="text-xs text-slate-500">Institution groups detected across profiles.</p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {institutions.length} total
                    </span>
                  </div>

                  <div className="space-y-2">
                    {institutions.map((institution) => (
                      <button
                        key={institution.key}
                        type="button"
                        onClick={() => setSelectedInstitutionKey(institution.key)}
                        className={`w-full rounded-xl border p-3 text-left transition-colors ${
                          institution.key === selectedInstitutionKey
                            ? "border-sky-300 bg-sky-50 shadow-sm"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{institution.label}</p>
                            <p className="truncate text-xs text-slate-500">
                              {institution.totalUsers} users • {institution.activeCourses} active courses
                            </p>
                          </div>
                          {institution.pendingApprovals > 0 ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              {institution.pendingApprovals} pending
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-1.5">
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-center">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Teachers</p>
                            <p className="text-sm font-bold text-slate-900">{institution.teachers}</p>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-center">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Students</p>
                            <p className="text-sm font-bold text-slate-900">{institution.students}</p>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-center">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Courses</p>
                            <p className="text-sm font-bold text-slate-900">{institution.activeCourses}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </article>

                <div className="space-y-4 lg:col-span-2">
                  {selectedInstitution ? (
                    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{selectedInstitution.label}</p>
                          <p className="text-xs text-slate-500">Institution detail, descriptors, and member routing.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                            {selectedInstitution.totalUsers} users
                          </span>
                          <Link
                            to={`/admin/institutions/${selectedInstitution.key}`}
                            className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                          >
                            Open detail
                          </Link>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Teachers</p>
                          <p className="text-lg font-bold text-slate-900">{selectedInstitution.teachers}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Students</p>
                          <p className="text-lg font-bold text-slate-900">{selectedInstitution.students}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Pending</p>
                          <p className="text-lg font-bold text-slate-900">{selectedInstitution.pendingApprovals}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Courses</p>
                          <p className="text-lg font-bold text-slate-900">{selectedInstitution.activeCourses}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {selectedInstitution.ownership.map((item) => (
                          <span
                            key={`ownership-${item}`}
                            className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700"
                          >
                            {item}
                          </span>
                        ))}
                        {selectedInstitution.types.map((item) => (
                          <span
                            key={`type-${item}`}
                            className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700"
                          >
                            {item}
                          </span>
                        ))}
                      </div>

                      <div className="mt-4 space-y-2">
                        {selectedInstitution.users.map((user) => (
                          <div
                            key={user.userId}
                            className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-slate-300 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0 flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                                {user.avatarUrl ? (
                                  <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
                                ) : user.avatarEmoji ? (
                                  <span className="text-base">{user.avatarEmoji}</span>
                                ) : (
                                  getInitials(user.name)
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                                <p className="truncate text-xs text-slate-500">
                                  {user.email || "No email"} • {getRoleLabel(user.role)}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {user.teacherApprovalStatus ? (
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getApprovalBadgeClassName(user.teacherApprovalStatus)}`}
                                >
                                  {user.teacherApprovalStatus === "approved"
                                    ? "Approved"
                                    : user.teacherApprovalStatus === "pending"
                                      ? "Pending"
                                      : "Rejected"}
                                </span>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => setSelectedUser(user)}
                                className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                              >
                                Reassign
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  ) : null}

                  <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Missing Institution</p>
                        <p className="text-xs text-slate-500">Users that still need an organization assignment.</p>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {missingInstitutionUsers.length} open
                      </span>
                    </div>

                    {missingInstitutionUsers.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
                        <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" />
                        <p className="mt-2 text-sm font-medium text-slate-700">All users have an institution</p>
                        <p className="text-xs text-slate-500">No assignment gaps detected in the current directory.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {missingInstitutionUsers.slice(0, 8).map((user) => (
                          <div
                            key={user.userId}
                            className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-slate-300 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                              <p className="truncate text-xs text-slate-500">
                                {user.email || "No email"} • {getRoleLabel(user.role)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedUser(user)}
                              className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                            >
                              Assign institution
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                </div>
              </section>
            )}
          </section>
        </div>
      </div>

      <AdminInstitutionAssignmentModal
        open={Boolean(selectedUser)}
        user={selectedUser}
        suggestions={suggestions}
        saving={savingInstitution}
        onClose={() => setSelectedUser(null)}
        onSubmit={handleAssignInstitution}
      />
    </DashboardLayout>
  );
}
