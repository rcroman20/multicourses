import { type ComponentType, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAcademic } from "@/contexts/AcademicContext";
import { useAuth } from "@/contexts/AuthContext";
import { getAccessibleCoursesForUser } from "@/lib/courseAccess";
import { firebaseDB } from "@/lib/firebase";
import { getPendingAccountDeletionRequests } from "@/lib/services/accountDeletionService";
import { getContactMessages } from "@/lib/services/contactMessageService";
import { getPricingContactRequests } from "@/lib/services/pricingContactService";
import { getTeacherApprovalRequests } from "@/lib/services/teacherApprovalService";
import { getTeacherPlanExpiryDate, resolveTeacherPlanId } from "@/lib/services/teacherPlanService";
import {
  AlertCircle,
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  GraduationCap,
  MapPin,
  X,
} from "lucide-react";

type CalendarMode = "upcoming" | "all" | "past";
type AdminActivitySort = "priority" | "chronological";
type AdminTimelineFilter =
  | "all"
  | "courses"
  | "accounts"
  | "approvals"
  | "plans"
  | "inbox"
  | "backups"
  | "account_deletions";
type CalendarEventType =
  | "start"
  | "due"
  | "class"
  | "course_created"
  | "account_created"
  | "teacher_approval_request"
  | "plan_purchased"
  | "plan_expiring"
  | "inbox_request"
  | "deletion_request"
  | "backup_created";

interface CalendarEvent {
  id: string;
  courseId: string;
  courseName: string;
  courseCode: string;
  assessmentId?: string;
  title: string;
  type: CalendarEventType;
  date: Date;
  endDate?: Date;
  location?: string;
  detail?: string;
  actorName?: string;
  navigationPath?: string | null;
};

type AdminAccountRow = {
  id: string;
  email: string;
  name: string;
  role: "docente" | "estudiante" | "admin" | "";
  createdAt: Date | null;
  teacherPlanLabel: string;
  teacherPlanId: string;
  teacherPlanAssignedAt: Date | null;
  teacherPlanExpiresAt: Date | null;
  teacherPlanStatus: string;
};

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const converter = value as { toDate: () => Date };
    return converter.toDate();
  }
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split("-").map(Number);
      return new Date(year, month - 1, day, 12, 0, 0, 0);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function normalizeCourseLookup(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDayKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function withTime(baseDate: Date, hhmm: string): Date | null {
  const parts = hhmm.split(":").map(Number);
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
  const [hour, minute] = parts;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    hour,
    minute,
    0,
    0,
  );
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getMonthGrid(monthDate: Date): Array<Date | null> {
  const first = startOfMonth(monthDate);
  const firstWeekday = first.getDay();
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();

  const cells: Array<Date | null> = [];

  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

function formatEventTime(event: CalendarEvent): string {
  if (event.type === "class" && event.endDate) {
    return `${event.date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    })} - ${event.endDate.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  return event.date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isUrgentPlanExpiry(event: CalendarEvent): boolean {
  if (event.type !== "plan_expiring") return false;
  const diffMs = event.date.getTime() - Date.now();
  return diffMs >= 0 && diffMs <= 30 * 24 * 60 * 60 * 1000;
}

function getAdminEventPriority(event: CalendarEvent): number {
  if (event.type === "teacher_approval_request") return 0;
  if (event.type === "inbox_request") return 1;
  if (event.type === "plan_expiring") return isUrgentPlanExpiry(event) ? 2 : 4;
  if (event.type === "deletion_request") return 3;
  if (event.type === "plan_purchased") return 5;
  if (event.type === "account_created") return 6;
  if (event.type === "course_created") return 7;
  if (event.type === "backup_created") return 8;
  return 10;
}

function getEventIcon(event: CalendarEvent): ComponentType<{ className?: string }> {
  if (event.type === "due") return Clock3;
  if (event.type === "start") return CalendarDays;
  if (event.type === "course_created") return BookOpen;
  if (event.type === "account_created") return CheckCircle2;
  if (event.type === "teacher_approval_request") return GraduationCap;
  if (event.type === "plan_purchased") return AlertCircle;
  if (event.type === "plan_expiring") return Clock3;
  if (event.type === "inbox_request") return AlertCircle;
  if (event.type === "deletion_request") return X;
  if (event.type === "backup_created") return CheckCircle2;
  return GraduationCap;
}

function getEventTypeLabel(event: CalendarEvent): string {
  if (event.type === "due") return "Due date";
  if (event.type === "start") return "Start date";
  if (event.type === "course_created") return "Course created";
  if (event.type === "account_created") return "Account created";
  if (event.type === "teacher_approval_request") return "Teacher approval";
  if (event.type === "plan_purchased") return "Plan activated";
  if (event.type === "plan_expiring") return "Plan expires";
  if (event.type === "inbox_request") return "Inbox request";
  if (event.type === "deletion_request") return "Deletion request";
  if (event.type === "backup_created") return "Backup snapshot";
  return "Class session";
}

function getTypeTone(event: CalendarEvent): string {
  if (event.type === "due") return "border-amber-200 bg-amber-50 text-amber-700";
  if (event.type === "start") return "border-sky-200 bg-sky-50 text-sky-700";
  if (event.type === "course_created") return "border-indigo-200 bg-indigo-50 text-indigo-700";
  if (event.type === "account_created") return "border-cyan-200 bg-cyan-50 text-cyan-700";
  if (event.type === "teacher_approval_request") return "border-teal-200 bg-teal-50 text-teal-700";
  if (event.type === "plan_purchased") return "border-violet-200 bg-violet-50 text-violet-700";
  if (event.type === "plan_expiring") {
    return isUrgentPlanExpiry(event)
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700";
  }
  if (event.type === "inbox_request") return "border-amber-200 bg-amber-50 text-amber-700";
  if (event.type === "deletion_request") return "border-rose-200 bg-rose-50 text-rose-700";
  if (event.type === "backup_created") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function getTypeIconTone(event: CalendarEvent): string {
  if (event.type === "due") return "bg-amber-100 text-amber-700";
  if (event.type === "start") return "bg-sky-100 text-sky-700";
  if (event.type === "course_created") return "bg-indigo-100 text-indigo-700";
  if (event.type === "account_created") return "bg-cyan-100 text-cyan-700";
  if (event.type === "teacher_approval_request") return "bg-teal-100 text-teal-700";
  if (event.type === "plan_purchased") return "bg-violet-100 text-violet-700";
  if (event.type === "plan_expiring") {
    return isUrgentPlanExpiry(event)
      ? "bg-rose-100 text-rose-700"
      : "bg-fuchsia-100 text-fuchsia-700";
  }
  if (event.type === "inbox_request") return "bg-amber-100 text-amber-700";
  if (event.type === "deletion_request") return "bg-rose-100 text-rose-700";
  if (event.type === "backup_created") return "bg-emerald-100 text-emerald-700";
  return "bg-emerald-100 text-emerald-700";
}

function getEventDotTone(event: CalendarEvent): string {
  if (event.type === "due") return "bg-amber-500";
  if (event.type === "start") return "bg-sky-500";
  if (event.type === "course_created") return "bg-indigo-500";
  if (event.type === "account_created") return "bg-cyan-500";
  if (event.type === "teacher_approval_request") return "bg-teal-500";
  if (event.type === "plan_purchased") return "bg-violet-500";
  if (event.type === "plan_expiring") return isUrgentPlanExpiry(event) ? "bg-rose-500" : "bg-fuchsia-500";
  if (event.type === "inbox_request") return "bg-amber-500";
  if (event.type === "deletion_request") return "bg-rose-500";
  if (event.type === "backup_created") return "bg-emerald-500";
  return "bg-emerald-500";
}

function getAdminFilterTheme(filter: AdminTimelineFilter) {
  if (filter === "courses") {
    return {
      badge: "border-indigo-200 bg-indigo-50 text-indigo-700",
      leftGlow: "bg-indigo-300/25",
      rightGlow: "bg-violet-300/20",
      primaryIcon: "bg-indigo-100 text-indigo-700",
      secondaryIcon: "bg-violet-100 text-violet-700",
    };
  }
  if (filter === "accounts") {
    return {
      badge: "border-cyan-200 bg-cyan-50 text-cyan-700",
      leftGlow: "bg-cyan-300/25",
      rightGlow: "bg-sky-300/20",
      primaryIcon: "bg-cyan-100 text-cyan-700",
      secondaryIcon: "bg-sky-100 text-sky-700",
    };
  }
  if (filter === "plans") {
    return {
      badge: "border-violet-200 bg-violet-50 text-violet-700",
      leftGlow: "bg-violet-300/25",
      rightGlow: "bg-amber-300/20",
      primaryIcon: "bg-violet-100 text-violet-700",
      secondaryIcon: "bg-amber-100 text-amber-700",
    };
  }
  if (filter === "approvals") {
    return {
      badge: "border-teal-200 bg-teal-50 text-teal-700",
      leftGlow: "bg-teal-300/25",
      rightGlow: "bg-cyan-300/20",
      primaryIcon: "bg-teal-100 text-teal-700",
      secondaryIcon: "bg-cyan-100 text-cyan-700",
    };
  }
  if (filter === "inbox") {
    return {
      badge: "border-amber-200 bg-amber-50 text-amber-700",
      leftGlow: "bg-amber-300/25",
      rightGlow: "bg-orange-300/20",
      primaryIcon: "bg-amber-100 text-amber-700",
      secondaryIcon: "bg-orange-100 text-orange-700",
    };
  }
  if (filter === "backups") {
    return {
      badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
      leftGlow: "bg-emerald-300/25",
      rightGlow: "bg-teal-300/20",
      primaryIcon: "bg-emerald-100 text-emerald-700",
      secondaryIcon: "bg-teal-100 text-teal-700",
    };
  }
  if (filter === "account_deletions") {
    return {
      badge: "border-rose-200 bg-rose-50 text-rose-700",
      leftGlow: "bg-rose-300/25",
      rightGlow: "bg-amber-300/20",
      primaryIcon: "bg-rose-100 text-rose-700",
      secondaryIcon: "bg-amber-100 text-amber-700",
    };
  }
  return {
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    leftGlow: "bg-sky-300/25",
    rightGlow: "bg-violet-300/20",
    primaryIcon: "bg-sky-100 text-sky-700",
    secondaryIcon: "bg-indigo-100 text-indigo-700",
  };
}

function normalizeAdminRole(value: unknown): AdminAccountRow["role"] {
  const normalized = String(value || "").trim().toLowerCase();
  if (["docente", "teacher", "profesor", "instructor"].includes(normalized)) return "docente";
  if (["estudiante", "student", "alumno", "learner"].includes(normalized)) return "estudiante";
  if (["admin", "administrador", "administrator"].includes(normalized)) return "admin";
  return "";
}

function mergeAdminAccountRow(
  map: Map<string, AdminAccountRow>,
  id: string,
  raw: Record<string, unknown>,
) {
  const email = String(raw.email || "").trim().toLowerCase();
  const key = email || id;
  const existing = map.get(key) || {
    id,
    email,
    name: "",
    role: "",
    createdAt: null,
    teacherPlanLabel: "",
    teacherPlanId: "",
    teacherPlanAssignedAt: null,
    teacherPlanExpiresAt: null,
    teacherPlanStatus: "",
  };

  const createdAt = toDate(raw.createdAt);
  const nextCreatedAt =
    !existing.createdAt || (createdAt && createdAt.getTime() < existing.createdAt.getTime())
      ? createdAt || existing.createdAt
      : existing.createdAt;

  map.set(key, {
    id: existing.id || id,
    email: existing.email || email,
    name: String(raw.name || existing.name || "").trim() || "User",
    role:
      existing.role ||
      normalizeAdminRole(raw.role) ||
      normalizeAdminRole(raw.requestedRole) ||
      normalizeAdminRole(raw.userRole),
    createdAt: nextCreatedAt,
    teacherPlanLabel:
      String(raw.teacherPlanName || raw.teacherPlanLabel || existing.teacherPlanLabel || "").trim(),
    teacherPlanId: String(raw.teacherPlanId || existing.teacherPlanId || "").trim(),
    teacherPlanAssignedAt: toDate(raw.teacherPlanAssignedAt) || existing.teacherPlanAssignedAt,
    teacherPlanExpiresAt: toDate(raw.teacherPlanExpiresAt) || existing.teacherPlanExpiresAt,
    teacherPlanStatus:
      String(raw.teacherPlanStatus || existing.teacherPlanStatus || "").trim().toLowerCase(),
  });
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { courses, assessments } = useAcademic();

  const [mode, setMode] = useState<CalendarMode>("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDateKey, setSelectedDateKey] = useState(() => dayKey(new Date()));
  const [showDayModal, setShowDayModal] = useState(false);
  const [dayModalClassOnly, setDayModalClassOnly] = useState(false);
  const [adminTimelineFilter, setAdminTimelineFilter] = useState<AdminTimelineFilter>("all");
  const [adminActivitySort, setAdminActivitySort] = useState<AdminActivitySort>("priority");
  const [adminOperationalEvents, setAdminOperationalEvents] = useState<CalendarEvent[]>([]);
  const [adminOperationalWarning, setAdminOperationalWarning] = useState("");
  const isAdminView = user?.role === "admin";

  const availableCourses = useMemo(() => {
    if (!user) return [];
    return getAccessibleCoursesForUser(courses, user, {
      includeAllForAdmin: user.role === "admin",
      includeEnrolledForTeacher: false,
    });
  }, [courses, user]);

  const courseById = useMemo(() => {
    const map: Record<string, (typeof courses)[number]> = {};
    availableCourses.forEach((course) => {
      map[course.id] = course;
    });
    return map;
  }, [availableCourses]);

  const courseByCode = useMemo(() => {
    const map: Record<string, (typeof courses)[number]> = {};
    availableCourses.forEach((course) => {
      const normalizedCode = normalizeCourseLookup(course.code);
      if (normalizedCode) {
        map[normalizedCode] = course;
      }
    });
    return map;
  }, [availableCourses]);

  const courseByName = useMemo(() => {
    const map: Record<string, (typeof courses)[number]> = {};
    availableCourses.forEach((course) => {
      const normalizedName = normalizeCourseLookup(course.name);
      if (normalizedName) {
        map[normalizedName] = course;
      }
    });
    return map;
  }, [availableCourses]);

  useEffect(() => {
    if (user?.role !== "admin") {
      setAdminOperationalEvents([]);
      setAdminOperationalWarning("");
      return;
    }

    let isMounted = true;

    const loadAdminOperationalEvents = async () => {
      const [usersResult, studentsResult, approvalsResult, deletionRequestsResult, contactResult, pricingResult, backupsResult] = await Promise.allSettled([
        getDocs(collection(firebaseDB, "usuarios")),
        getDocs(collection(firebaseDB, "estudiantes")),
        getTeacherApprovalRequests(),
        getPendingAccountDeletionRequests(),
        getContactMessages(),
        getPricingContactRequests(),
        getDocs(collection(firebaseDB, "courseBackups")),
      ]);

      if (!isMounted) return;

      const warnings: string[] = [];
      if (usersResult.status === "rejected") warnings.push("accounts");
      if (studentsResult.status === "rejected") warnings.push("students");
      if (approvalsResult.status === "rejected") warnings.push("teacher approvals");
      if (deletionRequestsResult.status === "rejected") warnings.push("deletion requests");
      if (contactResult.status === "rejected") warnings.push("contact inbox");
      if (pricingResult.status === "rejected") warnings.push("pricing inbox");
      if (backupsResult.status === "rejected") warnings.push("backups");

      const accountMap = new Map<string, AdminAccountRow>();

      if (usersResult.status === "fulfilled") {
        usersResult.value.docs.forEach((docSnap) => {
          mergeAdminAccountRow(accountMap, docSnap.id, (docSnap.data() || {}) as Record<string, unknown>);
        });
      }
      if (studentsResult.status === "fulfilled") {
        studentsResult.value.docs.forEach((docSnap) => {
          mergeAdminAccountRow(accountMap, docSnap.id, (docSnap.data() || {}) as Record<string, unknown>);
        });
      }

      const events: CalendarEvent[] = availableCourses
        .filter((course) => course.createdAt instanceof Date && !Number.isNaN(course.createdAt.getTime()))
        .map((course) => ({
          id: `course-created:${course.id}`,
          courseId: course.id,
          courseName: course.name || "Course",
          courseCode: course.code || "N/A",
          title: `${course.code || "N/A"} created`,
          type: "course_created" as const,
          date: course.createdAt,
          detail: `${course.name || "Course"} • created by ${course.teacherName || "Unknown teacher"}`,
          actorName: course.teacherName || "Unknown teacher",
          navigationPath: `/courses/view/${course.code}`,
        }));

      accountMap.forEach((entry) => {
        if (!entry.createdAt) return;
        events.push({
          id: `account-created:${entry.email || entry.id}`,
          courseId: "__admin__",
          courseName: "Admin operations",
          courseCode: "OPS",
          title: `${entry.name} account created`,
          type: "account_created",
          date: entry.createdAt,
          detail: `${
            entry.role === "docente" ? "Teacher" : entry.role === "estudiante" ? "Student" : "Admin"
          } • ${entry.email || "No email"}`,
          actorName: entry.name,
          navigationPath: "/admin/users",
        });

        if (
          entry.role === "docente" &&
          entry.teacherPlanAssignedAt &&
          entry.teacherPlanStatus !== "pending_payment"
        ) {
          const resolvedPlanId = resolveTeacherPlanId(entry.teacherPlanId);
          const planExpiresAt =
            entry.teacherPlanExpiresAt ||
            (resolvedPlanId ? getTeacherPlanExpiryDate(resolvedPlanId, entry.teacherPlanAssignedAt) : null);
          events.push({
            id: `plan-purchased:${entry.email || entry.id}`,
            courseId: "__admin__",
            courseName: "Billing",
            courseCode: "BILL",
            title: `${entry.name} plan activated`,
            type: "plan_purchased",
            date: entry.teacherPlanAssignedAt,
            detail: `${entry.teacherPlanLabel || "Teacher plan"} • ${entry.email || "No email"}`,
            actorName: entry.name,
            navigationPath: "/admin/billing",
          });
          if (planExpiresAt) {
            events.push({
              id: `plan-expiring:${entry.email || entry.id}`,
              courseId: "__admin__",
              courseName: "Billing",
              courseCode: "BILL",
              title: `${entry.name} plan expires`,
              type: "plan_expiring",
              date: planExpiresAt,
              detail: `${entry.teacherPlanLabel || "Teacher plan"} • ${entry.email || "No email"}`,
              actorName: entry.name,
              navigationPath: "/admin/billing",
            });
          }
        }
      });

      if (approvalsResult.status === "fulfilled") {
        approvalsResult.value.forEach((entry) => {
          if (!entry.requestedAt) return;
          const planLabel = entry.interestedPlan || entry.teacherPlanId || "Plan not selected";
          events.push({
            id: `teacher-approval:${entry.userId}`,
            courseId: "__admin__",
            courseName: "Teacher approvals",
            courseCode: "APPR",
            title: `${entry.name || entry.email} requested teacher access`,
            type: "teacher_approval_request",
            date: entry.requestedAt,
            detail: `${entry.status} • ${planLabel}${entry.institutionName ? ` • ${entry.institutionName}` : ""}`,
            actorName: entry.name || entry.email,
            navigationPath: "/admin/teacher-approvals",
          });
        });
      }

      if (deletionRequestsResult.status === "fulfilled") {
        deletionRequestsResult.value.forEach((entry) => {
          if (!entry.requestedAt) return;
          events.push({
            id: `deletion-request:${entry.userId}`,
            courseId: "__admin__",
            courseName: "Deletion requests",
            courseCode: "DEL",
            title: `${entry.name || entry.email} requested account deletion`,
            type: "deletion_request",
            date: entry.requestedAt,
            detail: `${entry.role === "docente" ? "Teacher" : "Student"}${
              entry.scheduledDeletionAt
                ? ` • scheduled ${entry.scheduledDeletionAt.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}`
                : ""
            }`,
            actorName: entry.name || entry.email,
            navigationPath: "/admin/deletions",
          });
        });
      }

      if (contactResult.status === "fulfilled") {
        contactResult.value.forEach((entry) => {
          if (!entry.createdAt || entry.status !== "new") return;
          events.push({
            id: `contact-message:${entry.id}`,
            courseId: "__admin__",
            courseName: "Admin inbox",
            courseCode: "INBOX",
            title: entry.subject || `${entry.name || entry.email} sent a contact message`,
            type: "inbox_request",
            date: entry.createdAt,
            detail: `Contact form • ${entry.status} • ${entry.email}`,
            actorName: entry.name || entry.email,
            navigationPath: "/admin/inbox",
          });
        });
      }

      if (pricingResult.status === "fulfilled") {
        pricingResult.value.forEach((entry) => {
          if (!entry.createdAt || entry.status !== "new") return;
          const demandLabel =
            entry.desiredCourses > 0 || entry.desiredStudents > 0
              ? ` • ${entry.desiredCourses} courses / ${entry.desiredStudents} students`
              : "";
          events.push({
            id: `pricing-request:${entry.id}`,
            courseId: "__admin__",
            courseName: "Admin inbox",
            courseCode: "INBOX",
            title: `${entry.name || entry.email} requested pricing`,
            type: "inbox_request",
            date: entry.createdAt,
            detail: `Pricing intake • ${entry.status}${demandLabel}`,
            actorName: entry.name || entry.email,
            navigationPath: "/admin/inbox",
          });
        });
      }

      if (backupsResult.status === "fulfilled") {
        backupsResult.value.docs.forEach((docSnap) => {
          const data = (docSnap.data() || {}) as Record<string, unknown>;
          const createdAt = toDate(data.createdAt);
          if (!createdAt) return;
          events.push({
            id: `backup-created:${docSnap.id}`,
            courseId: "__admin__",
            courseName: "Backups",
            courseCode: "BKP",
            title: `${String(data.courseCode || "N/A")} backup snapshot created`,
            type: "backup_created",
            date: createdAt,
            detail: `${String(data.courseName || "Course")} • ${String(data.teacherName || "Unknown teacher")}`,
            actorName: String(data.teacherName || "").trim(),
            navigationPath: "/admin/backups",
          });
        });
      }

      events.sort((a, b) => a.date.getTime() - b.date.getTime());
      setAdminOperationalEvents(events);
      setAdminOperationalWarning(
        warnings.length > 0
          ? `Some admin activity sources could not be loaded: ${warnings.join(", ")}.`
          : "",
      );
    };

    void loadAdminOperationalEvents();

    return () => {
      isMounted = false;
    };
  }, [availableCourses, isAdminView, user]);

  const events = useMemo(() => {
    if (isAdminView) {
      return [...adminOperationalEvents].sort((a, b) => a.date.getTime() - b.date.getTime());
    }

    const all: CalendarEvent[] = [];

    assessments.forEach((assessment) => {
      const course =
        courseById[String(assessment.courseId || "").trim()] ||
        courseByCode[normalizeCourseLookup(assessment.courseCode)] ||
        courseByName[normalizeCourseLookup(assessment.courseName)];
      if (!course) return;

      const dueDate = toDate(assessment.dueDate);
      if (dueDate) {
        all.push({
          id: `${assessment.id}-due`,
          courseId: course.id,
          courseName: course.name || "Course",
          courseCode: course.code || "N/A",
          assessmentId: assessment.id,
          title: assessment.name || "Assessment",
          type: "due",
          date: dueDate,
        });
      }

      const startDate = toDate(assessment.startDate);
      if (startDate) {
        all.push({
          id: `${assessment.id}-start`,
          courseId: course.id,
          courseName: course.name || "Course",
          courseCode: course.code || "N/A",
          assessmentId: assessment.id,
          title: assessment.name || "Assessment",
          type: "start",
          date: startDate,
        });
      }
    });

    const rangeStart = new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 2, 1, 0, 0, 0, 0);
    const rangeEnd = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 3, 0, 23, 59, 59, 999);

    availableCourses.forEach((course) => {
      const schedule = Array.isArray(course.classSchedule) ? course.classSchedule : [];
      schedule.forEach((slot, slotIndex) => {
        if (
          !Number.isInteger(slot.dayOfWeek) ||
          slot.dayOfWeek < 0 ||
          slot.dayOfWeek > 6 ||
          !slot.startTime ||
          !slot.endTime
        ) {
          return;
        }

        const cursor = new Date(rangeStart);
        const dayShift = (slot.dayOfWeek - cursor.getDay() + 7) % 7;
        cursor.setDate(cursor.getDate() + dayShift);

        while (cursor.getTime() <= rangeEnd.getTime()) {
          const startDate = withTime(cursor, slot.startTime);
          const endDate = withTime(cursor, slot.endTime);
          if (startDate && endDate && endDate.getTime() > startDate.getTime()) {
            all.push({
              id: `${course.id}-class-${slotIndex}-${dayKey(cursor)}`,
              courseId: course.id,
              courseName: course.name || "Course",
              courseCode: course.code || "N/A",
              title: "Class session",
              type: "class",
              date: startDate,
              endDate,
              location: slot.location || "",
            });
          }
          cursor.setDate(cursor.getDate() + 7);
        }
      });
    });

    all.sort((a, b) => a.date.getTime() - b.date.getTime());
    return all;
  }, [adminOperationalEvents, assessments, availableCourses, courseByCode, courseById, courseByName, isAdminView, monthCursor]);

  const courseScopedEvents = useMemo(() => {
    if (isAdminView) return events;
    if (courseFilter === "all") return events;
    if (courseFilter === "__admin__") {
      return events.filter((event) => event.courseId === "__admin__");
    }
    return events.filter((event) => event.courseId === courseFilter);
  }, [courseFilter, events, isAdminView]);

  const adminScopedEvents = useMemo(() => {
    if (!isAdminView) return courseScopedEvents;
    if (adminTimelineFilter === "all") return courseScopedEvents;
    if (adminTimelineFilter === "courses") {
      return courseScopedEvents.filter((event) => event.type === "course_created");
    }
    if (adminTimelineFilter === "accounts") {
      return courseScopedEvents.filter((event) => event.type === "account_created");
    }
    if (adminTimelineFilter === "approvals") {
      return courseScopedEvents.filter((event) => event.type === "teacher_approval_request");
    }
    if (adminTimelineFilter === "plans") {
      return courseScopedEvents.filter(
        (event) => event.type === "plan_purchased" || event.type === "plan_expiring",
      );
    }
    if (adminTimelineFilter === "inbox") {
      return courseScopedEvents.filter((event) => event.type === "inbox_request");
    }
    if (adminTimelineFilter === "backups") {
      return courseScopedEvents.filter((event) => event.type === "backup_created");
    }
    if (adminTimelineFilter === "account_deletions") {
      return courseScopedEvents.filter((event) => event.type === "deletion_request");
    }
    return courseScopedEvents;
  }, [adminTimelineFilter, courseScopedEvents, isAdminView]);

  const filteredEvents = useMemo(() => {
    const nowTs = Date.now();
    return adminScopedEvents.filter((event) => {
      if (mode === "upcoming") return event.date.getTime() >= nowTs;
      if (mode === "past") return event.date.getTime() < nowTs;
      return true;
    });
  }, [adminScopedEvents, mode]);

  const monthDays = useMemo(() => getMonthGrid(monthCursor), [monthCursor]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    filteredEvents.forEach((event) => {
      const key = dayKey(event.date);
      if (!map[key]) map[key] = [];
      map[key].push(event);
    });
    Object.values(map).forEach((list) => {
      list.sort((a, b) => a.date.getTime() - b.date.getTime());
    });
    return map;
  }, [filteredEvents]);

  const scopedEventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    adminScopedEvents.forEach((event) => {
      const key = dayKey(event.date);
      if (!map[key]) map[key] = [];
      map[key].push(event);
    });
    return map;
  }, [adminScopedEvents]);

  const selectedDayEvents = useMemo(() => eventsByDay[selectedDateKey] || [], [eventsByDay, selectedDateKey]);
  const selectedDayModalEvents = useMemo(
    () =>
      dayModalClassOnly
        ? selectedDayEvents.filter((event) => event.type === "class")
        : selectedDayEvents,
    [dayModalClassOnly, selectedDayEvents],
  );

  const nowTs = Date.now();
  const upcomingCount = useMemo(
    () => adminScopedEvents.filter((event) => event.date.getTime() >= nowTs).length,
    [adminScopedEvents, nowTs],
  );
  const pastCount = Math.max(0, adminScopedEvents.length - upcomingCount);

  const modeButtonOptions = [
    { key: "upcoming" as const, label: "Upcoming", count: upcomingCount, icon: CalendarClock },
    { key: "all" as const, label: "All", count: adminScopedEvents.length, icon: CalendarDays },
    { key: "past" as const, label: "Past", count: pastCount, icon: Clock3 },
  ];

  const monthLabel = monthCursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const selectedCourseCode =
    isAdminView
      ? "OPS"
      : courseFilter === "all"
      ? "ALL"
      : courseFilter === "__admin__"
        ? "OPS"
      : availableCourses.find((course) => course.id === courseFilter)?.code || "N/A";

  const selectedDate = useMemo(() => parseDayKey(selectedDateKey), [selectedDateKey]);
  const selectedDayLabel = selectedDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const todayKey = dayKey(new Date());
  const todayEventsCount = scopedEventsByDay[todayKey]?.length ?? 0;

  const classSessionCount = adminScopedEvents.filter((event) => event.type === "class").length;
  const accountCreatedCount = adminScopedEvents.filter((event) => event.type === "account_created").length;
  const approvalRequestCount = adminScopedEvents.filter((event) => event.type === "teacher_approval_request").length;
  const planActivatedCount = adminScopedEvents.filter((event) => event.type === "plan_purchased").length;
  const planExpiryCount = adminScopedEvents.filter((event) => event.type === "plan_expiring").length;
  const inboxRequestCount = adminScopedEvents.filter((event) => event.type === "inbox_request").length;
  const deletionRequestCount = adminScopedEvents.filter((event) => event.type === "deletion_request").length;
  const backupCreatedCount = adminScopedEvents.filter((event) => event.type === "backup_created").length;
  const courseCreatedCount = adminScopedEvents.filter((event) => event.type === "course_created").length;
  const selectedDayClassCount = selectedDayEvents.filter((event) => event.type === "class").length;
  const visibleCourseCount = useMemo(
    () => new Set(filteredEvents.map((event) => event.courseId).filter((id) => id !== "__admin__")).size,
    [filteredEvents],
  );
  const busyDaysInMonth = useMemo(
    () =>
      monthDays.reduce((count, date) => {
        if (!date) return count;
        return count + ((eventsByDay[dayKey(date)]?.length ?? 0) > 0 ? 1 : 0);
      }, 0),
    [eventsByDay, monthDays],
  );

  const visibleTypeCounts = useMemo(
    () =>
      filteredEvents.reduce(
        (acc, event) => {
          acc[event.type] += 1;
          return acc;
        },
        {
          due: 0,
          start: 0,
          class: 0,
          course_created: 0,
          account_created: 0,
          teacher_approval_request: 0,
          plan_purchased: 0,
          plan_expiring: 0,
          inbox_request: 0,
          deletion_request: 0,
          backup_created: 0,
        } as Record<CalendarEventType, number>,
      ),
    [filteredEvents],
  );
  const upcomingEvents = useMemo(
    () =>
      adminScopedEvents
        .filter((event) => event.date.getTime() >= Date.now())
        .sort((a, b) => {
          if (isAdminView && adminActivitySort === "priority") {
            const priorityDiff = getAdminEventPriority(a) - getAdminEventPriority(b);
            if (priorityDiff !== 0) return priorityDiff;
          }
          return a.date.getTime() - b.date.getTime();
        })
        .slice(0, 6),
    [adminActivitySort, adminScopedEvents, isAdminView],
  );

  const adminFilterOptions = useMemo(
    () => [
      { key: "all" as const, label: "All", count: courseScopedEvents.length },
      {
        key: "courses" as const,
        label: "Courses",
        count: courseScopedEvents.filter((event) => event.type === "course_created").length,
      },
      {
        key: "accounts" as const,
        label: "Accounts",
        count: courseScopedEvents.filter((event) => event.type === "account_created").length,
      },
      {
        key: "approvals" as const,
        label: "Approvals",
        count: courseScopedEvents.filter((event) => event.type === "teacher_approval_request").length,
      },
      {
        key: "plans" as const,
        label: "Plans",
        count: courseScopedEvents.filter(
          (event) => event.type === "plan_purchased" || event.type === "plan_expiring",
        ).length,
      },
      {
        key: "inbox" as const,
        label: "Inbox",
        count: courseScopedEvents.filter((event) => event.type === "inbox_request").length,
      },
      {
        key: "backups" as const,
        label: "Backups",
        count: courseScopedEvents.filter((event) => event.type === "backup_created").length,
      },
      {
        key: "account_deletions" as const,
        label: "Account deletions",
        count: courseScopedEvents.filter((event) => event.type === "deletion_request").length,
      },
    ],
    [courseScopedEvents],
  );
  const adminFilterTheme = useMemo(
    () => getAdminFilterTheme(adminTimelineFilter),
    [adminTimelineFilter],
  );

  const dayQueryParam = searchParams.get("day");
  const focusQueryParam = searchParams.get("focus");
  const openQueryParam = searchParams.get("open");
  const querySnapshot = searchParams.toString();

  useEffect(() => {
    if (openQueryParam !== "1") return;

    let targetDate = new Date();
    if (dayQueryParam && dayQueryParam !== "today" && /^\d{4}-\d{2}-\d{2}$/.test(dayQueryParam)) {
      targetDate = parseDayKey(dayQueryParam);
    }

    const targetKey = dayKey(targetDate);
    setMonthCursor(startOfMonth(targetDate));
    setSelectedDateKey(targetKey);
    setCourseFilter("all");
    setMode("all");
    setDayModalClassOnly(focusQueryParam === "classes");
    setShowDayModal(true);

    const nextParams = new URLSearchParams(querySnapshot);
    nextParams.delete("open");
    setSearchParams(nextParams, { replace: true });
  }, [dayQueryParam, focusQueryParam, openQueryParam, querySnapshot, setSearchParams]);

  const getEventTarget = (event: CalendarEvent): string | null => {
    if (event.navigationPath !== undefined) return event.navigationPath;
    if (event.type === "class" || !event.assessmentId) {
      return `/courses/view/${event.courseCode}`;
    }
    return `/courses/${event.courseCode}/assessments/${event.assessmentId}`;
  };

  return (
    <DashboardLayout contentClassName="pt-0 lg:pt-1">
      <div className="relative overflow-x-hidden">
        <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
        <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />

        <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex flex-col gap-4">
              <section className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
                <div className={`pointer-events-none absolute -left-[70px] -top-[90px] h-[180px] w-[180px] rounded-full ${adminFilterTheme.leftGlow}`} />
                <div className={`pointer-events-none absolute -right-[90px] -bottom-[90px] h-[200px] w-[200px] rounded-full ${adminFilterTheme.rightGlow}`} />

                <div className="relative z-10">
                  <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${adminFilterTheme.badge}`}>
                    <CalendarDays className="h-3.5 w-3.5" />
                    Calendar Workspace
                  </div>
                  <h2 className="mt-3 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                    {isAdminView ? "Operational Activity Calendar" : "Academic Calendar Center"}
                  </h2>
                  <p className="mt-1.5 text-sm text-slate-600">
                    {isAdminView
                      ? "Track platform events that matter to admins: course creation, registrations, teacher approvals, plan lifecycle, inbox demand, and deletion workflows."
                      : "Track classes, starts and due dates in one timeline with live filters."}
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5">
                    <div className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${adminFilterTheme.primaryIcon}`}>
                      <CalendarDays className="h-4 w-4" />
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Scoped events</p>
                    <p className="text-lg font-extrabold leading-5 text-slate-900">{courseScopedEvents.length}</p>
                  </div>

                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5">
                    <div className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${adminFilterTheme.secondaryIcon}`}>
                      <CalendarClock className="h-4 w-4" />
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Upcoming</p>
                    <p className="text-lg font-extrabold leading-5 text-slate-900">{upcomingCount}</p>
                  </div>

                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5">
                    <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                      <GraduationCap className="h-4 w-4" />
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">
                      {isAdminView ? "Accounts + approvals" : "Class sessions"}
                    </p>
                    <p className="text-lg font-extrabold leading-5 text-slate-900">
                      {isAdminView ? accountCreatedCount + approvalRequestCount : classSessionCount}
                    </p>
                  </div>

                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5">
                    <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">
                      {isAdminView ? "Inbox + deletions" : "Today"}
                    </p>
                    <p className="text-lg font-extrabold leading-5 text-slate-900">
                      {isAdminView ? inboxRequestCount + deletionRequestCount : todayEventsCount}
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="space-y-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Filters</p>
                      <p className="text-xs text-slate-500">
                        {isAdminView ? "Choose timeline mode and operational category." : "Choose timeline mode and course scope."}
                      </p>
                    </div>

                    {!isAdminView ? (
                      <div className="relative inline-flex w-full items-center lg:w-auto">
                        <Filter className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
                        <select
                          value={courseFilter}
                          onChange={(event) => setCourseFilter(event.target.value)}
                          className="h-10 rounded-xl border border-slate-300/60 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                        >
                          <option value="all">All courses</option>
                          {availableCourses.map((course) => (
                            <option key={course.id} value={course.id}>
                              {course.code} - {course.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </div>

                  {user?.role === "admin" ? (
                    <div className="relative inline-flex w-full items-center">
                      <Filter className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
                      <select
                        value={adminTimelineFilter}
                        onChange={(event) => setAdminTimelineFilter(event.target.value as AdminTimelineFilter)}
                        className="h-10 w-full rounded-xl border border-slate-300/60 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                      >
                        {adminFilterOptions.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label} ({option.count})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-3 gap-2">
                    {modeButtonOptions.map((option) => {
                      const Icon = option.icon;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setMode(option.key)}
                          className={`inline-flex items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                            mode === option.key
                              ? "border-sky-300 bg-sky-50 text-sky-700"
                              : "border-slate-200/60 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          <span>{option.label}</span>
                          <span className="rounded-full border border-slate-200/60 bg-slate-50 px-1.5 py-0.5 text-[10px] leading-none text-slate-600">
                            {option.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-5 w-5 text-sky-700" />
                      <p className="text-lg font-bold text-slate-900">{monthLabel}</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {isAdminView
                        ? "Platform events timeline"
                        : selectedCourseCode === "ALL"
                          ? "All course timelines"
                          : `Course scope: ${selectedCourseCode}`}
                    </p>
                    <button
                      type="button"
                      onClick={() => setMonthCursor(startOfMonth(new Date()))}
                      className="mt-2 inline-flex items-center rounded-lg border border-slate-200/60 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      Go to current month
                    </button>
                  </div>

                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setMonthCursor((prev) => addMonths(prev, -1))}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/60 bg-white text-slate-600 transition hover:border-sky-200 hover:text-sky-700"
                      aria-label="Previous month"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMonthCursor((prev) => addMonths(prev, 1))}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/60 bg-white text-slate-600 transition hover:border-sky-200 hover:text-sky-700"
                      aria-label="Next month"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mb-3 flex flex-wrap gap-2">
                  {isAdminView ? (
                    <>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-700">
                        <span className="h-2 w-2 rounded-full bg-teal-500" />
                        Approvals {visibleTypeCounts.teacher_approval_request}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        Inbox {visibleTypeCounts.inbox_request}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 text-[11px] font-semibold text-fuchsia-700">
                        <span className="h-2 w-2 rounded-full bg-fuchsia-500" />
                        Expiring {visibleTypeCounts.plan_expiring}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
                        <span className="h-2 w-2 rounded-full bg-rose-500" />
                        Deletion requests {visibleTypeCounts.deletion_request}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                        <span className="h-2 w-2 rounded-full bg-violet-500" />
                        Plans {visibleTypeCounts.plan_purchased + visibleTypeCounts.plan_expiring}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-700">
                        <span className="h-2 w-2 rounded-full bg-cyan-500" />
                        Accounts {visibleTypeCounts.account_created}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        Backups {visibleTypeCounts.backup_created}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                        <span className="h-2 w-2 rounded-full bg-indigo-500" />
                        Course created {visibleTypeCounts.course_created}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        Due {visibleTypeCounts.due}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                        <span className="h-2 w-2 rounded-full bg-sky-500" />
                        Start {visibleTypeCounts.start}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        Class {visibleTypeCounts.class}
                      </span>
                    </>
                  )}
                </div>

                {adminOperationalWarning ? (
                  <div className="mb-3 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                    {adminOperationalWarning}
                  </div>
                ) : null}

                {filteredEvents.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
                    <AlertCircle className="mx-auto h-9 w-9 text-slate-400" />
                    <p className="mt-2 text-sm font-semibold text-slate-700">No calendar events found</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {isAdminView
                        ? "No admin operational events match the current filter."
                        : "Adjust filters or add dated assessments and class schedules."}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200/60 bg-white p-2">
                    <div className="grid grid-cols-7 gap-1">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
                        <div
                          key={weekday}
                          className="px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                        >
                          {weekday}
                        </div>
                      ))}
                    </div>

                    <div className="mt-1 grid grid-cols-7 gap-1">
                      {monthDays.map((date, index) => {
                        if (!date) {
                          return <div key={`empty-${index}`} className="h-24 rounded-lg bg-slate-50" />;
                        }

                        const key = dayKey(date);
                        const dayEvents = eventsByDay[key] || [];
                        const isToday = isSameDay(date, new Date());
                        const isSelected = key === selectedDateKey;

                        return (
                          <button
                            type="button"
                            key={key}
                            onClick={() => {
                              setSelectedDateKey(key);
                              setDayModalClassOnly(false);
                              setShowDayModal(true);
                            }}
                            className={`h-24 rounded-lg border p-1.5 text-left transition ${
                              isSelected
                                ? "border-sky-300 bg-sky-50"
                                : "border-slate-200/60 bg-white hover:border-sky-200 hover:bg-sky-50/40"
                            } ${isToday ? "ring-1 ring-sky-200" : ""}`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className={`text-xs font-semibold ${isToday ? "text-sky-700" : "text-slate-700"}`}>
                                {date.getDate()}
                              </span>
                              {dayEvents.length > 0 && (
                                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1 text-[10px] font-bold text-white">
                                  {dayEvents.length}
                                </span>
                              )}
                            </div>

                            <div className="mt-1 hidden space-y-1 lg:block">
                              {dayEvents.slice(0, 2).map((event) => {
                                const Icon = getEventIcon(event);
                                const isPastEvent = event.date.getTime() < Date.now();
                                return (
                                  <div
                                    key={event.id}
                                    className={`inline-flex w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${getTypeTone(event)} ${isPastEvent ? "opacity-60" : ""}`}
                                    title={`${event.title} (${event.courseCode})`}
                                  >
                                    <Icon className="h-3 w-3 shrink-0" />
                                    <span className="truncate">
                                      {event.type === "class" ? `${event.title} ${formatEventTime(event)}` : event.title}
                                    </span>
                                  </div>
                                );
                              })}
                              {dayEvents.length > 2 && (
                                <p className="text-[10px] font-semibold text-slate-500">+{dayEvents.length - 2} more</p>
                              )}
                            </div>

                            <div className="mt-1 flex items-center gap-1 lg:hidden">
                              {dayEvents.slice(0, 3).map((event) => (
                                <span
                                  key={event.id}
                                  className={`h-1.5 w-1.5 rounded-full ${getEventDotTone(event)} ${
                                    event.date.getTime() < Date.now() ? "opacity-50" : ""
                                  }`}
                                />
                              ))}
                              {dayEvents.length > 3 && (
                                <span className="text-[10px] font-semibold text-slate-500">+{dayEvents.length - 3}</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            </div>

            <aside className="flex flex-col gap-4">
              <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-slate-900">Overview</h2>
                  <span className="inline-flex items-center rounded-full border border-slate-200/60 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {selectedCourseCode}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Past</p>
                    <p className="mt-1 text-lg font-extrabold leading-none text-slate-900">{pastCount}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {isAdminView ? "Course records" : "Courses in view"}
                    </p>
                    <p className="mt-1 text-lg font-extrabold leading-none text-slate-900">
                      {isAdminView ? courseCreatedCount : visibleCourseCount}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Busy month days</p>
                    <p className="mt-1 text-lg font-extrabold leading-none text-slate-900">{busyDaysInMonth}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Selected day</p>
                    <p className="mt-1 text-lg font-extrabold leading-none text-slate-900">{selectedDayEvents.length}</p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDayModal(true);
                      setDayModalClassOnly(false);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50"
                  >
                    <CalendarDays className="h-3.5 w-3.5" />
                    {selectedDayLabel}
                  </button>
                  {!isAdminView ? (
                    <button
                      type="button"
                      disabled={selectedDayClassCount === 0}
                      onClick={() => {
                        setShowDayModal(true);
                        setDayModalClassOnly(true);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <GraduationCap className="h-3.5 w-3.5" />
                      Class sessions ({selectedDayClassCount})
                    </button>
                  ) : null}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="mb-3 space-y-2">
                  <h2 className="text-base font-bold text-slate-900">{isAdminView ? "Next Activity" : "Next Dates"}</h2>

                  <div className="flex items-center justify-between gap-2">
                    {isAdminView ? (
                      <div className="inline-flex items-center rounded-xl border border-slate-200/60 bg-slate-50 p-1">
                        <button
                          type="button"
                          onClick={() => setAdminActivitySort("priority")}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                            adminActivitySort === "priority"
                              ? "bg-white text-sky-700 shadow-sm"
                              : "text-slate-600 hover:text-slate-800"
                          }`}
                        >
                          Priority
                        </button>
                        <button
                          type="button"
                          onClick={() => setAdminActivitySort("chronological")}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                            adminActivitySort === "chronological"
                              ? "bg-white text-sky-700 shadow-sm"
                              : "text-slate-600 hover:text-slate-800"
                          }`}
                        >
                          Chronological
                        </button>
                      </div>
                    ) : <div />}
                    <span className="inline-flex items-center rounded-full border border-slate-200/60 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {upcomingEvents.length}
                    </span>
                  </div>
                </div>
                {upcomingEvents.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
                    <p className="mt-2 text-sm font-semibold text-slate-700">No upcoming events.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {upcomingEvents.map((event) => {
                      const Icon = getEventIcon(event);
                      const target = getEventTarget(event);
                      return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => {
                            if (target) navigate(target);
                          }}
                          className={`flex w-full items-center gap-2 rounded-xl border border-slate-200/60 bg-white p-2.5 text-left transition ${
                            target ? "hover:border-sky-200 hover:bg-sky-50/40" : ""
                          }`}
                        >
                          <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${getTypeIconTone(event)}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">{event.title}</p>
                            <p className="mt-0.5 truncate text-xs text-slate-500">
                              {event.courseCode} • {event.courseName}
                            </p>
                            {event.detail ? (
                              <p className="mt-0.5 truncate text-[11px] text-slate-500">{event.detail}</p>
                            ) : null}
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getTypeTone(event)}`}
                              >
                                {getEventTypeLabel(event)}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                                {formatEventTime(event)}
                              </span>
                              {event.location ? (
                                <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                                  <MapPin className="h-3 w-3" />
                                  {event.location}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/60 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
                            {event.date.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </aside>
          </div>
        </div>
      </div>

      {showDayModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
          onClick={() => {
            setShowDayModal(false);
            setDayModalClassOnly(false);
          }}
        >
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-slate-200/60 bg-gradient-to-r from-sky-50 via-indigo-50/70 to-violet-50 px-4 py-3">
              <div>
                <p className="text-base font-semibold text-slate-900">
                  {parseDayKey(selectedDateKey).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedDayModalEvents.length} events in current timeline
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowDayModal(false);
                  setDayModalClassOnly(false);
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/60 bg-white/80 text-slate-600 transition hover:bg-white hover:text-slate-800"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {dayModalClassOnly && (
              <div className="m-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Showing class sessions for this day
              </div>
            )}

            <div className="max-h-[60vh] space-y-2 overflow-y-auto p-3">
              {selectedDayModalEvents.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center text-sm text-slate-600">
                  {dayModalClassOnly ? "No class sessions for this day." : "No events for this day."}
                </div>
              ) : (
                selectedDayModalEvents.map((event) => {
                  const Icon = getEventIcon(event);
                  const isPastEvent = event.date.getTime() < Date.now();
                  const target = getEventTarget(event);
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => {
                        setShowDayModal(false);
                        if (target) navigate(target);
                      }}
                      className={`flex w-full items-start gap-3 rounded-xl border border-slate-200/60 bg-white p-3 text-left transition ${
                        target ? "hover:border-sky-200 hover:bg-sky-50/40" : ""
                      } ${
                        isPastEvent ? "opacity-70" : ""
                      }`}
                    >
                      <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${getTypeIconTone(event)}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">{event.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                            <BookOpen className="h-3 w-3" />
                            {event.courseCode}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getTypeTone(event)}`}
                          >
                            {getEventTypeLabel(event)}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">{formatEventTime(event)}</span>
                          {event.location ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                              <MapPin className="h-3 w-3" />
                              {event.location}
                            </span>
                          ) : null}
                        </div>
                        {event.detail ? (
                          <p className="mt-1 text-xs text-slate-500">{event.detail}</p>
                        ) : null}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
