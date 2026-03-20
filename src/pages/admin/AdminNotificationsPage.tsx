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
  users.filter(
    (entry) =>
      entry.hasStoredAccount &&
      (entry.role === "docente" || entry.requestedRole === "docente"),
  );

const studentCandidates = (users: AdminDirectoryUserRecord[]) =>
  users.filter((entry) => entry.hasStoredAccount && entry.role === "estudiante");

const adminCandidates = (users: AdminDirectoryUserRecord[]) =>
  users.filter((entry) => entry.hasStoredAccount && entry.role === "admin");

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
    key: "teacher-approval-pending",
    label: "Teacher approval pending",
    audience: "teachers",
    type: "info",
    description: "Teachers still waiting for approval review.",
    eligibleUsers: (users) =>
      teacherCandidates(users).filter((entry) => entry.teacherApprovalStatus === "pending"),
    build: ({ user }) => ({
      title: user ? `Approval review pending for ${user.name}` : "Approval review pending",
      message: user
        ? `${user.name}, your teacher access request is still under review. Keep your profile details up to date and monitor your workspace for the next admin update.`
        : "Your teacher access request is still under review. Keep your profile details up to date and monitor your workspace for the next admin update.",
      link: "/teacher-approval-waiting",
    }),
    icon: BellRing,
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
    key: "teacher-no-active-courses",
    label: "Teacher without active courses",
    audience: "teachers",
    type: "warning",
    description: "Teachers with no active courses at the moment.",
    eligibleUsers: (users) =>
      teacherCandidates(users).filter((entry) => entry.activeCoursesCount === 0),
    build: ({ user }) => ({
      title: user ? `Course activity reminder for ${user.name}` : "Course activity reminder",
      message: user
        ? `${user.name}, your workspace currently has no active courses linked to your teacher account. Review your course setup or contact admin support if this should already be active.`
        : "Your workspace currently has no active courses linked to your teacher account. Review your course setup or contact admin support if this should already be active.",
      link: "/teacher/courses",
    }),
    icon: GraduationCap,
    toneClassName: "border-amber-200 bg-amber-50 text-amber-700",
  },
  {
    key: "teacher-profile-required",
    label: "Teacher profile required",
    audience: "teachers",
    type: "warning",
    description: "Teachers missing institution or profile setup details.",
    eligibleUsers: (users) =>
      teacherCandidates(users).filter((entry) => entry.institutionMissing),
    build: ({ user }) => ({
      title: user ? `Profile update required for ${user.name}` : "Profile update required",
      message: user
        ? `${user.name}, your teacher profile is still missing institution details. Update your profile information so your account can be managed correctly by the admin team.`
        : "Your teacher profile is still missing institution details. Update your profile information so your account can be managed correctly by the admin team.",
      link: "/profile",
    }),
    icon: Sparkles,
    toneClassName: "border-cyan-200 bg-cyan-50 text-cyan-700",
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
          entry.hasStoredAccount &&
          (
            entry.institutionMissing ||
            entry.teacherPlanStatus === "pending_payment" ||
            (entry.role === "estudiante" && entry.enrolledCoursesCount === 0)
          ),
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
    key: "student-course-activation",
    label: "Student course activation",
    audience: "students",
    type: "success",
    description: "Students who already have active course enrollment.",
    eligibleUsers: (users) =>
      studentCandidates(users).filter((entry) => entry.enrolledCoursesCount > 0),
    build: ({ user }) => ({
      title: user ? `Courses ready for ${user.name}` : "Your courses are ready",
      message: user
        ? `${user.name}, your academic access is active and your enrolled courses are available in the student workspace. Open your dashboard to continue with your pending work.`
        : "Your academic access is active and your enrolled courses are available in the student workspace. Open your dashboard to continue with your pending work.",
      link: "/student",
    }),
    icon: CheckCircle2,
    toneClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  {
    key: "student-engagement-reminder",
    label: "Student engagement reminder",
    audience: "students",
    type: "info",
    description: "Broad reminder for all students with stored accounts.",
    eligibleUsers: (users) => studentCandidates(users),
    build: ({ user }) => ({
      title: user ? `Academic reminder for ${user.name}` : "Academic reminder",
      message: user
        ? `${user.name}, review your notifications, activities and course updates today so you stay on track with your academic schedule.`
        : "Review your notifications, activities and course updates today so you stay on track with your academic schedule.",
      link: "/student",
    }),
    icon: MessageSquare,
    toneClassName: "border-sky-200 bg-sky-50 text-sky-700",
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
  {
    key: "admin-operations-brief",
    label: "Admin operations brief",
    audience: "admins",
    type: "info",
    description: "Internal admin notice for governance or follow-up tasks.",
    eligibleUsers: (users) => adminCandidates(users),
    build: ({ user }) => ({
      title: user ? `Admin update for ${user.name}` : "Admin operations update",
      message: user
        ? `${user.name}, a new internal admin follow-up item is ready for review. Open the admin workspace to verify operational priorities and pending actions.`
        : "A new internal admin follow-up item is ready for review. Open the admin workspace to verify operational priorities and pending actions.",
      link: "/admin",
    }),
    icon: ShieldCheck,
    toneClassName: "border-violet-200 bg-violet-50 text-violet-700",
  },
];

const getTypeBadgeClassName = (type: NotificationType): string => {
  if (type === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (type === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-sky-200 bg-sky-50 text-sky-700";
};

const getTypeIcon = (type: NotificationType) => {
  if (type === "success") return CheckCircle2;
  if (type === "warning") return AlertTriangle;
  return BellRing;
};

const getPreviewTheme = (type: NotificationType) => {
  if (type === "success") {
    return {
      surface: "bg-emerald-50/70",
      accentBg: "bg-emerald-100",
      accentText: "text-emerald-700",
      badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
      chip: "bg-emerald-50 text-emerald-700",
      mutedPanel: "bg-emerald-50/60",
      softBorder: "border-emerald-200/70",
    };
  }
  if (type === "warning") {
    return {
      surface: "bg-amber-50/80",
      accentBg: "bg-amber-100",
      accentText: "text-amber-700",
      badge: "border-amber-200 bg-amber-50 text-amber-700",
      chip: "bg-amber-50 text-amber-700",
      mutedPanel: "bg-amber-50/60",
      softBorder: "border-amber-200/70",
    };
  }
  return {
    surface: "bg-sky-50/70",
    accentBg: "bg-sky-100",
    accentText: "text-sky-700",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    chip: "bg-sky-50 text-sky-700",
    mutedPanel: "bg-slate-50",
    softBorder: "border-sky-200/60",
  };
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
    return users
      .filter((entry) => entry.hasStoredAccount && entry.role === "docente")
      .map((entry) => entry.userId);
  }
  if (audience === "students") {
    return users
      .filter((entry) => entry.hasStoredAccount && entry.role === "estudiante")
      .map((entry) => entry.userId);
  }
  if (audience === "admins") {
    return users
      .filter((entry) => entry.hasStoredAccount && entry.role === "admin")
      .map((entry) => entry.userId);
  }
  return users
    .filter((entry) => entry.hasStoredAccount)
    .map((entry) => entry.userId);
};

export default function AdminNotificationsPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminDirectoryUserRecord[]>([]);
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
    const [directoryResult] = await Promise.allSettled([getAdminDirectoryDataset()]);

    if (directoryResult.status === "fulfilled") {
      setUsers(directoryResult.value.users);
      setWarnings(directoryResult.value.warnings);
    } else {
      setUsers([]);
      setWarnings(["Could not load notification audience data."]);
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const counts = useMemo(
    () => ({
      all: users.filter((entry) => entry.hasStoredAccount).length,
      teachers: users.filter((entry) => entry.hasStoredAccount && entry.role === "docente").length,
      students: users.filter((entry) => entry.hasStoredAccount && entry.role === "estudiante").length,
      admins: users.filter((entry) => entry.hasStoredAccount && entry.role === "admin").length,
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

  const effectiveRecipients = useMemo(
    () =>
      users.filter(
        (entry) => entry.hasStoredAccount && effectiveRecipientIds.includes(entry.userId),
      ),
    [effectiveRecipientIds, users],
  );

  const previewRecipients = useMemo(() => effectiveRecipients.slice(0, 5), [effectiveRecipients]);
  const PreviewTypeIcon = getTypeIcon(type);
  const previewTheme = getPreviewTheme(type);
  const draftTitle = title.trim() || "Your notification title";
  const draftMessage =
    message.trim() ||
    "Write a clear, direct message so recipients understand what changed and what action they should take next.";
  const draftLink = link.trim();
  const previewTimestamp = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const audienceLabel = selectedTemplate
    ? selectedUser
      ? `${selectedUser.name}`
      : `${getAudienceLabel(selectedTemplate.audience)} with matching conditions`
    : getAudienceLabel(audience);

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

      if (deliveredCount === 0) {
        throw new Error("Could not deliver the notification to any valid recipient.");
      }

      setTitle("");
      setMessage("");
      setLink("");
      setType("info");
      setAudience("all");
      setSelectedTemplateKey("");
      setSelectedUserId("");
      toast.success(
        deliveredCount === effectiveRecipientIds.length
          ? `Notification delivered to ${deliveredCount} recipients.`
          : `Notification delivered to ${deliveredCount} of ${effectiveRecipientIds.length} recipients.`,
      );
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
            <section className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-slate-50/70 p-4 shadow-sm">
              <div className="pointer-events-none absolute -left-16 -top-20 h-40 w-40 rounded-full bg-sky-200/20" />
              <div className="pointer-events-none absolute -bottom-24 -right-20 h-48 w-48 rounded-full bg-indigo-200/20" />

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
 
            <section className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(460px,560px)_minmax(0,1fr)]">
              <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="mb-3">
                  <p className="text-sm font-semibold text-slate-900">Broadcast Composer</p>
                  <p className="text-xs text-slate-500">Deliver a notification directly to the in-app bell and notification center.</p>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200/60 bg-slate-50/80 p-3">
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Template source
                          </p>
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            {selectedTemplate ? "Guided" : "Manual"}
                          </span>
                        </div>
                        <div className="max-w-xl">
                          <select
                            value={selectedTemplateKey}
                            onChange={(event) => {
                              const nextKey = event.target.value;
                              if (!nextKey) {
                                setSelectedTemplateKey("");
                                setSelectedUserId("");
                                return;
                              }
                              const nextTemplate =
                                notificationTemplates.find((entry) => entry.key === nextKey) || null;
                              if (!nextTemplate) return;
                              applyTemplate(nextTemplate, null);
                            }}
                            className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          >
                            <option value="">Custom message</option>
                            {notificationTemplates.map((template) => (
                              <option key={template.key} value={template.key}>
                                {template.label} • {getAudienceLabel(template.audience)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200/60 bg-white p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Template reach
                        </p>
                        <p className="mt-2 text-2xl font-extrabold leading-none text-slate-900">
                          {selectedTemplate ? eligibleUsers.length : effectiveRecipientIds.length}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {selectedTemplate ? "eligible users" : "recipients in current scope"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-slate-200/60 bg-white p-3">
                      {selectedTemplate ? (
                        <div className="flex items-start gap-3">
                          <div
                            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${selectedTemplate.toneClassName}`}
                          >
                            <selectedTemplate.icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900">{selectedTemplate.label}</p>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                {getAudienceLabel(selectedTemplate.audience)}
                              </span>
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getTypeBadgeClassName(selectedTemplate.type)}`}>
                                {selectedTemplate.type}
                              </span>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-slate-600">
                              {selectedTemplate.description}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">Custom broadcast</p>
                            <p className="mt-1 text-xs leading-5 text-slate-600">
                              Use your own title, message, audience and route when the announcement needs a fully custom delivery.
                            </p>
                          </div>
                          <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                            Freeform
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,280px)_minmax(0,220px)]">
                    <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Audience
                      </p>
                      <select
                        value={audience}
                        onChange={(event) => setAudience(event.target.value as BroadcastAudience)}
                        className="mt-2 w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                      >
                        <option value="all">All users ({counts.all})</option>
                        <option value="teachers">Teachers ({counts.teachers})</option>
                        <option value="students">Students ({counts.students})</option>
                        <option value="admins">Admins ({counts.admins})</option>
                      </select>
                    </div>

                    <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Type
                      </p>
                      <select
                        value={type}
                        onChange={(event) => setType(event.target.value as NotificationType)}
                        className="mt-2 w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                      >
                        <option value="info">Info</option>
                        <option value="success">Success</option>
                        <option value="warning">Warning</option>
                      </select>
                    </div>
                  </div>

                  {selectedTemplate ? (
                    <div className="max-w-xl rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Delivery scope
                      </p>
                      <select
                        value={selectedUserId}
                        onChange={(event) => setSelectedUserId(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
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
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 items-stretch gap-3 xl:grid-cols-[minmax(0,1fr)_260px]">
                    <div className="space-y-3">
                      <div className="max-w-xl space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Title
                        </p>
                        <input
                          type="text"
                          value={title}
                          onChange={(event) => setTitle(event.target.value)}
                          placeholder="Notification title"
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Message body
                        </p>
                        <textarea
                          rows={7}
                          value={message}
                          onChange={(event) => setMessage(event.target.value)}
                          placeholder="Write the message recipients will see in their notification center."
                          className="w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                        />
                      </div>
                    </div>

                    <div className="max-w-full rounded-2xl border border-slate-200/60 bg-slate-50 p-3 xl:h-full xl:justify-self-end">
                      <div className="flex h-full flex-col gap-3">
                        <div className="flex flex-1 flex-col rounded-xl border border-slate-200/60 bg-white p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Destination route
                          </p>
                          <div className="mt-3 flex flex-1">
                            <input
                              type="text"
                              value={link}
                              onChange={(event) => setLink(event.target.value)}
                              placeholder="Optional link, e.g. /admin/dashboard"
                              className="h-full min-h-[88px] w-full rounded-xl border border-slate-200/60 bg-slate-50 px-3 py-3 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                            />
                          </div>
                        </div>

                        <div className="flex flex-1">
                          <div className="flex w-full flex-1 flex-col rounded-xl border border-slate-200/60 bg-white p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              Delivery notes
                            </p>
                            <p className="mt-2 text-xs leading-5 text-slate-600">
                              This message will appear in the notification bell and the personal notifications view of the selected audience.
                              {selectedTemplate ? ` Eligible now: ${eligibleUsers.length}.` : ""}
                              {selectedUser ? ` Current target: ${selectedUser.name}.` : ""}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => void handleSend()}
                    className="inline-flex w-fit rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Send className="h-3.5 w-3.5" />
                      {sending ? "Sending..." : `Send to ${effectiveRecipientIds.length} recipients`}
                    </span>
                  </button>
                </div>
              </article>

              <div className="space-y-4">
                <section className={`rounded-2xl border border-slate-200/60 ${previewTheme.surface} p-4 shadow-sm sm:p-5`}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Notification Preview</p>
                      <p className="text-xs text-slate-500">
                        Same visual language as the teacher workspace, adapted for delivery review.
                      </p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${previewTheme.badge}`}>
                      {type}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,300px)]">
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${previewTheme.accentBg}`}>
                              <BellRing className={`h-4 w-4 ${previewTheme.accentText}`} />
                            </div>
                            <div>
                              <h2 className="text-base font-bold text-slate-900">Notification Center</h2>
                              <p className="text-xs text-slate-500">Recipient-facing preview</p>
                            </div>
                          </div>
                          <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                            {effectiveRecipientIds.length} users
                          </span>
                        </div>

                        <div className={`rounded-xl border ${previewTheme.softBorder} ${previewTheme.mutedPanel} p-3`}>
                          <div className="mb-3 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                            <span>Now</span>
                            <span>{previewTimestamp}</span>
                          </div>

                          <div className="flex items-start gap-3 rounded-xl border border-slate-200/60 bg-white px-3 py-3 transition-colors">
                            <div className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${previewTheme.badge}`}>
                              <PreviewTypeIcon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-slate-900">{draftTitle}</p>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${previewTheme.chip}`}>
                                  {type}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-slate-600">
                                {audienceLabel} • delivered in-app
                              </p>
                              <p className="mt-2 text-sm leading-6 text-slate-600">{draftMessage}</p>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                  {audienceLabel}
                                </span>
                                {draftLink ? (
                                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${previewTheme.chip}`}>
                                    {draftLink}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${previewTheme.accentBg}`}>
                              <Send className={`h-4 w-4 ${previewTheme.accentText}`} />
                            </div>
                            <div>
                              <h2 className="text-base font-bold text-slate-900">Delivery Summary</h2>
                              <p className="text-xs text-slate-500">Audience, template and reach</p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500">Audience</p>
                            <p className="mt-1 text-xs font-semibold leading-5 text-slate-900">{audienceLabel}</p>
                          </div>
                          <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500">Reach now</p>
                            <p className="mt-1 text-xs font-semibold leading-5 text-slate-900">{effectiveRecipientIds.length}</p>
                          </div>
                          <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500">Template</p>
                            <p className="mt-1 text-xs font-semibold leading-5 text-slate-900">
                              {selectedTemplate?.label || "Custom"}
                            </p>
                          </div>
                          <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500">Link mode</p>
                            <p className="mt-1 text-xs font-semibold leading-5 text-slate-900">
                              {draftLink ? "Deep link" : "Bell only"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex h-full flex-col xl:justify-stretch">
                      <div className="flex h-full flex-col rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm xl:min-h-full">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${previewTheme.accentBg}`}>
                              <Users className={`h-4 w-4 ${previewTheme.accentText}`} />
                            </div>
                            <div>
                              <h2 className="text-base font-bold text-slate-900">Recipient Sample</h2>
                              <p className="text-xs text-slate-500">Who is currently included</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-1 flex-col">
                          {loading ? (
                            <div className="flex flex-1 items-center justify-center rounded-xl border border-slate-200/60 bg-slate-50 py-6">
                              <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
                            </div>
                          ) : previewRecipients.length > 0 ? (
                            <div className="flex flex-1 flex-col space-y-2">
                              {previewRecipients.map((entry) => (
                                <div
                                  key={entry.userId}
                                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/60 bg-slate-50/60 px-3 py-2.5 transition-colors hover:border-slate-300/60 hover:bg-slate-50"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-slate-900">{entry.name}</p>
                                    <p className="mt-1 text-xs text-slate-600">{entry.email || "No email"}</p>
                                  </div>
                                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${previewTheme.badge}`}>
                                    {entry.role}
                                  </span>
                                </div>
                              ))}
                              <div className="mt-auto pt-1">
                                {effectiveRecipients.length > previewRecipients.length ? (
                                  <p className="text-xs text-slate-500">
                                    +{effectiveRecipients.length - previewRecipients.length} more recipients in this delivery.
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-4 text-center">
                              <div>
                                <p className="text-sm font-medium text-slate-700">No recipients available</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  No valid recipients match the current filters yet.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <div className="max-w-md">
                  <article className="self-start rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Data Warnings</p>
                        <p className="text-xs text-slate-500">Audience issues detected while loading admin data.</p>
                      </div>
                      <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                    </div>

                    {warnings.length > 0 ? (
                      <div className="mt-4 space-y-2">
                        {warnings.map((warning) => (
                          <div
                            key={warning}
                            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                          >
                            {warning}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                        Audience data loaded cleanly. No warnings detected for this broadcast.
                      </div>
                    )}
                  </article>
                </div>
              </div>

            </section>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
