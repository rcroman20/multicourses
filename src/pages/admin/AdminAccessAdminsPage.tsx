import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { toast } from "sonner";
import { Mail, ShieldCheck, UserRoundCheck, Users } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { firebaseDB } from "@/lib/firebase";
import {
  addAdminEmail,
  getAdminEmails,
  getOwnerAdminEmail,
  isOwnerAdminEmail,
  normalizeAdminEmail,
  removeAdminEmail,
} from "@/lib/services/adminAccessService";
import { AdminWorkspaceShell } from "@/pages/admin/components/AdminWorkspaceShell";
import { useAdminWorkspaceCounts } from "@/pages/admin/hooks/useAdminWorkspaceCounts";
import { useAuth } from "@/contexts/AuthContext";
import { AdminSectionHeader } from "@/pages/admin/components/common/AdminSectionHeader";
import { AdminLoadingState } from "@/pages/admin/components/common/AdminLoadingState";
import { AdminEmailListItem } from "@/pages/admin/components/admins/AdminEmailListItem";

type AdminProfileSnapshot = {
  name: string;
  email: string;
  avatarUrl: string;
  avatarEmoji: string;
};

const toText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const isTeacherRole = (roleValue: unknown, requestedRoleValue: unknown): boolean => {
  const role = toText(roleValue).toLowerCase();
  const requestedRole = toText(requestedRoleValue).toLowerCase();
  return (
    role === "docente" ||
    role === "teacher" ||
    requestedRole === "docente" ||
    requestedRole === "teacher"
  );
};

export default function AdminAccessAdminsPage() {
  const { user } = useAuth();
  const { counts, refreshCounts } = useAdminWorkspaceCounts();
  const [pendingEmail, setPendingEmail] = useState("");
  const [adminEmails, setAdminEmails] = useState<string[]>(() => getAdminEmails());
  const [adminProfiles, setAdminProfiles] = useState<Record<string, AdminProfileSnapshot>>({});
  const [loadingAdminProfiles, setLoadingAdminProfiles] = useState(false);
  const [addingAdmin, setAddingAdmin] = useState(false);

  const ownerEmail = getOwnerAdminEmail();
  const normalizedUserEmail = normalizeAdminEmail(user?.email);
  const normalizedPendingEmail = useMemo(() => normalizeAdminEmail(pendingEmail), [pendingEmail]);
  const canSubmit = normalizedPendingEmail.length > 0;

  const refreshAdminEmails = () => {
    setAdminEmails(getAdminEmails());
  };

  const loadAdminProfiles = async (emails: string[]) => {
    setLoadingAdminProfiles(true);
    try {
      const profiles = await Promise.all(
        emails.map(async (email) => {
          const normalizedEmail = normalizeAdminEmail(email);
          const [usersSnap, studentsSnap] = await Promise.all([
            getDocs(
              query(collection(firebaseDB, "usuarios"), where("email", "==", normalizedEmail), limit(1)),
            ),
            getDocs(
              query(collection(firebaseDB, "estudiantes"), where("email", "==", normalizedEmail), limit(1)),
            ),
          ]);

          const studentData = studentsSnap.docs[0]?.data() || {};
          const userData = usersSnap.docs[0]?.data() || {};
          const merged = { ...studentData, ...userData } as Record<string, unknown>;

          const profile: AdminProfileSnapshot = {
            name: toText(merged.name) || normalizedEmail.split("@")[0] || "Admin",
            email: normalizedEmail,
            avatarUrl: toText(merged.avatarUrl),
            avatarEmoji: toText(merged.avatarEmoji),
          };

          return [normalizedEmail, profile] as const;
        }),
      );

      setAdminProfiles(Object.fromEntries(profiles));
    } catch {
      toast.error("Could not load admin profiles.");
    } finally {
      setLoadingAdminProfiles(false);
    }
  };

  const handleAddAdmin = async () => {
    if (addingAdmin) return;
    const normalizedEmail = normalizeAdminEmail(pendingEmail);
    if (!normalizedEmail) {
      toast.error("Email is required.");
      return;
    }

    setAddingAdmin(true);
    try {
      const [usersSnap, studentsSnap] = await Promise.all([
        getDocs(query(collection(firebaseDB, "usuarios"), where("email", "==", normalizedEmail), limit(1))),
        getDocs(
          query(collection(firebaseDB, "estudiantes"), where("email", "==", normalizedEmail), limit(1)),
        ),
      ]);

      const userData = (usersSnap.docs[0]?.data() || {}) as Record<string, unknown>;
      const studentData = (studentsSnap.docs[0]?.data() || {}) as Record<string, unknown>;
      const merged = { ...studentData, ...userData } as Record<string, unknown>;

      if (usersSnap.empty && studentsSnap.empty) {
        toast.error("This email is not registered yet. The user must register first.");
        return;
      }

      if (!isTeacherRole(merged.role, merged.requestedRole)) {
        toast.error("Only registered teacher accounts can be added as admin.");
        return;
      }

      const result = addAdminEmail(normalizedEmail);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setPendingEmail("");
      refreshAdminEmails();
      await refreshCounts();
    } catch {
      toast.error("Could not validate this user right now.");
    } finally {
      setAddingAdmin(false);
    }
  };

  const handleRemoveAdmin = async (email: string) => {
    const result = removeAdminEmail(email);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(result.message);
    refreshAdminEmails();
    await refreshCounts();
  };

  useEffect(() => {
    void loadAdminProfiles(adminEmails);
  }, [adminEmails]);

  return (
    <DashboardLayout contentClassName="pt-0 lg:pt-1">
      <AdminWorkspaceShell activeTab="admins" counts={counts}>
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <AdminSectionHeader
              icon={Users}
              iconClassName="border-sky-200 bg-sky-50 text-sky-700"
              title="Admin Emails"
              description="Emails with access to the admin section."
            />

            <div className="space-y-2">
              {loadingAdminProfiles && (
                <AdminLoadingState message="Loading admin profiles..." />
              )}

              {adminEmails.map((email) => {
                const isOwner = isOwnerAdminEmail(email);
                const isCurrent = email === normalizedUserEmail;
                const profile = adminProfiles[email];

                return (
                  <AdminEmailListItem
                    key={email}
                    email={email}
                    profile={profile}
                    isOwner={isOwner}
                    isCurrent={isCurrent}
                    onRemove={(targetEmail) => void handleRemoveAdmin(targetEmail)}
                  />
                );
              })}
            </div>
          </article>

          <aside className="space-y-4">
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Add Admin by Email</h2>
              <p className="mt-1 text-xs text-slate-500">
                User must be registered and have a teacher role to be added.
              </p>

              <label className="mt-3 block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</span>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={pendingEmail}
                    onChange={(event) => setPendingEmail(event.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    placeholder="name@example.com"
                  />
                </div>
              </label>

              <button
                type="button"
                onClick={() => void handleAddAdmin()}
                disabled={!canSubmit || addingAdmin}
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-sky-500 bg-gradient-to-b from-sky-500 to-sky-600 px-4 text-sm font-semibold text-white shadow-[0_12px_24px_-14px_rgba(2,132,199,0.95)] transition hover:from-sky-600 hover:to-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <UserRoundCheck className="h-4 w-4" />
                {addingAdmin ? "Validating..." : "Add admin email"}
              </button>
            </article>

            <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-amber-800">
                <ShieldCheck className="h-4 w-4" />
                Access Rules
              </h3>
              <ul className="mt-2 space-y-1 text-xs text-amber-800/90">
                <li>Owner admin is permanent: {ownerEmail}.</li>
                <li>Added admins can be removed anytime.</li>
                <li>Admin access is granted only by exact email match.</li>
              </ul>
            </article>
          </aside>
        </section>
      </AdminWorkspaceShell>
    </DashboardLayout>
  );
}
