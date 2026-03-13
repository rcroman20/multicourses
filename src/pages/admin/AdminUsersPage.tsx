import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  CreditCard,
  Loader2,
  Search,
  Settings,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { appendAdminAuditLog } from "@/lib/services/adminAuditLogService";
import { assertAdminPermission } from "@/lib/services/adminPermissionGuardService";
import AdminInstitutionAssignmentModal from "@/pages/admin/AdminInstitutionAssignmentModal";
import { getPendingAccountDeletionRequests } from "@/lib/services/accountDeletionService";
import {
  getAdminDirectoryDataset,
  type AdminDirectoryUserRecord,
} from "@/lib/services/adminDirectoryService";
import {
  getInstitutionSuggestions,
  saveUserInstitution,
} from "@/lib/services/institutionProfileService";

type UserFilter =
  | "all"
  | "teachers"
  | "students"
  | "admins"
  | "pending"
  | "payment"
  | "missing";

const getRoleLabel = (role: AdminDirectoryUserRecord["role"]): string => {
  if (role === "docente") return "Teacher";
  if (role === "admin") return "Admin";
  return "Student";
};

const getRoleBadgeClassName = (role: AdminDirectoryUserRecord["role"]): string => {
  if (role === "docente") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (role === "admin") return "border-indigo-200 bg-indigo-50 text-indigo-700";
  return "border-sky-200 bg-sky-50 text-sky-700";
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

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminDirectoryUserRecord[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [deletionPendingByUserId, setDeletionPendingByUserId] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<UserFilter>("all");
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<AdminDirectoryUserRecord | null>(null);
  const [savingInstitution, setSavingInstitution] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [datasetResult, suggestionsResult, deletionsResult] = await Promise.allSettled([
      getAdminDirectoryDataset(),
      getInstitutionSuggestions(),
      getPendingAccountDeletionRequests(),
    ]);

    if (datasetResult.status === "fulfilled") {
      setUsers(datasetResult.value.users);
      setWarnings(datasetResult.value.warnings);
    } else {
      setUsers([]);
      setWarnings(["Could not load user directory data."]);
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

    if (deletionsResult.status === "fulfilled") {
      setDeletionPendingByUserId(
        Object.fromEntries(deletionsResult.value.map((request) => [request.userId, true])),
      );
    } else {
      setDeletionPendingByUserId({});
      setWarnings((prev) =>
        prev.includes("Could not load deletion queue markers.")
          ? prev
          : [...prev, "Could not load deletion queue markers."],
      );
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const counts = useMemo(() => {
    const pending = users.filter((user) => user.teacherApprovalStatus === "pending").length;
    const payment = users.filter((user) => user.teacherPlanStatus === "pending_payment").length;
    const missing = users.filter((user) => user.institutionMissing).length;
    return {
      all: users.length,
      teachers: users.filter((user) => user.role === "docente").length,
      students: users.filter((user) => user.role === "estudiante").length,
      admins: users.filter((user) => user.role === "admin").length,
      pending,
      payment,
      missing,
    };
  }, [users]);

  const filterOptions = [
    { key: "all", label: "All", count: counts.all },
    { key: "teachers", label: "Teachers", count: counts.teachers },
    { key: "students", label: "Students", count: counts.students },
    { key: "admins", label: "Admins", count: counts.admins },
    { key: "pending", label: "Pending", count: counts.pending },
    { key: "payment", label: "Payment", count: counts.payment },
    { key: "missing", label: "Missing institution", count: counts.missing },
  ] as const;

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return users.filter((user) => {
      const matchesFilter =
        activeFilter === "all" ||
        (activeFilter === "teachers" && user.role === "docente") ||
        (activeFilter === "students" && user.role === "estudiante") ||
        (activeFilter === "admins" && user.role === "admin") ||
        (activeFilter === "pending" && user.teacherApprovalStatus === "pending") ||
        (activeFilter === "payment" && user.teacherPlanStatus === "pending_payment") ||
        (activeFilter === "missing" && user.institutionMissing);

      if (!matchesFilter) return false;
      if (!term) return true;

      return (
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term) ||
        user.institutionName.toLowerCase().includes(term)
      );
    });
  }, [activeFilter, searchTerm, users]);

  const handleAssignInstitution = async (institutionName: string) => {
    if (!selectedUser) return;
    setSavingInstitution(true);
    try {
      assertAdminPermission(
        "manageUsersDirectory",
        user?.email,
        "You do not have permission to update user institutions from the directory.",
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
        action: "Updated user institution",
        category: "institution",
        targetType: "user_directory",
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
                  <Users className="h-3.5 w-3.5" />
                  Admin Module
                </div>

                <div className="min-w-0">
                  <h1 className="mt-1 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                    Users Directory
                  </h1>
                  <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                    Global user directory. Search users, filter operational status, and route to the correct admin workflow.
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                        <Users className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{counts.all}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">All users</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                        <BadgeCheck className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{counts.pending}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Pending approvals</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                        <CreditCard className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{counts.payment}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Payment pending</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{counts.missing}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Missing institution</p>
                  </div>
                </div>
              </div>
            </section>

            {warnings.length > 0 ? (
              <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-700">
                {warnings.join(" ")}
              </div>
            ) : null}

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Directory Controls</p>
                  <p className="text-xs text-slate-500">Search by name, email, or institution and filter operational states.</p>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full lg:max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search users..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  />
                </div>

                <div className="w-full lg:w-[260px]">
                  <select
                    value={activeFilter}
                    onChange={(event) => setActiveFilter(event.target.value as UserFilter)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  >
                    {filterOptions.map((filter) => (
                      <option key={filter.key} value={filter.key}>
                        {filter.label} ({filter.count})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-3 lg:grid-cols-4">
              <Link to="/admin/teacher-approvals" className="block">
                <div className="rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-sky-300 hover:bg-sky-50/50">
                  <p className="text-sm font-semibold text-slate-900">Teacher approvals</p>
                  <p className="mt-1 text-xs text-slate-500">Resolve pending access requests.</p>
                </div>
              </Link>
              <Link to="/admin/billing" className="block">
                <div className="rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-sky-300 hover:bg-sky-50/50">
                  <p className="text-sm font-semibold text-slate-900">Billing</p>
                  <p className="mt-1 text-xs text-slate-500">Review payment and plan status.</p>
                </div>
              </Link>
              <Link to="/admin/admins" className="block">
                <div className="rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-sky-300 hover:bg-sky-50/50">
                  <p className="text-sm font-semibold text-slate-900">Admin emails</p>
                  <p className="mt-1 text-xs text-slate-500">Review delegated admin access.</p>
                </div>
              </Link>
              <Link to="/admin/deletions" className="block">
                <div className="rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-sky-300 hover:bg-sky-50/50">
                  <p className="text-sm font-semibold text-slate-900">Deletion requests</p>
                  <p className="mt-1 text-xs text-slate-500">Track removal queue markers.</p>
                </div>
              </Link>
            </section>

            {loading ? (
              <div className="flex min-h-[320px] items-center justify-center">
                <div className="space-y-2 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
                  <p className="text-base font-semibold text-slate-900">Loading users directory</p>
                  <p className="text-sm text-slate-600">Preparing global user registry and workflow markers</p>
                </div>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <CheckCircle2 className="mx-auto h-9 w-9 text-slate-400" />
                <p className="mt-2 text-sm font-medium text-slate-700">No users found</p>
                <p className="text-xs text-slate-500">Try a different filter or search term.</p>
              </div>
            ) : (
              <section className="space-y-2">
                {filteredUsers.map((user) => {
                  const deletionPending = Boolean(deletionPendingByUserId[user.userId]);
                  const showApprovalsLink =
                    user.teacherApprovalStatus === "pending" || user.teacherApprovalStatus === "rejected";
                  const showBillingLink = user.teacherPlanStatus === "pending_payment";

                  return (
                    <article
                      key={user.userId}
                      className="rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-slate-300 hover:bg-slate-50"
                    >
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div className="min-w-0 flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                            {user.avatarUrl ? (
                              <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
                            ) : user.avatarEmoji ? (
                              <span className="text-base">{user.avatarEmoji}</span>
                            ) : (
                              getInitials(user.name)
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getRoleBadgeClassName(user.role)}`}
                              >
                                {getRoleLabel(user.role)}
                              </span>
                              {user.teacherApprovalStatus ? (
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                    user.teacherApprovalStatus === "pending"
                                      ? "border-amber-200 bg-amber-50 text-amber-700"
                                      : user.teacherApprovalStatus === "rejected"
                                        ? "border-rose-200 bg-rose-50 text-rose-700"
                                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  }`}
                                >
                                  {user.teacherApprovalStatus}
                                </span>
                              ) : null}
                              {showBillingLink ? (
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                  payment pending
                                </span>
                              ) : null}
                              {deletionPending ? (
                                <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                                  deletion queued
                                </span>
                              ) : null}
                            </div>

                            <p className="truncate text-xs text-slate-600">{user.email || "No email"}</p>
                            <p className="truncate text-xs text-slate-500">
                              {user.institutionMissing ? "No institution" : user.institutionName}
                              {user.role === "docente" ? ` • ${user.activeCoursesCount} courses` : ""}
                              {user.role === "estudiante" ? ` • ${user.enrolledCoursesCount} enrollments` : ""}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {!user.institutionMissing ? (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
                              {user.institutionName}
                            </span>
                          ) : null}
                          {user.teacherPlanId ? (
                            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                              {user.teacherPlanLabel}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setSelectedUser(user)}
                            className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                          >
                            {user.institutionMissing ? "Assign institution" : "Reassign institution"}
                          </button>
                          {showApprovalsLink ? (
                            <Link
                              to="/admin/teacher-approvals"
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <BadgeCheck className="h-3.5 w-3.5" />
                                Approvals
                              </span>
                            </Link>
                          ) : null}
                          {showBillingLink ? (
                            <Link
                              to="/admin/billing"
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <CreditCard className="h-3.5 w-3.5" />
                                Billing
                              </span>
                            </Link>
                          ) : null}
                          {user.role === "admin" ? (
                            <Link
                              to="/admin/admins"
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <Settings className="h-3.5 w-3.5" />
                                Admins
                              </span>
                            </Link>
                          ) : null}
                          {deletionPending ? (
                            <Link
                              to="/admin/deletions"
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <Trash2 className="h-3.5 w-3.5" />
                                Deletions
                              </span>
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
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
