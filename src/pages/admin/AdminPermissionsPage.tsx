import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import {
  CheckCircle2,
  Crown,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { firebaseDB } from "@/lib/firebase";
import { appendAdminAuditLog } from "@/lib/services/adminAuditLogService";
import { assertOwnerAdmin } from "@/lib/services/adminPermissionGuardService";
import {
  getAdminEmails,
  getOwnerAdminEmail,
  isOwnerAdminEmail,
} from "@/lib/services/adminAccessService";
import {
  getDelegatedAdminPermissions,
  hydrateDelegatedAdminPermissionsFromFirestore,
  persistDelegatedAdminPermissionsToFirestore,
  resetDelegatedAdminPermissions,
  type DelegatedAdminPermissions,
} from "@/lib/services/adminPermissionsService";

type AdminRosterItem = {
  email: string;
  name: string;
  isOwner: boolean;
};

type PermissionDefinition = {
  key: keyof DelegatedAdminPermissions;
  label: string;
  description: string;
};

const permissionDefinitions: PermissionDefinition[] = [
  {
    key: "manageTeacherApprovals",
    label: "Teacher approvals",
    description: "Review and process teacher access requests.",
  },
  {
    key: "manageTeacherOps",
    label: "Teacher ops",
    description: "Monitor workload, plans, and teacher operational signals.",
  },
  {
    key: "manageDeletions",
    label: "Deletion requests",
    description: "Process account removal queue and destructive admin actions.",
  },
  {
    key: "manageInbox",
    label: "Admin inbox",
    description: "Handle inbound requests, follow-up, and routing.",
  },
  {
    key: "manageSettings",
    label: "Settings",
    description: "Edit global platform defaults and system toggles.",
  },
  {
    key: "manageBilling",
    label: "Billing",
    description: "Manage plan registry, payment follow-up, and billing workflow.",
  },
  {
    key: "manageInstitutions",
    label: "Institutions",
    description: "Assign institution ownership and review organization coverage.",
  },
  {
    key: "manageUsersDirectory",
    label: "Users directory",
    description: "Access the global user directory and institution assignment tools.",
  },
  {
    key: "exportReports",
    label: "Reports export",
    description: "Open export packs and generate Excel or PDF reports.",
  },
  {
    key: "manageBackups",
    label: "Backups",
    description: "Manage backup monitoring and restore-adjacent operations.",
  },
];

async function getAdminDisplayName(email: string): Promise<string> {
  const [usersResult, studentsResult] = await Promise.allSettled([
    getDocs(query(collection(firebaseDB, "usuarios"), where("email", "==", email), limit(1))),
    getDocs(query(collection(firebaseDB, "estudiantes"), where("email", "==", email), limit(1))),
  ]);

  const getName = (
    result: PromiseSettledResult<Awaited<ReturnType<typeof getDocs>>>,
  ): string => {
    if (result.status !== "fulfilled") return "";
    const docSnap = result.value.docs[0];
    if (!docSnap) return "";
    const data = (docSnap.data() || {}) as Record<string, unknown>;
    return String(data.name || "").trim();
  };

  const foundName = getName(usersResult) || getName(studentsResult);
  if (foundName) return foundName;

  const localPart = email.split("@")[0] || "Admin";
  return localPart
    .replace(/[._-]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function AdminPermissionsPage() {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<DelegatedAdminPermissions | null>(null);
  const [roster, setRoster] = useState<AdminRosterItem[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPermissions(getDelegatedAdminPermissions());
    void hydrateDelegatedAdminPermissionsFromFirestore().then(setPermissions);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadRoster = async () => {
      setLoadingRoster(true);
      const emails = getAdminEmails();
      const items = await Promise.all(
        emails.map(async (email) => ({
          email,
          name: await getAdminDisplayName(email),
          isOwner: isOwnerAdminEmail(email),
        })),
      );

      if (!isMounted) return;
      setRoster(items);
      setLoadingRoster(false);
    };

    void loadRoster();

    return () => {
      isMounted = false;
    };
  }, []);

  const delegatedCount = useMemo(
    () => roster.filter((item) => !item.isOwner).length,
    [roster],
  );
  const enabledPermissionsCount = useMemo(() => {
    if (!permissions) return 0;
    return permissionDefinitions.filter((permission) => permissions[permission.key]).length;
  }, [permissions]);
  const ownerEmail = getOwnerAdminEmail();
  const ownerAdminName = useMemo(
    () => roster.find((item) => item.isOwner)?.name || ownerEmail,
    [ownerEmail, roster],
  );

  const updatePermission = (
    key: keyof DelegatedAdminPermissions,
    value: boolean,
  ) => {
    setPermissions((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = async () => {
    if (!permissions) return;
    setSaving(true);
    try {
      assertOwnerAdmin(user?.email, "Only the owner admin can change delegated admin rules.");
      await persistDelegatedAdminPermissionsToFirestore(permissions);
      await appendAdminAuditLog({
        actorEmail: user?.email || "admin",
        actorName: user?.name || "Admin",
        action: "Updated delegated admin permissions",
        category: "access",
        targetType: "delegated_permissions",
        targetLabel: "Global policy",
        detail: `${permissionDefinitions.filter((permission) => permissions[permission.key]).length} active rules`,
      }).catch(() => undefined);
      toast.success("Delegated admin rules saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save delegated admin rules.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    const next = resetDelegatedAdminPermissions();
    setPermissions(next);
    try {
      assertOwnerAdmin(user?.email, "Only the owner admin can change delegated admin rules.");
      await persistDelegatedAdminPermissionsToFirestore(next);
      await appendAdminAuditLog({
        actorEmail: user?.email || "admin",
        actorName: user?.name || "Admin",
        action: "Reset delegated admin permissions",
        category: "access",
        targetType: "delegated_permissions",
        targetLabel: "Global policy",
      }).catch(() => undefined);
      toast.success("Delegated admin rules restored to defaults.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reset delegated admin rules.");
    }
  };

  if (!permissions) {
    return (
      <DashboardLayout contentClassName="pt-0 lg:pt-1">
        <div className="flex min-h-[320px] items-center justify-center">
          <div className="space-y-2 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
            <p className="text-base font-semibold text-slate-900">Loading permissions</p>
            <p className="text-sm text-slate-600">Preparing delegated admin rules</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

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
                  <KeyRound className="h-3.5 w-3.5" />
                  Admin Module
                </div>

                <div className="min-w-0">
                  <h1 className="mt-1 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                    Permissions
                  </h1>
                  <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                    Delegated admin rules. Define what non-owner admins are allowed to operate across the workspace.
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                        <Crown className="h-4 w-4" />
                      </div>
                      <p className="truncate text-xs font-semibold text-slate-900">{ownerAdminName}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Owner admin</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                        <UserCog className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{delegatedCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Delegated admins</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                        <ShieldCheck className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-sm font-extrabold leading-5 text-slate-900">
                        {enabledPermissionsCount} / {permissionDefinitions.length}
                      </p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Enabled delegated rules</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-sm font-bold text-slate-900">Global policy</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Applied to all non-owner admins</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Delegated Capabilities</p>
                    <p className="text-xs text-slate-500">Switch access on or off for all delegated admins.</p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {permissionDefinitions.length} rules
                  </span>
                </div>

                <div className="space-y-2">
                  {permissionDefinitions.map((permission) => (
                    <div
                      key={permission.key}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{permission.label}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{permission.description}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={permissions[permission.key]}
                        aria-pressed={permissions[permission.key]}
                        onClick={() => updatePermission(permission.key, !permissions[permission.key])}
                        className={`inline-flex h-7 w-12 items-center rounded-full border p-0.5 transition ${
                          permissions[permission.key]
                            ? "justify-end border-emerald-200 bg-emerald-500"
                            : "justify-start border-slate-200 bg-slate-300"
                        }`}
                      >
                        <span className="inline-flex h-5 w-5 rounded-full bg-white shadow-sm transition" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => void handleReset()}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <RefreshCw className="h-3.5 w-3.5" />
                      Reset defaults
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSave()}
                    className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Save className="h-3.5 w-3.5" />
                      {saving ? "Saving..." : "Save rules"}
                    </span>
                  </button>
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Admin Roster</p>
                    <p className="text-xs text-slate-500">Current owner and delegated admin emails.</p>
                  </div>
                </div>

                {loadingRoster ? (
                  <div className="flex min-h-[220px] items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {roster.map((admin) => (
                      <div key={admin.email} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{admin.name}</p>
                            <p className="truncate text-xs text-slate-500">{admin.email}</p>
                          </div>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                              admin.isOwner
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-sky-200 bg-sky-50 text-sky-700"
                            }`}
                          >
                            {admin.isOwner ? "Owner" : "Delegated"}
                          </span>
                        </div>
                      </div>
                    ))}

                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500">
                      Owner permissions are fixed. The toggles on this page apply only to delegated admins.
                    </div>
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
