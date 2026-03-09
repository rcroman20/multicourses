import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock3,
  FileText,
  Globe,
  Image as ImageIcon,
  Instagram,
  MapPin,
  Phone,
  Trash2,
  User,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { firebaseDB } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { AdminWorkspaceShell } from "@/pages/admin/components/AdminWorkspaceShell";
import { useAdminWorkspaceCounts } from "@/pages/admin/hooks/useAdminWorkspaceCounts";
import { AdminSectionHeader } from "@/pages/admin/components/common/AdminSectionHeader";
import { AdminMetricCard } from "@/pages/admin/components/common/AdminMetricCard";
import { AdminLoadingState } from "@/pages/admin/components/common/AdminLoadingState";
import { AdminEmptyState } from "@/pages/admin/components/common/AdminEmptyState";
import {
  getPendingAccountDeletionRequests,
  processAccountDeletionRequest,
  processDueAccountDeletionRequests,
  type AccountDeletionRequestRecord,
} from "@/lib/services/accountDeletionService";
import { getOwnerAdminEmail, isOwnerAdminEmail, normalizeAdminEmail } from "@/lib/services/adminAccessService";

type DeletionProfileSnapshot = {
  name: string;
  email: string;
  role: "docente" | "estudiante";
  avatarUrl: string;
  avatarEmoji: string;
  bio: string;
  phone: string;
  location: string;
  website: string;
  instagram: string;
  createdAt: Date | null;
};

const toText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

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

export default function AdminAccessDeletionsPage() {
  const { user } = useAuth();
  const { counts, refreshCounts } = useAdminWorkspaceCounts();
  const [deletionRequests, setDeletionRequests] = useState<AccountDeletionRequestRecord[]>([]);
  const [deletionProfiles, setDeletionProfiles] = useState<Record<string, DeletionProfileSnapshot>>({});
  const [loadingDeletionRequests, setLoadingDeletionRequests] = useState(false);
  const [processingDue, setProcessingDue] = useState(false);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);

  const ownerEmail = getOwnerAdminEmail();
  const normalizedUserEmail = normalizeAdminEmail(user?.email);
  const canModerateTeacherApprovals = isOwnerAdminEmail(user?.email);

  const dueRequests = useMemo(
    () =>
      deletionRequests.filter((request) => {
        const dueAt = request.scheduledDeletionAt?.getTime() || 0;
        return dueAt > 0 && dueAt <= Date.now();
      }),
    [deletionRequests],
  );

  const loadDeletionRequests = async () => {
    setLoadingDeletionRequests(true);
    try {
      const requests = await getPendingAccountDeletionRequests();
      setDeletionRequests(requests);

      const profiles = await Promise.all(
        requests.map(async (request) => {
          const [userSnap, studentSnap] = await Promise.all([
            getDoc(doc(firebaseDB, "usuarios", request.userId)),
            getDoc(doc(firebaseDB, "estudiantes", request.userId)),
          ]);

          const studentData = (studentSnap.exists() ? studentSnap.data() : {}) as Record<string, unknown>;
          const userData = (userSnap.exists() ? userSnap.data() : {}) as Record<string, unknown>;
          const merged = { ...studentData, ...userData };

          const roleRaw = toText(merged.role).toLowerCase();
          const profile: DeletionProfileSnapshot = {
            name: toText(merged.name) || request.name,
            email: toText(merged.email) || request.email,
            role: roleRaw === "docente" || roleRaw === "teacher" ? "docente" : request.role,
            avatarUrl: toText(merged.avatarUrl),
            avatarEmoji: toText(merged.avatarEmoji),
            bio: toText(merged.bio),
            phone: toText(merged.phone) || toText(merged.whatsApp) || toText(merged.whatsapp),
            location: toText(merged.location),
            website: toText(merged.website),
            instagram: toText(merged.instagram),
            createdAt: toDate(merged.createdAt),
          };
          return [request.userId, profile] as const;
        }),
      );

      setDeletionProfiles(Object.fromEntries(profiles));
    } catch {
      toast.error("Could not load account deletion requests.");
    } finally {
      setLoadingDeletionRequests(false);
    }
  };

  useEffect(() => {
    void loadDeletionRequests();
  }, []);

  const handleProcessDue = async () => {
    if (!normalizedUserEmail) return;
    if (!canModerateTeacherApprovals) {
      toast.error(`Only ${ownerEmail} can permanently delete Auth users.`);
      return;
    }

    setProcessingDue(true);
    try {
      const result = await processDueAccountDeletionRequests(normalizedUserEmail);
      if (result.processed > 0) {
        toast.success(`${result.processed} due account(s) deleted.`);
      } else {
        toast.message("No due deletion requests yet.");
      }
      await Promise.all([loadDeletionRequests(), refreshCounts()]);
    } catch (error: any) {
      const reason =
        typeof error?.message === "string" && error.message.trim().length > 0
          ? error.message
          : "Could not process due requests.";
      toast.error(reason);
    } finally {
      setProcessingDue(false);
    }
  };

  const handleApproveNow = async (request: AccountDeletionRequestRecord) => {
    if (!normalizedUserEmail) return;
    if (!canModerateTeacherApprovals) {
      toast.error(`Only ${ownerEmail} can permanently delete Auth users.`);
      return;
    }
    const confirmed = window.confirm(
      `Delete all data for ${request.email} immediately? This action cannot be undone.`,
    );
    if (!confirmed) return;

    setProcessingRequestId(request.userId);
    try {
      await processAccountDeletionRequest(request.userId, normalizedUserEmail);
      toast.success("Account deleted from Auth and Firestore.");
      await Promise.all([loadDeletionRequests(), refreshCounts()]);
    } catch (error: any) {
      const reason =
        typeof error?.message === "string" && error.message.trim().length > 0
          ? error.message
          : "Could not delete account from Firebase Auth.";
      toast.error(reason);
    } finally {
      setProcessingRequestId(null);
    }
  };

  return (
    <DashboardLayout contentClassName="pt-0 lg:pt-1">
      <AdminWorkspaceShell activeTab="deletions" counts={counts}>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <AdminSectionHeader
            icon={Clock3}
            iconClassName="border-amber-200 bg-amber-50 text-amber-700"
            title="Account Deletion Requests"
            description="Admins can delete immediately or wait for the 30-day countdown."
          />

          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <AdminMetricCard label="Total requests" value={deletionRequests.length} />
            <AdminMetricCard
              label="Due now"
              value={dueRequests.length}
              className="border-amber-200 bg-amber-50"
              labelClassName="text-amber-700"
              valueClassName="text-amber-800"
            />
          </div>

          <div className="mb-3">
            <button
              type="button"
              onClick={() => void handleProcessDue()}
              disabled={processingDue || dueRequests.length === 0 || !canModerateTeacherApprovals}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" />
              {processingDue ? "Processing..." : "Process due requests"}
            </button>
          </div>

          {loadingDeletionRequests ? (
            <AdminLoadingState message="Loading requests..." />
          ) : deletionRequests.length === 0 ? (
            <AdminEmptyState message="No account deletion requests." />
          ) : (
            <div className="space-y-2">
              {deletionRequests.map((request) => {
                const profile = deletionProfiles[request.userId];
                const dueAt = request.scheduledDeletionAt;
                const dueText = dueAt
                  ? dueAt.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "No date";
                const isDueNow = dueAt ? dueAt.getTime() <= Date.now() : false;
                const isProcessing = processingRequestId === request.userId;
                const displayName = profile?.name || request.name;
                const displayEmail = profile?.email || request.email;
                const displayRole = profile?.role || request.role;
                const displayPhone = profile?.phone || "No phone";
                const displayLocation = profile?.location || "No location";
                const displayWebsite = profile?.website || "No website";
                const displayInstagram = profile?.instagram || "No Instagram";
                const displayBio = profile?.bio || "No biography";
                const displayCreatedAt = profile?.createdAt
                  ? profile.createdAt.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "Unknown";
                const hasAvatarImage = Boolean(profile?.avatarUrl);
                const avatarLabel = (displayName || displayEmail || "U").trim().charAt(0).toUpperCase();

                return (
                  <div key={request.userId} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <div className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white text-base shadow-sm">
                          {hasAvatarImage ? (
                            <img src={profile?.avatarUrl} alt={displayName} className="h-full w-full object-cover" />
                          ) : (
                            <span>{profile?.avatarEmoji || avatarLabel}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="break-all text-sm font-semibold text-slate-900">{displayEmail}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                            <span>{displayName}</span>
                            <span className="text-slate-400">•</span>
                            <span className="capitalize">{displayRole}</span>
                            <span className="text-slate-400">•</span>
                            <span>Joined: {displayCreatedAt}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleApproveNow(request)}
                        disabled={isProcessing || !canModerateTeacherApprovals}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {isProcessing ? "Deleting..." : "Delete now"}
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
                      <p className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                        <Clock3 className="h-3.5 w-3.5 text-slate-500" />
                        Due: {dueText}
                      </p>
                      <p className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                        <Phone className="h-3.5 w-3.5 text-slate-500" />
                        {displayPhone}
                      </p>
                      <p className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                        <MapPin className="h-3.5 w-3.5 text-slate-500" />
                        {displayLocation}
                      </p>
                      <p className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                        <Globe className="h-3.5 w-3.5 text-slate-500" />
                        <span className="break-all">{displayWebsite}</span>
                      </p>
                      <p className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                        <Instagram className="h-3.5 w-3.5 text-slate-500" />
                        <span className="break-all">{displayInstagram}</span>
                      </p>
                      <p className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                        {hasAvatarImage ? (
                          <>
                            <ImageIcon className="h-3.5 w-3.5 text-slate-500" />
                            <span className="break-all">{profile?.avatarUrl}</span>
                          </>
                        ) : (
                          <>
                            <User className="h-3.5 w-3.5 text-slate-500" />
                            <span>Avatar: {profile?.avatarEmoji || avatarLabel}</span>
                          </>
                        )}
                      </p>
                    </div>

                    <div className="mt-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                      <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        <FileText className="h-3.5 w-3.5" />
                        Biography
                      </p>
                      <p className="mt-1 text-xs text-slate-700">{displayBio}</p>
                    </div>

                    {isDueNow && (
                      <div className="mt-2 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        Due now
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </AdminWorkspaceShell>
    </DashboardLayout>
  );
}
