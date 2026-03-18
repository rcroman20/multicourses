import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  CreditCard,
  GraduationCap,
  Loader2,
  MessageSquare,
  Send,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import {
  getAdminAuditLogEntries,
  appendAdminAuditLog,
  type AdminAuditLogEntry,
} from "@/lib/services/adminAuditLogService";
import {
  getAdminDirectoryDataset,
  type AdminDirectoryUserRecord,
} from "@/lib/services/adminDirectoryService";
import { assertAdminPermission } from "@/lib/services/adminPermissionGuardService";
import { notificationService, type NotificationType } from "@/lib/services/notificationService";
import { getTeacherPlanExpiryDate } from "@/lib/services/teacherPlanService";
import { isTeacherPlanExpired } from "@/lib/services/teacherPlanAccessService";

type BroadcastAudience = "all" | "teachers" | "students" | "admins";

type NotificationTemplateContext = {
  user: AdminDirectoryUserRecord | null;
};

type NotificationTemplate = {
  key: string;
  label: string;
  audience: BroadcastAudience;
  type: NotificationType;
  description: string;
  eligibleUsers: (users: AdminDirectoryUserRecord[]) => AdminDirectoryUserRecord[];
  build: (context: NotificationTemplateContext) => {
    title: string;
    message: string;
    link: string;
  };
  icon: typeof BellRing;
  toneClassName: string;
};

const formatShortDate = (value: Date | null): string => {
  if (!value) return "Not set";
  return value.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const resolveTeacherPlanExpiry = (teacher: AdminDirectoryUserRecord | null): Date | null => {
  if (!teacher) return null;
  if (teacher.teacherPlanExpiresAt) return teacher.teacherPlanExpiresAt;
  if (teacher.teacherPlanId && (teacher.teacherPlanAssignedAt || teacher.teacherApprovedAt)) {
    return getTeacherPlanExpiryDate(
      teacher.teacherPlanId,
      teacher.teacherPlanAssignedAt || teacher.teacherApprovedAt || new Date(),
    );
  }
  return null;
};

const isPlanExpiringSoon = (teacher: AdminDirectoryUserRecord): boolean => {
  if (teacher.role !== "docente") return false;
  if (isTeacherPlanExpired(teacher)) return false;
  const expiresAt = resolveTeacherPlanExpiry(teacher);
  if (!expiresAt) return false;
  const daysUntilExpiry = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
};

const teacherCandidates = (users: AdminDirectoryUserRecord[]) =>
  users.filter((entry) => entry.role === "docente" || entry.requestedRole === "docente");

const studentCandidates = (users: AdminDirectoryUserRecord[]) =>
  users.filter((entry) => entry.role === "estudiante");

const notificationTemplates: NotificationTemplate[] = [
  {
    key: "payment-reminder",
    label: "Payment reminder",
    audience: "teachers",
    type: "warning",
    description: "Teachers with pending payment validation.",
    eligibleUsers: (users) =>
      teacherCandidates(users).filter((entry) => entry.teacherPlanStatus === "pending_payment"),
    build: ({ user }) => ({
      title: user ? `Payment reminder for ${user.name}` : "Payment reminder",
      message: user
        ? `${user.name}, your ${user.teacherPlanLabel || "teacher"} plan is still pending payment validation. Complete the payment process to keep your academic operations active without interruption.`
        : "Your annual teacher plan is still pending payment validation. Complete the payment process to keep access and operational continuity active.",
      link: "/teacher-approval-waiting",
    }),
    icon: CreditCard,
    toneClassName: "border-amber-200 bg-amber-50 text-amber-700",
  },
  {
    key: "teacher-approval-update",
    label: "Teacher approval update",
    audience: "teachers",
    type: "info",
    description: "Teachers currently in approval workflow.",
    eligibleUsers: (users) =>
      teacherCandidates(users).filter((entry) => entry.teacherApprovalStatus !== null),
    build: ({ user }) => ({
      title: user ? `Teacher approval update for ${user.name}` : "Teacher approval update",
      message: user
        ? `${user.name}, your teacher access workflow is now marked as ${user.teacherApprovalStatus || "updated"}. Open your approval workspace to review the latest status and next required step.`
        : "Your teacher access request was updated by the admin team. Open your account workspace and review the latest status and next required step.",
      link: "/teacher-approval-waiting",
    }),
    icon: CheckCircle2,
    toneClassName: "border-sky-200 bg-sky-50 text-sky-700",
  },
  {
    key: "plan-expiring-soon",
    label: "Plan expiring soon",
    audience: "teachers",
    type: "warning",
    description: "Teachers whose plan expires within 30 days.",
    eligibleUsers: (users) => teacherCandidates(users).filter(isPlanExpiringSoon),
    build: ({ user }) => {
      const expiresAt = resolveTeacherPlanExpiry(user);
      return {
        title: user ? `Plan expiring soon for ${user.name}` : "Plan expiring soon",
        message: user
          ? `${user.name}, your ${user.teacherPlanLabel || "current"} plan expires on ${formatShortDate(expiresAt)}. Review renewal and payment details now to avoid service interruption.`
          : "Your current teacher plan is approaching its expiration date. Review renewal and payment details as soon as possible to avoid service interruption.",
        link: "/teacher-approval-waiting",
      };
    },
    icon: TimerReset,
    toneClassName: "border-rose-200 bg-rose-50 text-rose-700",
  },
  {
    key: "mandatory-action-required",
    label: "Mandatory action required",
    audience: "all",
    type: "warning",
    description: "Users with missing institution, pending payment, or no courses.",
    eligibleUsers: (users) =>
      users.filter(
        (entry) =>
          entry.institutionMissing ||
          entry.teacherPlanStatus === "pending_payment" ||
          (entry.role === "estudiante" && entry.enrolledCoursesCount === 0),
      ),
    build: ({ user }) => ({
      title: user ? `Mandatory action required for ${user.name}` : "Mandatory action required",
      message: user
        ? `${user.name}, the admin team requires immediate follow-up on your account workflow. Open your workspace today and complete the pending action related to ${user.institutionMissing ? "institution data" : user.teacherPlanStatus === "pending_payment" ? "plan payment" : "course enrollment"}.`
        : "The admin team requires immediate follow-up on your account or academic workflow. Open your workspace notifications and complete the pending action today.",
      link: user?.role === "docente" ? "/teacher/notifications" : "/",
    }),
    icon: ShieldCheck,
    toneClassName: "border-violet-200 bg-violet-50 text-violet-700",
  },
  {
    key: "student-without-courses",
    label: "Student without courses",
    audience: "students",
    type: "info",
    description: "Students with zero enrolled courses.",
    eligibleUsers: (users) =>
      studentCandidates(users).filter((entry) => entry.enrolledCoursesCount === 0),
    build: ({ user }) => ({
      title: user ? `Course enrollment update for ${user.name}` : "Course enrollment update",
      message: user
        ? `${user.name}, we detected that your account does not have any active course enrollments yet. Contact your teacher or institution if you should already have access.`
        : "We detected that your account does not have any active course enrollments yet. Contact your teacher or institution if you should already have access.",
      link: "/student",
    }),
    icon: GraduationCap,
    toneClassName: "border-indigo-200 bg-indigo-50 text-indigo-700",
  },
  {
    key: "institution-data-required",
    label: "Institution data required",
    audience: "students",
    type: "warning",
    description: "Students missing institution assignment.",
    eligibleUsers: (users) =>
      studentCandidates(users).filter((entry) => entry.institutionMissing),
    build: ({ user }) => ({
      title: user ? `Institution data required for ${user.name}` : "Institution data required",
      message: user
        ? `${user.name}, your account is missing institution assignment. Update your profile or contact support so the admin team can complete your academic record correctly.`
        : "Your account is missing institution assignment. Update your profile or contact support so the admin team can complete your academic record correctly.",
      link: "/profile",
    }),
    icon: Sparkles,
    toneClassName: "border-cyan-200 bg-cyan-50 text-cyan-700",
  },
];

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

const getTypeBadgeClassName = (type: NotificationType): string => {
  if (type === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (type === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-sky-200 bg-sky-50 text-sky-700";
};

const getAudienceLabel = (value: BroadcastAudience): string => {
  if (value === "teachers") return "Teachers";
  if (value === "students") return "Students";
  if (value === "admins") return "Admins";
  return "All users";
};

const buildRecipientIds = (
  users: AdminDirectoryUserRecord[],
  audience: BroadcastAudience,
): string[] => {
  if (audience === "teachers") {
    return users.filter((entry) => entry.role === "docente").map((entry) => entry.userId);
  }
  if (audience === "students") {
    return users.filter((entry) => entry.role === "estudiante").map((entry) => entry.userId);
  }
  if (audience === "admins") {
    return users.filter((entry) => entry.role === "admin").map((entry) => entry.userId);
  }
  return users.map((entry) => entry.userId);
};

export default function AdminNotificationsPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminDirectoryUserRecord[]>([]);
  const [recentBroadcasts, setRecentBroadcasts] = useState<AdminAuditLogEntry[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [type, setType] = useState<NotificationType>("info");
  const [audience, setAudience] = useState<BroadcastAudience>("all");
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>("");
  const [selectedUserId, setSelectedUserId] = useState("");

  const loadData = async () => {
    setLoading(true);
    const [directoryResult, auditResult] = await Promise.allSettled([
      getAdminDirectoryDataset(),
      getAdminAuditLogEntries(200),
    ]);

    if (directoryResult.status === "fulfilled") {
      setUsers(directoryResult.value.users);
      setWarnings(directoryResult.value.warnings);
    } else {
      setUsers([]);
      setWarnings(["Could not load notification audience data."]);
    }

    if (auditResult.status === "fulfilled") {
      setRecentBroadcasts(
        auditResult.value
          .filter((entry) => entry.category === "notification")
          .slice(0, 12),
      );
    } else {
      setRecentBroadcasts([]);
      setWarnings((current) =>
        current.includes("Could not load broadcast history.")
          ? current
          : [...current, "Could not load broadcast history."],
      );
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const counts = useMemo(
    () => ({
      all: users.length,
      teachers: users.filter((entry) => entry.role === "docente").length,
      students: users.filter((entry) => entry.role === "estudiante").length,
      admins: users.filter((entry) => entry.role === "admin").length,
    }),
    [users],
  );

  const recipientIds = useMemo(
    () => buildRecipientIds(users, audience),
    [audience, users],
  );

  const selectedTemplate = useMemo(
    () => notificationTemplates.find((entry) => entry.key === selectedTemplateKey) || null,
    [selectedTemplateKey],
  );

  const eligibleUsers = useMemo(
    () => (selectedTemplate ? selectedTemplate.eligibleUsers(users) : []),
    [selectedTemplate, users],
  );

  const selectedUser = useMemo(
    () => eligibleUsers.find((entry) => entry.userId === selectedUserId) || null,
    [eligibleUsers, selectedUserId],
  );

  const effectiveRecipientIds = useMemo(() => {
    if (selectedTemplate) {
      if (selectedUser) return [selectedUser.userId];
      return eligibleUsers.map((entry) => entry.userId);
    }
    return recipientIds;
  }, [eligibleUsers, recipientIds, selectedTemplate, selectedUser]);

  const applyTemplate = (
    template: NotificationTemplate,
    contextUser: AdminDirectoryUserRecord | null = selectedUser,
  ) => {
    const payload = template.build({ user: contextUser });
    setSelectedTemplateKey(template.key);
    setSelectedUserId(contextUser?.userId || "");
    setAudience(template.audience);
    setType(template.type);
    setTitle(payload.title);
    setMessage(payload.message);
    setLink(payload.link);
  };

  useEffect(() => {
    if (!selectedTemplateKey) return;
    if (!selectedTemplate) return;
    applyTemplate(selectedTemplate, selectedUser);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId]);

  const handleSend = async () => {
    if (title.trim().length < 4 || message.trim().length < 10) {
      toast.error("Title and message must contain enough detail.");
      return;
    }

    if (effectiveRecipientIds.length === 0) {
      toast.error("No recipients found for the selected audience.");
      return;
    }

    setSending(true);
    try {
      assertAdminPermission(
        "manageInbox",
        user?.email,
        "You do not have permission to send admin notifications.",
      );

      const deliveredCount = await notificationService.createBulkNotifications({
        recipientIds: effectiveRecipientIds,
        title,
        message,
        type,
        link: link.trim() || undefined,
      });

      await appendAdminAuditLog({
        actorEmail: user?.email || "admin",
        actorName: user?.name || "Admin",
        action: "Sent broadcast notification",
        category: "notification",
        targetType: "broadcast",
        targetLabel: title.trim(),
        detail: `${selectedTemplate?.label || getAudienceLabel(audience)} • ${deliveredCount} recipients • ${type}${link.trim() ? ` • ${link.trim()}` : ""}`,
      }).catch(() => undefined);

      setTitle("");
      setMessage("");
      setLink("");
      setType("info");
      setAudience("all");
      setSelectedTemplateKey("");
      setSelectedUserId("");
      toast.success(`Notification delivered to ${deliveredCount} recipients.`);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send notifications.");
    } finally {
      setSending(false);
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
                  <BellRing className="h-3.5 w-3.5" />
                  Admin Module
                </div>
                <div className="min-w-0">
                  <h1 className="mt-1 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                    Notifications Broadcasts
                  </h1>
                  <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                    Replace announcements with direct in-app notifications delivered to the notification bell and personal notification hubs.
                  </p>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-slate-200/60 bg-white/90 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                        <Users className="h-4 w-4" />
                      </div>
                      <p className="text-lg font-extrabold text-slate-900">{counts.all}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">Users reachable</p>
                  </div>
                  <div className="rounded-xl border border-slate-200/60 bg-white/90 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                        <GraduationCap className="h-4 w-4" />
                      </div>
                      <p className="text-lg font-extrabold text-slate-900">{counts.teachers}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">Teachers</p>
                  </div>
                  <div className="rounded-xl border border-slate-200/60 bg-white/90 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                        <MessageSquare className="h-4 w-4" />
                      </div>
                      <p className="text-lg font-extrabold text-slate-900">{counts.students}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">Students</p>
                  </div>
                  <div className="rounded-xl border border-slate-200/60 bg-white/90 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                        <ShieldCheck className="h-4 w-4" />
                      </div>
                      <p className="text-lg font-extrabold text-slate-900">{recipientIds.length}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">Current audience</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm xl:col-span-1">
                <div className="mb-3">
                  <p className="text-sm font-semibold text-slate-900">Broadcast Composer</p>
                  <p className="text-xs text-slate-500">Deliver a notification directly to the in-app bell and notification center.</p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Quick templates
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
                      {notificationTemplates.map((template) => {
                        const TemplateIcon = template.icon;
                        return (
                          <button
                            key={template.key}
                            type="button"
                            onClick={() => applyTemplate(template)}
                            className="rounded-xl border border-slate-200/60 bg-slate-50 p-3 text-left transition hover:border-slate-300/60 hover:bg-white"
                          >
                            <div className="flex items-start gap-2">
                              <div
                                className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${template.toneClassName}`}
                              >
                                <TemplateIcon className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900">{template.label}</p>
                                <p className="mt-0.5 text-xs text-slate-500">
                                  {getAudienceLabel(template.audience)} • {template.type}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">{template.description}</p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {selectedTemplate ? (
                    <select
                      value={selectedUserId}
                      onChange={(event) => setSelectedUserId(event.target.value)}
                      className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    >
                      <option value="">
                        All eligible users ({eligibleUsers.length})
                      </option>
                      {eligibleUsers.map((entry) => (
                        <option key={entry.userId} value={entry.userId}>
                          {entry.name} • {entry.role} • {entry.teacherPlanLabel || "No plan"}
                        </option>
                      ))}
                    </select>
                  ) : null}

                  <select
                    value={audience}
                    onChange={(event) => setAudience(event.target.value as BroadcastAudience)}
                    className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="all">All users ({counts.all})</option>
                    <option value="teachers">Teachers ({counts.teachers})</option>
                    <option value="students">Students ({counts.students})</option>
                    <option value="admins">Admins ({counts.admins})</option>
                  </select>

                  <select
                    value={type}
                    onChange={(event) => setType(event.target.value as NotificationType)}
                    className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="info">Info</option>
                    <option value="success">Success</option>
                    <option value="warning">Warning</option>
                  </select>

                  <input
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Notification title"
                    className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  />

                  <textarea
                    rows={5}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Message..."
                    className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  />

                  <input
                    type="text"
                    value={link}
                    onChange={(event) => setLink(event.target.value)}
                    placeholder="Optional link, e.g. /admin/dashboard"
                    className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  />

                  <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3 text-xs text-slate-600">
                    This message will appear in the notification bell and the personal notifications view of the selected audience.
                    {selectedTemplate ? ` Eligible now: ${eligibleUsers.length}.` : ""}
                    {selectedUser ? ` Current target: ${selectedUser.name}.` : ""}
                  </div>

                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => void handleSend()}
                    className="w-full rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Send className="h-3.5 w-3.5" />
                      {sending ? "Sending..." : `Send to ${effectiveRecipientIds.length} recipients`}
                    </span>
                  </button>
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm xl:col-span-2">
                <div className="mb-3">
                  <p className="text-sm font-semibold text-slate-900">Broadcast History</p>
                  <p className="text-xs text-slate-500">Recent notification pushes recorded in the audit log.</p>
                </div>

                {loading ? (
                  <div className="flex min-h-[240px] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
                  </div>
                ) : warnings.length > 0 && recentBroadcasts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
                    <AlertTriangle className="mx-auto h-9 w-9 text-slate-400" />
                    <p className="mt-2 text-sm font-medium text-slate-700">{warnings[0]}</p>
                  </div>
                ) : recentBroadcasts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
                    <BellRing className="mx-auto h-9 w-9 text-slate-400" />
                    <p className="mt-2 text-sm font-medium text-slate-700">No broadcasts yet</p>
                    <p className="text-xs text-slate-500">Send your first notification to start the log.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentBroadcasts.map((entry) => (
                      <article key={entry.id} className="rounded-xl border border-slate-200/60 bg-white p-3 shadow-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{entry.targetLabel || "Broadcast notification"}</p>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getTypeBadgeClassName(
                            entry.detail.toLowerCase().includes("warning")
                              ? "warning"
                              : entry.detail.toLowerCase().includes("success")
                                ? "success"
                                : "info",
                          )}`}>
                            notification
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">{entry.detail || "Broadcast delivered."}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {entry.actorName} • {formatDateTime(entry.createdAt)}
                        </p>
                      </article>
                    ))}
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
