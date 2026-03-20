import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import {
  AlertTriangle,
  ArchiveRestore,
  BadgeCheck,School,
  Bell,
  BookOpen,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ClipboardCheck,
  CreditCard,
  Database,
  Download,
  FileBarChart2,
  FileText,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademic } from "@/contexts/AcademicContext";
import { firebaseDB } from "@/lib/firebase";
import { isOwnerAdminEmail } from "@/lib/services/adminAccessService";
import { getAdminDirectoryDataset } from "@/lib/services/adminDirectoryService";
import { canAccessDelegatedAdminPermission } from "@/lib/services/adminPermissionsService";
import { getPendingTeacherApprovalRequests } from "@/lib/services/teacherApprovalService";
import { getPendingAccountDeletionRequests } from "@/lib/services/accountDeletionService";
import { getContactMessages } from "@/lib/services/contactMessageService";
import { getPricingContactRequests } from "@/lib/services/pricingContactService";
import {
  getTeacherOnboardingCourse,
  TEACHER_ONBOARDING_COURSE_CODE,
} from "@/lib/services/teacherOnboardingService";

type AdminModuleCard = {
  key: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  iconTone: string;
};

type SnapshotMetric = {
  label: string;
  value: string;
  icon: LucideIcon;
  iconClassName: string;
  description?: string;
};

type SnapshotCard = {
  key: string;
  title: string;
  subtitle: string;
  value: string;
  suffix: string;
  hint: string;
  icon: LucideIcon;
  iconClassName: string;
  metrics: SnapshotMetric[];
};

type CriticalAlert = {
  key: string;
  title: string;
  description: string;
  count: number;
  severity: "critical" | "warning" | "info";
  icon: LucideIcon;
};

type OnboardingTeacherRow = {
  userId: string;
  name: string;
  email: string;
  institution: string;
  onboardingStatus: string;
  enrolledAt: Date | null;
  dueAt: Date | null;
  closedAt: Date | null;
  teacherApprovalStatus: string;
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
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const [year, month, day] = value.trim().split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseTimeToMinutes = (value: unknown): number | null => {
  const raw = String(value || "").trim();
  const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const normalizeEnrollmentEntry = (entry: unknown): string => {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && "id" in entry) {
    const maybeId = (entry as { id?: unknown }).id;
    return typeof maybeId === "string" ? maybeId : "";
  }
  return "";
};

const getMetricChipClassName = (iconClassName: string): string => {
  if (iconClassName.includes("indigo")) return "bg-indigo-100 text-indigo-700";
  if (iconClassName.includes("emerald")) return "bg-emerald-100 text-emerald-700";
  if (iconClassName.includes("cyan")) return "bg-cyan-100 text-cyan-700";
  if (iconClassName.includes("violet")) return "bg-violet-100 text-violet-700";
  if (iconClassName.includes("amber")) return "bg-amber-100 text-amber-700";
  if (iconClassName.includes("rose")) return "bg-rose-100 text-rose-700";
  if (iconClassName.includes("orange")) return "bg-orange-100 text-orange-700";
  if (iconClassName.includes("sky")) return "bg-sky-100 text-sky-700";
  return "bg-slate-100 text-slate-700";
};

const getAlertBadgeClassName = (severity: CriticalAlert["severity"]): string => {
  if (severity === "critical") return "border-rose-200 bg-rose-50 text-rose-700";
  if (severity === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-sky-200 bg-sky-50 text-sky-700";
};

const getHealthToneClassName = (status: string): string => {
  if (status === "Critical") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "Attention") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
};

const formatShortDate = (value: Date | null): string => {
  if (!value) return "Not set";
  return value.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const getOnboardingStatusBadgeClassName = (status: string): string => {
  if (status === "in_progress") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "closed") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200/60 bg-slate-50 text-slate-700";
};

const getOnboardingStatusLabel = (status: string): string => {
  if (status === "in_progress") return "In progress";
  if (status === "completed") return "Completed";
  if (status === "closed") return "Closed";
  return "Not started";
};

const adminModules: AdminModuleCard[] = [
  {
    key: "admins",
    title: "Admin Emails",
    description: "Access control and delegation",
    href: "/admin/admins",
    icon: Users,
    iconTone: "bg-indigo-100 text-indigo-700",
  },
  {
    key: "teacherApprovals",
    title: "Access Approvals",
    description: "Teacher and institution access review",
    href: "/admin/teacher-approvals",
    icon: BadgeCheck,
    iconTone: "bg-violet-100 text-violet-700",
  },
  {
    key: "teacherOps",
    title: "Teacher Ops",
    description: "Operational monitoring",
    href: "/admin/teacher-ops",
    icon: FileText,
    iconTone: "bg-emerald-100 text-emerald-700",
  },
  {
    key: "deletions",
    title: "Deletion Requests",
    description: "Account removal control",
    href: "/admin/deletions",
    icon: Clock3,
    iconTone: "bg-amber-100 text-amber-700",
  },
  {
    key: "inbox",
    title: "Admin Inbox",
    description: "Inbound requests and follow-up",
    href: "/admin/inbox",
    icon: MessageSquare,
    iconTone: "bg-rose-100 text-rose-700",
  },
  {
    key: "notifications",
    title: "Notifications",
    description: "Direct in-app broadcasts",
    href: "/admin/notifications",
    icon: Bell,
    iconTone: "bg-amber-100 text-amber-700",
  },
  {
    key: "settings",
    title: "Settings",
    description: "Global platform defaults",
    href: "/admin/settings",
    icon: Settings2,
    iconTone: "bg-cyan-100 text-cyan-700",
  },
  {
    key: "billing",
    title: "Billing",
    description: "Plan and payment control",
    href: "/admin/billing",
    icon: CreditCard,
    iconTone: "bg-emerald-100 text-emerald-700",
  },
  {
    key: "institutions",
    title: "Institutions",
    description: "Organizations and cohorts",
    href: "/admin/institutions",
    icon: Building2,
    iconTone: "bg-cyan-100 text-cyan-700",
  },
  {
    key: "users",
    title: "Users Directory",
    description: "Global user directory",
    href: "/admin/users",
    icon: Users,
    iconTone: "bg-indigo-100 text-indigo-700",
  },
  {
    key: "reports",
    title: "Reports",
    description: "Export and reporting packs",
    href: "/admin/reports",
    icon: FileBarChart2,
    iconTone: "bg-violet-100 text-violet-700",
  },
  {
    key: "backups",
    title: "Backups",
    description: "Snapshot monitoring",
    href: "/admin/backups",
    icon: ArchiveRestore,
    iconTone: "bg-orange-100 text-orange-700",
  },
  {
    key: "permissions",
    title: "Permissions",
    description: "Delegated admin rules",
    href: "/admin/permissions",
    icon: KeyRound,
    iconTone: "bg-lime-100 text-lime-700",
  },
];

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const { courses, assessments, loading } = useAcademic();
  const [activeSnapshotIndex, setActiveSnapshotIndex] = useState(0);
  const [quickActionMessage, setQuickActionMessage] = useState("");
  const [backupSnapshotsCount, setBackupSnapshotsCount] = useState<number | null>(null);
  const [studentCatalogIds, setStudentCatalogIds] = useState<string[] | null>(null);
  const [pendingTeacherApprovalsCount, setPendingTeacherApprovalsCount] = useState<number | null>(null);
  const [newInboxCount, setNewInboxCount] = useState<number | null>(null);
  const [pendingDeletionQueueCount, setPendingDeletionQueueCount] = useState<number | null>(null);
  const [directoryUsersCount, setDirectoryUsersCount] = useState<number | null>(null);
  const [directoryTeachersCount, setDirectoryTeachersCount] = useState<number | null>(null);
  const [missingInstitutionUsersCount, setMissingInstitutionUsersCount] = useState<number | null>(null);
  const [paymentPendingUsersCount, setPaymentPendingUsersCount] = useState<number | null>(null);
  const [onboardingWarnings, setOnboardingWarnings] = useState<string[]>([]);
  const [onboardingTeachers, setOnboardingTeachers] = useState<OnboardingTeacherRow[]>([]);
  const [onboardingCourseEnrollmentCount, setOnboardingCourseEnrollmentCount] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadBackupSnapshotsCount = async () => {
      try {
        const snapshot = await getDocs(collection(firebaseDB, "courseBackups"));
        if (isMounted) {
          setBackupSnapshotsCount(snapshot.size);
        }
      } catch {
        if (isMounted) {
          setBackupSnapshotsCount(0);
        }
      }
    };

    void loadBackupSnapshotsCount();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadStudentsCatalog = async () => {
      try {
        const snapshot = await getDocs(collection(firebaseDB, "estudiantes"));
        if (isMounted) {
          setStudentCatalogIds(snapshot.docs.map((docSnap) => docSnap.id));
        }
      } catch {
        if (isMounted) {
          setStudentCatalogIds([]);
        }
      }
    };

    void loadStudentsCatalog();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadDirectorySignals = async () => {
      try {
        const dataset = await getAdminDirectoryDataset();
        if (!isMounted) return;

        setDirectoryUsersCount(dataset.users.length);
        setDirectoryTeachersCount(
          dataset.users.filter((entry) => entry.role === "docente").length,
        );
        setMissingInstitutionUsersCount(
          dataset.users.filter((entry) => entry.institutionMissing).length,
        );
        setPaymentPendingUsersCount(
          dataset.users.filter((entry) => entry.teacherPlanStatus === "pending_payment").length,
        );
      } catch {
        if (!isMounted) return;
        setDirectoryUsersCount(0);
        setDirectoryTeachersCount(0);
        setMissingInstitutionUsersCount(0);
        setPaymentPendingUsersCount(0);
      }
    };

    void loadDirectorySignals();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadOperationalQueueCounts = async () => {
      const [approvalsResult, deletionsResult, contactResult, pricingResult] = await Promise.allSettled([
        getPendingTeacherApprovalRequests(),
        getPendingAccountDeletionRequests(),
        getContactMessages(),
        getPricingContactRequests(),
      ]);

      if (!isMounted) return;

      const pendingApprovals =
        approvalsResult.status === "fulfilled" ? approvalsResult.value.length : 0;
      const pendingDeletions =
        deletionsResult.status === "fulfilled" ? deletionsResult.value.length : 0;
      const contactNew =
        contactResult.status === "fulfilled"
          ? contactResult.value.filter((message) => message.status === "new").length
          : 0;
      const pricingNew =
        pricingResult.status === "fulfilled"
          ? pricingResult.value.filter((request) => request.status === "new").length
          : 0;

      setPendingTeacherApprovalsCount(pendingApprovals);
      setPendingDeletionQueueCount(pendingDeletions);
      setNewInboxCount(contactNew + pricingNew);
    };

    void loadOperationalQueueCounts();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadOnboardingData = async () => {
      const nextWarnings: string[] = [];
      const [usersResult, studentsResult, onboardingCourseResult] = await Promise.allSettled([
        getDocs(collection(firebaseDB, "usuarios")),
        getDocs(collection(firebaseDB, "estudiantes")),
        getTeacherOnboardingCourse(),
      ]);

      if (!isMounted) return;

      if (usersResult.status === "rejected") {
        nextWarnings.push("Could not load teacher profiles for onboarding.");
      }
      if (studentsResult.status === "rejected") {
        nextWarnings.push("Could not load student onboarding records.");
      }
      if (onboardingCourseResult.status === "rejected") {
        nextWarnings.push("Could not load onboarding course.");
      }

      const usersById = new Map<string, Record<string, unknown>>();
      if (usersResult.status === "fulfilled") {
        usersResult.value.docs.forEach((docSnap) => {
          usersById.set(docSnap.id, (docSnap.data() || {}) as Record<string, unknown>);
        });
      }

      const nextTeachers: OnboardingTeacherRow[] =
        studentsResult.status === "fulfilled"
          ? studentsResult.value.docs
              .map((docSnap) => {
                const studentData = (docSnap.data() || {}) as Record<string, unknown>;
                const userData = usersById.get(docSnap.id) || {};
                const approvalStatus = String(
                  userData.teacherApprovalStatus || studentData.teacherApprovalStatus || "",
                )
                  .trim()
                  .toLowerCase();
                const role = String(
                  userData.role || studentData.role || userData.requestedRole || "",
                )
                  .trim()
                  .toLowerCase();
                const onboardingStatus = String(studentData.teacherOnboardingStatus || "")
                  .trim()
                  .toLowerCase();

                const isTeacherLike =
                  role === "docente" ||
                  role === "teacher" ||
                  String(userData.requestedRole || studentData.requestedRole || "")
                    .trim()
                    .toLowerCase() === "docente" ||
                  approvalStatus === "approved" ||
                  onboardingStatus.length > 0;

                if (!isTeacherLike) return null;

                return {
                  userId: docSnap.id,
                  name: String(userData.name || studentData.name || "").trim() || "Teacher",
                  email: String(userData.email || studentData.email || "").trim(),
                  institution: String(
                    userData.teacherInstitutionName ||
                      userData.institutionName ||
                      studentData.teacherInstitutionName ||
                      studentData.institutionName ||
                      "",
                  ).trim(),
                  onboardingStatus,
                  enrolledAt: toDate(studentData.teacherOnboardingEnrolledAt),
                  dueAt: toDate(studentData.teacherOnboardingDueAt),
                  closedAt: toDate(studentData.teacherOnboardingClosedAt),
                  teacherApprovalStatus: approvalStatus,
                } satisfies OnboardingTeacherRow;
              })
              .filter((item): item is OnboardingTeacherRow => item !== null)
              .sort((left, right) => left.name.localeCompare(right.name))
          : [];

      setOnboardingTeachers(nextTeachers);
      setOnboardingCourseEnrollmentCount(
        onboardingCourseResult.status === "fulfilled" && onboardingCourseResult.value
          ? onboardingCourseResult.value.enrolledStudents.length
          : 0,
      );
      setOnboardingWarnings(nextWarnings);
    };

    void loadOnboardingData();

    return () => {
      isMounted = false;
    };
  }, []);

  const teacherCourses = useMemo(
    () => courses.filter((course) => String(course.teacherId || "").trim().length > 0),
    [courses],
  );

  const scheduledClasses = useMemo(
    () =>
      teacherCourses.reduce((acc, course) => {
        const classSchedule = Array.isArray(course.classSchedule) ? course.classSchedule : [];
        return acc + classSchedule.length;
      }, 0),
    [teacherCourses],
  );

  const lowHealthCourses = useMemo(() => {
    return courses
      .map((course) => {
        const courseId = String(course.id || "");
        const teacherName = String(course.teacherName || "").trim() || "Unassigned teacher";
        const teacherAssigned = String(course.teacherId || "").trim().length > 0;
        const enrolledCount = Array.isArray(course.enrolledStudents) ? course.enrolledStudents.length : 0;
        const scheduleCount = Array.isArray(course.classSchedule) ? course.classSchedule.length : 0;

        const courseAssessments = assessments.filter(
          (assessment) => String((assessment as { courseId?: unknown }).courseId || "") === courseId,
        );

        const overdueCount = courseAssessments.filter((assessment) => {
          const dueDate = toDate((assessment as { dueDate?: unknown }).dueDate);
          return dueDate ? dueDate.getTime() < Date.now() : false;
        }).length;

        const missingDueCount = courseAssessments.filter(
          (assessment) => !toDate((assessment as { dueDate?: unknown }).dueDate),
        ).length;

        const teacherScore = teacherAssigned ? 100 : 0;
        const enrollmentScore = enrolledCount > 0 ? clamp((enrolledCount / 20) * 100, 0, 100) : 0;
        const scheduleScore = scheduleCount > 0 ? clamp(scheduleCount * 35, 0, 100) : 0;
        const assessmentBaseScore = courseAssessments.length > 0 ? 100 : 30;
        const assessmentScore = clamp(
          assessmentBaseScore - overdueCount * 18 - missingDueCount * 12,
          0,
          100,
        );

        const healthScore = Math.round(
          teacherScore * 0.3 +
            enrollmentScore * 0.25 +
            scheduleScore * 0.15 +
            assessmentScore * 0.3,
        );

        return {
          id: courseId,
          courseName: String(course.name || "Course"),
          courseCode: String(course.code || "N/A"),
          teacherName,
          healthScore,
          enrolledCount,
          overdueCount,
          missingDueCount,
        };
      })
      .filter((course) => course.healthScore < 50)
      .sort((a, b) => a.healthScore - b.healthScore);
  }, [assessments, courses]);
  const lowHealthCoursesCount = lowHealthCourses.length;
  const lowHealthTeacherAlerts = useMemo(() => lowHealthCourses.slice(0, 6), [lowHealthCourses]);
  const totalParticipantsInScope = useMemo(
    () =>
      courses.reduce((sum, course) => {
        const enrolled = Array.isArray(course.enrolledStudents) ? course.enrolledStudents.length : 0;
        return sum + enrolled;
      }, 0),
    [courses],
  );
  const studentsWithoutCoursesCount = useMemo(() => {
    if (studentCatalogIds === null) return null;

    const enrolledIds = new Set<string>();
    courses.forEach((course) => {
      const enrolled = Array.isArray(course.enrolledStudents) ? course.enrolledStudents : [];
      enrolled
        .map(normalizeEnrollmentEntry)
        .filter((studentId): studentId is string => studentId.length > 0)
        .forEach((studentId) => enrolledIds.add(studentId));
    });

    return studentCatalogIds.reduce(
      (count, studentId) => (enrolledIds.has(studentId) ? count : count + 1),
      0,
    );
  }, [courses, studentCatalogIds]);
  const totalTeachersInScope = useMemo(
    () =>
      new Set(
        courses
          .map((course) => String(course.teacherId || "").trim())
          .filter((teacherId) => teacherId.length > 0),
      ).size,
    [courses],
  );
  const totalTeachers = directoryTeachersCount ?? totalTeachersInScope;
  const coursesWithoutTeacher = useMemo(
    () => courses.filter((course) => String(course.teacherId || "").trim().length === 0).length,
    [courses],
  );
  const coursesWithoutStudents = useMemo(
    () =>
      courses.filter((course) => {
        const enrolled = Array.isArray(course.enrolledStudents) ? course.enrolledStudents.length : 0;
        return enrolled === 0;
      }).length,
    [courses],
  );
  const courseIdSet = useMemo(() => new Set(courses.map((course) => String(course.id || ""))), [courses]);
  const assessmentsWithoutDueDate = useMemo(
    () =>
      assessments.filter(
        (assessment) => !toDate((assessment as { dueDate?: unknown }).dueDate),
      ).length,
    [assessments],
  );
  const assessmentsWithoutCourseLink = useMemo(
    () =>
      assessments.filter((assessment) => {
        const courseId = String((assessment as { courseId?: unknown }).courseId || "");
        return !courseId || !courseIdSet.has(courseId);
      }).length,
    [assessments, courseIdSet],
  );
  const duplicateCourseCodeCount = useMemo(() => {
    const codeMap = new Map<string, number>();
    courses.forEach((course) => {
      const code = String(course.code || "").trim().toLowerCase();
      if (!code) return;
      codeMap.set(code, (codeMap.get(code) || 0) + 1);
    });
    return Array.from(codeMap.values()).filter((value) => value > 1).length;
  }, [courses]);
  const invalidCreditsCount = useMemo(
    () =>
      courses.filter((course) => {
        const credits = Number(course.credits);
        return !Number.isFinite(credits) || credits <= 0;
      }).length,
    [courses],
  );
  const invalidClassScheduleCount = useMemo(
    () =>
      courses.reduce((sum, course) => {
        const schedule = Array.isArray(course.classSchedule) ? course.classSchedule : [];
        const invalidInCourse = schedule.filter((slot) => {
          const dayOfWeek = Number((slot as { dayOfWeek?: unknown }).dayOfWeek);
          const startMinutes = parseTimeToMinutes((slot as { startTime?: unknown }).startTime);
          const endMinutes = parseTimeToMinutes((slot as { endTime?: unknown }).endTime);
          if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return true;
          if (startMinutes === null || endMinutes === null) return true;
          return endMinutes <= startMinutes;
        }).length;
        return sum + invalidInCourse;
      }, 0),
    [courses],
  );

  const criticalAlerts = useMemo<CriticalAlert[]>(
    () => [
      {
        key: "assessments-without-course",
        title: "Assessments without valid course",
        description: "Assessment records that do not map to an existing course.",
        count: assessmentsWithoutCourseLink,
        severity: "critical",
        icon: AlertTriangle,
      },
      {
        key: "low-health-courses",
        title: "Low health courses",
        description: "Courses below 50 health score that require admin follow-up.",
        count: lowHealthCoursesCount,
        severity: "warning",
        icon: AlertTriangle,
      },
      {
        key: "courses-without-teacher",
        title: "Courses without teacher",
        description: "Courses that currently have no assigned teacher owner.",
        count: coursesWithoutTeacher,
        severity: "warning",
        icon: Users,
      },
      {
        key: "assessments-without-due-date",
        title: "Assessments without due date",
        description: "Assessments missing due dates reduce scheduling quality.",
        count: assessmentsWithoutDueDate,
        severity: "warning",
        icon: CalendarClock,
      },
      {
        key: "empty-courses",
        title: "Courses with zero students",
        description: "Classes with no enrolled students.",
        count: coursesWithoutStudents,
        severity: "info",
        icon: ShieldCheck,
      },
    ],
    [
      assessmentsWithoutCourseLink,
      lowHealthCoursesCount,
      coursesWithoutTeacher,
      assessmentsWithoutDueDate,
      coursesWithoutStudents,
    ],
  );

  const visibleAlerts = useMemo(() => criticalAlerts.filter((alert) => alert.count > 0), [criticalAlerts]);
  const criticalCount = useMemo(
    () => visibleAlerts.filter((alert) => alert.severity === "critical").length,
    [visibleAlerts],
  );
  const warningCount = useMemo(
    () => visibleAlerts.filter((alert) => alert.severity === "warning").length,
    [visibleAlerts],
  );
  const healthStatus = criticalCount > 0 ? "Critical" : warningCount > 0 ? "Attention" : "Healthy";

  const integrityChecks = useMemo(
    () => [
      {
        key: "duplicate-codes",
        label: "Duplicate course codes",
        value: duplicateCourseCodeCount,
        icon: FileBarChart2,
        tone: duplicateCourseCodeCount > 0 ? "text-amber-600" : "text-emerald-600",
      },
      {
        key: "invalid-schedule",
        label: "Invalid class schedule entries",
        value: invalidClassScheduleCount,
        icon: CalendarClock,
        tone: invalidClassScheduleCount > 0 ? "text-amber-600" : "text-emerald-600",
      },
      {
        key: "invalid-credits",
        label: "Courses with invalid credits",
        value: invalidCreditsCount,
        icon: CreditCard,
        tone: invalidCreditsCount > 0 ? "text-amber-600" : "text-emerald-600",
      },
      {
        key: "assessment-course",
        label: "Assessments with invalid course link",
        value: assessmentsWithoutCourseLink,
        icon: AlertTriangle,
        tone: assessmentsWithoutCourseLink > 0 ? "text-rose-600" : "text-emerald-600",
      },
      {
        key: "assessment-due",
        label: "Assessments without due date",
        value: assessmentsWithoutDueDate,
        icon: Clock3,
        tone: assessmentsWithoutDueDate > 0 ? "text-amber-600" : "text-emerald-600",
      },
    ],
    [
      assessmentsWithoutCourseLink,
      assessmentsWithoutDueDate,
      duplicateCourseCodeCount,
      invalidClassScheduleCount,
      invalidCreditsCount,
    ],
  );

  const integrityIssueTotal = useMemo(
    () => integrityChecks.reduce((sum, check) => sum + check.value, 0),
    [integrityChecks],
  );
  const actionableOpsTotal = useMemo(
    () =>
      (pendingTeacherApprovalsCount || 0) +
      (newInboxCount || 0) +
      (pendingDeletionQueueCount || 0),
    [newInboxCount, pendingDeletionQueueCount, pendingTeacherApprovalsCount],
  );
  const onboardingInProgressCount = useMemo(
    () =>
      onboardingTeachers.filter((teacher) => teacher.onboardingStatus === "in_progress").length,
    [onboardingTeachers],
  );
  const onboardingCompletedCount = useMemo(
    () =>
      onboardingTeachers.filter((teacher) => teacher.onboardingStatus === "completed").length,
    [onboardingTeachers],
  );
  const onboardingClosedCount = useMemo(
    () =>
      onboardingTeachers.filter((teacher) => teacher.onboardingStatus === "closed").length,
    [onboardingTeachers],
  );
  const onboardingOverdueCount = useMemo(() => {
    const now = Date.now();
    return onboardingTeachers.filter(
      (teacher) =>
        teacher.onboardingStatus === "in_progress" &&
        teacher.dueAt &&
        teacher.dueAt.getTime() < now,
    ).length;
  }, [onboardingTeachers]);
  const operationalHealthChecks = useMemo(
    () => [
      {
        key: "pending-approvals",
        label: "Pending approvals",
        value: pendingTeacherApprovalsCount,
        hint: "Teachers still waiting for access review.",
      },
      {
        key: "deletion-queue",
        label: "Deletion queue",
        value: pendingDeletionQueueCount,
        hint: "Account removal requests not processed yet.",
      },
      {
        key: "unresolved-inbox",
        label: "Unresolved inbox",
        value: newInboxCount,
        hint: "Inbound requests still requiring follow-up.",
      },
      {
        key: "missing-institution",
        label: "Missing institution",
        value: missingInstitutionUsersCount,
        hint: "Users missing organization linkage.",
      },
      {
        key: "payment-pending",
        label: "Payment pending",
        value: paymentPendingUsersCount,
        hint: "Teachers with incomplete plan payment setup.",
      },
      {
        key: "users-indexed",
        label: "Users indexed",
        value: directoryUsersCount,
        hint: "Directory records available for admin monitoring.",
      },
    ],
    [
      directoryUsersCount,
      missingInstitutionUsersCount,
      newInboxCount,
      paymentPendingUsersCount,
      pendingDeletionQueueCount,
      pendingTeacherApprovalsCount,
    ],
  );
  const onboardingPriorityTeachers = useMemo(
    () =>
      onboardingTeachers
        .filter(
          (teacher) =>
            teacher.onboardingStatus === "in_progress" || teacher.onboardingStatus === "closed",
        )
        .sort((left, right) => {
          const leftDue = left.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
          const rightDue = right.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
          return leftDue - rightDue;
        })
        .slice(0, 8),
    [onboardingTeachers],
  );

  const snapshotCards = useMemo<SnapshotCard[]>(
    () => [
      {
        key: "platform",
        title: "Platform Snapshot",
        subtitle: "Global academic activity",
        value: courses.length.toLocaleString("en-US"),
        suffix: "courses",
        hint: "Live overview from current academic data loaded in the workspace.",
        icon: LayoutDashboard,
        iconClassName: "text-sky-700",
        metrics: [
          {
            label: "Teacher courses",
            value: teacherCourses.length.toLocaleString("en-US"),
            icon: Users,
            iconClassName: "text-emerald-600",
            description: "Courses with an assigned teacher. If this drops, review assignments.",
          },
          {
            label: "Class slots",
            value: scheduledClasses.toLocaleString("en-US"),
            icon: CalendarClock,
            iconClassName: "text-cyan-700",
            description: "Loaded schedule blocks. Fix courses with missing schedules.",
          },
          {
            label: "Integrity",
            value: integrityIssueTotal.toLocaleString("en-US"),
            icon: Database,
            iconClassName: integrityIssueTotal > 0 ? "text-amber-600" : "text-emerald-600",
            description: "Data incidents. Review them in the integrity panel.",
          },
          {
            label: "Students without courses",
            value:
              studentsWithoutCoursesCount === null
                ? "..."
                : studentsWithoutCoursesCount.toLocaleString("en-US"),
            icon: AlertTriangle,
            iconClassName:
              studentsWithoutCoursesCount === null
                ? "text-slate-500"
                : studentsWithoutCoursesCount > 0
                  ? "text-amber-600"
                  : "text-emerald-600",
            description: "Students without assigned courses. Check enrollments or cohorts.",
          },
        ],
      },
      {
        key: "risk",
        title: "Risk Alerts",
        subtitle: "Urgent follow-up window",
        value: visibleAlerts.length.toLocaleString("en-US"),
        suffix: "alerts",
        hint: "Combined count of critical and warning operational alerts.",
        icon: Clock3,
        iconClassName: visibleAlerts.length > 0 ? "text-rose-600" : "text-emerald-600",
        metrics: [
          {
            label: "Critical",
            value: criticalCount.toLocaleString("en-US"),
            icon: AlertTriangle,
            iconClassName: criticalCount > 0 ? "text-rose-600" : "text-emerald-600",
            description: "Active critical alert categories. Prioritize immediate resolution.",
          },
          {
            label: "Invalid course links",
            value: assessmentsWithoutCourseLink.toLocaleString("en-US"),
            icon: AlertTriangle,
            iconClassName: assessmentsWithoutCourseLink > 0 ? "text-rose-600" : "text-emerald-600",
            description: "Assessments without a valid course. Fix courseId to prevent errors.",
          },
          {
            label: "Load",
            value: loading.assessments ? "Loading" : "Ready",
            icon: LayoutDashboard,
            iconClassName: loading.assessments ? "text-amber-600" : "text-emerald-600",
            description: "Assessment load state. If it stays on Loading, refresh.",
          },
          {
            label: "Admin",
            value: user?.name || "Admin",
            icon: ShieldCheck,
            iconClassName: "text-sky-700",
            description: "Admin in session for operational follow-up.",
          },
        ],
      },
      {
        key: "queue",
        title: "Operational Queue",
        subtitle: "Admin requests and follow-up",
        value: actionableOpsTotal.toLocaleString("en-US"),
        suffix: "open ops",
        hint: "Pending approvals, inbound messages, and deletion queue requiring attention.",
        icon: Database,
        iconClassName: "text-cyan-700",
        metrics: [
          {
            label: "Pending approvals",
            value:
              pendingTeacherApprovalsCount === null
                ? "..."
                : pendingTeacherApprovalsCount.toLocaleString("en-US"),
            icon: BadgeCheck,
            iconClassName:
              pendingTeacherApprovalsCount === null
                ? "text-slate-500"
                : pendingTeacherApprovalsCount > 0
                  ? "text-amber-600"
                  : "text-emerald-600",
            description: "Accounts waiting for approval. Review Access Approvals.",
          },
          {
            label: "Inbox new",
            value: newInboxCount === null ? "..." : newInboxCount.toLocaleString("en-US"),
            icon: MessageSquare,
            iconClassName:
              newInboxCount === null
                ? "text-slate-500"
                : newInboxCount > 0
                  ? "text-amber-600"
                  : "text-emerald-600",
            description: "New contact and pricing messages to resolve.",
          },
          {
            label: "Deletion queue",
            value:
              pendingDeletionQueueCount === null
                ? "..."
                : pendingDeletionQueueCount.toLocaleString("en-US"),
            icon: Clock3,
            iconClassName:
              pendingDeletionQueueCount === null
                ? "text-slate-500"
                : pendingDeletionQueueCount > 0
                  ? "text-rose-600"
                  : "text-emerald-600",
            description: "Pending deletion requests awaiting processing.",
          },
          {
            label: "Backups",
            value: backupSnapshotsCount === null ? "..." : backupSnapshotsCount.toLocaleString("en-US"),
            icon: ArchiveRestore,
            iconClassName: backupSnapshotsCount === null ? "text-slate-500" : "text-orange-600",
            description: "Backup monitoring. Verify snapshots and operational continuity.",
          },
        ],
      },
    ],
    [
      courses.length,
      criticalCount,
      integrityIssueTotal,
      actionableOpsTotal,
      studentsWithoutCoursesCount,
      assessmentsWithoutCourseLink,
      backupSnapshotsCount,
      newInboxCount,
      pendingDeletionQueueCount,
      pendingTeacherApprovalsCount,
      loading.assessments,
      scheduledClasses,
      teacherCourses.length,
      user?.name,
      visibleAlerts.length,
    ],
  );

  const activeSnapshot = snapshotCards[activeSnapshotIndex] || snapshotCards[0];
  const ActiveSnapshotIcon = activeSnapshot.icon;
  const visibleAdminModules = useMemo(() => {
    const isOwner = isOwnerAdminEmail(user?.email);

    return adminModules.filter((module) => {
      if (module.key === "admins" || module.key === "permissions") return isOwner;
      if (module.key === "teacherApprovals") {
        return canAccessDelegatedAdminPermission("manageTeacherApprovals", user?.email);
      }
      if (module.key === "teacherOps") {
        return canAccessDelegatedAdminPermission("manageTeacherOps", user?.email);
      }
      if (module.key === "deletions") {
        return canAccessDelegatedAdminPermission("manageDeletions", user?.email);
      }
      if (module.key === "inbox") {
        return canAccessDelegatedAdminPermission("manageInbox", user?.email);
      }
      if (module.key === "notifications") {
        return canAccessDelegatedAdminPermission("manageInbox", user?.email);
      }
      if (module.key === "settings") {
        return canAccessDelegatedAdminPermission("manageSettings", user?.email);
      }
      if (module.key === "billing") {
        return canAccessDelegatedAdminPermission("manageBilling", user?.email);
      }
      if (module.key === "institutions") {
        return canAccessDelegatedAdminPermission("manageInstitutions", user?.email);
      }
      if (module.key === "users") {
        return canAccessDelegatedAdminPermission("manageUsersDirectory", user?.email);
      }
      if (module.key === "reports") {
        return canAccessDelegatedAdminPermission("exportReports", user?.email);
      }
      if (module.key === "backups") {
        return canAccessDelegatedAdminPermission("manageBackups", user?.email);
      }
      return true;
    });
  }, [user?.email]);

  const goPreviousSnapshot = () => {
    if (snapshotCards.length <= 1) return;
    setActiveSnapshotIndex((current) => (current - 1 + snapshotCards.length) % snapshotCards.length);
  };

  const goNextSnapshot = () => {
    if (snapshotCards.length <= 1) return;
    setActiveSnapshotIndex((current) => (current + 1) % snapshotCards.length);
  };

  const setFlashMessage = (message: string) => {
    setQuickActionMessage(message);
    window.setTimeout(() => setQuickActionMessage(""), 2400);
  };

  const exportIntegrityReport = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      generatedBy: user?.email || "admin",
      summary: {
        healthStatus,
        criticalAlerts: criticalCount,
        warningAlerts: warningCount,
        integrityIssues: integrityIssueTotal,
      },
      alerts: visibleAlerts.map((alert) => ({
        key: alert.key,
        title: alert.title,
        severity: alert.severity,
        count: alert.count,
        description: alert.description,
      })),
      integrity: integrityChecks.map((check) => ({
        key: check.key,
        label: check.label,
        count: check.value,
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `admin-integrity-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setFlashMessage("Integrity report exported.");
  };

  const copyHealthSummary = async () => {
    const summary = [
      `Admin Health: ${healthStatus}`,
      `Critical alerts: ${criticalCount}`,
      `Warning alerts: ${warningCount}`,
      `Integrity issues: ${integrityIssueTotal}`,
      `Courses: ${courses.length}`,
      `Assessments: ${assessments.length}`,
    ].join(" | ");

    try {
      await navigator.clipboard.writeText(summary);
      setFlashMessage("Health summary copied.");
    } catch {
      setFlashMessage("Clipboard permission unavailable.");
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
                  <Sparkles className="h-3.5 w-3.5" />
                  Admin Dashboard
                </div>

                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="min-w-0">
                    <h1 className="mt-1 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">Administrative Control Surface</h1>
                    <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                      Unified monitoring for operations, governance, and academic platform workload.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-teal-100 text-teal-700">
                        <BookOpen className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{courses.length}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Courses</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                        <Users className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{totalParticipantsInScope}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Students</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                        <GraduationCap className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{totalTeachers}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Teachers</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                        <ShieldCheck className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{visibleAdminModules.length}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Admin modules</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Operational System Health</p>
                  <p className="text-xs text-slate-500">Workflow pressure, queue status, and directory coverage in one place.</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getHealthToneClassName(healthStatus)}`}>
                  {healthStatus}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {operationalHealthChecks.map((item) => {
                  const resolvedValue = item.value ?? 0;
                  const isLoadingValue = item.value === null;
                  const toneClass = isLoadingValue
                    ? "border-slate-200/60 bg-slate-50 text-slate-700"
                    : resolvedValue > 0
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700";

                  return (
                    <div key={item.key} className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${toneClass}`}>
                          {isLoadingValue ? "Loading" : resolvedValue > 0 ? "Attention" : "Healthy"}
                        </span>
                      </div>
                      <p className="mt-2 text-2xl font-extrabold text-slate-900">
                        {isLoadingValue ? "..." : resolvedValue.toLocaleString("en-US")}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{item.hint}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <article className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm xl:col-span-2">
                <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-sky-200/35" />
                <div className="pointer-events-none absolute -right-24 -bottom-24 h-64 w-64 rounded-full bg-indigo-200/35" />

                <div className="relative space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="inline-flex items-center gap-1 rounded-full border border-slate-200/60 bg-slate-50 px-2 py-0.5">
                        <ActiveSnapshotIcon className={`h-3.5 w-3.5 ${activeSnapshot.iconClassName}`} />
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                          {activeSnapshot.title}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{activeSnapshot.subtitle}</p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={goPreviousSnapshot}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/60 bg-white text-slate-600 transition-colors hover:border-sky-200 hover:text-sky-700"
                        aria-label="Previous snapshot"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={goNextSnapshot}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/60 bg-white text-slate-600 transition-colors hover:border-sky-200 hover:text-sky-700"
                        aria-label="Next snapshot"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-end gap-1">
                    <p className={`text-3xl font-extrabold leading-none ${activeSnapshot.iconClassName}`}>{activeSnapshot.value}</p>
                    <span className="pb-1 text-sm font-semibold text-slate-500">{activeSnapshot.suffix}</span>
                  </div>

                  <p className="text-sm text-slate-600">{activeSnapshot.hint}</p>

                  <div className="grid grid-cols-2 gap-2">
                    {activeSnapshot.metrics.map((metric) => (
                      <div key={metric.label} className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${getMetricChipClassName(metric.iconClassName)}`}>
                            <metric.icon className="h-4 w-4" />
                          </div>
                          <p className={`shrink-0 text-lg font-extrabold leading-5 ${metric.iconClassName}`}>{metric.value}</p>
                        </div>
                        <p className="mt-1 text-[11px] font-semibold uppercase leading-4 text-slate-500">{metric.label}</p>
                        {metric.description ? (
                          <p className="mt-0.5 text-[10px] leading-4 text-slate-500">{metric.description}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-center gap-1.5">
                    {snapshotCards.map((item, index) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setActiveSnapshotIndex(index)}
                        className={`h-2 rounded-full transition-all ${
                          index === activeSnapshotIndex ? "w-6 bg-sky-600" : "w-2 bg-slate-300 hover:bg-slate-400"
                        }`}
                        aria-label={`Go to ${item.title}`}
                      />
                    ))}
                  </div>
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Data Integrity</p>
                    <p className="text-xs text-slate-500">Consistency and quality checks across records.</p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    integrityIssueTotal > 0
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}>
                    {integrityIssueTotal} issues
                  </span>
                </div>

                <div className="space-y-2">
                  {integrityChecks.map((check) => (
                    <div
                      key={check.key}
                      className="rounded-xl border border-slate-200/60 bg-white px-3 py-2.5 transition-colors hover:border-slate-300/60 hover:bg-slate-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${getMetricChipClassName(check.tone)}`}>
                            <check.icon className="h-3.5 w-3.5" />
                          </div>
                          <p className="truncate text-xs font-semibold  tracking-wide text-slate-600">{check.label}</p>
                        </div>
                        <p className={`text-base font-extrabold ${check.tone}`}>{check.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <section className="space-y-4">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Critical Alerts Center</p>
                      <p className="text-xs text-slate-500">Priority anomalies requiring admin action.</p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getHealthToneClassName(healthStatus)}`}>
                      {healthStatus}
                    </span>
                  </div>

                  {visibleAlerts.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
                      <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" />
                      <p className="mt-2 text-sm font-medium text-slate-700">No critical alerts</p>
                      <p className="text-xs text-slate-500">Current workspace checks are healthy.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {visibleAlerts.slice(0, 5).map((alert) => (
                        <div
                          key={alert.key}
                          className="rounded-xl border border-slate-200/60 bg-white px-3 py-2.5 transition-colors hover:border-slate-300/60 hover:bg-slate-50"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${getAlertBadgeClassName(alert.severity)}`}>
                                  <alert.icon className="h-3.5 w-3.5" />
                                </div>
                                <p className="truncate text-sm font-semibold text-slate-900">{alert.title}</p>
                              </div>
                              <p className="mt-1 text-xs text-slate-600">{alert.description}</p>
                            </div>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getAlertBadgeClassName(alert.severity)}`}>
                              {alert.count}
                            </span>
                          </div>
                        </div>
                      ))}

                      {lowHealthTeacherAlerts.length > 0 ? (
                        <div className="rounded-xl border border-slate-200/60 bg-slate-50/70 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                              Low Health Course Alerts
                            </p>
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              {lowHealthTeacherAlerts.length} below 50
                            </span>
                          </div>
                          <div className="space-y-2">
                            {lowHealthTeacherAlerts.map((item) => (
                              <div
                                key={item.id}
                                className="rounded-xl border border-slate-200/60 bg-white px-3 py-2.5"
                              >
                                <div className="flex items-start gap-2">
                                  <div className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
                                    <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-900">
                                      {item.courseName}
                                    </p>
                                    <p className="mt-0.5 truncate text-xs text-slate-600">
                                      {item.courseCode} • {item.enrolledCount} students
                                    </p>
                                    <p className="mt-0.5 text-xs text-slate-600">
                                      Teacher:{" "}
                                      <span className="font-semibold text-slate-800">
                                        {item.teacherName}
                                      </span>
                                    </p>
                                    <p className="text-[10px] font-semibold  tracking-wide text-amber-700">
                                      Health {item.healthScore}/100 • Overdue {item.overdueCount} • Missing due {item.missingDueCount}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </article>

                <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Quick Admin Actions</p>
                      <p className="text-xs text-slate-500">Shortcuts for operations and diagnostics.</p>
                    </div>
                    <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      4 actions
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      to="/courses"
                      className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-center text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                    >
                      Open courses
                    </Link>
                    <button
                      type="button"
                      onClick={exportIntegrityReport}
                      className="rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <Download className="mr-1.5 inline h-3.5 w-3.5" />
                      Export report
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyHealthSummary()}
                      className="rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <ClipboardCheck className="mr-1.5 inline h-3.5 w-3.5" />
                      Copy summary
                    </button>
                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      className="rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <RefreshCw className="mr-1.5 inline h-3.5 w-3.5" />
                      Refresh view
                    </button>
                  </div>

                  {quickActionMessage ? (
                    <p className="mt-2 text-xs font-semibold text-sky-700">{quickActionMessage}</p>
                  ) : null}
                </article>
              </div>

              <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Mandatory Teacher Onboarding</p>
                    <p className="text-xs text-slate-500">
                      Teacher progress against {TEACHER_ONBOARDING_COURSE_CODE} and due-date follow-up.
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {onboardingTeachers.length} teachers
                  </span>
                </div>

                {onboardingWarnings.length > 0 ? (
                  <div className="mb-3 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-700">
                    {onboardingWarnings.join(" ")}
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                        <Users className="h-4 w-4" />
                      </div>
                      <p className="text-lg font-extrabold leading-5 text-slate-900">{onboardingInProgressCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">In progress</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                      <p className="text-lg font-extrabold leading-5 text-slate-900">{onboardingCompletedCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Completed</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <p className="text-lg font-extrabold leading-5 text-slate-900">{onboardingOverdueCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Overdue</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                        <School className="h-4 w-4" />
                      </div>
                      <p className="text-lg font-extrabold leading-5 text-slate-900">
                        {onboardingCourseEnrollmentCount === null ? "..." : onboardingCourseEnrollmentCount}
                      </p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">
                      {TEACHER_ONBOARDING_COURSE_CODE} enrollments
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
                  <div className="xl:col-span-2">
                    {onboardingPriorityTeachers.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
                        <CheckCircle2 className="mx-auto h-9 w-9 text-slate-400" />
                        <p className="mt-2 text-sm font-medium text-slate-700">No onboarding records found</p>
                        <p className="text-xs text-slate-500">Teacher onboarding data will appear here once generated.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {onboardingPriorityTeachers.map((teacher) => (
                          <article
                            key={teacher.userId}
                            className="rounded-xl border border-slate-200/60 bg-white p-3 transition-colors hover:border-slate-300/60 hover:bg-slate-50"
                          >
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate text-sm font-semibold text-slate-900">{teacher.name}</p>
                                  <span
                                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getOnboardingStatusBadgeClassName(teacher.onboardingStatus)}`}
                                  >
                                    {getOnboardingStatusLabel(teacher.onboardingStatus)}
                                  </span>
                                  {teacher.teacherApprovalStatus ? (
                                    <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                      approval {teacher.teacherApprovalStatus}
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-1 truncate text-xs text-slate-600">{teacher.email || "No email"}</p>
                                <p className="mt-0.5 text-xs text-slate-500">
                                  {teacher.institution || "No institution"} • enrolled {formatShortDate(teacher.enrolledAt)}
                                </p>
                              </div>

                              <div className="grid grid-cols-2 gap-2 sm:min-w-[240px]">
                                <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-2 py-1 text-center">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Due</p>
                                  <p className="text-sm font-bold text-slate-900">{formatShortDate(teacher.dueAt)}</p>
                                </div>
                                <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-2 py-1 text-center">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Closed</p>
                                  <p className="text-sm font-bold text-slate-900">{formatShortDate(teacher.closedAt)}</p>
                                </div>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200/60 bg-slate-50/70 p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Onboarding Summary</p>
                        <p className="text-xs text-slate-500">Operational checkpoint for teacher enablement.</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="rounded-xl border border-slate-200/60 bg-white px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Completed</p>
                        <p className="mt-1 text-lg font-extrabold text-emerald-700">{onboardingCompletedCount}</p>
                        <p className="mt-0.5 text-[10px] leading-4 text-slate-500">Teachers who finished the mandatory onboarding path.</p>
                      </div>
                      <div className="rounded-xl border border-slate-200/60 bg-white px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Closed</p>
                        <p className="mt-1 text-lg font-extrabold text-rose-700">{onboardingClosedCount}</p>
                        <p className="mt-0.5 text-[10px] leading-4 text-slate-500">Expired or closed onboarding cases requiring admin review.</p>
                      </div>
                      <div className="rounded-xl border border-slate-200/60 bg-white px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Action</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">Focus on overdue teachers first</p>
                        <p className="mt-0.5 text-[10px] leading-4 text-slate-500">Use Access Approvals or Teacher Ops if an account still needs plan or access follow-up.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Admin Modules</p>
                    <p className="text-xs text-slate-500">Navigate to each operational area.</p>
                  </div>
                  <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {visibleAdminModules.length} total
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {visibleAdminModules.map((module) => {
                    const Icon = module.icon;
                    return (
                      <Link
                        key={module.key}
                        to={module.href}
                        className="group rounded-xl border border-slate-200/60 bg-white p-3 text-left transition-colors hover:border-sky-300 hover:bg-sky-50/50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{module.title}</p>
                            <p className="mt-0.5 text-xs text-slate-500">{module.description}</p>
                          </div>
                          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${module.iconTone}`}>
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </article>
            </section>

          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
