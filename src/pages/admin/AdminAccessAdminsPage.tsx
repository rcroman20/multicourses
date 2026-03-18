import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Crown,
  Mail,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { firebaseAuth, firebaseDB } from "@/lib/firebase";
import { appendAdminAuditLog } from "@/lib/services/adminAuditLogService";
import { assertOwnerAdmin } from "@/lib/services/adminPermissionGuardService";
import {
  addAdminEmail,
  getAdminEmails,
  getOwnerAdminEmail,
  hydrateAdminEmailsFromFirestore,
  isOwnerAdminEmail,
  normalizeAdminEmail,
  persistAdminEmailsToFirestore,
  removeAdminEmail,
} from "@/lib/services/adminAccessService";

function sortAdminEmails(emails: string[]): string[] {
  return [...emails].sort((a, b) => a.localeCompare(b));
}

function getDisplayNameFromEmail(email: string): string {
  const localPart = email.split("@")[0] || "Admin";
  return localPart
    .replace(/[._-]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getInitials(name: string): string {
  const tokens = name
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 2);
  if (tokens.length === 0) return "AD";
  return tokens.map((token) => token.charAt(0).toUpperCase()).join("");
}

type AdminProfile = {
  name: string;
  avatarUrl: string;
  avatarEmoji: string;
  whatsapp: string;
};

function getAvatarUrlFromRecord(data: Record<string, unknown>): string {
  return String(data.avatarUrl || data.photoURL || data.photoUrl || "").trim();
}

type NormalizedRole = "docente" | "estudiante" | "admin" | null;

function normalizeRole(value: unknown): NormalizedRole {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();

  if (["docente", "teacher", "profesor", "professor", "instructor"].includes(normalized)) {
    return "docente";
  }
  if (["estudiante", "student", "alumno", "learner"].includes(normalized)) {
    return "estudiante";
  }
  if (["admin", "administrador", "administrator"].includes(normalized)) {
    return "admin";
  }
  return null;
}

async function validateRegisteredTeacherByEmail(email: string): Promise<{
  isRegistered: boolean;
  isTeacher: boolean;
}> {
  const [usersResult, studentsResult] = await Promise.allSettled([
    getDocs(query(collection(firebaseDB, "usuarios"), where("email", "==", email), limit(1))),
    getDocs(query(collection(firebaseDB, "estudiantes"), where("email", "==", email), limit(1))),
  ]);

  const roles: NormalizedRole[] = [];
  let found = false;

  const collectRole = (result: PromiseSettledResult<Awaited<ReturnType<typeof getDocs>>>) => {
    if (result.status !== "fulfilled" || result.value.empty) return;
    found = true;
    const data = result.value.docs[0].data() as Record<string, unknown>;
    roles.push(
      normalizeRole(data.role),
      normalizeRole(data.userRole),
      normalizeRole(data.requestedRole),
    );
  };

  collectRole(usersResult);
  collectRole(studentsResult);

  return {
    isRegistered: found,
    isTeacher: roles.includes("docente"),
  };
}

export default function AdminAccessAdminsPage() {
  const { user } = useAuth();
  const [adminEmails, setAdminEmails] = useState<string[]>([]);
  const [adminProfiles, setAdminProfiles] = useState<Record<string, AdminProfile>>({});
  const [newEmail, setNewEmail] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = () => setAdminEmails(sortAdminEmails(getAdminEmails()));
    void hydrateAdminEmailsFromFirestore().then(load);
    load();
    const onStorage = () => load();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const ownerEmail = getOwnerAdminEmail();
  const normalizedCurrentUserEmail = normalizeAdminEmail(user?.email);
  const filteredEmails = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return adminEmails;
    return adminEmails.filter((email) => email.toLowerCase().includes(term));
  }, [adminEmails, searchTerm]);

  const delegatedCount = useMemo(
    () => adminEmails.filter((email) => !isOwnerAdminEmail(email)).length,
    [adminEmails],
  );
  const currentUserHasAdminAccess = useMemo(
    () => adminEmails.includes(normalizedCurrentUserEmail),
    [adminEmails, normalizedCurrentUserEmail],
  );
  const ownerProfile = adminProfiles[ownerEmail];

  useEffect(() => {
    let isMounted = true;

    const loadAdminProfiles = async () => {
      if (adminEmails.length === 0) {
        if (isMounted) setAdminProfiles({});
        return;
      }

      const entries = await Promise.all(
        adminEmails.map(async (email) => {
          const isCurrentUserEmail = email === normalizedCurrentUserEmail;

          let name = "";
          let avatarUrl = "";
          let avatarEmoji = "";
          let whatsapp = "";

          const [usersResult, studentsResult] = await Promise.allSettled([
            getDocs(query(collection(firebaseDB, "usuarios"), where("email", "==", email), limit(1))),
            getDocs(query(collection(firebaseDB, "estudiantes"), where("email", "==", email), limit(1))),
          ]);

          const extractProfile = (
            result: PromiseSettledResult<Awaited<ReturnType<typeof getDocs>>>,
          ): AdminProfile | null => {
            if (result.status !== "fulfilled") return null;
            const docSnap = result.value.docs[0];
            if (!docSnap) return null;
            const data = docSnap.data() as Record<string, unknown>;
            return {
              name: String(data.name || "").trim(),
              avatarUrl: getAvatarUrlFromRecord(data),
              avatarEmoji: String(data.avatarEmoji || "").trim(),
              whatsapp: String(data.phone || data.whatsApp || data.whatsapp || "").trim(),
            };
          };

          const usersProfile = extractProfile(usersResult);
          const studentsProfile = extractProfile(studentsResult);

          const authPhotoUrl = isCurrentUserEmail
            ? String(firebaseAuth.currentUser?.photoURL || "").trim()
            : "";

          name =
            (isCurrentUserEmail ? user?.name?.trim() || "" : "") ||
            usersProfile?.name ||
            studentsProfile?.name ||
            getDisplayNameFromEmail(email);
          avatarUrl =
            (isCurrentUserEmail ? user?.avatarUrl?.trim() || authPhotoUrl : "") ||
            usersProfile?.avatarUrl ||
            studentsProfile?.avatarUrl;
          avatarEmoji =
            (isCurrentUserEmail ? user?.avatarEmoji?.trim() || "" : "") ||
            usersProfile?.avatarEmoji ||
            studentsProfile?.avatarEmoji;
          whatsapp =
            (isCurrentUserEmail ? user?.phone?.trim() || "" : "") ||
            usersProfile?.whatsapp ||
            studentsProfile?.whatsapp;

          return [email, { name, avatarUrl, avatarEmoji, whatsapp }] as const;
        }),
      );

      if (!isMounted) return;
      setAdminProfiles(Object.fromEntries(entries));
    };

    void loadAdminProfiles();

    return () => {
      isMounted = false;
    };
  }, [adminEmails, normalizedCurrentUserEmail, user]);

  const refreshAdminEmails = () => setAdminEmails(sortAdminEmails(getAdminEmails()));

  const handleAddAdminEmail = async () => {
    const candidate = normalizeAdminEmail(newEmail);
    if (!candidate) {
      toast.error("Email is required.");
      return;
    }
    setSubmitting(true);
    try {
      assertOwnerAdmin(user?.email, "Only the owner admin can manage admin emails.");
      const validation = await validateRegisteredTeacherByEmail(candidate);
      if (!validation.isRegistered) {
        toast.error("Email is not registered. Ask the teacher to sign up first.");
        return;
      }
      if (!validation.isTeacher) {
        toast.error("Only registered teacher accounts can be granted admin access.");
        return;
      }

      const result = addAdminEmail(candidate);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      await persistAdminEmailsToFirestore();
      await appendAdminAuditLog({
        actorEmail: user?.email || "admin",
        actorName: user?.name || "Admin",
        action: "Granted admin access",
        category: "access",
        targetType: "admin_email",
        targetLabel: candidate,
        detail: "Delegated admin added",
      }).catch(() => undefined);
      setNewEmail("");
      refreshAdminEmails();
      toast.success(result.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveAdminEmail = async (email: string) => {
    if (isOwnerAdminEmail(email)) {
      toast.error("Owner admin cannot be removed.");
      return;
    }
    const confirmRemove = window.confirm(`Remove admin access for ${email}?`);
    if (!confirmRemove) return;

    setSubmitting(true);
    try {
      assertOwnerAdmin(user?.email, "Only the owner admin can manage admin emails.");
      const result = removeAdminEmail(email);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      await persistAdminEmailsToFirestore();
      await appendAdminAuditLog({
        actorEmail: user?.email || "admin",
        actorName: user?.name || "Admin",
        action: "Revoked admin access",
        category: "access",
        targetType: "admin_email",
        targetLabel: email,
      }).catch(() => undefined);
      refreshAdminEmails();
      toast.success(result.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      toast.success("Admin email copied.");
    } catch {
      toast.error("Clipboard permission unavailable.");
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
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Admin Module
                </div>

                <div className="min-w-0">
                  <h1 className="mt-1 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                    Admin Emails
                  </h1>
                  <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                    Access control and delegation for administrative workspace permissions.
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                        <Mail className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{adminEmails.length}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Total admin emails</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                        <Crown className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">1</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Owner admin</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                        <UserCheck className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{delegatedCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Delegated admins</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">
                        {currentUserHasAdminAccess ? "Yes" : "No"}
                      </p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Your access</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm xl:col-span-2">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Admin Directory</p>
                    <p className="text-xs text-slate-500">Review who currently has platform-level admin access.</p>
                  </div>
                  <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {filteredEmails.length} shown
                  </span>
                </div>

                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search admin email..."
                    className="w-full rounded-xl border border-slate-200/60 bg-white py-2 pl-9 pr-3 text-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  />
                </div>

                {filteredEmails.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
                    <AlertTriangle className="mx-auto h-9 w-9 text-slate-400" />
                    <p className="mt-2 text-sm font-medium text-slate-700">No admin emails found</p>
                    <p className="text-xs text-slate-500">Try a different search or add a new admin email.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredEmails.map((email) => {
                      const isOwner = isOwnerAdminEmail(email);
                      const isCurrentUser = email === normalizedCurrentUserEmail;
                      const profile = adminProfiles[email];
                      const displayName = profile?.name || getDisplayNameFromEmail(email);
                      const avatarUrl = profile?.avatarUrl || "";
                      const avatarEmoji = profile?.avatarEmoji || "";
                      const whatsapp = profile?.whatsapp || "";
                      return (
                        <div
                          key={email}
                          className="rounded-xl border border-slate-200/60 bg-white px-3 py-2.5 transition-colors hover:border-slate-300/60 hover:bg-slate-50"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div className="inline-flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200/60 bg-slate-100 text-sm font-bold text-slate-700">
                                {avatarUrl ? (
                                  <img
                                    src={avatarUrl}
                                    alt={`${displayName} avatar`}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <span>{avatarEmoji || getInitials(displayName)}</span>
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                                <p className="truncate text-xs text-slate-500">{email}</p>
                                {whatsapp ? (
                                  <p className="mt-0.5 inline-flex items-center gap-1 truncate text-xs text-slate-600">
                                    {whatsapp}
                                  </p>
                                ) : null}
                                <div className="mt-1 flex items-center gap-1.5">
                                  {isOwner ? (
                                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                      Owner
                                    </span>
                                  ) : (
                                    <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                                      Delegate
                                    </span>
                                  )}
                                  {isCurrentUser ? (
                                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                      You
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => void handleCopyEmail(email)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/60 bg-white text-slate-600 transition-colors hover:border-sky-200 hover:text-sky-700"
                                aria-label={`Copy ${email}`}
                              >
                                <Copy className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                disabled={submitting || isOwner}
                                onClick={() => void handleRemoveAdminEmail(email)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/60 bg-white text-slate-600 transition-colors hover:border-rose-200 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label={`Remove ${email}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>

              <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="mb-3">
                  <p className="text-sm font-semibold text-slate-900">Add Admin Email</p>
                  <p className="text-xs text-slate-500">
                    Grant admin permissions only to registered teacher accounts.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="admin-email-input">
                    Email address
                  </label>
                  <input
                    id="admin-email-input"
                    type="email"
                    value={newEmail}
                    onChange={(event) => setNewEmail(event.target.value)}
                    placeholder="name@institution.edu"
                    className="w-full rounded-xl border border-slate-200/60 bg-white px-4 py-2.5 text-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  />

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleAddAdminEmail()}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add admin email
                  </button>
                </div>

                <div className="mt-3 rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Owner account</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200/60 bg-white text-xs font-bold text-slate-700">
                      {ownerProfile?.avatarUrl ? (
                        <img
                          src={ownerProfile.avatarUrl}
                          alt={`${ownerProfile.name || "Owner"} avatar`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span>
                          {ownerProfile?.avatarEmoji ||
                            getInitials(ownerProfile?.name || getDisplayNameFromEmail(ownerEmail))}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-900">
                        {ownerProfile?.name || getDisplayNameFromEmail(ownerEmail)}
                      </p>
                      <p className="truncate text-xs text-slate-700">{ownerEmail}</p>
                      {(ownerProfile?.whatsapp || "").trim() ? (
                        <p className="mt-0.5 inline-flex items-center gap-1 truncate text-xs text-slate-600">
                          {ownerProfile?.whatsapp}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    This owner email has permanent access and cannot be removed.
                  </p>
                </div>
              </article>
            </section>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
