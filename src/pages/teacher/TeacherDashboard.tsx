import { type ComponentType, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademic } from "@/contexts/AcademicContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { InstitutionCaptureModal } from "@/components/common/InstitutionCaptureModal";
import { format } from "date-fns";
import {
  BookOpen,
  Users,
  TrendingUp,
  HeartPulse,
  Layers3,
  Plus,
  AlertTriangle,
  Presentation,
  FileSpreadsheet,
  CheckCircle2,
  FileText,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Zap,
  CalendarClock,
  AlertCircle,
  Clock,
  FolderOpen,
  ListChecks,
  Download,
  Upload,
  Trash2,
  X,
} from "lucide-react";
import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { firebaseDB } from "@/lib/firebase";
import { unitService } from "@/lib/unitService";
import { enUS } from "date-fns/locale";
import {
  courseBackupService,
  type CourseBackupSnapshot,
} from "@/lib/services/courseBackupService";
import { backfillTransferredCourseContent } from "@/lib/services/courseTransferService";
import { TEACHER_ONBOARDING_COURSE_CODE } from "@/lib/services/teacherOnboardingService";
import {
  getInstitutionSaveErrorMessage,
  getInstitutionSuggestions,
  getUserStoredInstitution,
  isInstitutionMissing,
  saveUserInstitution,
} from "@/lib/services/institutionProfileService";

interface GradeSheetStudent {
  studentId: string;
  name: string;
  total?: number;
  status: string;
  grades?: {
    [key: string]: {
      value: number;
      comment: string;
      submittedAt: Timestamp | null;
    };
  };
}

interface GradeSheet {
  id: string;
  title: string;
  courseId: string;
  courseName: string;
  teacherId: string;
  teacherName: string;
  students: GradeSheetStudent[];
  isPublished: boolean;
  gradingPeriod: string;
  activities: Array<{
    id: string;
    name: string;
    maxScore: number;
    type: string;
    description: string;
  }>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface Assessment {
  id: string;
  name: string;
  courseId: string;
  type: string;
  assessmentType?: string;
  maxPoints: number;
  passingScore: number;
  percentage: number;
  dueDate: string;
  description: string;
  status: string;
  gradeSheetId?: string;
  createdAt: string;
  createdBy: string;
}

interface Submission {
  id: string;
  assessmentId: string;
  studentId: string;
  status: string;
  grade?: number;
  submittedAt: Timestamp;
  gradedAt?: Timestamp;
  wordCount?: number;
  characterCount?: number;
  content?: string;
}

const stripHtmlPreview = (value?: string): string => {
  if (!value) return "";
  try {
    const doc = new DOMParser().parseFromString(value, "text/html");
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  } catch {
    return value
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const toDateOrNull = (value: unknown): Date | null => {
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

const addMonths = (baseDate: Date, months: number): Date => {
  const next = new Date(baseDate.getTime());
  next.setMonth(next.getMonth() + months);
  return next;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const getHealthTone = (score: number) => {
  if (score >= 85) {
    return {
      text: "text-emerald-700",
      bg: "bg-emerald-50",
      border: "border-emerald-200",
    };
  }
  if (score >= 70) {
    return {
      text: "text-sky-700",
      bg: "bg-sky-50",
      border: "border-sky-200",
    };
  }
  if (score >= 55) {
    return {
      text: "text-amber-700",
      bg: "bg-amber-50",
      border: "border-amber-200",
    };
  }
  return {
    text: "text-rose-700",
    bg: "bg-rose-50",
    border: "border-rose-200",
  };
};

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const normalizeTextField = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  return "";
};

const parseDueDateValue = (
  value?: string,
): { date: Date; hasExplicitTime: boolean } | null => {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;

  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
    if (Number.isNaN(date.getTime())) return null;
    return { date, hasExplicitTime: false };
  }

  const localDateTimeMatch = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (localDateTimeMatch) {
    const [, year, month, day, hour, minute, second = "0"] = localDateTimeMatch;
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      0,
    );
    if (Number.isNaN(date.getTime())) return null;
    return { date, hasExplicitTime: true };
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return { date: parsed, hasExplicitTime: /[T ]\d{2}:\d{2}/.test(raw) };
};

const getDueComparisonDate = (value?: string): Date | null => {
  const parsed = parseDueDateValue(value);
  if (!parsed) return null;
  if (parsed.hasExplicitTime) return parsed.date;
  const endOfDay = new Date(parsed.date);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay;
};

const formatDueDateTime = (value?: string): string => {
  const parsed = parseDueDateValue(value);
  if (!parsed) return "No due date";
  if (!parsed.hasExplicitTime) {
    return `${format(parsed.date, "EEE, MMM d", { locale: enUS })} • All day`;
  }
  return `${format(parsed.date, "EEE, MMM d", { locale: enUS })} • ${format(parsed.date, "h:mm a", { locale: enUS })}`;
};

const isWithinNextSevenDays = (value?: string): boolean => {
  const dueDate = getDueComparisonDate(value);
  if (!dueDate) return false;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const limit = new Date(todayStart);
  limit.setDate(limit.getDate() + 7);
  limit.setHours(23, 59, 59, 999);

  return dueDate >= todayStart && dueDate <= limit;
};

const parseTimeToMinutes = (value?: string): number | null => {
  if (!value) return null;
  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const formatTimeToMeridiem = (value?: string): string => {
  if (!value) return "";
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value;
  const hours = Number(match[1]);
  const minutes = match[2];
  if (!Number.isFinite(hours) || hours < 0 || hours > 23) return value;
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${minutes} ${suffix}`;
};

const formatTimeRangeLabel = (value?: string): string => {
  if (!value) return "";
  if (/\b(am|pm)\b/i.test(value)) return value;
  const matches = value.match(/\b\d{1,2}:\d{2}\b/g);
  if (!matches || matches.length === 0) return value;
  let formatted = value;
  matches.forEach((timeText) => {
    formatted = formatted.replace(timeText, formatTimeToMeridiem(timeText));
  });
  return formatted.replace(/\s*-\s*/g, " - ");
};

const parseClassDayIndexesFromText = (value?: string): number[] => {
  if (!value) return [];
  const normalized = normalizeText(value);
  const days = [
    { index: 0, tokens: ["sunday", "sun", "domingo", "dom"] },
    { index: 1, tokens: ["monday", "mon", "lunes", "lun"] },
    { index: 2, tokens: ["tuesday", "tue", "martes", "mar"] },
    { index: 3, tokens: ["wednesday", "wed", "miercoles", "miércoles", "mie"] },
    { index: 4, tokens: ["thursday", "thu", "jueves", "jue"] },
    { index: 5, tokens: ["friday", "fri", "viernes", "vie"] },
    { index: 6, tokens: ["saturday", "sat", "sabado", "sábado", "sab"] },
  ];

  return days
    .filter((day) => day.tokens.some((token) => normalized.includes(token)))
    .map((day) => day.index);
};

type CourseClassScheduleSlot = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  location?: string;
};

const normalizeCourseClassSchedule = (value: unknown): CourseClassScheduleSlot[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const payload = entry as {
        dayOfWeek?: unknown;
        startTime?: unknown;
        endTime?: unknown;
        location?: unknown;
      };
      const dayOfWeek = Number(payload.dayOfWeek);
      const startTime = normalizeTextField(payload.startTime);
      const endTime = normalizeTextField(payload.endTime);
      if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return null;
      if (!startTime || !endTime) return null;
      const slot: CourseClassScheduleSlot = { dayOfWeek, startTime, endTime };
      const location = normalizeTextField(payload.location);
      if (location) slot.location = location;
      return slot;
    })
    .filter((slot): slot is CourseClassScheduleSlot => slot !== null)
    .sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return (parseTimeToMinutes(a.startTime) ?? 9999) - (parseTimeToMinutes(b.startTime) ?? 9999);
    });
};

const formatClassScheduleSlot = (slot: CourseClassScheduleSlot, includeDay = false): string => {
  const timeLabel = `${formatTimeToMeridiem(slot.startTime)} - ${formatTimeToMeridiem(slot.endTime)}`;
  if (!includeDay) return timeLabel;
  const dayLabel = WEEKDAY_SHORT[slot.dayOfWeek] ?? "Day";
  return `${dayLabel} ${timeLabel}`;
};

const resolveUpcomingTag = (
  item: { assessmentType?: string; type?: string },
): { label: string; tone: "activity" | "forum" | "announcement" } => {
  const assessmentType = String(item.assessmentType || "").trim().toLowerCase();
  const activityType = String(item.type || "").trim().toLowerCase();
  const combinedType = `${activityType} ${assessmentType}`.trim();

  if (combinedType.includes("forum") || combinedType.includes("foro")) {
    return { label: "Forum", tone: "forum" };
  }
  if (combinedType.includes("announcement") || combinedType.includes("aviso")) {
    return { label: "Announcement", tone: "announcement" };
  }
  if (activityType.includes("quiz")) {
    return { label: "Quiz", tone: "activity" };
  }
  if (activityType.includes("exam") || activityType.includes("examen")) {
    return { label: "Exam", tone: "activity" };
  }
  if (activityType.includes("homework") || activityType.includes("tarea")) {
    return { label: "Homework", tone: "activity" };
  }
  if (activityType.includes("project") || activityType.includes("proyecto")) {
    return { label: "Project", tone: "activity" };
  }
  if (activityType.includes("participation") || activityType.includes("participacion")) {
    return { label: "Participation", tone: "activity" };
  }
  if (activityType.includes("self_evaluation") || activityType.includes("self-evaluation")) {
    return { label: "Self Eval", tone: "activity" };
  }
  if (assessmentType.includes("delivery") || activityType.includes("delivery")) {
    return { label: "Delivery", tone: "activity" };
  }
  if (assessmentType.includes("assessment")) {
    return { label: "Assessment", tone: "activity" };
  }
  return { label: "Activity", tone: "activity" };
};

interface Slide {
  id: string;
  title: string;
  description: string;
  canvaUrl: string;
  createdAt: Timestamp;
  weekId: string;
  order: number;
  courseId?: string;
}

interface CourseSlide extends Slide {
  weekNumber: number;
  weekTopic: string;
  unitName: string;
  unitId: string;
  hasValidWeek: boolean;
  hasValidUnit: boolean;
}

interface Unit {
  id: string;
  name: string;
  description: string;
  courseId: string;
  order: number;
  createdAt: Timestamp;
}

interface Week {
  id: string;
  number: number;
  topic: string;
  unitId: string;
  createdAt: Timestamp;
  courseId?: string;
}

interface Period {
  id: string;
  courseId: string;
  name: string;
  number: number;
  order: number;
}

interface CourseWeek {
  id: string;
  courseId: string;
  periodId: string;
  number: number;
  topic: string;
  order: number;
}

interface CourseFile {
  id: string;
  courseId: string;
  periodId?: string;
  weekId?: string;
  name: string;
  type: string;
  size: number;
  uploadedBy: string;
  uploadedAt?: Timestamp;
  url?: string;
}

interface Course {
  id: string;
  name: string;
  code: string;
  group: string;
  enrolledStudents: string[];
  credits: number;
  description: string;
  teacherId: string;
  teacherName: string;
  semester: string;
  status: string;
  createdAt: Timestamp;
  classSchedule?: CourseClassScheduleSlot[];
  classDays?: string;
  classTime?: string;
  scheduleText?: string;
  classRoom?: string;
  location?: string;
}

interface Student {
  id: string;
  name: string;
  email: string;
  idNumber: string;
  whatsApp?: string;
  courses?: string[];
}

type DashboardMetric = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  iconClassName: string;
};

type SnapshotCardModel = {
  key: string;
  title: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  iconClassName: string;
  value: string | number;
  suffix: string;
  hint: string;
  metrics: DashboardMetric[];
};

type UpcomingActivityItem = {
  id: string;
  name: string;
  dueDate: string;
  courseId: string;
  courseName: string;
  courseCode: string;
  type: string;
  assessmentType?: string;
  link?: string;
};

type TodayClassItem = {
  id: string;
  timeLabel: string;
  courseLabel: string;
  courseCode: string;
  sortOrder: number;
};

type SelectedCourseResourceCounts = {
  slidesCount: number;
  filesCount: number;
};

type MandatoryCourseQuizProgress = {
  courseId: string;
  courseCode: string;
  courseName: string;
  totalThemes: number;
  approvedThemes: number;
  pendingThemes: number;
  progressPercentage: number;
};

const chunkValues = (values: string[], size = 10): string[][] => {
  const normalized = Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean)),
  );
  const chunks: string[][] = [];

  for (let index = 0; index < normalized.length; index += size) {
    chunks.push(normalized.slice(index, index + size));
  }

  return chunks;
};

export default function TeacherDashboard() {
  const { user, isAuthenticated } = useAuth();
  const { courses: academicCourses, selectedCourseId, setSelectedCourseId } = useAcademic();
  const navigate = useNavigate();

  const [gradeSheets, setGradeSheets] = useState<GradeSheet[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [courseWeeks, setCourseWeeks] = useState<CourseWeek[]>([]);
  const [courseFiles, setCourseFiles] = useState<CourseFile[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBackupCenter, setShowBackupCenter] = useState(false);
  const [loadingBackupSnapshots, setLoadingBackupSnapshots] = useState(false);
  const [backupSnapshots, setBackupSnapshots] = useState<
    CourseBackupSnapshot[]
  >([]);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const restoreFileInputRef = useRef<HTMLInputElement | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const [activeSnapshotIndex, setActiveSnapshotIndex] = useState(0);
  const [institutionModalOpen, setInstitutionModalOpen] = useState(false);
  const [institutionValue, setInstitutionValue] = useState("");
  const [institutionSuggestions, setInstitutionSuggestions] = useState<string[]>([]);
  const [savingInstitution, setSavingInstitution] = useState(false);
  const [institutionError, setInstitutionError] = useState("");
  const [selectedCourseResourceCounts, setSelectedCourseResourceCounts] =
    useState<SelectedCourseResourceCounts>({ slidesCount: 0, filesCount: 0 });
  const [mandatoryCourseQuizProgress, setMandatoryCourseQuizProgress] =
    useState<MandatoryCourseQuizProgress | null>(null);
  const [loadingMandatoryCourseQuizProgress, setLoadingMandatoryCourseQuizProgress] =
    useState(false);
  const backfilledCourseIdsRef = useRef<Set<string>>(new Set());
  const courses = useMemo(
    () =>
      academicCourses.filter(
        (course) => String(course.teacherId || "").trim() === String(user?.id || "").trim(),
      ),
    [academicCourses, user?.id],
  );
  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) || null,
    [courses, selectedCourseId],
  );
  const institutionRoleLabel = user?.role === "admin" ? "Admin" : "Teacher";
  const courseById = useMemo(
    () => new Map(courses.map((course) => [course.id, course])),
    [courses],
  );
  const ownedCourseIds = useMemo(
    () => new Set(courses.map((course) => course.id)),
    [courses],
  );

  const upcomingActivitiesAllCourses = useMemo<UpcomingActivityItem[]>(() => {
    return assessments
      .filter((assessment) => {
        const normalizedCourseId = String(assessment.courseId || "").trim();
        if (!normalizedCourseId || !ownedCourseIds.has(normalizedCourseId)) {
          return false;
        }
        const status = String(assessment.status || "").toLowerCase();
        if (status === "draft" || status === "deleted" || status === "archived") {
          return false;
        }
        return isWithinNextSevenDays(assessment.dueDate);
      })
      .map((assessment) => {
        const course = courseById.get(assessment.courseId);
        return {
          id: assessment.id,
          name: assessment.name || "Activity",
          dueDate: assessment.dueDate || "",
          courseId: assessment.courseId || "",
          courseName: course?.name || "Untitled Course",
          courseCode: course?.code || "",
          type: assessment.type || "",
          assessmentType: assessment.assessmentType || "",
        };
      })
      .sort((a, b) => {
        const dueDelta =
          (getDueComparisonDate(a.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER) -
          (getDueComparisonDate(b.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER);
        if (dueDelta !== 0) return dueDelta;
        return a.courseName.localeCompare(b.courseName);
      });
  }, [assessments, courseById, ownedCourseIds]);
  const todayClassesAllCourses = useMemo<TodayClassItem[]>(() => {
    const todayDayIndex = new Date().getDay();
    const classes: TodayClassItem[] = [];

    courses.forEach((course) => {
      const scheduleSlots = normalizeCourseClassSchedule(course.classSchedule);
      if (scheduleSlots.length > 0) {
        scheduleSlots.forEach((slot, index) => {
          if (slot.dayOfWeek !== todayDayIndex) return;
          const roomText =
            normalizeTextField(slot.location) ||
            normalizeTextField(course.classRoom) ||
            normalizeTextField(course.location);

          classes.push({
            id: `${course.id}-${slot.dayOfWeek}-${slot.startTime}-${index}`,
            timeLabel: formatClassScheduleSlot(slot),
            courseLabel: `${course.code || "Course"}${roomText ? ` • ${roomText}` : ""}`,
            courseCode: course.code || "",
            sortOrder: parseTimeToMinutes(slot.startTime) ?? 9999,
          });
        });
        return;
      }

      const dayIndexes = parseClassDayIndexesFromText(
        `${normalizeTextField(course.classDays)} ${normalizeTextField(course.scheduleText)}`.trim(),
      );
      if (!dayIndexes.includes(todayDayIndex)) return;

      const timeText =
        normalizeTextField(course.classTime) ||
        normalizeTextField(course.scheduleText) ||
        "Class session";
      const roomText = normalizeTextField(course.classRoom) || normalizeTextField(course.location);

      classes.push({
        id: `${course.id}-legacy-${todayDayIndex}`,
        timeLabel: formatTimeRangeLabel(timeText),
        courseLabel: `${course.code || "Course"}${roomText ? ` • ${roomText}` : ""}`,
        courseCode: course.code || "",
        sortOrder: parseTimeToMinutes(timeText) ?? 9999,
      });
    });

    return classes
      .sort((a, b) => a.sortOrder - b.sortOrder || a.courseLabel.localeCompare(b.courseLabel))
      .slice(0, 8);
  }, [courses]);
  const courseHealthOverview = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const unitCourseById = new Map<string, string>();
    units.forEach((unit) => {
      unitCourseById.set(unit.id, unit.courseId);
    });

    const weekCourseById = new Map<string, string>();
    weeks.forEach((week) => {
      const courseId = unitCourseById.get(week.unitId);
      if (courseId) weekCourseById.set(week.id, courseId);
    });

    const filesCountByCourse = new Map<string, number>();
    const fileWeekIdsByCourse = new Map<string, Set<string>>();
    courseFiles.forEach((file) => {
      if (!file.courseId) return;
      filesCountByCourse.set(
        file.courseId,
        (filesCountByCourse.get(file.courseId) || 0) + 1,
      );
      if (!file.weekId) return;
      if (!fileWeekIdsByCourse.has(file.courseId)) {
        fileWeekIdsByCourse.set(file.courseId, new Set<string>());
      }
      fileWeekIdsByCourse.get(file.courseId)?.add(file.weekId);
    });

    const slidesCountByCourse = new Map<string, number>();
    slides.forEach((slide) => {
      const courseId = weekCourseById.get(slide.weekId);
      if (!courseId) return;
      slidesCountByCourse.set(courseId, (slidesCountByCourse.get(courseId) || 0) + 1);
    });

    const assessmentCourseById = new Map<string, string>();
    const assessmentsByCourse = new Map<string, Assessment[]>();
    assessments.forEach((assessment) => {
      assessmentCourseById.set(assessment.id, assessment.courseId);
      if (!assessmentsByCourse.has(assessment.courseId)) {
        assessmentsByCourse.set(assessment.courseId, []);
      }
      assessmentsByCourse.get(assessment.courseId)?.push(assessment);
    });

    const pendingByCourse = new Map<string, number>();
    submissions.forEach((submission) => {
      const courseId = assessmentCourseById.get(submission.assessmentId);
      if (!courseId) return;
      const status = String(submission.status || "").toLowerCase();
      if (status !== "submitted" && status !== "pending") return;
      pendingByCourse.set(courseId, (pendingByCourse.get(courseId) || 0) + 1);
    });

    const weeksCountByCourse = new Map<string, number>();
    courseWeeks.forEach((week) => {
      weeksCountByCourse.set(
        week.courseId,
        (weeksCountByCourse.get(week.courseId) || 0) + 1,
      );
    });

    return courses
      .map((course) => {
        const publishedSheets = gradeSheets.filter(
          (sheet) => sheet.courseId === course.id && sheet.isPublished,
        );
        const studentGradesById: Record<string, number[]> = {};
        const knownStudents = new Set<string>(course.enrolledStudents || []);

        publishedSheets.forEach((sheet) => {
          sheet.students?.forEach((student) => {
            if (!student?.studentId) return;
            knownStudents.add(student.studentId);
            const value = Number(student.total);
            if (!Number.isFinite(value) || value <= 0) return;
            if (!studentGradesById[student.studentId]) {
              studentGradesById[student.studentId] = [];
            }
            studentGradesById[student.studentId].push(value);
          });
        });

        const averages = Object.values(studentGradesById).map(
          (grades) => grades.reduce((sum, value) => sum + value, 0) / grades.length,
        );
        const averageGradeValue =
          averages.length > 0
            ? averages.reduce((sum, value) => sum + value, 0) / averages.length
            : 0;

        const totalStudents = Math.max(
          knownStudents.size,
          Object.keys(studentGradesById).length,
        );
        const passingStudents = averages.filter((value) => value >= 3.5).length;
        const approvalRate =
          totalStudents > 0 ? Math.round((passingStudents / totalStudents) * 100) : 0;

        const courseAssessments = assessmentsByCourse.get(course.id) || [];
        const overdueCount = courseAssessments.filter((assessment) => {
          if (!assessment.dueDate || assessment.status === "draft") return false;
          const due = new Date(assessment.dueDate);
          due.setHours(0, 0, 0, 0);
          return due < today;
        }).length;

        const dueSoonCount = courseAssessments.filter((assessment) => {
          if (!assessment.dueDate || assessment.status === "draft") return false;
          const due = new Date(assessment.dueDate);
          due.setHours(0, 0, 0, 0);
          const diffDays = Math.floor((due.getTime() - today.getTime()) / 86400000);
          return diffDays >= 0 && diffDays <= 7;
        }).length;

        const pendingCount = pendingByCourse.get(course.id) || 0;
        const slidesCount = slidesCountByCourse.get(course.id) || 0;
        const filesCount = filesCountByCourse.get(course.id) || 0;
        const materialsCount = slidesCount + filesCount;
        const totalWeeks = weeksCountByCourse.get(course.id) || 0;
        const coveredWeeks = fileWeekIdsByCourse.get(course.id)?.size || 0;
        const coverageRate =
          totalWeeks > 0
            ? Math.round((Math.min(coveredWeeks, totalWeeks) / totalWeeks) * 100)
            : materialsCount > 0
              ? 100
              : 0;

        const healthScore = Math.round(
          clamp(
            averageGradeValue * 20 * 0.32 +
              approvalRate * 0.28 +
              coverageRate * 0.2 +
              clamp(100 - pendingCount * 6 - overdueCount * 8, 20, 100) * 0.2,
            0,
            100,
          ),
        );

        return {
          id: course.id,
          name: course.name,
          code: course.code,
          group: course.group,
          studentsCount: totalStudents,
          averageGrade: averageGradeValue,
          approvalRate,
          healthScore,
          pendingCount,
          overdueCount,
          dueSoonCount,
          materialsCount,
          tone: getHealthTone(healthScore),
        };
      })
      .sort((a, b) => b.healthScore - a.healthScore);
  }, [
    assessments,
    courseFiles,
    courseWeeks,
    courses,
    gradeSheets,
    slides,
    submissions,
    units,
    weeks,
  ]);
  const selectedCourseHealth = useMemo(
    () => courseHealthOverview.find((course) => course.id === selectedCourseId) || null,
    [courseHealthOverview, selectedCourseId],
  );

  useEffect(() => {
    if (isAuthenticated && user?.role === "estudiante") {
      navigate("/students", { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  useEffect(() => {
    let cancelled = false;

    const loadInstitutionProfile = async () => {
      if (!isAuthenticated || !user?.id) {
        if (!cancelled) {
          setInstitutionModalOpen(false);
        }
        return;
      }

      if (user.role !== "docente" && user.role !== "admin") {
        if (!cancelled) {
          setInstitutionModalOpen(false);
        }
        return;
      }

      try {
        const [storedInstitution, options] = await Promise.all([
          getUserStoredInstitution(user.id, user.role),
          getInstitutionSuggestions(),
        ]);
        if (cancelled) return;

        setInstitutionSuggestions(options);
        setInstitutionError("");

        if (isInstitutionMissing(storedInstitution)) {
          setInstitutionValue("");
          setInstitutionModalOpen(true);
          return;
        }

        setInstitutionValue(storedInstitution);
        setInstitutionModalOpen(false);
      } catch {
        if (cancelled) return;
        setInstitutionModalOpen(true);
      }
    };

    void loadInstitutionProfile();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id, user?.role]);

  useEffect(() => {
    let active = true;
    let loadingPromise: Promise<void> | null = null;

    const loadAllData = async () => {
      if (!user?.id) return;
      if (loadingPromise) return loadingPromise;

      loadingPromise = (async () => {
        setLoading(true);

        try {
          const loadedCourses = courses;
          const assessmentsPromise = fetchAssessments(loadedCourses);
          const mandatoryProgressPromise = fetchMandatoryCourseQuizProgress();

          await Promise.all([
            fetchGradeSheets(loadedCourses),
            assessmentsPromise,
            fetchStudents(loadedCourses),
            mandatoryProgressPromise,
          ]);

          const loadedAssessments = await assessmentsPromise;
          await fetchSubmissions(loadedAssessments);

          if (!active) return;
          setLoading(false);

          void Promise.allSettled([
            fetchLegacyCourseContent(loadedCourses),
            fetchPeriods(loadedCourses),
            fetchCourseWeeks(loadedCourses),
            fetchCourseFiles(loadedCourses),
            runTransferredCourseBackfill(loadedCourses),
          ]);
        } catch {
          if (active) {
            setLoading(false);
          }
        } finally {
          loadingPromise = null;
        }
      })();

      return loadingPromise;
    };

    if (isAuthenticated && user?.role === "docente") {
      void loadAllData();
    }

    return () => {
      active = false;
    };
  }, [courses, isAuthenticated, user?.id, user?.role]);

  useEffect(() => {
    if (courses.length === 0) {
      if (selectedCourseId) setSelectedCourseId("");
      return;
    }

    const hasSelected = selectedCourseId
      ? courses.some((course) => course.id === selectedCourseId)
      : false;

    if (!hasSelected) {
      setSelectedCourseId(courses[0].id);
    }
  }, [courses, selectedCourseId, setSelectedCourseId]);

  useEffect(() => {
    if (
      !isAuthenticated ||
      user?.role !== "docente" ||
      !user?.id ||
      courses.length === 0
    ) {
      return;
    }

    void courseBackupService.runAutoBackupIfDue(
      { id: user.id, name: user.name || "Teacher" },
      courses.map((course) => course.id),
      24,
    );
  }, [courses, isAuthenticated, user?.id, user?.name, user?.role]);

  useEffect(() => {
    if (!selectedCourse?.id) {
      setSelectedCourseResourceCounts({ slidesCount: 0, filesCount: 0 });
      return;
    }

    let active = true;

    const fetchByChunk = async (
      collectionName: string,
      field: string,
      values: string[],
    ) => {
      const snapshots = await Promise.all(
        chunkValues(values).map((chunk) =>
          getDocs(
            query(
              collection(firebaseDB, collectionName),
              where(field, "in", chunk),
            ),
          ),
        ),
      );

      return snapshots.flatMap((snapshot) => snapshot.docs);
    };

    const loadSelectedCourseResourceCounts = async () => {
      try {
        const courseId = selectedCourse.id;
        const [
          inferredUnits,
          directSlidesSnap,
          directFilesSnap,
          periodsSnap,
          modernWeeksSnap,
        ] = await Promise.all([
          unitService.getByCourse(courseId),
          getDocs(query(collection(firebaseDB, "diapositivas"), where("courseId", "==", courseId))),
          getDocs(query(collection(firebaseDB, "course_files"), where("courseId", "==", courseId))),
          getDocs(query(collection(firebaseDB, "periods"), where("courseId", "==", courseId))),
          getDocs(query(collection(firebaseDB, "weeks"), where("courseId", "==", courseId))),
        ]);
        const inferredSlidesCount = inferredUnits.reduce(
          (sum, unit) =>
            sum +
            (unit.weeks || []).reduce(
              (weekSum, week) => weekSum + ((week.slides || []).length || 0),
              0,
            ),
          0,
        );
        const legacyWeekIds = inferredUnits.flatMap((unit) =>
          (unit.weeks || []).map((week) => String(week.id || "").trim()).filter(Boolean),
        );
        const modernWeekIds = modernWeeksSnap.docs.map((docSnap) => docSnap.id);
        const periodIds = periodsSnap.docs.map((docSnap) => docSnap.id);

        const [filesByLegacyWeek, filesByModernWeek, filesByPeriod] =
          await Promise.all([
            fetchByChunk("course_files", "weekId", legacyWeekIds),
            fetchByChunk("course_files", "weekId", modernWeekIds),
            fetchByChunk("course_files", "periodId", periodIds),
          ]);

        if (!active) return;

        const uniqueSlideIds = new Set<string>();
        directSlidesSnap.docs.forEach((docSnap) => uniqueSlideIds.add(docSnap.id));

        const uniqueFileIds = new Set<string>();
        directFilesSnap.docs.forEach((docSnap) => uniqueFileIds.add(docSnap.id));
        filesByLegacyWeek.forEach((docSnap) => uniqueFileIds.add(docSnap.id));
        filesByModernWeek.forEach((docSnap) => uniqueFileIds.add(docSnap.id));
        filesByPeriod.forEach((docSnap) => uniqueFileIds.add(docSnap.id));

        setSelectedCourseResourceCounts({
          slidesCount: Math.max(uniqueSlideIds.size, inferredSlidesCount),
          filesCount: uniqueFileIds.size,
        });
      } catch {
        if (!active) return;
        setSelectedCourseResourceCounts({ slidesCount: 0, filesCount: 0 });
      }
    };

    if (!backfilledCourseIdsRef.current.has(selectedCourse.id)) {
      void runTransferredCourseBackfill([selectedCourse]).then(() => {
        if (!active) return;
        void loadSelectedCourseResourceCounts();
      });
    }

    void loadSelectedCourseResourceCounts();

    return () => {
      active = false;
    };
  }, [selectedCourse?.id]);

  const loadBackupSnapshots = async () => {
    if (!user?.id) return;
    setLoadingBackupSnapshots(true);
    try {
      await courseBackupService.cleanupOldTeacherBackups(user.id, 7);
      const snapshots = await courseBackupService.listTeacherBackups(user.id);
      setBackupSnapshots(snapshots);
    } catch {
      setBackupSnapshots([]);
    } finally {
      setLoadingBackupSnapshots(false);
    }
  };

  const openBackupCenter = async () => {
    await loadBackupSnapshots();
    setShowBackupCenter(true);
  };

  const handleSaveSnapshot = async () => {
    if (!user?.id || !selectedCourse) return;
    setIsExportingBackup(true);
    try {
      await courseBackupService.saveBackupSnapshot(selectedCourse.id, {
        id: user.id,
        name: user.name || "Teacher",
      });
      await loadBackupSnapshots();
      alert("Snapshot saved successfully.");
    } catch (error: any) {
      alert(`Could not save snapshot: ${error?.message || "Unknown error"}`);
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handleExportBackup = async () => {
    if (!selectedCourse) return;
    setIsExportingBackup(true);
    try {
      const backup = await courseBackupService.exportCourseBackup(
        selectedCourse.id,
      );
      courseBackupService.downloadBackupFile(backup);
      alert("Backup exported successfully.");
    } catch (error: any) {
      alert(`Could not export backup: ${error?.message || "Unknown error"}`);
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handleRestoreBackupClick = () => {
    restoreFileInputRef.current?.click();
  };

  const handleRestoreBackupFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user?.id) return;

    setIsRestoringBackup(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const restored = await courseBackupService.restoreCourseBackup(parsed, {
        id: user.id,
        name: user.name || "Teacher",
      });
      alert(
        `Backup restored as "${restored.newCourseName}" (${restored.newCourseCode}).`,
      );
      setShowBackupCenter(false);
      navigate(`/courses/view/${restored.newCourseCode}`);
    } catch (error: any) {
      alert(
        `Could not restore backup: ${error?.message || "Invalid backup file"}`,
      );
    } finally {
      setIsRestoringBackup(false);
    }
  };

  const handleRestoreSnapshot = async (snapshotId: string) => {
    if (!user?.id) return;
    setIsRestoringBackup(true);
    try {
      const restored = await courseBackupService.restoreFromSnapshot(
        snapshotId,
        {
          id: user.id,
          name: user.name || "Teacher",
        },
      );
      alert(
        `Snapshot restored as "${restored.newCourseName}" (${restored.newCourseCode}).`,
      );
      setShowBackupCenter(false);
      navigate(`/courses/view/${restored.newCourseCode}`);
    } catch (error: any) {
      alert(`Could not restore snapshot: ${error?.message || "Unknown error"}`);
    } finally {
      setIsRestoringBackup(false);
    }
  };

  const handleDeleteSnapshot = async (snapshotId: string) => {
    if (!confirm("Delete this backup snapshot?")) return;
    try {
      await courseBackupService.deleteSnapshot(snapshotId);
      await loadBackupSnapshots();
    } catch (error: any) {
      alert(`Could not delete snapshot: ${error?.message || "Unknown error"}`);
    }
  };

  const handleSaveInstitution = async () => {
    if (!user?.id || savingInstitution) return;

    setInstitutionError("");
    setSavingInstitution(true);
    try {
      const savedInstitution = await saveUserInstitution({
        userId: user.id,
        role: user.role,
        email: user.email,
        name: user.name,
        institutionName: institutionValue,
      });

      setInstitutionValue(savedInstitution);
      setInstitutionSuggestions((current) =>
        Array.from(new Set([...current, savedInstitution])).sort((left, right) =>
          left.localeCompare(right),
        ),
      );
      setInstitutionModalOpen(false);
    } catch (error) {
      setInstitutionError(getInstitutionSaveErrorMessage(error));
    } finally {
      setSavingInstitution(false);
    }
  };

  const convertTimestamp = (timestamp: Timestamp | Date | string): Date => {
    if (timestamp instanceof Date) return timestamp;
    if (timestamp instanceof Timestamp) return timestamp.toDate();
    if (typeof timestamp === "string") return new Date(timestamp);
    return new Date();
  };

  const fetchGradeSheets = async (teacherCourses: Course[] = []) => {
    const sourceCourses = teacherCourses.length > 0 ? teacherCourses : courses;
    const courseIds = Array.from(
      new Set(
        sourceCourses
          .map((course) => String(course.id || "").trim())
          .filter((courseId) => courseId.length > 0),
      ),
    );

    if (courseIds.length === 0) {
      setGradeSheets([]);
      return;
    }

    try {
      const gradeSheetsRef = collection(firebaseDB, "gradeSheets");
      const sheets: GradeSheet[] = [];
      const seenIds = new Set<string>();
      const chunks: string[][] = [];

      for (let index = 0; index < courseIds.length; index += 10) {
        chunks.push(courseIds.slice(index, index + 10));
      }

      const snapshots = await Promise.all(
        chunks.map((chunk) => getDocs(query(gradeSheetsRef, where("courseId", "in", chunk)))),
      );

      snapshots.forEach((querySnapshot) => {
        querySnapshot.forEach((doc) => {
          if (seenIds.has(doc.id)) return;
          seenIds.add(doc.id);

          const data = doc.data();
          sheets.push({
            id: doc.id,
            title: data.title || "",
            courseId: data.courseId || "",
            courseName: data.courseName || "",
            teacherId: data.teacherId || "",
            teacherName: data.teacherName || "",
            students: data.students || [],
            isPublished: data.isPublished || false,
            gradingPeriod: data.gradingPeriod || "",
            activities: data.activities || [],
            createdAt: data.createdAt || Timestamp.now(),
            updatedAt: data.updatedAt || Timestamp.now(),
          });
        });
      });

      setGradeSheets(sheets);
    } catch {
      setGradeSheets([]);
      return;
    }
  };

  const fetchAssessments = async (teacherCourses: Course[] = []): Promise<Assessment[]> => {
    const sourceCourses = teacherCourses.length > 0 ? teacherCourses : courses;
    const courseIds = Array.from(
      new Set(
        sourceCourses
          .map((course) => String(course.id || "").trim())
          .filter((courseId) => courseId.length > 0),
      ),
    );

    if (courseIds.length === 0) {
      setAssessments([]);
      return [];
    }

    try {
      const assessmentsRef = collection(firebaseDB, "assessments");
      const assessmentList: Assessment[] = [];
      const seenIds = new Set<string>();
      const chunks: string[][] = [];

      for (let index = 0; index < courseIds.length; index += 10) {
        chunks.push(courseIds.slice(index, index + 10));
      }

      const snapshots = await Promise.all(
        chunks.map((chunk) => getDocs(query(assessmentsRef, where("courseId", "in", chunk)))),
      );

      snapshots.forEach((querySnapshot) => {
        querySnapshot.forEach((doc) => {
          if (seenIds.has(doc.id)) return;
          seenIds.add(doc.id);

          const data = doc.data();
          assessmentList.push({
            id: doc.id,
            name: data.name || "",
            courseId: data.courseId || "",
            type: data.type || "",
            assessmentType: data.assessmentType || "assessment",
            maxPoints: data.maxPoints || 0,
            passingScore: data.passingScore || 0,
            percentage: data.percentage || 0,
            dueDate: data.dueDate || "",
            description: data.description || "",
            status: data.status || "draft",
            gradeSheetId: data.gradeSheetId,
            createdAt: data.createdAt || new Date().toISOString(),
            createdBy: data.createdBy || "",
          });
        });
      });

      assessmentList.sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        const dueA = getDueComparisonDate(a.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const dueB = getDueComparisonDate(b.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return dueA - dueB;
      });

      setAssessments(assessmentList);
      return assessmentList;
    } catch {
      setAssessments([]);
      return [];
    }
  };

  const fetchSubmissions = async (sourceAssessments: Assessment[] = []) => {
    const assessmentIds = Array.from(
      new Set(
        sourceAssessments
          .map((assessment) => String(assessment.id || "").trim())
          .filter((assessmentId) => assessmentId.length > 0),
      ),
    );

    if (assessmentIds.length === 0) {
      setSubmissions([]);
      return;
    }

    try {
      const submissionsRef = collection(firebaseDB, "submissions");
      const submissionsList: Submission[] = [];
      const seenIds = new Set<string>();
      const snapshots = await Promise.all(
        chunkValues(assessmentIds).map((chunk) =>
          getDocs(query(submissionsRef, where("assessmentId", "in", chunk))),
        ),
      );

      snapshots.forEach((querySnapshot) => {
        querySnapshot.forEach((doc) => {
          if (seenIds.has(doc.id)) return;
          seenIds.add(doc.id);

          const data = doc.data();
          submissionsList.push({
            id: doc.id,
            assessmentId: data.assessmentId || "",
            studentId: data.studentId || "",
            status: data.status || "pending",
            grade: data.grade,
            submittedAt: data.submittedAt || Timestamp.now(),
            gradedAt: data.gradedAt,
            wordCount: data.wordCount,
            characterCount: data.characterCount,
            content: data.content,
          });
        });
      });

      setSubmissions(submissionsList);
    } catch {
      setSubmissions([]);
    }
  };

  const fetchLegacyCourseContent = async (teacherCourses: Course[] = []) => {
    const sourceCourses = teacherCourses.length > 0 ? teacherCourses : courses;
    const courseIds = Array.from(
      new Set(
        sourceCourses
          .map((course) => String(course.id || "").trim())
          .filter((courseId) => courseId.length > 0),
      ),
    );

    if (courseIds.length === 0) {
      setUnits([]);
      setWeeks([]);
      setSlides([]);
      return;
    }

    try {
      const courseUnitGroups = await Promise.all(courseIds.map((courseId) => unitService.getByCourse(courseId)));
      const unitMap = new Map<string, Unit>();
      const weekMap = new Map<string, Week>();
      const slideMap = new Map<string, Slide>();

      courseUnitGroups.flat().forEach((unit) => {
        unitMap.set(unit.id, {
          id: unit.id,
          name: unit.name || "",
          description: unit.description || "",
          courseId: unit.courseId || "",
          order: unit.order || 0,
          createdAt: (unit.createdAt as Timestamp) || Timestamp.now(),
        });

        (unit.weeks || []).forEach((week) => {
          const weekRecord = week as unknown as Record<string, unknown>;
          const weekCourseId =
            typeof weekRecord.courseId === "string" && weekRecord.courseId.trim()
              ? weekRecord.courseId.trim()
              : unit.courseId || "";

          weekMap.set(week.id, {
            id: week.id,
            number: week.number || 1,
            topic: week.topic || "",
            unitId: week.unitId || unit.id,
            createdAt: (week.createdAt as Timestamp) || Timestamp.now(),
            courseId: weekCourseId,
          });

          (week.slides || []).forEach((slide) => {
            const slideRecord = slide as unknown as Record<string, unknown>;
            slideMap.set(slide.id, {
              id: slide.id,
              title: slide.title || "",
              description: slide.description || "",
              canvaUrl: slide.canvaUrl || "",
              createdAt: (slide.createdAt as Timestamp) || Timestamp.now(),
              weekId: slide.weekId || week.id,
              order: slide.order || 0,
              courseId:
                typeof slideRecord.courseId === "string" && slideRecord.courseId.trim()
                  ? slideRecord.courseId.trim()
                  : weekCourseId,
            });
          });
        });
      });

      setUnits(Array.from(unitMap.values()));
      setWeeks(Array.from(weekMap.values()));
      setSlides(
        Array.from(slideMap.values()).sort(
          (left, right) =>
            convertTimestamp(right.createdAt).getTime() - convertTimestamp(left.createdAt).getTime(),
        ),
      );
    } catch {
      setUnits([]);
      setWeeks([]);
      setSlides([]);
    }
  };

  const fetchStudents = async (teacherCourses: Course[] = []) => {
    const sourceCourses = teacherCourses.length > 0 ? teacherCourses : courses;
    const studentIds = Array.from(
      new Set(
        sourceCourses.flatMap((course) =>
          (course.enrolledStudents || []).filter(
            (studentId): studentId is string =>
              typeof studentId === "string" && studentId.trim().length > 0,
          ),
        ),
      ),
    );

    if (studentIds.length === 0) {
      setStudents([]);
      return;
    }

    try {
      const studentsRef = collection(firebaseDB, "estudiantes");
      const studentList: Student[] = [];
      const snapshots = await Promise.all(
        chunkValues(studentIds).map((chunk) =>
          getDocs(query(studentsRef, where(documentId(), "in", chunk))),
        ),
      );

      snapshots.forEach((querySnapshot) => {
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          studentList.push({
            id: doc.id,
            name: data.name || "",
            email: data.email || "",
            idNumber: data.idNumber || "",
            whatsApp: data.whatsApp,
            courses: data.courses || [],
          });
        });
      });

      setStudents(studentList);
    } catch {
      setStudents([]);
    }
  };

  const fetchPeriods = async (teacherCourses: Course[] = []) => {
    const sourceCourses = teacherCourses.length > 0 ? teacherCourses : courses;
    const courseIds = sourceCourses.map((course) => course.id);
    if (courseIds.length === 0) {
      setPeriods([]);
      return;
    }

    try {
      const periodsRef = collection(firebaseDB, "periods");
      const snapshots = await Promise.all(
        chunkValues(courseIds).map((chunk) =>
          getDocs(query(periodsRef, where("courseId", "in", chunk))),
        ),
      );

      const periodMap = new Map<string, Period>();
      snapshots.forEach((snapshot) => {
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          periodMap.set(docSnap.id, {
            id: docSnap.id,
            courseId: data.courseId || "",
            name: data.name || "",
            number: data.number || 0,
            order: data.order || 0,
          });
        });
      });

      setPeriods(Array.from(periodMap.values()));
    } catch {
      setPeriods([]);
    }
  };

  const fetchCourseWeeks = async (teacherCourses: Course[] = []) => {
    const sourceCourses = teacherCourses.length > 0 ? teacherCourses : courses;
    const courseIds = sourceCourses.map((course) => course.id);
    if (courseIds.length === 0) {
      setCourseWeeks([]);
      return;
    }

    try {
      const weeksRef = collection(firebaseDB, "weeks");
      const snapshots = await Promise.all(
        chunkValues(courseIds).map((chunk) =>
          getDocs(query(weeksRef, where("courseId", "in", chunk))),
        ),
      );

      const weekMap = new Map<string, CourseWeek>();
      snapshots.forEach((snapshot) => {
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          weekMap.set(docSnap.id, {
            id: docSnap.id,
            courseId: data.courseId || "",
            periodId: data.periodId || "",
            number: data.number || 0,
            topic: data.topic || "",
            order: data.order || 0,
          });
        });
      });

      setCourseWeeks(Array.from(weekMap.values()));
    } catch {
      setCourseWeeks([]);
    }
  };

  const fetchCourseFiles = async (teacherCourses: Course[] = []) => {
    const sourceCourses = teacherCourses.length > 0 ? teacherCourses : courses;
    const courseIds = sourceCourses.map((course) => course.id);
    if (courseIds.length === 0) {
      setCourseFiles([]);
      return;
    }

    try {
      const filesRef = collection(firebaseDB, "course_files");
      const snapshots = await Promise.all(
        chunkValues(courseIds).map((chunk) =>
          getDocs(query(filesRef, where("courseId", "in", chunk))),
        ),
      );

      const fileMap = new Map<string, CourseFile>();
      snapshots.forEach((snapshot) => {
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          fileMap.set(docSnap.id, {
            id: docSnap.id,
            courseId: data.courseId || "",
            periodId: data.periodId || "",
            weekId: data.weekId || "",
            name: data.name || "",
            type: data.type || "",
            size: data.size || 0,
            uploadedBy: data.uploadedBy || "",
            uploadedAt: data.uploadedAt,
            url: data.url || "",
          });
        });
      });

      setCourseFiles(Array.from(fileMap.values()));
    } catch {
      setCourseFiles([]);
    }
  };

  const fetchMandatoryCourseQuizProgress = async () => {
    if (!user?.id) {
      setMandatoryCourseQuizProgress(null);
      return;
    }

    setLoadingMandatoryCourseQuizProgress(true);
    try {
      const mandatoryCourseSnapshot = await getDocs(
        query(
          collection(firebaseDB, "cursos"),
          where("code", "==", TEACHER_ONBOARDING_COURSE_CODE),
          limit(1),
        ),
      );

      const mandatoryCourseDoc = mandatoryCourseSnapshot.docs[0];
      if (!mandatoryCourseDoc) {
        setMandatoryCourseQuizProgress(null);
        return;
      }

      const mandatoryCourseData = mandatoryCourseDoc.data() as Record<string, unknown>;
      const mandatoryCourseId = mandatoryCourseDoc.id;
      const mandatoryCourseCode = String(
        mandatoryCourseData.code || TEACHER_ONBOARDING_COURSE_CODE,
      ).trim();
      const mandatoryCourseName = String(mandatoryCourseData.name || "Mandatory Course").trim();

      const [questionsSnapshot, attemptsSnapshot] = await Promise.all([
        getDocs(
          query(
            collection(firebaseDB, "exerciseQuestions"),
            where("courseId", "==", mandatoryCourseId),
          ),
        ),
        getDocs(
          query(
            collection(firebaseDB, "quizAttempts"),
            where("courseId", "==", mandatoryCourseId),
            where("studentId", "==", user.id),
          ),
        ),
      ]);

      const themeSet = new Set<string>();
      questionsSnapshot.forEach((questionDoc) => {
        const payload = questionDoc.data() as Record<string, unknown>;
        const theme = String(payload.theme || "").trim();
        const isPublished =
          typeof payload.isPublished === "boolean" ? payload.isPublished : true;
        if (!theme || !isPublished) return;
        themeSet.add(theme);
      });

      const approvedThemeSet = new Set<string>();
      attemptsSnapshot.forEach((attemptDoc) => {
        const payload = attemptDoc.data() as Record<string, unknown>;
        const theme = String(payload.theme || "").trim();
        const percentage = Number(payload.percentage || 0);
        if (!theme || !themeSet.has(theme)) return;
        if (percentage >= 80) {
          approvedThemeSet.add(theme);
        }
      });

      const totalThemes = themeSet.size;
      const approvedThemes = approvedThemeSet.size;
      const pendingThemes = Math.max(0, totalThemes - approvedThemes);
      const progressPercentage =
        totalThemes > 0 ? Math.round((approvedThemes / totalThemes) * 100) : 0;

      setMandatoryCourseQuizProgress({
        courseId: mandatoryCourseId,
        courseCode: mandatoryCourseCode || TEACHER_ONBOARDING_COURSE_CODE,
        courseName: mandatoryCourseName || "Mandatory Course",
        totalThemes,
        approvedThemes,
        pendingThemes,
        progressPercentage,
      });
    } catch {
      setMandatoryCourseQuizProgress(null);
    } finally {
      setLoadingMandatoryCourseQuizProgress(false);
    }
  };

  const runTransferredCourseBackfill = async (teacherCourses: Course[] = []) => {
    const sourceCourses = teacherCourses.length > 0 ? teacherCourses : courses;
    const courseIds = Array.from(
      new Set(
        sourceCourses
          .map((course) => String(course.id || "").trim())
          .filter((courseId) => courseId.length > 0),
      ),
    );

    if (courseIds.length === 0) return;

    const pendingCourseIds = courseIds.filter(
      (courseId) => !backfilledCourseIdsRef.current.has(courseId),
    );
    if (pendingCourseIds.length === 0) return;

    pendingCourseIds.forEach((courseId) => {
      backfilledCourseIdsRef.current.add(courseId);
    });

    await Promise.all(
      pendingCourseIds.map(async (courseId) => {
        await Promise.allSettled([
          unitService.backfillCourseContentCourseIds(courseId),
          backfillTransferredCourseContent(courseId),
        ]);
      }),
    );
  };

  const getCourseStudents = () => {
    if (!selectedCourse) return [];
    const enrolledIds = new Set(selectedCourse.enrolledStudents || []);

    // Prefer explicit enrollment in the course document; fallback to legacy student.courses links.
    const matched = students.filter(
      (student) =>
        enrolledIds.has(student.id) ||
        student.courses?.includes(selectedCourse.id),
    );

    // Ensure unique students when both sources contain the same student.
    const uniqueById = new Map<string, Student>();
    matched.forEach((student) => uniqueById.set(student.id, student));
    return Array.from(uniqueById.values());
  };

  const getCourseAssessments = () => {
    if (!selectedCourse) return [];

    return assessments.filter((a) => a.courseId === selectedCourse.id);
  };

  const isAnnouncementAssessment = (assessment: Assessment) => {
    return (
      assessment.assessmentType === "announcement" ||
      (assessment.type as string) === "announcement"
    );
  };

  const isForumAssessment = (assessment: Assessment) => {
    return (
      assessment.assessmentType === "forum" ||
      (assessment.type as string) === "forum"
    );
  };

  const isSubmissionTrackedAssessment = (assessment: Assessment) => {
    return !isAnnouncementAssessment(assessment) && !isForumAssessment(assessment);
  };

  const getCourseGradeSheets = () => {
    if (!selectedCourse) return [];

    return gradeSheets.filter((sheet) => sheet.courseId === selectedCourse.id);
  };

  const getCourseSlides = (): CourseSlide[] => {
    if (!selectedCourse) return [];

    const courseUnits = units.filter(
      (unit) => unit.courseId === selectedCourse.id,
    );
    const unitIds = new Set(courseUnits.map((unit) => unit.id));
    const courseWeeks = weeks.filter(
      (week) =>
        unitIds.has(week.unitId) ||
        String(week.courseId || "").trim() === selectedCourse.id,
    );
    const weekIds = new Set(courseWeeks.map((week) => week.id));
    const courseSlides = slides.filter(
      (slide) =>
        weekIds.has(slide.weekId) ||
        String(slide.courseId || "").trim() === selectedCourse.id,
    );

    const slidesWithInfo: CourseSlide[] = courseSlides.map((slide) => {
      const week = courseWeeks.find((w) => w.id === slide.weekId);
      const unit = week ? courseUnits.find((u) => u.id === week.unitId) : null;

      return {
        ...slide,
        weekNumber: week?.number || 0,
        weekTopic: week?.topic || "",
        unitName: unit?.name || "Unknown Unit",
        unitId: unit?.id || "",
        weekId: slide.weekId,
        hasValidWeek: !!week,
        hasValidUnit: !!unit,
      };
    });

    return slidesWithInfo.sort((a, b) => {
      const dateA = convertTimestamp(a.createdAt).getTime();
      const dateB = convertTimestamp(b.createdAt).getTime();
      return dateB - dateA;
    });
  };

  const getCourseSubmissions = () => {
    if (!selectedCourse) return [];

    const courseAssessments = getCourseAssessments().filter(
      (assessment) => isSubmissionTrackedAssessment(assessment),
    );
    const assessmentIds = courseAssessments.map((a) => a.id);

    return submissions.filter((s) => assessmentIds.includes(s.assessmentId));
  };

  const getPendingGrading = () => {
    if (!selectedCourse) return [];

    const courseSubmissions = getCourseSubmissions();
    return courseSubmissions.filter(
      (s) => s.status === "pending" || (s.status === "submitted" && !s.grade),
    );
  };

  const getMissingSubmissions = () => {
    if (!selectedCourse) return [];

    const courseAssessments = getCourseAssessments();
    const courseStudents = getCourseStudents();

    const missing: {
      studentName: string;
      assessmentName: string;
      gradeSheetName: string;
      daysLate: number;
    }[] = [];

    const pendingAssessments = courseAssessments.filter((a) => {
      if (!isSubmissionTrackedAssessment(a)) return false;
      const dueDate = new Date(a.dueDate);
      const today = new Date();
      dueDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      return dueDate < today && a.status !== "draft";
    });

    pendingAssessments.forEach((assessment) => {
      const gradeSheet = gradeSheets.find(
        (sheet) => sheet.id === assessment.gradeSheetId,
      );
      const gradeSheetName =
        gradeSheet?.title || gradeSheet?.gradingPeriod || "Grade Sheet";

      const assessmentSubmissions = submissions.filter(
        (s) => s.assessmentId === assessment.id,
      );
      const submittedStudentIds = assessmentSubmissions.map((s) => s.studentId);

      const studentsWithGrade: string[] = [];

      if (gradeSheet && gradeSheet.activities) {
        const activity = gradeSheet.activities.find(
          (act) =>
            act.name === assessment.name ||
            act.id === assessment.gradeSheetId ||
            act.description?.includes(assessment.name),
        );

        if (activity && gradeSheet.students) {
          gradeSheet.students.forEach((student) => {
            if (student.grades && student.grades[activity.id]) {
              const grade = student.grades[activity.id];
              if (grade && grade.value !== undefined && grade.value !== null) {
                studentsWithGrade.push(student.studentId);
              }
            }
          });
        }
      }

      const validStudentIds = new Set([
        ...submittedStudentIds,
        ...studentsWithGrade,
      ]);

      courseStudents.forEach((student) => {
        if (!validStudentIds.has(student.id)) {
          const dueDate = new Date(assessment.dueDate);
          const today = new Date();
          const daysLate = Math.floor(
            (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
          );

          missing.push({
            studentName: student.name,
            assessmentName: assessment.name,
            gradeSheetName: gradeSheetName,
            daysLate: Math.max(1, daysLate),
          });
        }
      });
    });

    missing.sort((a, b) => b.daysLate - a.daysLate);

    return missing;
  };
  const calculateCourseStats = () => {
    if (!selectedCourse) {
      return {
        totalStudents: 0,
        totalPassing: 0,
        totalAtRisk: 0,
        totalFailing: 0,
        averageGrade: "0.0",
        approvalRate: 0,
        totalAssessments: 0,
        publishedAssessments: 0,
      };
    }

    const courseGradeSheets = getCourseGradeSheets();
    const courseAssessments = getCourseAssessments();
    const courseStudents = getCourseStudents();

    let totalStudents = Math.max(
      courseStudents.length,
      selectedCourse.enrolledStudents?.length || 0,
    );
    let totalPassing = 0;
    let totalAtRisk = 0;
    let totalFailing = 0;
    let totalGradeSum = 0;
    let gradedCount = 0;

    if (courseGradeSheets.length > 0) {
      const studentGrades: { [key: string]: number[] } = {};

      courseStudents.forEach((student) => {
        studentGrades[student.id] = [];
      });

      // Include students present in published grade sheets (important when student.courses is stale).
      courseGradeSheets.forEach((sheet) => {
        if (!sheet.isPublished) return;
        sheet.students?.forEach((student) => {
          if (!studentGrades[student.studentId]) {
            studentGrades[student.studentId] = [];
          }
        });
      });

      totalStudents = Math.max(
        totalStudents,
        Object.keys(studentGrades).length,
      );

      courseGradeSheets.forEach((sheet) => {
        if (sheet.isPublished) {
          sheet.students.forEach((student) => {
            if (student.total !== undefined && student.total > 0) {
              studentGrades[student.studentId]?.push(student.total);
            }
          });
        }
      });

      Object.entries(studentGrades).forEach(([, grades]) => {
        if (grades.length > 0) {
          const average =
            grades.reduce((sum, grade) => sum + grade, 0) / grades.length;
          totalGradeSum += average;
          gradedCount++;

          if (average >= 3.5) {
            totalPassing++;
          } else if (average >= 2.5) {
            totalAtRisk++;
          } else {
            totalFailing++;
          }
        } else {
          totalFailing++;
        }
      });
    } else {
      // No synthetic fallback: without real published grades, stats must stay at zero.
      totalPassing = 0;
      totalAtRisk = 0;
      totalFailing = 0;
      totalGradeSum = 0;
      gradedCount = 0;
    }

    const averageGrade = gradedCount > 0 ? totalGradeSum / gradedCount : 0;
    const approvalRate =
      totalStudents > 0 ? Math.round((totalPassing / totalStudents) * 100) : 0;

    const publishedAssessments = courseAssessments.filter(
      (a) => a.status !== "draft",
    ).length;

    return {
      totalStudents,
      totalPassing,
      totalAtRisk,
      totalFailing,
      averageGrade: averageGrade.toFixed(1),
      approvalRate,
      totalAssessments: courseAssessments.length,
      publishedAssessments,
    };
  };
  const formatDueDate = (dateString: string): string => {
    try {
      if (!dateString) return "No due date";

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [year, month, day] = dateString.split("-").map(Number);
      const dueDate = new Date(year, month - 1, day);
      dueDate.setHours(0, 0, 0, 0);

      const diffTime = dueDate.getTime() - today.getTime();
      const diffDays = Math.floor(diffTime / 86400000);

      if (diffDays === 0) {
        return "today";
      } else if (diffDays === 1) {
        return "tomorrow";
      } else if (diffDays > 1 && diffDays <= 7) {
        return `in ${diffDays} days`;
      } else if (diffDays < 0) {
        return "overdue";
      }

      return format(dueDate, "MMM dd", { locale: enUS });
    } catch {
      return "Invalid date";
    }
  };

  const formatFullDate = (dateString: string): string => {
    try {
      if (!dateString) return "No due date";

      const [year, month, day] = dateString.split("-").map(Number);
      const date = new Date(year, month - 1, day, 12, 0, 0);

      return format(date, "EEEE, MMMM d, yyyy", { locale: enUS });
    } catch {
      return "Invalid date";
    }
  };

  const getUpcomingAssessments = () => {
    const courseAssessments = getCourseAssessments();
    return courseAssessments
      .filter((a) => {
        try {
          if (!a.dueDate) return false;
          const dueDate = new Date(a.dueDate);
          const today = new Date();
          dueDate.setHours(0, 0, 0, 0);
          today.setHours(0, 0, 0, 0);
          return dueDate >= today;
        } catch {
          return false;
        }
      })
      .slice(0, 3);
  };

  const getAssessmentHealth = () => {
    const courseAssessments = getCourseAssessments();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const draftCount = courseAssessments.filter(
      (a) => a.status === "draft",
    ).length;

    const overdueCount = courseAssessments.filter((a) => {
      if (!a.dueDate || a.status === "draft") return false;
      const dueDate = new Date(a.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate < today;
    }).length;

    const dueSoonCount = courseAssessments.filter((a) => {
      if (!a.dueDate || a.status === "draft") return false;
      const dueDate = new Date(a.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      const diffDays = Math.floor(
        (dueDate.getTime() - today.getTime()) / 86400000,
      );
      return diffDays >= 0 && diffDays <= 7;
    }).length;

    return {
      draftCount,
      overdueCount,
      dueSoonCount,
    };
  };

  const getContentCoverage = () => {
    if (!selectedCourse) {
      return {
        periodsCount: 0,
        weeksCount: 0,
        filesCount: 0,
        weeksWithFiles: 0,
        weeksWithoutFiles: 0,
      };
    }

    const selectedPeriods = periods.filter(
      (p) => p.courseId === selectedCourse.id,
    );
    const selectedWeeks = courseWeeks.filter(
      (w) => w.courseId === selectedCourse.id,
    );
    const legacyUnitIds = new Set(
      units
        .filter((unit) => unit.courseId === selectedCourse.id)
        .map((unit) => unit.id),
    );
    const legacyWeeks = weeks.filter(
      (week) =>
        legacyUnitIds.has(week.unitId) ||
        String(week.courseId || "").trim() === selectedCourse.id,
    );
    const selectedWeekIds = new Set([
      ...selectedWeeks.map((week) => week.id),
      ...legacyWeeks.map((week) => week.id),
    ]);
    const selectedPeriodIds = new Set(selectedPeriods.map((period) => period.id));
    const selectedFiles = courseFiles.filter(
      (file) =>
        file.courseId === selectedCourse.id ||
        (file.weekId ? selectedWeekIds.has(file.weekId) : false) ||
        (file.periodId ? selectedPeriodIds.has(file.periodId) : false),
    );

    const fileWeekIds = new Set(
      selectedFiles.map((f) => f.weekId).filter(Boolean),
    );
    const effectiveWeeks = Array.from(
      new Map(
        [...selectedWeeks, ...legacyWeeks].map((week) => [week.id, week]),
      ).values(),
    );
    const weeksWithFiles = effectiveWeeks.filter((w) =>
      fileWeekIds.has(w.id),
    ).length;

    return {
      periodsCount: selectedPeriods.length,
      weeksCount: effectiveWeeks.length,
      filesCount: selectedFiles.length,
      weeksWithFiles,
      weeksWithoutFiles: Math.max(0, effectiveWeeks.length - weeksWithFiles),
    };
  };

  const courseStats = calculateCourseStats();
  const upcomingAssessments = getUpcomingAssessments();
  const courseStudents = getCourseStudents();
  const courseGradeSheets = getCourseGradeSheets();
  const courseAssessments = getCourseAssessments();
  const courseQuizCount = courseAssessments.filter(
    (assessment) =>
      (assessment.type || "").toLowerCase() === "quiz" ||
      (assessment.assessmentType || "").toLowerCase() === "quiz",
  ).length;
  const courseSlides = getCourseSlides();
  const effectiveCourseSlidesCount = Math.max(
    courseSlides.length,
    selectedCourseResourceCounts.slidesCount,
  );
  const pendingGrading = getPendingGrading();
  const missingSubmissions = getMissingSubmissions();
  const assessmentHealth = getAssessmentHealth();
  const contentCoverage = getContentCoverage();
  const effectiveFilesCount = Math.max(
    contentCoverage.filesCount,
    selectedCourseResourceCounts.filesCount,
  );
  const actionAlertsTotal =
    pendingGrading.length +
    missingSubmissions.length +
    assessmentHealth.overdueCount +
    courseStats.totalAtRisk;
  const operationalSnapshotTotal =
    upcomingAssessments.length +
    effectiveCourseSlidesCount +
    courseQuizCount +
    effectiveFilesCount;
  const snapshotCards = useMemo<SnapshotCardModel[]>(
    () => [
      {
        key: "academic-health",
        title: "Academic Health",
        subtitle: selectedCourse
          ? `${selectedCourse.code} • Group ${selectedCourse.group}`
          : "Selected course",
        icon: HeartPulse,
        iconClassName: "text-sky-700",
        value: selectedCourseHealth?.healthScore ?? 0,
        suffix: "/100",
        hint: "Built from grade trends, approval rate, pending queue and coverage.",
        metrics: [
          {
            icon: TrendingUp,
            label: "Approval",
            value: `${courseStats.approvalRate}%`,
            iconClassName: "text-emerald-600",
          },
          {
            icon: FileSpreadsheet,
            label: "Avg Grade",
            value: `${courseStats.averageGrade}/5.0`,
            iconClassName: "text-sky-600",
          },
          {
            icon: CheckCircle2,
            label: "Passing",
            value: courseStats.totalPassing,
            iconClassName: "text-indigo-600",
          },
          {
            icon: AlertTriangle,
            label: "At Risk",
            value: courseStats.totalAtRisk,
            iconClassName: "text-amber-600",
          },
        ],
      },
      {
        key: "action-alerts",
        title: "Action Alerts",
        subtitle: selectedCourse
          ? `${selectedCourse.code} • Group ${selectedCourse.group}`
          : "Selected course",
        icon: Zap,
        iconClassName: "text-violet-700",
        value: actionAlertsTotal,
        suffix: " items",
        hint: "Prioritize grading queue, missing submissions and overdue activities.",
        metrics: [
          {
            icon: Clock,
            label: "To Grade",
            value: pendingGrading.length,
            iconClassName: "text-orange-600",
          },
          {
            icon: AlertCircle,
            label: "Missing",
            value: missingSubmissions.length,
            iconClassName: "text-rose-600",
          },
          {
            icon: CalendarClock,
            label: "Overdue",
            value: assessmentHealth.overdueCount,
            iconClassName: "text-red-600",
          },
          {
            icon: FileText,
            label: "Drafts",
            value: assessmentHealth.draftCount,
            iconClassName: "text-amber-600",
          },
        ],
      },
      {
        key: "operational-snapshot",
        title: "Operational Snapshot",
        subtitle: selectedCourse
          ? `${selectedCourse.code} • Group ${selectedCourse.group}`
          : "Selected course",
        icon: Layers3,
        iconClassName: "text-cyan-700",
        value: operationalSnapshotTotal,
        suffix: " items",
        hint: "Live operational pulse: upcoming work, slides, files and quizzes.",
        metrics: [
          {
            icon: CalendarClock,
            label: "Due Soon",
            value: upcomingAssessments.length,
            iconClassName: "text-blue-600",
          },
          {
            icon: Presentation,
            label: "Slides",
            value: effectiveCourseSlidesCount,
            iconClassName: "text-violet-600",
          },
          {
            icon: FolderOpen,
            label: "Coverage",
            value: `${contentCoverage.weeksWithFiles}/${contentCoverage.weeksCount}`,
            iconClassName: "text-cyan-600",
          },
          {
            icon: ListChecks,
            label: "Quizzes",
            value: courseQuizCount,
            iconClassName: "text-teal-600",
          },
        ],
      },
    ],
    [
      actionAlertsTotal,
      assessmentHealth.draftCount,
      assessmentHealth.overdueCount,
      contentCoverage.weeksCount,
      contentCoverage.weeksWithFiles,
      courseQuizCount,
      effectiveCourseSlidesCount,
      courseStats.approvalRate,
      courseStats.averageGrade,
      courseStats.totalAtRisk,
      courseStats.totalPassing,
      missingSubmissions.length,
      operationalSnapshotTotal,
      pendingGrading.length,
      selectedCourse,
      selectedCourseHealth?.healthScore,
      upcomingAssessments.length,
    ],
  );
  const activeSnapshotCard = snapshotCards[activeSnapshotIndex] || null;
  const ActiveSnapshotIcon = activeSnapshotCard?.icon || null;

  const goToNextSnapshot = () => {
    if (snapshotCards.length <= 1) return;
    setActiveSnapshotIndex((current) => (current + 1) % snapshotCards.length);
  };

  const goToPreviousSnapshot = () => {
    if (snapshotCards.length <= 1) return;
    setActiveSnapshotIndex((current) => (current - 1 + snapshotCards.length) % snapshotCards.length);
  };

  useEffect(() => {
    setActiveSnapshotIndex(0);
  }, [selectedCourseId, snapshotCards.length]);

  if (loading) {
    return (
      <DashboardLayout contentClassName="pt-0 lg:pt-1">
        <div className="relative overflow-x-hidden">
          <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
          <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />
          <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
            <div className="flex min-h-[320px] items-center justify-center">
              <div className="space-y-2 text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
                <p className="text-base font-semibold text-slate-900">
                  Loading your dashboard
                </p>
                <p className="text-sm text-slate-600">
                  Preparing your personalized teaching overview
                </p>
              </div>
            </div>
          </div>
        </div>
        <InstitutionCaptureModal
          open={institutionModalOpen}
          roleLabel={institutionRoleLabel}
          institutionValue={institutionValue}
          suggestions={institutionSuggestions}
          saving={savingInstitution}
          errorMessage={institutionError}
          onInstitutionChange={(value) => {
            setInstitutionValue(value);
            if (institutionError) setInstitutionError("");
          }}
          onSave={handleSaveInstitution}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout contentClassName="pt-0 lg:pt-1">
      <input
        ref={restoreFileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleRestoreBackupFile}
      />
      <div className="relative overflow-x-hidden">
        <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
        <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />
        <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <div className="space-y-4">
        <section className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-slate-50/70 p-4 shadow-sm">
          <div className="pointer-events-none absolute -left-16 -top-20 h-40 w-40 rounded-full bg-sky-200/20" />
          <div className="pointer-events-none absolute -bottom-24 -right-20 h-48 w-48 rounded-full bg-indigo-200/20" />

          <div className="relative space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1">
                  <Layers3 className="h-3.5 w-3.5 text-sky-700" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                    Course Workspace
                  </span>
                </div>
                <h1 className="mt-2 truncate text-xl font-bold text-slate-900 sm:text-2xl">
                  {selectedCourse?.name || "Select a course"}
                </h1>
                <div className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                  <p className="min-w-0 truncate">
                    {selectedCourse
                      ? `${selectedCourse.code} • Group ${selectedCourse.group} • ${courseStats.totalStudents} students • ${selectedCourse.credits} credits`
                      : "No courses available"}
                  </p>
                  {selectedCourseHealth ? (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200/60 bg-white/80 px-2.5 py-1 text-xs text-slate-600">
                      <span className="font-semibold text-slate-700">
                        Pending: {selectedCourseHealth.pendingCount}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span>Due soon: {selectedCourseHealth.dueSoonCount}</span>
                      <span className="text-slate-300">•</span>
                      <span>Overdue: {selectedCourseHealth.overdueCount}</span>
                    </span>
                  ) : null}
                </div>
                {selectedCourse?.description && (
                  <p className="mt-3 max-w-3xl text-sm text-slate-600">
                    {selectedCourse.description}
                  </p>
                )}
              </div>

              <div className="w-full lg:w-auto lg:min-w-[320px]">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-slate-200/60 bg-white/90 px-3 py-2.5 backdrop-blur">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      Course Average
                    </p>
                    <p className="text-lg font-bold leading-tight text-slate-900">
                      {courseStats.averageGrade}
                      <span className="text-sm font-medium text-slate-500"> / 5.0</span>
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200/60 bg-white/90 px-3 py-2.5 backdrop-blur">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      Approval
                    </p>
                    <p className="text-lg font-bold leading-tight text-slate-900">
                      {courseStats.approvalRate}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200/60 bg-white/90 px-3 py-2.5 backdrop-blur">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      Assessments
                    </p>
                    <p className="text-lg font-bold leading-tight text-slate-900">
                      {courseStats.totalAssessments}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openBackupCenter}
                    className="rounded-xl border border-slate-200/60 bg-white px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                  >
                    <p className="text-[11px] uppercase tracking-wide text-slate-600">
                      Recovery
                    </p>
                    <p className="text-sm font-semibold leading-tight text-slate-900">
                      Open backups
                    </p>
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/60 bg-white p-3 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Your Courses</p>
                  <p className="text-xs text-slate-500">
                    Tap a card to switch the active dashboard context
                  </p>
                </div>
                <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  {courses.length} total
                </span>
              </div>

              {courseHealthOverview.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-4 text-center text-sm text-slate-600">
                  No courses available.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {courseHealthOverview.map((course) => (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() => setSelectedCourseId(course.id)}
                      className={`group rounded-xl border p-3 text-left transition-colors ${
                        selectedCourseId === course.id
                          ? "border-sky-300 bg-sky-50 shadow-sm"
                          : "border-slate-200/60 bg-white hover:border-slate-300/60 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {course.name}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {course.code} • Group {course.group}
                          </p>
                        </div>
                        {selectedCourseId === course.id ? (
                          <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                            Active
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 flex items-end justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <HeartPulse className={`h-4 w-4 ${course.tone.text}`} />
                          <p className={`text-xl font-extrabold ${course.tone.text}`}>
                            {course.healthScore}
                            <span className="ml-0.5 text-xs font-semibold text-slate-500">
                              /100
                            </span>
                          </p>
                        </div>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${course.tone.bg} ${course.tone.border} ${course.tone.text}`}
                        >
                          {course.materialsCount} materials
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-1.5">
                        <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-2 py-1 text-center">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            Students
                          </p>
                          <p className="text-sm font-bold text-slate-900">
                            {course.studentsCount}
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-2 py-1 text-center">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            Approval
                          </p>
                          <p className="text-sm font-bold text-slate-900">
                            {course.approvalRate}%
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-2 py-1 text-center">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            Pending
                          </p>
                          <p className="text-sm font-bold text-slate-900">
                            {course.pendingCount}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200/60 bg-slate-50/70 p-3 shadow-sm sm:p-4 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">General Cards</p>
                <p className="text-xs text-slate-500">
                  Swipe or use arrows. Infinite loop with live course context.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={goToPreviousSnapshot}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/60 bg-white text-slate-600 transition-colors hover:border-sky-200 hover:text-sky-700"
                  aria-label="Previous metrics card"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={goToNextSnapshot}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/60 bg-white text-slate-600 transition-colors hover:border-sky-200 hover:text-sky-700"
                  aria-label="Next metrics card"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div
              className="overflow-hidden"
              onTouchStart={(event) => {
                touchStartXRef.current = event.changedTouches[0]?.clientX ?? null;
              }}
              onTouchEnd={(event) => {
                if (touchStartXRef.current === null) return;
                const endX = event.changedTouches[0]?.clientX ?? touchStartXRef.current;
                const delta = endX - touchStartXRef.current;
                touchStartXRef.current = null;
                if (Math.abs(delta) < 45) return;
                if (delta < 0) {
                  goToNextSnapshot();
                  return;
                }
                goToPreviousSnapshot();
              }}
            >
              {activeSnapshotCard ? (
                <article className="w-full">
                  <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="inline-flex items-center gap-1 rounded-full border border-slate-200/60 bg-slate-50 px-2 py-0.5">
                          {ActiveSnapshotIcon ? (
                            <ActiveSnapshotIcon
                              className={`h-3.5 w-3.5 ${activeSnapshotCard.iconClassName}`}
                            />
                          ) : null}
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                            {activeSnapshotCard.title}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{activeSnapshotCard.subtitle}</p>
                      </div>
                    </div>

                    <div className="mt-2 flex items-end gap-1">
                      <p className={`text-3xl font-extrabold leading-none ${activeSnapshotCard.iconClassName}`}>
                        {activeSnapshotCard.value}
                      </p>
                      <span className="pb-1 text-sm font-semibold text-slate-500">
                        {activeSnapshotCard.suffix}
                      </span>
                    </div>

                    <p className="mt-2 text-xs text-slate-500">{activeSnapshotCard.hint}</p>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {activeSnapshotCard.metrics.map((metric) => {
                        const MetricIcon = metric.icon;
                        return (
                          <div
                            key={`${activeSnapshotCard.key}-${metric.label}`}
                            className="rounded-xl border border-slate-200/60 bg-slate-50 p-2 text-center"
                          >
                            <div className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white">
                              <MetricIcon className={`h-3.5 w-3.5 ${metric.iconClassName}`} />
                            </div>
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              {metric.label}
                            </p>
                            <p className={`text-sm font-bold ${metric.iconClassName}`}>
                              {metric.value}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </article>
              ) : null}
            </div>

            <div className="mt-3 flex items-center justify-center gap-1.5">
              {snapshotCards.map((card, index) => (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => setActiveSnapshotIndex(index)}
                  className={`h-2 w-2 rounded-full transition-all ${
                    index === activeSnapshotIndex
                      ? "w-6 bg-sky-600"
                      : "bg-slate-300 hover:bg-slate-400"
                  }`}
                  aria-label={`Go to ${card.title}`}
                />
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100">
                  <Clock className="h-4 w-4 text-teal-700" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Today's Classes</h2>
                  <p className="text-xs text-slate-500">Live schedule across your courses</p>
                </div>
              </div>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                {todayClassesAllCourses.length}
              </span>
            </div>

            {todayClassesAllCourses.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
                <Clock className="mx-auto h-9 w-9 text-slate-400" />
                <p className="mt-2 text-sm font-medium text-slate-700">No classes today</p>
                <p className="text-xs text-slate-500">
                  No schedule blocks match today in your active courses.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {todayClassesAllCourses.map((classItem) => (
                  <Link
                    key={classItem.id}
                    to={classItem.courseCode ? `/courses/view/${classItem.courseCode}` : "/courses"}
                    className="block"
                  >
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/60 bg-slate-50/60 px-3 py-2.5 transition-colors hover:border-slate-300/60 hover:bg-slate-50">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100">
                            <Clock className="h-3.5 w-3.5 text-teal-700" />
                          </div>
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {classItem.timeLabel}
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">{classItem.courseLabel}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-500" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

        </section>

        <section className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100">
                    <CalendarClock className="h-4 w-4 text-sky-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Upcoming Activities</h2>
                    <p className="text-xs text-slate-500">Next 7 days • your courses</p>
                  </div>
                </div>
                <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                  {upcomingActivitiesAllCourses.length}
                </span>
              </div>

              {upcomingActivitiesAllCourses.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
                  <CalendarClock className="mx-auto h-9 w-9 text-slate-400" />
                  <p className="mt-2 text-sm font-medium text-slate-700">
                    No upcoming activities
                  </p>
                  <p className="text-xs text-slate-500">
                    You are clear for the next seven days.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {upcomingActivitiesAllCourses.map((activity) => {
                    const tag = resolveUpcomingTag(activity);
                    const tagToneClasses =
                      tag.tone === "forum"
                        ? "border-green-200 bg-green-50 text-green-800"
                        : tag.tone === "announcement"
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-sky-200 bg-cyan-50 text-sky-800";
                    const activityLink =
                      activity.link ||
                      (activity.courseCode
                        ? `/courses/${activity.courseCode}/assessments/${activity.id}`
                        : "/courses");

                    return (
                      <Link
                        key={activity.id}
                        to={activityLink}
                        className="block"
                        onClick={() => {
                          if (activity.courseId && ownedCourseIds.has(activity.courseId)) {
                            setSelectedCourseId(activity.courseId);
                          }
                        }}
                      >
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/60 bg-white px-3 py-2.5 transition-colors hover:border-sky-300 hover:bg-sky-50/50">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sky-100">
                                <AlertCircle className="h-3.5 w-3.5 text-sky-700" />
                              </div>
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {activity.name}
                              </p>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tagToneClasses}`}
                              >
                                {tag.label}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-600">
                              {formatDueDateTime(activity.dueDate)}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {activity.courseCode || "Course"} • {activity.courseName}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-500" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-100">
                      <ListChecks className="h-4 w-4 text-cyan-700" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        Course Detail ({mandatoryCourseQuizProgress?.courseCode || TEACHER_ONBOARDING_COURSE_CODE})
                      </h2>
                      <p className="text-xs text-slate-600 mt-1">
                        Course overview and progress
                      </p>
                    </div>
                  </div>
                </div>

                {loadingMandatoryCourseQuizProgress ? (
                  <div className="flex items-center justify-center rounded-xl border border-slate-200/60 bg-slate-50 py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
                  </div>
                ) : !mandatoryCourseQuizProgress ? (
                  <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-4 text-center">
                    <p className="text-sm font-medium text-slate-700">No mandatory course data</p>
                    <p className="mt-1 text-xs text-slate-500">
                      We could not load quiz progress for the mandatory teacher course.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-slate-200/60 bg-slate-50 px-3 py-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {mandatoryCourseQuizProgress.courseName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {mandatoryCourseQuizProgress.courseCode}
                      </p>
                    </div>

                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-3xl font-extrabold leading-none text-slate-900">
                          {mandatoryCourseQuizProgress.progressPercentage}%
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          Approved themes progress
                        </p>
                      </div>
                      <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                        {mandatoryCourseQuizProgress.approvedThemes}/{mandatoryCourseQuizProgress.totalThemes}
                      </span>
                    </div>

                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-sky-600 transition-all duration-300"
                        style={{
                          width: `${Math.max(0, Math.min(100, mandatoryCourseQuizProgress.progressPercentage))}%`,
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>Approved: {mandatoryCourseQuizProgress.approvedThemes}</span>
                      <span>Pending: {mandatoryCourseQuizProgress.pendingThemes}</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Progress is calculated by quizzes approved with at least 80%.
                    </p>

                    <Link
                      to={`/courses/${mandatoryCourseQuizProgress.courseCode}/exercise-bank`}
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                    >
                      Open mandatory course
                    </Link>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100">
                      <Zap className="h-4 w-4 text-violet-700" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900">Quick Actions</h2>
                      <p className="text-xs text-slate-600 mt-1">
                        Shortcuts for daily teaching tasks
                      </p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Link
                    to="/courses/create"
                    className="group flex flex-col items-center justify-center rounded-xl border border-slate-200/60 bg-white p-3 transition-colors hover:border-slate-300/60 hover:bg-slate-50"
                  >
                    <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100">
                      <Plus className="h-4 w-4 text-sky-700" />
                    </div>
                    <p className="text-sm font-semibold text-slate-900">Course</p>
                    <p className="mt-1 text-xs text-slate-500">Create new</p>
                  </Link>

                  <Link
                    to="/grades"
                    className="group flex flex-col items-center justify-center rounded-xl border border-slate-200/60 bg-white p-3 transition-colors hover:border-slate-300/60 hover:bg-slate-50"
                  >
                    <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100">
                      <FileSpreadsheet className="h-4 w-4 text-violet-700" />
                    </div>
                    <p className="text-sm font-semibold text-slate-900">Grade</p>
                    <p className="mt-1 text-xs text-slate-500">{courseGradeSheets.length} sheets</p>
                  </Link>

                  <Link
                    to="/slides"
                    className="group flex flex-col items-center justify-center rounded-xl border border-slate-200/60 bg-white p-3 transition-colors hover:border-slate-300/60 hover:bg-slate-50"
                  >
                    <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100">
                      <Presentation className="h-4 w-4 text-indigo-700" />
                    </div>
                    <p className="text-sm font-semibold text-slate-900">Slides</p>
                    <p className="mt-1 text-xs text-slate-500">{effectiveCourseSlidesCount} ready</p>
                  </Link>

                  <Link
                    to={
                      selectedCourse
                        ? `/courses/${selectedCourse.code}/files`
                        : "/courses"
                    }
                    className="group flex flex-col items-center justify-center rounded-xl border border-slate-200/60 bg-white p-3 transition-colors hover:border-slate-300/60 hover:bg-slate-50"
                  >
                    <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-teal-100">
                      <FolderOpen className="h-4 w-4 text-teal-700" />
                    </div>
                    <p className="text-sm font-semibold text-slate-900">Materials</p>
                    <p className="mt-1 text-xs text-slate-500">{effectiveFilesCount} files</p>
                  </Link>

                  <Link
                    to="/students/list"
                    className="group flex flex-col items-center justify-center rounded-xl border border-slate-200/60 bg-white p-3 transition-colors hover:border-slate-300/60 hover:bg-slate-50"
                  >
                    <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100">
                      <Users className="h-4 w-4 text-emerald-700" />
                    </div>
                    <p className="text-sm font-semibold text-slate-900">Students</p>
                    <p className="mt-1 text-xs text-slate-500">{courseStudents.length} enrolled</p>
                  </Link>

                  <Link
                    to="/calendar"
                    className="group flex flex-col items-center justify-center rounded-xl border border-slate-200/60 bg-white p-3 transition-colors hover:border-slate-300/60 hover:bg-slate-50"
                  >
                    <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100">
                      <CalendarClock className="h-4 w-4 text-amber-700" />
                    </div>
                    <p className="text-sm font-semibold text-slate-900">Calendar</p>
                    <p className="mt-1 text-xs text-slate-500">Today + upcoming</p>
                  </Link>

                  <Link
                    to={
                      selectedCourse
                        ? `/courses/${selectedCourse.code}/exercise-bank`
                        : "/courses"
                    }
                    className="group flex flex-col items-center justify-center rounded-xl border border-slate-200/60 bg-white p-3 transition-colors hover:border-slate-300/60 hover:bg-slate-50"
                  >
                    <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-rose-100">
                      <ListChecks className="h-4 w-4 text-rose-700" />
                    </div>
                    <p className="text-sm font-semibold text-slate-900">Quiz</p>
                    <p className="mt-1 text-xs text-slate-500">{courseQuizCount} quizzes</p>
                  </Link>
                </div>
              </div>
            </div>
          </div>

        </section>
        </div>
      </div>
      </div>

      {showBackupCenter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
            <div className="flex items-center justify-between border-b border-slate-200/60 bg-slate-50 px-5 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Backup & Recovery Center
                </h3>
                <p className="text-sm text-slate-600">
                  Restore deleted courses or manage snapshots from all your
                  courses
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBackupCenter(false)}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-white/80 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={handleSaveSnapshot}
                  disabled={
                    !selectedCourse || isExportingBackup || isRestoringBackup
                  }
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isExportingBackup ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Clock className="h-4 w-4" />
                  )}
                  Save Snapshot
                </button>
                <button
                  type="button"
                  onClick={handleExportBackup}
                  disabled={
                    !selectedCourse || isExportingBackup || isRestoringBackup
                  }
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isExportingBackup ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Export Backup
                </button>
                <button
                  type="button"
                  onClick={handleRestoreBackupClick}
                  disabled={isRestoringBackup || isExportingBackup}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRestoringBackup ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Restore Backup File
                </button>
              </div>

              <div className="text-xs text-slate-500">
                Selected course for save/export:{" "}
                <span className="font-semibold text-slate-700">
                  {selectedCourse
                    ? `${selectedCourse.name} (${selectedCourse.code})`
                    : "None"}
                </span>
              </div>

              {loadingBackupSnapshots ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                </div>
              ) : backupSnapshots.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-10">
                  No snapshots found yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {backupSnapshots.map((snapshot) => (
                    <div
                      key={snapshot.id}
                      className="border border-slate-200/60 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {snapshot.courseName} ({snapshot.courseCode})
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Saved on {snapshot.createdAt.toLocaleString("en-US")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleRestoreSnapshot(snapshot.id)}
                          disabled={isRestoringBackup}
                          className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-700 hover:shadow-md disabled:opacity-50"
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSnapshot(snapshot.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300/60 text-slate-700 text-sm font-medium hover:bg-slate-100"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-600" />
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <InstitutionCaptureModal
        open={institutionModalOpen}
        roleLabel={institutionRoleLabel}
        institutionValue={institutionValue}
        suggestions={institutionSuggestions}
        saving={savingInstitution}
        errorMessage={institutionError}
        onInstitutionChange={(value) => {
          setInstitutionValue(value);
          if (institutionError) setInstitutionError("");
        }}
        onSave={handleSaveInstitution}
      />
    </DashboardLayout>
  );
}
 
