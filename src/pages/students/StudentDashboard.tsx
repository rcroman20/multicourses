import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import {
  Bell,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileCheck,
  GraduationCap,
  Loader2,
  Percent,
  Presentation,
  Rocket,
  Sparkles,
  Trophy,
  UserPlus,
} from "lucide-react";
import { collection, doc, getDoc, getDocs, orderBy, query, Timestamp, where } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademic } from "@/contexts/AcademicContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { InstitutionCaptureModal } from "@/components/common/InstitutionCaptureModal";
import { calculateStudentProgress } from "@/utils/gradeCalculations";
import type { Assessment, Course, Grade, CourseClassSchedule } from "@/types/academic";
import { firebaseDB } from "@/lib/firebase";
import {
  getInstitutionSaveErrorMessage,
  getInstitutionSuggestions,
  getUserStoredInstitution,
  isInstitutionMissing,
  saveUserInstitution,
} from "@/lib/services/institutionProfileService";

interface GradeSheetStudentRecord {
  studentId: string;
  userId?: string;
  email?: string;
  idNumber?: string;
  identification?: string;
  total?: number;
  status: string;
  matchesCurrentUser?: boolean;
  grades?: Record<
    string,
    {
      value?: number;
      comment?: string;
      submittedAt?: Timestamp | Date | string | null;
    }
  >;
}

interface GradeSheetRecord {
  id: string;
  title: string;
  courseId: string;
  courseCode?: string;
  courseName: string;
  gradingPeriod: string;
  weightPercentage?: number;
  isPublished: boolean;
  students: GradeSheetStudentRecord[];
  activities: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
  updatedAt: Timestamp | Date;
}

interface StudentCourse extends Course {
  enrolledStudents: string[];
  scheduleText?: string;
  classDays?: string;
  classTime?: string;
  classRoom?: string;
  location?: string;
}

interface SubmissionRecord {
  id: string;
  assessmentId: string;
  studentId: string;
  status: string;
  grade?: number;
  submittedAt?: Timestamp | Date | string;
  gradedAt?: Timestamp | Date | string;
}

interface SlideRecord {
  id: string;
  title: string;
  description: string;
  canvaUrl: string;
  createdAt: Timestamp | Date;
  weekId: string;
  courseId?: string;
  courseName?: string;
}

type StatusTone = "good" | "mid" | "risk" | "neutral";
type InsightCard = {
  id: string;
  title: string;
  subtitle: string;
  value: string | number;
  suffix: string;
  tone: StatusTone;
  metrics: Array<{
    label: string;
    value: string | number;
    tone: StatusTone;
  }>;
};

const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-700",
  mid: "border-amber-200 bg-amber-50 text-amber-700",
  risk: "border-rose-200 bg-rose-50 text-rose-700",
  neutral: "border-slate-200/60 bg-slate-100 text-slate-600",
};

const getStatusToneClass = (tone: StatusTone): string => STATUS_TONE_CLASS[tone];

const INSIGHT_TONE_CLASS: Record<
  StatusTone,
  { panel: string; value: string; chip: string }
> = {
  good: {
    panel: "border-emerald-200 bg-emerald-50/60",
    value: "text-emerald-700",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  mid: {
    panel: "border-amber-200 bg-amber-50/60",
    value: "text-amber-700",
    chip: "border-amber-200 bg-amber-50 text-amber-700",
  },
  risk: {
    panel: "border-rose-200 bg-rose-50/60",
    value: "text-rose-700",
    chip: "border-rose-200 bg-rose-50 text-rose-700",
  },
  neutral: {
    panel: "border-slate-200/60 bg-slate-50",
    value: "text-slate-700",
    chip: "border-slate-200/60 bg-slate-100 text-slate-700",
  },
};

const toDate = (value: unknown): Date => {
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === "string" || typeof value === "number") {
    return new Date(value);
  }
  return new Date();
};

const isValidDate = (value: Date): boolean => !Number.isNaN(value.getTime());

const formatDueRelative = (value: unknown): string => {
  const dueDate = toDate(value);
  if (!isValidDate(dueDate)) return "No due date";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((dueDate.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) return "Overdue";
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays <= 7) return `In ${diffDays} days`;

  return format(dueDate, "MMM dd", { locale: enUS });
};

const toStatusLabel = (assessment: Assessment): string => {
  const rawType = String(assessment.assessmentType || assessment.type || "activity");
  return rawType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const normalizeTextField = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean)
      .join(" • ");
  }
  return "";
};

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const normalizeCourseMatchValue = (value: unknown): string =>
  normalizeText(String(value || "").trim());

const normalizeIdentityValue = (value: unknown): string =>
  String(value || "").trim().toLowerCase();

const normalizeNameValue = (value: unknown): string =>
  normalizeText(String(value || "").trim()).replace(/\s+/g, " ");

const readRecordValue = (
  record: Record<string, unknown>,
  keys: string[],
): unknown => {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return undefined;
};

const parseLooseNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.\-]/g, "");
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const gradeSheetMatchesCourse = (
  sheet: Pick<GradeSheetRecord, "courseId" | "courseCode" | "courseName">,
  course: Pick<Course, "id" | "code" | "name">,
): boolean => {
  const sheetCourseId = String(sheet.courseId || "").trim();
  const courseId = String(course.id || "").trim();
  if (sheetCourseId && courseId && sheetCourseId === courseId) return true;

  const sheetCode = normalizeCourseMatchValue(sheet.courseCode);
  const courseCode = normalizeCourseMatchValue(course.code);
  if (sheetCode && courseCode && sheetCode === courseCode) return true;

  const sheetName = normalizeCourseMatchValue(sheet.courseName);
  const courseName = normalizeCourseMatchValue(course.name);
  if (sheetName && courseName && sheetName === courseName) return true;

  return false;
};

const normalizeClassSchedule = (value: unknown): CourseClassSchedule[] => {
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
      const startTime = typeof payload.startTime === "string" ? payload.startTime.trim() : "";
      const endTime = typeof payload.endTime === "string" ? payload.endTime.trim() : "";
      if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return null;
      if (!startTime || !endTime) return null;
      const slot: CourseClassSchedule = { dayOfWeek, startTime, endTime };
      if (typeof payload.location === "string" && payload.location.trim()) {
        slot.location = payload.location.trim();
      }
      return slot;
    })
    .filter((slot): slot is CourseClassSchedule => slot !== null)
    .sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return a.startTime.localeCompare(b.startTime);
    });
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

const parseClassDayIndexes = (value?: string): number[] => {
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

const isActiveAssessment = (assessment: Assessment): boolean => {
  const status = String(assessment.status || "").toLowerCase();
  return status !== "draft" && status !== "deleted" && status !== "archived";
};

const isForumOrDeliveryAssessment = (assessment: Assessment): boolean => {
  const assessmentType = String(assessment.assessmentType || "").toLowerCase();
  const activityType = String(assessment.type || "").toLowerCase();
  const deliveryType = String(assessment.deliveryType || "").toLowerCase();

  const isAnnouncement = assessmentType === "announcement" || activityType === "announcement";
  const isForum = assessmentType === "forum" || activityType === "forum";
  const isQuizOrExam =
    assessmentType === "quiz" ||
    assessmentType === "exam" ||
    activityType === "quiz" ||
    activityType === "exam";
  const deliveryLikeType =
    assessmentType === "delivery" ||
    activityType === "delivery" ||
    activityType === "homework" ||
    activityType === "project" ||
    activityType === "participation" ||
    activityType === "assignment" ||
    activityType === "task" ||
    activityType === "activity";
  const isDelivery = deliveryLikeType || (Boolean(deliveryType) && !isQuizOrExam);

  if (isAnnouncement || isQuizOrExam) return false;
  return isForum || isDelivery;
};

const isAnnouncementAssessment = (assessment: Assessment): boolean => {
  const assessmentType = String(assessment.assessmentType || "").toLowerCase();
  const activityType = String(assessment.type || "").toLowerCase();
  return assessmentType === "announcement" || activityType === "announcement";
};

const resolveGradeTone = (hasGrade: boolean, gradeValue: number): StatusTone => {
  if (!hasGrade) return "neutral";
  if (gradeValue >= 3.5) return "good";
  if (gradeValue >= 3.0) return "mid";
  return "risk";
};

const resolvePendingStateTone = (stateKey: string): StatusTone => {
  if (stateKey === "missing-overdue") return "risk";
  if (stateKey === "missing-today") return "mid";
  return "neutral";
};

export default function StudentDashboard() {
  const { user, isAuthenticated } = useAuth();
  const {
    courses,
    assessments,
    grades,
    loading,
    selectedCourseId: persistedSelectedCourseId,
    setSelectedCourseId,
  } = useAcademic();
  const navigate = useNavigate();
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  const [studentCourses, setStudentCourses] = useState<StudentCourse[]>([]);
  const [gradeSheets, setGradeSheets] = useState<GradeSheetRecord[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [recentSlides, setRecentSlides] = useState<SlideRecord[]>([]);
  const [loadingSlides, setLoadingSlides] = useState(false);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [activeInsightIndex, setActiveInsightIndex] = useState(0);
  const [animateIn, setAnimateIn] = useState(false);
  const [institutionModalOpen, setInstitutionModalOpen] = useState(false);
  const [institutionValue, setInstitutionValue] = useState("");
  const [institutionSuggestions, setInstitutionSuggestions] = useState<string[]>([]);
  const [savingInstitution, setSavingInstitution] = useState(false);
  const [institutionError, setInstitutionError] = useState("");
  const institutionRoleLabel = user?.role === "admin" ? "Admin" : "Student";

  useEffect(() => {
    if (isAuthenticated && user?.role === "docente") {
      navigate("/teacher", { replace: true });
    }
  }, [isAuthenticated, navigate, user?.role]);

  useEffect(() => {
    let cancelled = false;

    const loadInstitutionProfile = async () => {
      if (!isAuthenticated || !user?.id) {
        if (!cancelled) {
          setInstitutionModalOpen(false);
        }
        return;
      }

      if (user.role !== "estudiante" && user.role !== "admin") {
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
    setAvatarLoadFailed(false);
  }, [user?.avatarUrl]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setAnimateIn(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setStudentCourses([]);
      return;
    }

    const enrolled = courses.filter((course) =>
      Array.isArray(course.enrolledStudents) && course.enrolledStudents.includes(user.id),
    ) as StudentCourse[];

    setStudentCourses(enrolled);
  }, [courses, user?.id]);

  useEffect(() => {
    const loadGradeSheets = async () => {
      if (!user?.id || studentCourses.length === 0) {
        setGradeSheets([]);
        return;
      }

      setLoadingSheets(true);
      try {
        const [userDocSnapshot, studentDocSnapshot] = await Promise.all([
          getDoc(doc(firebaseDB, "usuarios", user.id)),
          getDoc(doc(firebaseDB, "estudiantes", user.id)),
        ]);

        const userDocData = userDocSnapshot.exists() ? userDocSnapshot.data() : {};
        const studentDocData = studentDocSnapshot.exists() ? studentDocSnapshot.data() : {};
        const identityAliases = new Set<string>(
          [
            user.id,
            user.email,
            user.name,
            (userDocData as Record<string, unknown>).idNumber,
            (userDocData as Record<string, unknown>).identification,
            (userDocData as Record<string, unknown>).document,
            (userDocData as Record<string, unknown>).cedula,
            (studentDocData as Record<string, unknown>).idNumber,
            (studentDocData as Record<string, unknown>).identification,
            (studentDocData as Record<string, unknown>).document,
            (studentDocData as Record<string, unknown>).cedula,
            (studentDocData as Record<string, unknown>).email,
          ]
            .map(normalizeIdentityValue)
            .filter(Boolean),
        );
        const currentUserNameKey = normalizeNameValue(user.name);

        const matchesCurrentStudent = (payload: Record<string, unknown>) => {
          const nestedStudent =
            payload.student && typeof payload.student === "object"
              ? (payload.student as Record<string, unknown>)
              : null;
          const directIdentifiers = [
            payload.studentId,
            payload.studentID,
            payload.student_id,
            payload.userId,
            payload.userID,
            payload.user_id,
            payload.uid,
            payload.id,
            payload.email,
            payload.studentEmail,
            payload.correo,
            payload.mail,
            payload.idNumber,
            payload.identification,
            payload.document,
            payload.cedula,
            nestedStudent?.id,
            nestedStudent?.uid,
            nestedStudent?.userId,
            nestedStudent?.email,
            nestedStudent?.idNumber,
            nestedStudent?.identification,
            nestedStudent?.document,
            nestedStudent?.cedula,
          ]
            .map(normalizeIdentityValue)
            .filter(Boolean);

          if (directIdentifiers.some((key) => identityAliases.has(key))) return true;

          const payloadName = normalizeNameValue(payload.name);
          return Boolean(payloadName) && payloadName === currentUserNameKey;
        };

        const courseIds = Array.from(
          new Set(
            studentCourses
              .map((course) => String(course.id || "").trim())
              .filter(Boolean),
          ),
        );
        if (courseIds.length === 0) {
          setGradeSheets([]);
          return;
        }

        const gradeSheetsRef = collection(firebaseDB, "gradeSheets");
        const chunkSize = 10;
        const chunks = Array.from(
          { length: Math.ceil(courseIds.length / chunkSize) },
          (_, index) => courseIds.slice(index * chunkSize, index * chunkSize + chunkSize),
        );
        const snapshotGroups = await Promise.all(
          chunks.map((chunk) =>
            getDocs(query(gradeSheetsRef, where("courseId", "in", chunk))),
          ),
        );

        const sheets: GradeSheetRecord[] = [];
        snapshotGroups.forEach((groupSnapshot) => {
          groupSnapshot.forEach((docSnapshot) => {
          const data = docSnapshot.data();
          const publishedRaw = (data as Record<string, unknown>)?.isPublished ??
            (data as Record<string, unknown>)?.published ??
            (data as Record<string, unknown>)?.status ??
            (data as Record<string, unknown>)?.estado;
          const normalizedPublishText = normalizeIdentityValue(publishedRaw);
          const isSheetPublished =
            typeof publishedRaw === "boolean"
              ? publishedRaw
              : typeof publishedRaw === "number"
                ? publishedRaw === 1
                : normalizedPublishText === "true" ||
                  normalizedPublishText === "1" ||
                  normalizedPublishText === "published" ||
                  normalizedPublishText === "publicado" ||
                  normalizedPublishText === "active" ||
                  normalizedPublishText === "activo" ||
                  normalizedPublishText === "yes" ||
                  normalizedPublishText === "si";
          if (!isSheetPublished) return;

          const studentsRaw = Array.isArray(data.students)
            ? data.students
            : data.students && typeof data.students === "object"
              ? Object.entries(data.students as Record<string, unknown>).map(
                  ([studentKey, studentPayload]) => {
                    if (studentPayload && typeof studentPayload === "object") {
                      return {
                        __studentKey: studentKey,
                        ...(studentPayload as Record<string, unknown>),
                      };
                    }
                    return {
                      __studentKey: studentKey,
                      total: studentPayload,
                    };
                  },
                )
              : [];
          const students = studentsRaw
            .map((entry) => {
              if (!entry || typeof entry !== "object") return null;
              const payload = entry as Record<string, unknown>;
              const studentId = String(
                readRecordValue(payload, [
                  "__studentKey",
                  "studentId",
                  "studentID",
                  "student_id",
                  "id",
                  "uid",
                  "userId",
                  "userID",
                  "user_id",
                ]) || "",
              ).trim();
              const userIdValue = String(
                readRecordValue(payload, ["userId", "userID", "user_id", "uid"]) || "",
              ).trim();
              const emailValue = String(
                readRecordValue(payload, ["email", "studentEmail", "correo", "mail"]) || "",
              ).trim();
              const idNumberValue = String(
                readRecordValue(payload, ["idNumber", "document", "cedula"]) || "",
              ).trim();
              const identificationValue = String(
                readRecordValue(payload, ["identification"]) || "",
              ).trim();
              const hasSomeIdentity =
                studentId ||
                userIdValue ||
                emailValue ||
                idNumberValue ||
                identificationValue;
              if (!hasSomeIdentity) return null;

              let parsedGrades: GradeSheetStudentRecord["grades"];
              if (Array.isArray(payload.grades)) {
                const entries: Array<
                  [string, NonNullable<GradeSheetStudentRecord["grades"]>[string]]
                > = [];
                (payload.grades as unknown[]).forEach((gradeValue, index) => {
                  const parsedGradeValue = parseLooseNumber(
                    typeof gradeValue === "object" && gradeValue !== null
                      ? readRecordValue(gradeValue as Record<string, unknown>, [
                          "value",
                          "grade",
                          "score",
                          "nota",
                          "total",
                          "average",
                        ])
                      : gradeValue,
                  );
                  if (parsedGradeValue === null) return;
                  entries.push([`activity_${index + 1}`, { value: parsedGradeValue }]);
                });

                if (entries.length > 0) {
                  parsedGrades = Object.fromEntries(entries);
                }
              } else if (payload.grades && typeof payload.grades === "object") {
                const entries: Array<
                  [string, NonNullable<GradeSheetStudentRecord["grades"]>[string]]
                > = [];
                Object.entries(payload.grades as Record<string, unknown>).forEach(
                  ([activityId, gradeValue]) => {
                    if (!gradeValue || typeof gradeValue !== "object") return;
                    const gradePayload = gradeValue as {
                      value?: unknown;
                      grade?: unknown;
                      score?: unknown;
                      nota?: unknown;
                      total?: unknown;
                      average?: unknown;
                      comment?: unknown;
                      submittedAt?: unknown;
                    };

                    const gradeEntry: NonNullable<GradeSheetStudentRecord["grades"]>[string] = {};
                    const parsedGradeValue = parseLooseNumber(
                      gradePayload.value ??
                        gradePayload.grade ??
                        gradePayload.score ??
                        gradePayload.nota ??
                        gradePayload.total ??
                        gradePayload.average,
                    );
                    if (parsedGradeValue !== null) {
                      gradeEntry.value = parsedGradeValue;
                    }
                    if (typeof gradePayload.comment === "string") {
                      gradeEntry.comment = gradePayload.comment;
                    }
                    if (
                      gradePayload.submittedAt instanceof Timestamp ||
                      gradePayload.submittedAt instanceof Date ||
                      typeof gradePayload.submittedAt === "string"
                    ) {
                      gradeEntry.submittedAt = gradePayload.submittedAt;
                    }

                    entries.push([activityId, gradeEntry]);
                  },
                );

                if (entries.length > 0) {
                  parsedGrades = Object.fromEntries(entries);
                }
              }

              const studentRecord: GradeSheetStudentRecord = {
                studentId: studentId || userIdValue,
                status: String(readRecordValue(payload, ["status", "estado"]) || ""),
                userId: userIdValue || undefined,
                email: emailValue || undefined,
                idNumber: idNumberValue || undefined,
                identification: identificationValue || undefined,
                matchesCurrentUser: matchesCurrentStudent(payload as Record<string, unknown>),
              };
              const parsedTotal = parseLooseNumber(
                readRecordValue(payload, [
                  "total",
                  "grade",
                  "finalGrade",
                  "average",
                  "promedio",
                  "notaFinal",
                  "nota",
                  "score",
                ]),
              );
              if (parsedTotal !== null) {
                studentRecord.total = parsedTotal;
              }
              if (parsedGrades) {
                studentRecord.grades = parsedGrades;
              }
              return studentRecord;
            })
            .filter((entry): entry is GradeSheetStudentRecord => entry !== null);

          const activitiesRaw = Array.isArray(data.activities)
            ? data.activities
            : data.activities && typeof data.activities === "object"
              ? Object.entries(data.activities as Record<string, unknown>).map(
                  ([activityKey, activityPayload]) => {
                    if (activityPayload && typeof activityPayload === "object") {
                      return {
                        __activityKey: activityKey,
                        ...(activityPayload as Record<string, unknown>),
                      };
                    }
                    return {
                      __activityKey: activityKey,
                      name: String(activityPayload || activityKey),
                    };
                  },
                )
              : [];
          const activities = activitiesRaw
            .map((entry) => {
              if (!entry || typeof entry !== "object") return null;
              const payload = entry as { id?: unknown; name?: unknown; description?: unknown };
              const id = String((payload as Record<string, unknown>).__activityKey || payload.id || "").trim();
              const name = String(payload.name || "").trim();
              if (!id && !name) return null;
              const activityRecord: GradeSheetRecord["activities"][number] = {
                id: id || name,
                name: name || id,
              };
              if (typeof payload.description === "string" && payload.description.trim()) {
                activityRecord.description = payload.description;
              }
              return activityRecord;
            })
            .filter(
              (entry): entry is GradeSheetRecord["activities"][number] => entry !== null,
            );

          const isStudentInSheet = students.some(
            (student) =>
              student.matchesCurrentUser ||
              normalizeIdentityValue(student.studentId) === normalizeIdentityValue(user.id) ||
              normalizeIdentityValue(student.userId) === normalizeIdentityValue(user.id),
          );
          if (!isStudentInSheet) return;

          sheets.push({
            id: docSnapshot.id,
            title: String(data.title || "Grade Sheet"),
            courseId: String(
              (data as Record<string, unknown>).courseId ||
                (data as Record<string, unknown>).course_id ||
                (data as Record<string, unknown>).cursoId ||
                "",
            ).trim(),
            courseCode:
              String(
                (data as Record<string, unknown>).courseCode ||
                  (data as Record<string, unknown>).course_code ||
                  (data as Record<string, unknown>).codigoCurso ||
                  "",
              ).trim() || undefined,
            courseName: String(
              (data as Record<string, unknown>).courseName ||
                (data as Record<string, unknown>).course_name ||
                (data as Record<string, unknown>).nombreCurso ||
                "Course",
            ),
            gradingPeriod: String(data.gradingPeriod || "Period"),
            weightPercentage:
              parseLooseNumber(
                (data as Record<string, unknown>).weightPercentage ??
                  (data as Record<string, unknown>).weight ??
                  (data as Record<string, unknown>).percentage ??
                  (data as Record<string, unknown>).porcentaje,
              ) ?? undefined,
            isPublished: isSheetPublished,
            students,
            activities,
            updatedAt:
              data.updatedAt instanceof Timestamp || data.updatedAt instanceof Date
                ? data.updatedAt
                : new Date(),
          });
          });
        });

        setGradeSheets(sheets);
      } catch {
        setGradeSheets([]);
      } finally {
        setLoadingSheets(false);
      }
    };

    void loadGradeSheets();
  }, [studentCourses, user?.id]);

  useEffect(() => {
    const loadRecentSlides = async () => {
      if (!user?.id || studentCourses.length === 0) {
        setRecentSlides([]);
        return;
      }

      setLoadingSlides(true);
      try {
        const studentCourseById = new Map(studentCourses.map((course) => [course.id, course]));
        const studentCourseIds = new Set(studentCourseById.keys());

        const slidesRef = collection(firebaseDB, "diapositivas");
        const slidesQuery = query(slidesRef, orderBy("createdAt", "desc"));
        const weeksRef = collection(firebaseDB, "semanas");
        const unitsRef = collection(firebaseDB, "unidades");
        const [slidesSnapshot, weeksSnapshot, unitsSnapshot] = await Promise.all([
          getDocs(slidesQuery),
          getDocs(weeksRef),
          getDocs(unitsRef),
        ]);

        const unitToCourseId = new Map<string, string>();
        unitsSnapshot.forEach((docSnapshot) => {
          const data = docSnapshot.data();
          const courseId = String(data.courseId || "").trim();
          if (!courseId) return;
          unitToCourseId.set(docSnapshot.id, courseId);
        });

        const weekToCourseId = new Map<string, string>();
        weeksSnapshot.forEach((docSnapshot) => {
          const data = docSnapshot.data();
          const unitId = String(data.unitId || "").trim();
          if (!unitId) return;
          const courseId = unitToCourseId.get(unitId);
          if (!courseId) return;
          weekToCourseId.set(docSnapshot.id, courseId);
        });

        const slides: SlideRecord[] = [];
        slidesSnapshot.forEach((docSnapshot) => {
          if (slides.length >= 6) return;
          const data = docSnapshot.data();
          const weekId = String(data.weekId || "").trim();
          const explicitCourseId = String(data.courseId || "").trim();
          const linkedCourseId = explicitCourseId || weekToCourseId.get(weekId) || "";

          if (linkedCourseId && !studentCourseIds.has(linkedCourseId)) {
            return;
          }

          const linkedCourse = linkedCourseId
            ? studentCourseById.get(linkedCourseId)
            : undefined;
          const fallbackCourseName = String(data.courseName || "").trim();

          slides.push({
            id: docSnapshot.id,
            title: String(data.title || "Slide"),
            description: String(data.description || ""),
            canvaUrl: String(data.canvaUrl || ""),
            createdAt:
              data.createdAt instanceof Timestamp || data.createdAt instanceof Date
                ? data.createdAt
                : new Date(),
            weekId,
            courseId: linkedCourse?.id || linkedCourseId || undefined,
            courseName: linkedCourse?.name || fallbackCourseName || undefined,
          });
        });

        setRecentSlides(slides);
      } catch {
        setRecentSlides([]);
      } finally {
        setLoadingSlides(false);
      }
    };

    void loadRecentSlides();
  }, [studentCourses, user?.id]);

  useEffect(() => {
    const loadSubmissions = async () => {
      if (!user?.id) {
        setSubmissions([]);
        return;
      }

      setLoadingSubmissions(true);
      try {
        const submissionsRef = collection(firebaseDB, "submissions");
        const submissionsQuery = query(submissionsRef, where("studentId", "==", user.id));
        const querySnapshot = await getDocs(submissionsQuery);

        const records: SubmissionRecord[] = [];
        querySnapshot.forEach((docSnapshot) => {
          const data = docSnapshot.data();
          records.push({
            id: docSnapshot.id,
            assessmentId: String(data.assessmentId || ""),
            studentId: String(data.studentId || ""),
            status: String(data.status || ""),
            grade:
              typeof data.grade === "number" && Number.isFinite(data.grade)
                ? data.grade
                : undefined,
            submittedAt: data.submittedAt,
            gradedAt: data.gradedAt,
          });
        });

        setSubmissions(records);
      } catch {
        setSubmissions([]);
      } finally {
        setLoadingSubmissions(false);
      }
    };

    void loadSubmissions();
  }, [user?.id]);

  const courseGradeMetrics = useMemo(() => {
    const metrics = new Map<
      string,
      { average: number; evaluatedPercentage: number; hasGrade: boolean }
    >();
    if (!user?.id || studentCourses.length === 0) return metrics;

    studentCourses.forEach((course) => {
      const matchingSheets = gradeSheets.filter((sheet) =>
        gradeSheetMatchesCourse(sheet, course),
      );
      if (matchingSheets.length === 0) return;

      const evaluatedSheets: Array<{ score: number; weight: number | null }> = [];
      let gradedActivities = 0;
      let totalActivities = 0;

      matchingSheets.forEach((sheet) => {
        const studentData = sheet.students.find(
          (student) =>
            student.matchesCurrentUser ||
            normalizeIdentityValue(student.studentId) === normalizeIdentityValue(user.id) ||
            normalizeIdentityValue(student.userId) === normalizeIdentityValue(user.id),
        );
        if (!studentData) return;

        const gradeEntries = Object.values(studentData.grades || {})
          .map((entry) => parseLooseNumber(entry?.value))
          .filter((value): value is number => value !== null);
        const hasGradeEntries = gradeEntries.length > 0;

        const activityCount = Array.isArray(sheet.activities) && sheet.activities.length > 0
          ? sheet.activities.length
          : gradeEntries.length;

        if (activityCount > 0) {
          totalActivities += activityCount;
        }
        if (hasGradeEntries) {
          gradedActivities += gradeEntries.length;
        }

        const totalValue = parseLooseNumber(studentData.total);
        const statusText = normalizeIdentityValue(studentData.status);
        const pendingWithoutGrades =
          !hasGradeEntries &&
          (statusText === "" ||
            statusText === "pending" ||
            statusText === "not_graded" ||
            statusText === "sin calificar");

        if (pendingWithoutGrades) return;

        let sheetScore: number | null = null;
        if (gradeEntries.length > 0) {
          const averageFromEntries =
            gradeEntries.reduce((sum, value) => sum + value, 0) / gradeEntries.length;
          sheetScore = Math.max(0, Math.min(5, averageFromEntries));
        } else if (totalValue !== null) {
          sheetScore = Math.max(0, Math.min(5, totalValue));
        }

        if (sheetScore === null) return;

        const sheetWeight = parseLooseNumber(sheet.weightPercentage);
        evaluatedSheets.push({
          score: sheetScore,
          weight:
            sheetWeight !== null && sheetWeight > 0
              ? Math.max(0, Math.min(100, sheetWeight))
              : null,
        });
      });

      const hasGrade = evaluatedSheets.length > 0;
      if (!hasGrade) return;

      const weightedSheets = evaluatedSheets.filter((sheet) => sheet.weight !== null);
      const hasWeights = weightedSheets.length > 0;
      const average = hasWeights
        ? (() => {
            const evaluatedWeight = weightedSheets.reduce(
              (sum, sheet) => sum + (sheet.weight || 0),
              0,
            );
            if (evaluatedWeight <= 0) {
              return (
                evaluatedSheets.reduce((sum, sheet) => sum + sheet.score, 0) /
                evaluatedSheets.length
              );
            }
            const weightedSum = weightedSheets.reduce(
              (sum, sheet) => sum + sheet.score * ((sheet.weight || 0) / 100),
              0,
            );
            return weightedSum / (evaluatedWeight / 100);
          })()
        : evaluatedSheets.reduce((sum, sheet) => sum + sheet.score, 0) / evaluatedSheets.length;

      const evaluatedPercentage = hasWeights
        ? Math.max(
            0,
            Math.min(
              100,
              weightedSheets.reduce((sum, sheet) => sum + (sheet.weight || 0), 0),
            ),
          )
        : totalActivities > 0
          ? Math.max(0, Math.min(100, (gradedActivities / totalActivities) * 100))
          : Math.max(
              0,
              Math.min(
                100,
                (evaluatedSheets.length / Math.max(1, matchingSheets.length)) * 100,
              ),
            );

      metrics.set(course.id, {
        average: Math.max(0, Math.min(5, average)),
        evaluatedPercentage,
        hasGrade,
      });
    });

    return metrics;
  }, [gradeSheets, studentCourses, user?.id]);

  const courseProgress = useMemo(() => {
    if (!user?.id) return [];

    return studentCourses.map((course) => {
      const courseAssessments = assessments.filter((assessment) => assessment.courseId === course.id);
      const realAverage = courseGradeMetrics.get(course.id);
      const gradedAssessmentIds = new Set(
        courseAssessments
          .map((assessment) => String(assessment.id || "").trim())
          .filter(Boolean),
      );
      const linkedAssessmentGrades = grades.filter((grade) => {
        if (grade.studentId !== user.id) return false;
        const assessmentId = String(grade.assessmentId || "").trim();
        if (!assessmentId || !gradedAssessmentIds.has(assessmentId)) return false;
        const parsedValue = parseLooseNumber(grade.value);
        return parsedValue !== null;
      });

      const linkedAssessmentProgress =
        linkedAssessmentGrades.length > 0
          ? (() => {
              const assessmentById = new Map(
                courseAssessments.map((assessment) => [String(assessment.id || "").trim(), assessment]),
              );
              const gradedPercentages = new Set<string>();
              let weightedSum = 0;

              linkedAssessmentGrades.forEach((grade) => {
                const assessmentId = String(grade.assessmentId || "").trim();
                const assessment = assessmentById.get(assessmentId);
                if (!assessment) return;

                const gradeValue = parseLooseNumber(grade.value);
                if (gradeValue === null) return;
                const percentage = parseLooseNumber(
                  (assessment as unknown as Record<string, unknown>).percentage,
                );
                const safePercentage = percentage !== null ? Math.max(0, percentage) : 0;

                weightedSum += gradeValue * (safePercentage / 100);
                gradedPercentages.add(`${assessmentId}:${safePercentage}`);
              });

              const evaluatedPercentage = Array.from(gradedPercentages).reduce((sum, key) => {
                const maybePercentage = parseLooseNumber(key.split(":")[1]);
                return sum + (maybePercentage ?? 0);
              }, 0);

              const normalizedGrade =
                evaluatedPercentage > 0
                  ? Math.max(0, Math.min(5, weightedSum / (evaluatedPercentage / 100)))
                  : 0;
              const remainingPercentage = Math.max(0, 100 - evaluatedPercentage);

              return {
                studentId: user.id,
                courseId: course.id,
                currentGrade: normalizedGrade,
                evaluatedPercentage: Math.max(0, Math.min(100, evaluatedPercentage)),
                remainingPercentage,
                minGradeToPass: normalizedGrade >= 3.0 ? 0 : 3.0,
                status:
                  normalizedGrade >= 3.5
                    ? "passing"
                    : normalizedGrade >= 2.5
                      ? "at-risk"
                      : "failing",
                grades: linkedAssessmentGrades as Grade[],
              } as const;
            })()
          : null;

      const fallbackCalculatedProgress = calculateStudentProgress(
        user.id,
        course.id,
        grades,
        courseAssessments,
      );
      const fallbackNormalizedGrade =
        fallbackCalculatedProgress.evaluatedPercentage > 0
          ? fallbackCalculatedProgress.currentGrade /
            (fallbackCalculatedProgress.evaluatedPercentage / 100)
          : fallbackCalculatedProgress.currentGrade;
      const fallbackCurrentGrade = Math.max(
        0,
        Math.min(5, Number.isFinite(fallbackNormalizedGrade) ? fallbackNormalizedGrade : 0),
      );
      const fallbackStatus =
        fallbackCurrentGrade >= 3.5
          ? "passing"
          : fallbackCurrentGrade >= 2.5
            ? "at-risk"
            : "failing";
      const normalizedFallbackProgress = {
        ...fallbackCalculatedProgress,
        currentGrade: fallbackCurrentGrade,
        status: fallbackStatus,
      };

      const progress =
        realAverage?.hasGrade
          ? {
              studentId: user.id,
              courseId: course.id,
              currentGrade: realAverage.average,
              evaluatedPercentage: realAverage.evaluatedPercentage,
              remainingPercentage: Math.max(0, 100 - realAverage.evaluatedPercentage),
              minGradeToPass: realAverage.average >= 3.0 ? 0 : 3.0,
              status:
                realAverage.average >= 3.5
                  ? "passing"
                  : realAverage.average >= 2.5
                    ? "at-risk"
                    : "failing",
                grades: [] as Grade[],
            }
          : linkedAssessmentProgress
            ? linkedAssessmentProgress
          : normalizedFallbackProgress;

      return {
        course,
        progress,
        hasRealGrades:
          Boolean(realAverage?.hasGrade) ||
          Boolean(linkedAssessmentProgress) ||
          progress.grades.length > 0 ||
          grades.some((grade) => grade.courseId === course.id && grade.studentId === user.id),
      };
    });
  }, [assessments, courseGradeMetrics, grades, studentCourses, user?.id]);

  const totalCourses = studentCourses.length;

  const { passingCourses, atRiskCourses, failingCourses, averageGrade, completedCourses } =
    useMemo(() => {
      let passing = 0;
      let atRisk = 0;
      let failing = 0;
      let completed = 0;
      let gradeSum = 0;
      let gradedCourses = 0;

      courseProgress.forEach((item) => {
        if (!item.hasRealGrades) return;

        gradedCourses += 1;
        gradeSum += item.progress.currentGrade;

        if (item.progress.currentGrade >= 3.0) completed += 1;

        if (item.progress.status === "passing") passing += 1;
        else if (item.progress.status === "at-risk") atRisk += 1;
        else failing += 1;
      });

      return {
        passingCourses: passing,
        atRiskCourses: atRisk,
        failingCourses: failing,
        completedCourses: completed,
        averageGrade: gradedCourses > 0 ? gradeSum / gradedCourses : 0,
      };
    }, [courseProgress]);

  const recentGrades = useMemo(() => {
    return [...gradeSheets]
      .sort((a, b) => toDate(b.updatedAt).getTime() - toDate(a.updatedAt).getTime())
      .slice(0, 5);
  }, [gradeSheets]);

  const studentCourseIds = useMemo(
    () => new Set(studentCourses.map((course) => course.id)),
    [studentCourses],
  );

  const activeStudentAssessments = useMemo(
    () =>
      assessments.filter(
        (assessment) => studentCourseIds.has(assessment.courseId) && isActiveAssessment(assessment),
      ),
    [assessments, studentCourseIds],
  );

  const assessmentById = useMemo(
    () =>
      new Map(
        assessments.map((assessment) => [String(assessment.id || "").trim(), assessment]),
      ),
    [assessments],
  );

  const studentAssessments = useMemo(
    () => activeStudentAssessments.filter((assessment) => isForumOrDeliveryAssessment(assessment)),
    [activeStudentAssessments],
  );

  const courseById = useMemo(
    () => new Map(studentCourses.map((course) => [course.id, course])),
    [studentCourses],
  );

  const studentAnnouncements = useMemo(
    () =>
      activeStudentAssessments
        .filter((assessment) => isAnnouncementAssessment(assessment))
        .map((assessment) => {
          const course = courseById.get(assessment.courseId);
          const baseDate = toDate(
            assessment.startDate || assessment.dueDate || assessment.createdAt,
          );
          const dateLabel = isValidDate(baseDate)
            ? format(baseDate, "MMM dd", { locale: enUS })
            : "Recent";

          return {
            id: assessment.id,
            title: assessment.name,
            subtitle: `${course?.code || "Course"} • ${dateLabel}`,
            sortAt: isValidDate(baseDate) ? baseDate.getTime() : 0,
            link: course?.code
              ? `/courses/${course.code}/assessments/${assessment.id}`
              : "/courses",
          };
        })
        .sort((a, b) => b.sortAt - a.sortAt)
        .slice(0, 4),
    [activeStudentAssessments, courseById],
  );

  const todayClassesDateLabel = format(new Date(), "EEEE, MMM d", { locale: enUS });

  const todayClasses = useMemo(() => {
    const todayDayIndex = new Date().getDay();
    const results: Array<{
      id: string;
      courseId: string;
      timeLabel: string;
      courseLabel: string;
      link: string;
      sortOrder: number;
    }> = [];

    studentCourses.forEach((course) => {
      const schedule = normalizeClassSchedule(course.classSchedule);
      if (schedule.length > 0) {
        schedule.forEach((slot, slotIndex) => {
          if (slot.dayOfWeek !== todayDayIndex) return;
          const roomText =
            normalizeTextField(slot.location) ||
            normalizeTextField(course.classRoom) ||
            normalizeTextField(course.location);
          results.push({
            id: `${course.id}-${slot.dayOfWeek}-${slot.startTime}-${slotIndex}`,
            courseId: course.id,
            timeLabel: `${formatTimeToMeridiem(slot.startTime)} - ${formatTimeToMeridiem(slot.endTime)}`,
            courseLabel: `${course.code || "Course"}${roomText ? ` • ${roomText}` : ""}`,
            link: course.code ? `/courses/view/${course.code}` : "/courses",
            sortOrder: parseTimeToMinutes(slot.startTime) ?? 9999,
          });
        });
        return;
      }

      const dayIndexes = parseClassDayIndexes(
        normalizeTextField(course.classDays) || normalizeTextField(course.scheduleText),
      );
      if (!dayIndexes.includes(todayDayIndex)) return;

      const timeText =
        normalizeTextField(course.classTime) ||
        normalizeTextField(course.scheduleText) ||
        "Class session";
      const roomText = normalizeTextField(course.classRoom) || normalizeTextField(course.location);
      results.push({
        id: `${course.id}-legacy-${todayDayIndex}`,
        courseId: course.id,
        timeLabel: formatTimeRangeLabel(timeText),
        courseLabel: `${course.code || "Course"}${roomText ? ` • ${roomText}` : ""}`,
        link: course.code ? `/courses/view/${course.code}` : "/courses",
        sortOrder: parseTimeToMinutes(timeText) ?? 9999,
      });
    });

    return results.sort(
      (a, b) => a.sortOrder - b.sortOrder || a.courseLabel.localeCompare(b.courseLabel),
    );
  }, [studentCourses]);

  const gradeByAssessmentId = useMemo(() => {
    const gradeMap = new Map<string, Grade>();
    if (!user?.id) return gradeMap;

    grades
      .filter((grade) => grade.studentId === user.id)
      .forEach((grade) => gradeMap.set(grade.assessmentId, grade));

    return gradeMap;
  }, [grades, user?.id]);

  const submissionByAssessmentId = useMemo(() => {
    const byAssessment = new Map<string, SubmissionRecord>();

    submissions.forEach((submission) => {
      const existing = byAssessment.get(submission.assessmentId);
      const currentTime = toDate(submission.submittedAt || submission.gradedAt).getTime();
      const previousTime = existing
        ? toDate(existing.submittedAt || existing.gradedAt).getTime()
        : 0;

      if (!existing || currentTime >= previousTime) {
        byAssessment.set(submission.assessmentId, submission);
      }
    });

    return byAssessment;
  }, [submissions]);

  const pendingRealWork = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const hasGradeFromSheet = (assessment: Assessment): boolean => {
      const assessmentName = normalizeText(String(assessment.name || ""));
      const assessmentGradeSheetId = String(assessment.gradeSheetId || "");

      return gradeSheets.some((sheet) => {
        if (!sheet.isPublished || sheet.courseId !== assessment.courseId) return false;

        const studentRecord = sheet.students.find((student) => student.studentId === user?.id);
        if (!studentRecord?.grades) return false;

        const directKeys = [assessment.id, assessmentGradeSheetId].filter(Boolean);
        const hasDirectGrade = directKeys.some((key) => {
          const gradeEntry = studentRecord.grades?.[key];
          return typeof gradeEntry?.value === "number" && Number.isFinite(gradeEntry.value);
        });
        if (hasDirectGrade) return true;

        const matchedActivity = sheet.activities.find((activity) => {
          const activityName = normalizeText(activity.name || "");
          const activityDescription = normalizeText(activity.description || "");

          if (activity.id === assessment.id) return true;
          if (assessmentGradeSheetId && activity.id === assessmentGradeSheetId) return true;
          if (activityName && assessmentName && activityName === assessmentName) return true;
          if (activityName && assessmentName && activityName.includes(assessmentName)) return true;
          if (activityName && assessmentName && assessmentName.includes(activityName)) return true;
          if (
            activityDescription &&
            assessmentName &&
            assessmentName.length >= 6 &&
            activityDescription.includes(assessmentName)
          ) {
            return true;
          }
          return false;
        });

        if (!matchedActivity) return false;
        const gradeEntry = studentRecord.grades?.[matchedActivity.id];
        return typeof gradeEntry?.value === "number" && Number.isFinite(gradeEntry.value);
      });
    };

    return studentAssessments
      .map((assessment) => {
        const dueDate = toDate(assessment.dueDate);
        const hasDueDate = isValidDate(dueDate);
        if (hasDueDate) dueDate.setHours(0, 0, 0, 0);

        const submission = submissionByAssessmentId.get(assessment.id);
        const grade = gradeByAssessmentId.get(assessment.id);
        const hasGrade =
          typeof grade?.value === "number" ||
          typeof submission?.grade === "number" ||
          hasGradeFromSheet(assessment);

        if (hasGrade) return null;

        const submissionStatus = String(submission?.status || "").toLowerCase();
        const isSubmitted = Boolean(submission);
        const isPendingReview =
          isSubmitted &&
          (submissionStatus === "submitted" ||
            submissionStatus === "pending" ||
            submissionStatus === "in_review" ||
            submissionStatus === "in-review");

        const isOverdue = hasDueDate && dueDate.getTime() < today.getTime();
        const isDueToday = hasDueDate && dueDate.getTime() === today.getTime();
        const daysOverdue = hasDueDate
          ? Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86400000))
          : 0;

        const stateKey = !isSubmitted
          ? isOverdue
            ? "missing-overdue"
            : isDueToday
              ? "missing-today"
              : "missing-open"
          : isPendingReview && isOverdue
            ? "submitted-overdue"
            : "submitted-pending";

        const urgencyScore =
          stateKey === "missing-overdue"
            ? 100 + daysOverdue
            : stateKey === "submitted-overdue"
              ? 85 + daysOverdue
              : stateKey === "missing-today"
                ? 80
                : stateKey === "submitted-pending"
                  ? 65
                  : 45;

        const stateLabel =
          stateKey === "missing-overdue"
            ? "Missing (overdue)"
            : stateKey === "submitted-overdue"
              ? "Submitted, waiting grade"
              : stateKey === "missing-today"
                ? "Due today (no submission)"
                : stateKey === "submitted-pending"
                  ? "Submitted, waiting review"
                  : "Pending submission";

        const course = courseById.get(assessment.courseId);
        const courseCode = course?.code || "Course";

        return {
          id: assessment.id,
          title: assessment.name,
          typeLabel: toStatusLabel(assessment),
          courseId: assessment.courseId,
          courseCode,
          stateKey,
          stateLabel,
          urgencyScore,
          dueDateTs: hasDueDate ? dueDate.getTime() : Number.MAX_SAFE_INTEGER,
          dueRelative: formatDueRelative(assessment.dueDate),
          assessmentLink: course?.code
            ? `/courses/${course.code}/assessments/${assessment.id}`
            : "/courses",
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => {
        if (b.urgencyScore !== a.urgencyScore) return b.urgencyScore - a.urgencyScore;
        return a.dueDateTs - b.dueDateTs;
      });
  }, [
    courseById,
    gradeByAssessmentId,
    gradeSheets,
    studentAssessments,
    submissionByAssessmentId,
    user?.id,
  ]);

  const pendingWorkSummary = useMemo(() => {
    return pendingRealWork.reduce(
      (acc, item) => {
        if (item.stateKey === "missing-overdue") acc.overdue += 1;
        else if (item.stateKey === "missing-today") acc.dueToday += 1;
        else if (item.stateKey === "submitted-overdue" || item.stateKey === "submitted-pending") {
          acc.waitingReview += 1;
        } else {
          acc.pendingSubmission += 1;
        }
        return acc;
      },
      { overdue: 0, dueToday: 0, waitingReview: 0, pendingSubmission: 0 },
    );
  }, [pendingRealWork]);

  const nextDeadlineItem = useMemo(() => {
    const withDate = pendingRealWork.find((item) => Number.isFinite(item.dueDateTs));
    return withDate || pendingRealWork[0] || null;
  }, [pendingRealWork]);

  const recentFeedbackItems = useMemo(() => {
    const feedbackItems: Array<{
      id: string;
      title: string;
      subtitle: string;
      comment: string;
      score: number | null;
      link: string;
      updatedAt: number;
    }> = [];

    gradeSheets.forEach((sheet) => {
      if (!sheet.isPublished) return;

      const studentRecord = sheet.students.find(
        (student) =>
          student.matchesCurrentUser ||
          normalizeIdentityValue(student.studentId) === normalizeIdentityValue(user?.id) ||
          normalizeIdentityValue(student.userId) === normalizeIdentityValue(user?.id),
      );
      if (!studentRecord?.grades) return;

      Object.entries(studentRecord.grades).forEach(([activityId, gradeEntry]) => {
        const comment = normalizeTextField(gradeEntry?.comment);
        if (!comment) return;

        const activity = sheet.activities.find((item) => item.id === activityId);
        const course = courseById.get(sheet.courseId);
        const score = parseLooseNumber(gradeEntry?.value);
        const updatedAt = toDate(gradeEntry?.submittedAt || sheet.updatedAt).getTime();

        feedbackItems.push({
          id: `sheet-${sheet.id}-${activityId}`,
          title: activity?.name || sheet.title,
          subtitle: course?.code || sheet.courseCode || sheet.courseName,
          comment,
          score,
          link: "/grades",
          updatedAt,
        });
      });
    });

    grades.forEach((grade) => {
      if (grade.studentId !== user?.id) return;

      const comment = normalizeTextField(grade.feedback || grade.comment || grade.comments);
      if (!comment) return;

      const assessment = assessmentById.get(String(grade.assessmentId || "").trim());
      const course = courseById.get(String(grade.courseId || assessment?.courseId || "").trim());
      feedbackItems.push({
        id: `grade-${grade.id}`,
        title: assessment?.name || "Teacher feedback",
        subtitle: course?.code || "Course",
        comment,
        score: parseLooseNumber(grade.value),
        link: "/grades",
        updatedAt: toDate(grade.gradedAt || grade.submittedAt || 0).getTime(),
      });
    });

    const uniqueItems = new Map<string, (typeof feedbackItems)[number]>();
    feedbackItems.forEach((item) => {
      const key = `${item.title}::${item.subtitle}::${normalizeText(item.comment)}`;
      const existing = uniqueItems.get(key);
      if (!existing || item.updatedAt > existing.updatedAt) {
        uniqueItems.set(key, item);
      }
    });

    return Array.from(uniqueItems.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 4);
  }, [assessmentById, courseById, gradeSheets, grades, user?.id]);

  const continueLearningItem = useMemo(() => {
    if (pendingRealWork.length > 0) {
      const item = pendingRealWork[0];
      return {
        id: `continue-pending-${item.id}`,
        title: item.title,
        subtitle: `${item.courseCode} • ${item.stateLabel}`,
        link: item.assessmentLink,
        actionLabel: "Resume activity",
        badge: item.dueRelative,
        external: false,
      };
    }

    if (recentSlides.length > 0) {
      const slide = recentSlides[0];
      const course = slide.courseId ? courseById.get(slide.courseId) : undefined;
      return {
        id: `continue-slide-${slide.id}`,
        title: slide.title,
        subtitle: `${course?.code || slide.courseName || "Course"} • Study material`,
        link: slide.canvaUrl || "/slides",
        actionLabel: slide.canvaUrl ? "Open slide" : "Go to slides",
        badge: "Continue",
        external: Boolean(slide.canvaUrl),
      };
    }

    if (todayClasses.length > 0) {
      const item = todayClasses[0];
      return {
        id: `continue-class-${item.id}`,
        title: item.courseLabel,
        subtitle: `${item.timeLabel} • Scheduled today`,
        link: item.link,
        actionLabel: "Open course",
        badge: "Today",
        external: false,
      };
    }

    if (recentGrades.length > 0) {
      const sheet = recentGrades[0];
      return {
        id: `continue-grade-${sheet.id}`,
        title: sheet.title,
        subtitle: `${sheet.courseName} • Latest published grade`,
        link: "/grades",
        actionLabel: "Review grades",
        badge: "Updated",
        external: false,
      };
    }

    return null;
  }, [courseById, pendingRealWork, recentGrades, recentSlides, todayClasses]);

  const weeklyCalendar = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    const days = Array.from({ length: 7 }, (_, offset) => {
      const date = new Date(start);
      date.setDate(start.getDate() + offset);
      return {
        key: format(date, "yyyy-MM-dd"),
        label: format(date, "EEEE, MMM d", { locale: enUS }),
        date,
        items: [] as Array<{
          id: string;
          courseId: string;
          title: string;
          subtitle: string;
          badge: string;
          link: string;
          order: number;
        }>,
      };
    });

    const dayMap = new Map(days.map((day) => [day.key, day]));

    activeStudentAssessments.forEach((assessment) => {
      const dueDate = toDate(assessment.dueDate);
      if (!isValidDate(dueDate)) return;
      dueDate.setHours(0, 0, 0, 0);
      if (dueDate < start || dueDate > end) return;

      const key = format(dueDate, "yyyy-MM-dd");
      const course = courseById.get(assessment.courseId);
      const courseCode = course?.code || "Course";
      const target = dayMap.get(key);
      if (!target) return;

      target.items.push({
        id: `assessment-${assessment.id}`,
        courseId: assessment.courseId,
        title: assessment.name,
        subtitle: `${courseCode} • ${toStatusLabel(assessment)}`,
        badge: formatDueRelative(assessment.dueDate),
        link: course?.code ? `/courses/${course.code}/assessments/${assessment.id}` : "/courses",
        order: 2,
      });
    });

    studentCourses.forEach((course) => {
      const schedule = normalizeClassSchedule(course.classSchedule);
      if (schedule.length > 0) {
        schedule.forEach((slot, slotIndex) => {
          const day = days.find((entry) => entry.date.getDay() === slot.dayOfWeek);
          if (!day) return;

          const roomText =
            normalizeTextField(slot.location) ||
            normalizeTextField(course.classRoom) ||
            normalizeTextField(course.location);
          day.items.push({
            id: `class-${course.id}-${slot.dayOfWeek}-${slot.startTime}-${slotIndex}`,
            courseId: course.id,
            title: `${course.name}`,
            subtitle: `${course.code} • ${formatTimeToMeridiem(slot.startTime)} - ${formatTimeToMeridiem(slot.endTime)}${
              roomText ? ` • ${roomText}` : ""
            }`,
            badge: "Class",
            link: `/courses/view/${course.code}`,
            order: 1,
          });
        });
        return;
      }

      const dayIndexes = parseClassDayIndexes(
        normalizeTextField(course.classDays) || normalizeTextField(course.scheduleText),
      );
      if (dayIndexes.length === 0) return;

      days.forEach((day) => {
        if (!dayIndexes.includes(day.date.getDay())) return;
        const timeText =
          normalizeTextField(course.classTime) ||
          normalizeTextField(course.scheduleText) ||
          "Class session";
        const roomText = normalizeTextField(course.classRoom) || normalizeTextField(course.location);
        day.items.push({
          id: `class-${course.id}-${day.key}`,
          courseId: course.id,
          title: `${course.name}`,
          subtitle: `${course.code} • ${formatTimeRangeLabel(timeText)}${
            roomText ? ` • ${roomText}` : ""
          }`,
          badge: "Class",
          link: `/courses/view/${course.code}`,
          order: 1,
        });
      });
    });

    return days
      .map((day) => ({
        ...day,
        items: day.items.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
      }))
      .filter((day) => day.items.length > 0);
  }, [activeStudentAssessments, courseById, studentCourses]);

  const criticalAlerts = useMemo(() => {
    const alerts: Array<{
      id: string;
      title: string;
      subtitle: string;
      severity: "High" | "Medium";
      tone: StatusTone;
      link: string;
      rank: number;
    }> = [];

    pendingRealWork.forEach((item) => {
      if (item.stateKey === "missing-overdue") {
        alerts.push({
          id: `alert-missing-${item.id}`,
          title: item.title,
          subtitle: `${item.courseCode} • Missing overdue work`,
          severity: "High",
          tone: "risk",
          link: item.assessmentLink,
          rank: 100,
        });
      } else if (item.stateKey === "missing-today") {
        alerts.push({
          id: `alert-today-${item.id}`,
          title: item.title,
          subtitle: `${item.courseCode} • Due today without submission`,
          severity: "Medium",
          tone: "mid",
          link: item.assessmentLink,
          rank: 80,
        });
      }
    });

    const unique = new Map<string, (typeof alerts)[number]>();
    alerts.forEach((alert) => unique.set(alert.id, alert));

    return Array.from(unique.values())
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 8);
  }, [pendingRealWork]);

  const assessmentCountByCourse = useMemo(() => {
    const counts = new Map<string, number>();
    activeStudentAssessments.forEach((assessment) => {
      const key = assessment.courseId;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [activeStudentAssessments]);

  const slideCountByCourse = useMemo(() => {
    const counts = new Map<string, number>();
    recentSlides.forEach((slide) => {
      const key = String(slide.courseId || "").trim();
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [recentSlides]);

  const pendingCountByCourse = useMemo(() => {
    const counts = new Map<string, number>();
    pendingRealWork.forEach((item) => {
      counts.set(item.courseId, (counts.get(item.courseId) || 0) + 1);
    });
    return counts;
  }, [pendingRealWork]);

  const studentCourseCards = useMemo(() => {
    return studentCourses.map((course) => {
      const progress = courseProgress.find((item) => item.course.id === course.id);
      const currentGrade = progress?.progress.currentGrade || 0;
      const normalizedGrade = Math.max(0, Math.min(5, Number(currentGrade || 0)));
      const evaluatedPercent = Math.max(
        0,
        Math.min(100, Math.round(progress?.progress.evaluatedPercentage || 0)),
      );
      const materialsCount =
        (assessmentCountByCourse.get(course.id) || 0) + (slideCountByCourse.get(course.id) || 0);
      const pendingCount = pendingCountByCourse.get(course.id) || 0;
      const studentCount = Array.isArray(course.enrolledStudents) ? course.enrolledStudents.length : 0;

      const scoreTone =
        normalizedGrade >= 3.5
          ? "text-sky-700"
          : normalizedGrade >= 3.0
            ? "text-amber-700"
            : "text-rose-700";
      const pillTone =
        materialsCount >= 12
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-sky-200 bg-sky-50 text-sky-700";

      return {
        course,
        currentGrade: normalizedGrade,
        evaluatedPercent,
        materialsCount,
        pendingCount,
        studentCount,
        scoreTone,
        pillTone,
      };
    });
  }, [assessmentCountByCourse, courseProgress, pendingCountByCourse, slideCountByCourse, studentCourses]);

  const selectedCourseId = useMemo(() => {
    if (studentCourseCards.length === 0) return null;
    if (
      persistedSelectedCourseId &&
      studentCourseCards.some((item) => item.course.id === persistedSelectedCourseId)
    ) {
      return persistedSelectedCourseId;
    }
    return studentCourseCards[0].course.id;
  }, [persistedSelectedCourseId, studentCourseCards]);

  const selectedCourse = useMemo(
    () => studentCourses.find((course) => course.id === selectedCourseId) || null,
    [selectedCourseId, studentCourses],
  );

  const selectedCourseHeroDetails = useMemo(() => {
    if (!selectedCourse) return null;

    const roomText =
      normalizeTextField(selectedCourse.classRoom) || normalizeTextField(selectedCourse.location);
    const normalizedSchedule = normalizeClassSchedule(selectedCourse.classSchedule);

    let scheduleLabel = "";
    if (normalizedSchedule.length > 0) {
      const dayLabels = Array.from(
        new Set(
          normalizedSchedule.map((slot) =>
            format(new Date(2024, 0, 7 + slot.dayOfWeek), "EEE", { locale: enUS }),
          ),
        ),
      ).join(", ");
      const firstSlot = normalizedSchedule[0];
      scheduleLabel = `${dayLabels} • ${formatTimeToMeridiem(firstSlot.startTime)} - ${formatTimeToMeridiem(firstSlot.endTime)}`;
    } else {
      const fallbackSchedule =
        normalizeTextField(selectedCourse.classTime) || normalizeTextField(selectedCourse.scheduleText);
      if (fallbackSchedule) {
        const daysLabel = normalizeTextField(selectedCourse.classDays);
        scheduleLabel = daysLabel
          ? `${daysLabel} • ${formatTimeRangeLabel(fallbackSchedule)}`
          : formatTimeRangeLabel(fallbackSchedule);
      }
    }

    if (scheduleLabel && roomText) {
      scheduleLabel = `${scheduleLabel} • ${roomText}`;
    } else if (!scheduleLabel && roomText) {
      scheduleLabel = roomText;
    }

    return {
      courseLabel: `${selectedCourse.code} • Group ${selectedCourse.group}`,
      courseName: selectedCourse.name,
      teacherName: normalizeTextField(selectedCourse.teacherName),
      semester: normalizeTextField(selectedCourse.semester),
      scheduleLabel,
    };
  }, [selectedCourse]);

  const scopedCourseProgress = useMemo(
    () =>
      selectedCourseId
        ? courseProgress.filter((item) => item.course.id === selectedCourseId)
        : courseProgress,
    [courseProgress, selectedCourseId],
  );

  const {
    passingCourses: scopedPassingCourses,
    atRiskCourses: scopedAtRiskCourses,
    failingCourses: scopedFailingCourses,
    completedCourses: scopedCompletedCourses,
    averageGrade: scopedAverageGrade,
  } = useMemo(() => {
    let passing = 0;
    let atRisk = 0;
    let failing = 0;
    let completed = 0;
    let gradeSum = 0;
    let gradedCourses = 0;

    scopedCourseProgress.forEach((item) => {
      if (!item.hasRealGrades) return;

      gradedCourses += 1;
      gradeSum += item.progress.currentGrade;

      if (item.progress.currentGrade >= 3.0) completed += 1;

      if (item.progress.status === "passing") passing += 1;
      else if (item.progress.status === "at-risk") atRisk += 1;
      else failing += 1;
    });

    return {
      passingCourses: passing,
      atRiskCourses: atRisk,
      failingCourses: failing,
      completedCourses: completed,
      averageGrade: gradedCourses > 0 ? gradeSum / gradedCourses : 0,
    };
  }, [scopedCourseProgress]);

  const {
    atRiskCourses: overallAtRiskCourses,
    failingCourses: overallFailingCourses,
    completedCourses: overallCompletedCourses,
    averageGrade: overallAverageGrade,
  } = useMemo(() => {
    let atRisk = 0;
    let failing = 0;
    let completed = 0;
    let gradeSum = 0;
    let gradedCourses = 0;

    courseProgress.forEach((item) => {
      if (!item.hasRealGrades) return;

      gradedCourses += 1;
      gradeSum += item.progress.currentGrade;

      if (item.progress.currentGrade >= 3.0) completed += 1;

      if (item.progress.status === "at-risk") atRisk += 1;
      else if (item.progress.status !== "passing") failing += 1;
    });

    return {
      atRiskCourses: atRisk,
      failingCourses: failing,
      completedCourses: completed,
      averageGrade: gradedCourses > 0 ? gradeSum / gradedCourses : 0,
    };
  }, [courseProgress]);

  const scopedTotalCourses = selectedCourseId ? 1 : totalCourses;

  const scopedStudentAssessments = useMemo(
    () =>
      selectedCourseId
        ? studentAssessments.filter((assessment) => assessment.courseId === selectedCourseId)
        : studentAssessments,
    [selectedCourseId, studentAssessments],
  );

  const scopedSubmissionCount = useMemo(() => {
    if (!selectedCourseId) return submissions.length;
    const scopedAssessmentIds = new Set(scopedStudentAssessments.map((assessment) => assessment.id));
    return submissions.filter((submission) => scopedAssessmentIds.has(submission.assessmentId)).length;
  }, [selectedCourseId, scopedStudentAssessments, submissions]);

  const scopedTodayClasses = useMemo(
    () =>
      selectedCourseId
        ? todayClasses.filter((item) => item.courseId === selectedCourseId)
        : todayClasses,
    [selectedCourseId, todayClasses],
  );

  const scopedPendingRealWork = useMemo(
    () =>
      selectedCourseId
        ? pendingRealWork.filter((item) => item.courseId === selectedCourseId)
        : pendingRealWork,
    [pendingRealWork, selectedCourseId],
  );

  const scopedPendingWorkSummary = useMemo(() => {
    return scopedPendingRealWork.reduce(
      (acc, item) => {
        if (item.stateKey === "missing-overdue") acc.overdue += 1;
        else if (item.stateKey === "missing-today") acc.dueToday += 1;
        else if (item.stateKey === "submitted-overdue" || item.stateKey === "submitted-pending") {
          acc.waitingReview += 1;
        } else {
          acc.pendingSubmission += 1;
        }
        return acc;
      },
      { overdue: 0, dueToday: 0, waitingReview: 0, pendingSubmission: 0 },
    );
  }, [scopedPendingRealWork]);

  const scopedCriticalAlerts = useMemo(() => {
    const alerts: Array<{
      id: string;
      title: string;
      subtitle: string;
      severity: "High" | "Medium";
      tone: StatusTone;
      link: string;
      rank: number;
    }> = [];

    scopedPendingRealWork.forEach((item) => {
      if (item.stateKey === "missing-overdue") {
        alerts.push({
          id: `alert-missing-${item.id}`,
          title: item.title,
          subtitle: `${item.courseCode} • Missing overdue work`,
          severity: "High",
          tone: "risk",
          link: item.assessmentLink,
          rank: 100,
        });
      } else if (item.stateKey === "missing-today") {
        alerts.push({
          id: `alert-today-${item.id}`,
          title: item.title,
          subtitle: `${item.courseCode} • Due today without submission`,
          severity: "Medium",
          tone: "mid",
          link: item.assessmentLink,
          rank: 80,
        });
      }
    });

    const unique = new Map<string, (typeof alerts)[number]>();
    alerts.forEach((alert) => unique.set(alert.id, alert));

    return Array.from(unique.values())
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 8);
  }, [scopedPendingRealWork]);

  const scopedRecentSlides = useMemo(
    () =>
      selectedCourseId
        ? recentSlides.filter((slide) => String(slide.courseId || "") === selectedCourseId)
        : recentSlides,
    [recentSlides, selectedCourseId],
  );

  const scopedRecentGrades = useMemo(
    () =>
      selectedCourseId
        ? recentGrades.filter((sheet) => sheet.courseId === selectedCourseId)
        : recentGrades,
    [recentGrades, selectedCourseId],
  );

  const scopedWeeklyCalendar = useMemo(() => {
    if (!selectedCourseId) return weeklyCalendar;
    return weeklyCalendar
      .map((day) => ({
        ...day,
        items: day.items.filter((item) => item.courseId === selectedCourseId),
      }))
      .filter((day) => day.items.length > 0);
  }, [selectedCourseId, weeklyCalendar]);

  const studentName = user?.name || "Student";
  const studentFirstName = studentName.split(" ")[0] || "Student";
  const studentInitial = studentName.charAt(0).toUpperCase() || "S";
  const hourNow = new Date().getHours();
  const dayGreeting =
    hourNow < 12 ? "Good morning" : hourNow < 18 ? "Good afternoon" : "Good evening";
  const memberSinceLabel =
    user?.createdAt instanceof Date && isValidDate(user.createdAt)
      ? format(user.createdAt, "MMMM yyyy", { locale: enUS })
      : "N/A";
  const profileHref = user
    ? user.role === "docente"
      ? `/teacher/profile/${user.id}`
      : user.role === "estudiante"
        ? `/student/profile/${user.id}`
        : "/profile"
    : "/profile";
  const entryMotionClass = animateIn
    ? "translate-y-0 opacity-100"
    : "translate-y-2 opacity-0";
  const entryMotionStyle = (delayMs: number): CSSProperties => ({
    transitionDelay: `${delayMs}ms`,
  });

  const insightCards = useMemo<InsightCard[]>(() => {
    const hasAverage = scopedTotalCourses > 0;
    const pendingTone: StatusTone =
      scopedPendingWorkSummary.overdue > 0
        ? "risk"
        : scopedPendingWorkSummary.dueToday > 0
          ? "mid"
          : scopedPendingRealWork.length > 0
            ? "neutral"
            : "good";

    return [
      {
        id: "progress",
        title: "Progress Snapshot",
        subtitle: selectedCourse
          ? `Academic performance for ${selectedCourse.code}.`
          : "Overall academic performance across active courses.",
        value: hasAverage ? scopedAverageGrade.toFixed(1) : "0.0",
        suffix: "/5.0",
        tone: hasAverage ? resolveGradeTone(true, scopedAverageGrade) : "neutral",
        metrics: [
          { label: "Courses", value: scopedTotalCourses, tone: "neutral" },
          { label: "Passed", value: scopedCompletedCourses, tone: "good" },
          { label: "At Risk", value: scopedAtRiskCourses, tone: "mid" },
          { label: "Failing", value: scopedFailingCourses, tone: "risk" },
        ],
      },
      {
        id: "pending",
        title: "Pending Radar",
        subtitle: selectedCourse
          ? `Urgent tasks and grading pipeline for ${selectedCourse.code}.`
          : "Track urgent tasks and grading pipeline for this week.",
        value: scopedPendingRealWork.length,
        suffix: "items",
        tone: pendingTone,
        metrics: [
          { label: "Overdue", value: scopedPendingWorkSummary.overdue, tone: "risk" },
          { label: "Due Today", value: scopedPendingWorkSummary.dueToday, tone: "mid" },
          { label: "Review", value: scopedPendingWorkSummary.waitingReview, tone: "neutral" },
          { label: "Open", value: scopedPendingWorkSummary.pendingSubmission, tone: "neutral" },
        ],
      },
      {
        id: "activity",
        title: "Learning Flow",
        subtitle: selectedCourse
          ? `Activity pulse for ${selectedCourse.code}.`
          : "Daily activity pulse from classes, submissions and materials.",
        value: scopedStudentAssessments.length,
        suffix: "activities",
        tone: scopedStudentAssessments.length > 0 ? "good" : "neutral",
        metrics: [
          { label: "Submissions", value: scopedSubmissionCount, tone: "neutral" },
          { label: "Slides", value: scopedRecentSlides.length, tone: "good" },
          { label: "Today Classes", value: scopedTodayClasses.length, tone: "mid" },
          { label: "Week Slots", value: scopedWeeklyCalendar.length, tone: "neutral" },
        ],
      },
    ];
  }, [
    scopedAtRiskCourses,
    scopedAverageGrade,
    scopedCompletedCourses,
    scopedFailingCourses,
    scopedPendingRealWork.length,
    scopedPendingWorkSummary.dueToday,
    scopedPendingWorkSummary.overdue,
    scopedPendingWorkSummary.pendingSubmission,
    scopedPendingWorkSummary.waitingReview,
    scopedRecentSlides.length,
    scopedStudentAssessments.length,
    scopedTodayClasses.length,
    scopedTotalCourses,
    scopedWeeklyCalendar.length,
    scopedSubmissionCount,
    selectedCourse,
  ]);
  const activeInsightCard = insightCards[activeInsightIndex] || null;

  useEffect(() => {
    if (studentCourseCards.length === 0) {
      if (persistedSelectedCourseId) {
        setSelectedCourseId("");
      }
      return;
    }
    if (!selectedCourseId || selectedCourseId !== persistedSelectedCourseId) {
      setSelectedCourseId(selectedCourseId || studentCourseCards[0].course.id);
    }
  }, [persistedSelectedCourseId, selectedCourseId, setSelectedCourseId, studentCourseCards]);

  useEffect(() => {
    setActiveInsightIndex(0);
  }, [insightCards.length]);

  const goToPreviousInsight = () => {
    if (insightCards.length <= 1) return;
    setActiveInsightIndex((current) => (current - 1 + insightCards.length) % insightCards.length);
  };

  const goToNextInsight = () => {
    if (insightCards.length <= 1) return;
    setActiveInsightIndex((current) => (current + 1) % insightCards.length);
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

  if (loading.courses || loadingSheets || loadingSubmissions) {
    return (
      <DashboardLayout contentClassName="pt-0 lg:pt-1">
        <div className="relative overflow-x-hidden">
          <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
          <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />
          <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
            <div className="flex min-h-[320px] items-center justify-center">
              <div className="space-y-2 text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
                <p className="text-lg font-semibold text-slate-900">Loading your dashboard</p>
                <p className="text-sm text-slate-600">
                  Preparing your personalized academic overview
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

  if (studentCourses.length === 0) {
    return (
      <DashboardLayout contentClassName="pt-0 lg:pt-1">
        <div className="relative overflow-x-hidden">
          <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
          <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />
          <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
            <section className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-6 shadow-sm">
              <div className="pointer-events-none absolute -left-10 top-0 h-28 w-28 rounded-full bg-sky-100/70 blur-sm" />
              <div className="pointer-events-none absolute -bottom-12 -right-8 h-36 w-36 rounded-full bg-indigo-100/60 blur-sm" />
              <div className="relative mx-auto max-w-2xl text-center">
                <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-sky-600 shadow-lg">
                  <GraduationCap className="h-8 w-8 text-white" />
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  Student Workspace
                </span>
                <h1 className="mt-3 text-2xl font-bold text-slate-900">Start your learning journey</h1>
                <p className="mt-2 text-sm text-slate-600">
                  Join your first course to access grades, activities, and study materials.
                </p>
                <div className="mx-auto mt-4 grid max-w-lg grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200/60 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600">
                    <Percent className="h-3.5 w-3.5" />
                    Grades
                  </div>
                  <div className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200/60 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600">
                    <FileCheck className="h-3.5 w-3.5" />
                    Activities
                  </div>
                  <div className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200/60 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600">
                    <BookOpen className="h-3.5 w-3.5" />
                    Materials
                  </div>
                </div>
                <Link
                  to="/courses"
                  className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-sky-500 bg-gradient-to-b from-sky-500 to-sky-600 px-5 text-sm font-semibold text-white shadow-[0_12px_24px_-14px_rgba(2,132,199,0.95)] transition hover:from-sky-600 hover:to-sky-700"
                >
                  <Rocket className="h-4 w-4" />
                  Join course
                  <UserPlus className="h-4 w-4" />
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </section>
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
      <div className="relative overflow-x-hidden">
        <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
        <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />

        <div className="relative border border-slate-200/60 bg-white p-2.5 sm:p-3 lg:p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)]">
          <div className="space-y-3">
            <section
              className={`relative overflow-hidden rounded-2xl border border-slate-200/60 bg-slate-50/70 p-3 lg:p-4 shadow-sm transition-all duration-500 ease-out ${entryMotionClass}`}
              style={entryMotionStyle(0)}
            >
              <div className="pointer-events-none absolute -left-16 -top-20 h-40 w-40 rounded-full bg-sky-200/20" />
              <div className="pointer-events-none absolute -bottom-24 -right-20 h-48 w-48 rounded-full bg-indigo-200/20" />

              <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                    <Sparkles className="h-3.5 w-3.5" />
                    Student Workspace
                  </span>
                  <h1 className="mt-2 text-2xl font-bold text-slate-900">
                    {dayGreeting}, {studentFirstName}
                  </h1>
                  <p className="mt-1 text-sm text-slate-600">
                    Track courses, pending work, grades and study materials in one place.
                  </p>
                  {selectedCourseHeroDetails && (
                    <div className="mt-3 space-y-1.5">
                      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2 sm:whitespace-nowrap">
                        <p className="text-[1.05rem] font-semibold leading-tight text-slate-950">
                          {selectedCourseHeroDetails.courseName}
                        </p>
                        <span className="hidden text-slate-400 sm:inline">|</span>
                        <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-slate-900">
                          {selectedCourseHeroDetails.courseLabel}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1 text-xs text-slate-700 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1.5">
                        {selectedCourseHeroDetails.teacherName ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="font-semibold text-slate-950">Teacher:</span>
                            <span>{selectedCourseHeroDetails.teacherName}</span>
                          </span>
                        ) : null}
                        {selectedCourseHeroDetails.semester ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="font-semibold text-slate-950">Semester:</span>
                            <span>{selectedCourseHeroDetails.semester}</span>
                          </span>
                        ) : null}
                        {selectedCourseHeroDetails.scheduleLabel ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="font-semibold text-slate-950">Schedule:</span>
                            <span>{selectedCourseHeroDetails.scheduleLabel}</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid w-full grid-cols-2 gap-2 lg:w-auto lg:min-w-[340px]">
                  {[
                    {
                      key: "courses",
                      label: "Courses",
                      value: totalCourses,
                      icon: BookOpen,
                      tone: "bg-sky-100 text-sky-700",
                    },
                    {
                      key: "average",
                      label: "Average",
                      value: (
                        <>
                          {overallAverageGrade.toFixed(1)}
                          <span className="text-sm font-medium text-slate-500"> / 5.0</span>
                        </>
                      ),
                      icon: Percent,
                      tone: "bg-violet-100 text-violet-700",
                    },
                    {
                      key: "passed",
                      label: "Passed",
                      value: overallCompletedCourses,
                      icon: Trophy,
                      tone: "bg-emerald-100 text-emerald-700",
                    },
                    {
                      key: "attention",
                      label: "Attention",
                      value: overallAtRiskCourses + overallFailingCourses,
                      icon: FileCheck,
                      tone: "bg-amber-100 text-amber-700",
                    }, 
                  ].map((metric) => {
                    const Icon = metric.icon;
                    return (
                      <div key={metric.key} className="rounded-xl border border-slate-200/60 bg-white px-3 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-slate-500">{metric.label}</p>
                            <p className="text-xl font-bold leading-tight text-slate-900">{metric.value}</p>
                          </div>
                          <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${metric.tone}`}>
                            <Icon className="h-4 w-4" />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section
              className={`grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_340px] transition-all duration-500 ease-out ${entryMotionClass}`}
              style={entryMotionStyle(160)}
            >
              <div className="space-y-3">
                <article
                  className={`rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm transition-all duration-500 ease-out ${entryMotionClass}`}
                  style={entryMotionStyle(210)}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">Your Courses</h2>
                      <p className="text-xs text-slate-500">
                        Tap a card to switch the active dashboard context.
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {studentCourseCards.length} total
                    </span>
                  </div>

                  {studentCourseCards.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-4 text-center text-sm text-slate-600">
                      No courses available.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {studentCourseCards.map((item) => {
                        const isActive = selectedCourseId === item.course.id;
                        return (
                          <article
                            key={item.course.id}
                            onClick={() => setSelectedCourseId(item.course.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedCourseId(item.course.id);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                            className={`rounded-xl border p-3 text-left transition ${
                              isActive
                                ? "border-sky-300 bg-sky-50/60 shadow-sm"
                                : "border-slate-200/60 bg-white hover:border-slate-300/60 hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">
                                  {item.course.name}
                                </p>
                                <p className="truncate text-xs text-slate-500">
                                  {item.course.code} • Group {item.course.group}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5">
                              
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${item.pillTone}`}
                                >
                                  {item.materialsCount} materials
                                </span>
                              </div>
                            </div>

                            <div className="mt-2 flex items-end gap-1">
                              <GraduationCap className={`mb-0.5 h-4 w-4 ${item.scoreTone}`} />
                              <p className={`text-4xl font-extrabold leading-none ${item.scoreTone}`}>
                                {item.currentGrade.toFixed(1)}
                              </p>
                              <span className="pb-1 text-sm font-semibold text-slate-500">/5.0
</span>
                            </div>

                            <div className="mt-2 grid grid-cols-3 gap-1.5">
                              <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-2 py-1 text-center">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                  Students
                                </p>
                                <p className="text-sm font-bold text-slate-900">{item.studentCount}</p>
                              </div>
                              <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-2 py-1 text-center">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                  Evaluated
                                </p>
                                <p className="text-sm font-bold text-slate-900">
                                  {item.evaluatedPercent}%
                                </p>
                              </div>
                              <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-2 py-1 text-center">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                  Pending
                                </p>
                                <p className="text-sm font-bold text-slate-900">{item.pendingCount}</p>
                              </div>
                            </div>

                            <Link
                              to={`/courses/view/${item.course.code}`}
                              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-800"
                              onClick={(event) => event.stopPropagation()}
                            >
                              Open course
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Link>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </article>

                <article
                  className={`rounded-2xl border border-slate-200/60 bg-slate-50/70 p-3 shadow-sm transition-all duration-500 ease-out sm:p-4 ${entryMotionClass}`}
                  style={entryMotionStyle(230)}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">General Cards</p>
                      <p className="text-xs text-slate-500">
                        Navigate your key student metrics from one control panel.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={goToPreviousInsight}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/60 bg-white text-slate-600 transition hover:border-sky-200 hover:text-sky-700"
                        aria-label="Previous general card"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={goToNextInsight}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/60 bg-white text-slate-600 transition hover:border-sky-200 hover:text-sky-700"
                        aria-label="Next general card"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {activeInsightCard ? (
                    <article className={`rounded-2xl border p-4 shadow-sm ${INSIGHT_TONE_CLASS[activeInsightCard.tone].panel}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="inline-flex items-center rounded-full border border-white/70 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                            {activeInsightCard.title}
                          </p>
                          <p className="mt-1 text-xs text-slate-600">{activeInsightCard.subtitle}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-end gap-1">
                        <p className={`text-4xl font-extrabold leading-none ${INSIGHT_TONE_CLASS[activeInsightCard.tone].value}`}>
                          {activeInsightCard.value}
                        </p>
                        <span className="pb-1 text-xs font-semibold text-slate-500">
                          {activeInsightCard.suffix}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {activeInsightCard.metrics.map((metric) => (
                          <div
                            key={`${activeInsightCard.id}-${metric.label}`}
                            className="rounded-xl border border-slate-200/60 bg-white p-2 text-center"
                          >
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              {metric.label}
                            </p>
                            <p className={`text-sm font-bold ${INSIGHT_TONE_CLASS[metric.tone].value}`}>
                              {metric.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </article>
                  ) : null}

                  <div className="mt-3 flex items-center justify-center gap-1.5">
                    {insightCards.map((card, index) => (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => setActiveInsightIndex(index)}
                        className={`h-2.5 rounded-full transition-all ${
                          index === activeInsightIndex
                            ? "w-7 bg-sky-500"
                            : "w-2.5 bg-slate-300 hover:bg-slate-400"
                        }`}
                        aria-label={`Show ${card.title}`}
                      />
                    ))}
                  </div>
                </article>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <article
                    className={`rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm transition-all duration-500 ease-out ${entryMotionClass}`}
                    style={entryMotionStyle(250)}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h2 className="text-base font-bold text-slate-900">Real Pending Work</h2>
                      <Link to="/courses" className="text-xs font-semibold text-sky-700 hover:text-sky-800">
                        See all
                      </Link>
                    </div>
                    <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg border border-slate-200/60 bg-slate-50 p-2">
                        <p className="text-slate-500">Overdue</p>
                        <p className="text-sm font-bold text-slate-900">{scopedPendingWorkSummary.overdue}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200/60 bg-slate-50 p-2">
                        <p className="text-slate-500">Due Today</p>
                        <p className="text-sm font-bold text-slate-900">{scopedPendingWorkSummary.dueToday}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200/60 bg-slate-50 p-2">
                        <p className="text-slate-500">Waiting Review</p>
                        <p className="text-sm font-bold text-slate-900">{scopedPendingWorkSummary.waitingReview}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200/60 bg-slate-50 p-2">
                        <p className="text-slate-500">Open</p>
                        <p className="text-sm font-bold text-slate-900">{scopedPendingWorkSummary.pendingSubmission}</p>
                      </div>
                    </div>

                    {scopedPendingRealWork.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-300/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-600">
                        No pending work right now.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {scopedPendingRealWork.slice(0, 6).map((item) => {
                          const stateTone = getStatusToneClass(resolvePendingStateTone(item.stateKey));
                          return (
                            <Link key={item.id} to={item.assessmentLink}>
                              <div className="rounded-lg border border-slate-200/60 bg-slate-50 p-2.5 transition hover:border-slate-300/60 hover:bg-white">
                                <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
                                <p className="truncate text-xs text-slate-500">
                                  {item.courseCode} • {item.typeLabel}
                                </p>
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  <span className="rounded-full border border-slate-200/60 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                    {item.dueRelative}
                                  </span>
                                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stateTone}`}>
                                    {item.stateLabel}
                                  </span>
                                </div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </article>

                  <article
                    className={`rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm transition-all duration-500 ease-out ${entryMotionClass}`}
                    style={entryMotionStyle(290)}
                  >
                    <h2 className="mb-3 text-base font-bold text-slate-900">Critical Alerts</h2>
                    {scopedCriticalAlerts.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-300/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-600">
                        No critical alerts detected.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {scopedCriticalAlerts.map((alert) => {
                          const severityTone = getStatusToneClass(alert.tone);
                          return (
                            <Link key={alert.id} to={alert.link}>
                              <div className="rounded-lg border border-slate-200/60 bg-slate-50 p-2.5 transition hover:border-slate-300/60 hover:bg-white">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-900">{alert.title}</p>
                                    <p className="truncate text-xs text-slate-500">{alert.subtitle}</p>
                                  </div>
                                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${severityTone}`}>
                                    {alert.severity}
                                  </span>
                                </div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </article>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <article
                    className={`rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm transition-all duration-500 ease-out ${entryMotionClass}`}
                    style={entryMotionStyle(310)}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <h2 className="text-base font-bold text-slate-900">Next Deadline</h2>
                        <p className="text-xs text-slate-500">Closest action that still needs your attention.</p>
                      </div>
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                        <Clock3 className="h-4 w-4" />
                      </span>
                    </div>

                    {nextDeadlineItem ? (
                      <Link to={nextDeadlineItem.assessmentLink}>
                        <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3 transition hover:border-slate-300/60 hover:bg-white">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{nextDeadlineItem.title}</p>
                              <p className="truncate text-xs text-slate-500">
                                {nextDeadlineItem.courseCode} • {nextDeadlineItem.typeLabel}
                              </p>
                            </div>
                            <span className="rounded-full border border-slate-200/60 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                              {nextDeadlineItem.dueRelative}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getStatusToneClass(
                                resolvePendingStateTone(nextDeadlineItem.stateKey),
                              )}`}
                            >
                              {nextDeadlineItem.stateLabel}
                            </span>
                            <span className="text-xs font-semibold text-sky-700">Open activity</span>
                          </div>
                        </div>
                      </Link>
                    ) : (
                      <div className="rounded-lg border border-dashed border-slate-300/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-600">
                        No upcoming deadlines right now.
                      </div>
                    )}
                  </article>

                  <article
                    className={`rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm transition-all duration-500 ease-out ${entryMotionClass}`}
                    style={entryMotionStyle(330)}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <h2 className="text-base font-bold text-slate-900">Announcements</h2>
                        <p className="text-xs text-slate-500">Latest course notices and teacher broadcasts.</p>
                      </div>
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                        <Bell className="h-4 w-4" />
                      </span>
                    </div>

                    {studentAnnouncements.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-300/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-600">
                        No announcements available.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {studentAnnouncements.map((announcement) => (
                          <Link key={announcement.id} to={announcement.link}>
                            <div className="rounded-lg border border-slate-200/60 bg-slate-50 p-2.5 transition hover:border-slate-300/60 hover:bg-white">
                              <p className="truncate text-sm font-semibold text-slate-900">{announcement.title}</p>
                              <p className="truncate text-xs text-slate-500">{announcement.subtitle}</p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </article>

                  <article
                    className={`rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm transition-all duration-500 ease-out ${entryMotionClass}`}
                    style={entryMotionStyle(350)}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <h2 className="text-base font-bold text-slate-900">Teacher Feedback</h2>
                        <p className="text-xs text-slate-500">Recent comments and grading notes from your courses.</p>
                      </div>
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                        <FileCheck className="h-4 w-4" />
                      </span>
                    </div>

                    {loadingSheets && recentFeedbackItems.length === 0 ? (
                      <div className="flex h-28 items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
                      </div>
                    ) : recentFeedbackItems.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-300/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-600">
                        No teacher feedback available yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {recentFeedbackItems.map((item) => (
                          <Link key={item.id} to={item.link}>
                            <div className="rounded-lg border border-slate-200/60 bg-slate-50 p-2.5 transition hover:border-slate-300/60 hover:bg-white">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
                                  <p className="truncate text-xs text-slate-500">{item.subtitle}</p>
                                </div>
                                {item.score !== null ? (
                                  <span className="rounded-full border border-slate-200/60 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                    {item.score.toFixed(1)}
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs text-slate-600">{item.comment}</p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </article>

                  <article
                    className={`rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm transition-all duration-500 ease-out ${entryMotionClass}`}
                    style={entryMotionStyle(370)}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <h2 className="text-base font-bold text-slate-900">Continue Learning</h2>
                        <p className="text-xs text-slate-500">Jump back into the most relevant next step.</p>
                      </div>
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                        <Rocket className="h-4 w-4" />
                      </span>
                    </div>

                    {continueLearningItem ? (
                      continueLearningItem.external ? (
                        <a
                          href={continueLearningItem.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-xl border border-slate-200/60 bg-slate-50 p-3 transition hover:border-slate-300/60 hover:bg-white"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{continueLearningItem.title}</p>
                              <p className="truncate text-xs text-slate-500">{continueLearningItem.subtitle}</p>
                            </div>
                            <span className="rounded-full border border-slate-200/60 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                              {continueLearningItem.badge}
                            </span>
                          </div>
                          <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-700">
                            {continueLearningItem.actionLabel}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </div>
                        </a>
                      ) : (
                        <Link to={continueLearningItem.link}>
                          <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3 transition hover:border-slate-300/60 hover:bg-white">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">{continueLearningItem.title}</p>
                                <p className="truncate text-xs text-slate-500">{continueLearningItem.subtitle}</p>
                              </div>
                              <span className="rounded-full border border-slate-200/60 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                {continueLearningItem.badge}
                              </span>
                            </div>
                            <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-700">
                              {continueLearningItem.actionLabel}
                              <ChevronRight className="h-3.5 w-3.5" />
                            </div>
                          </div>
                        </Link>
                      )
                    ) : (
                      <div className="rounded-lg border border-dashed border-slate-300/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-600">
                        Your next learning step will appear here.
                      </div>
                    )}
                  </article>
                </div>

                <article
                  className={`rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm transition-all duration-500 ease-out ${entryMotionClass}`}
                  style={entryMotionStyle(330)}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="text-base font-bold text-slate-900">Study Materials</h2>
                    <Link
                      to="/slides"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-800"
                    >
                      See all
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                  {loadingSlides ? (
                    <div className="flex h-28 items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
                    </div>
                  ) : scopedRecentSlides.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-600">
                      No materials available yet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
                      <Link to="/slides" className="overflow-hidden rounded-xl border border-slate-200/60 bg-slate-50">
                        <img
                          src="/slides.png"
                          alt="Slides area preview"
                          className="h-36 w-full object-cover"
                          loading="lazy"
                        />
                        <div className="p-3">
                          <p className="text-sm font-semibold text-slate-900">Slides Area</p>
                          <p className="text-xs text-slate-500">{scopedRecentSlides.length} slides available</p>
                        </div>
                      </Link>

                      <div className="space-y-2">
                        {scopedRecentSlides.slice(0, 5).map((slide) => {
                          const slideDate = toDate(slide.createdAt);
                          const dateLabel = isValidDate(slideDate)
                            ? format(slideDate, "MMM dd", { locale: enUS })
                            : "Recent";
                          const linkedCourse = slide.courseId
                            ? courseById.get(slide.courseId)
                            : undefined;
                          const courseLabel = linkedCourse
                            ? linkedCourse.name
                            : slide.courseName || "Course not linked";

                          if (slide.canvaUrl) {
                            return (
                              <a
                                key={slide.id}
                                href={slide.canvaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/60 bg-slate-50 p-2.5 transition hover:border-slate-300/60 hover:bg-white"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900">{slide.title}</p>
                                  <p className="truncate text-xs text-slate-500">
                                    {courseLabel} • {dateLabel}
                                  </p>
                                </div>
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200/60 bg-white text-slate-600">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </span>
                              </a>
                            );
                          }

                          return (
                            <Link
                              key={slide.id}
                              to="/slides"
                              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/60 bg-slate-50 p-2.5 transition hover:border-slate-300/60 hover:bg-white"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">{slide.title}</p>
                                <p className="truncate text-xs text-slate-500">
                                  {courseLabel} • {dateLabel}
                                </p>
                              </div>
                              <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                                <Presentation className="h-3 w-3" />
                                View
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </article>

                <article
                  className={`rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm transition-all duration-500 ease-out ${entryMotionClass}`}
                  style={entryMotionStyle(370)}
                >
                  <h2 className="mb-3 text-base font-bold text-slate-900">Consolidated Weekly Calendar</h2>
                  {scopedWeeklyCalendar.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-600">
                      No events scheduled in the next 7 days.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {scopedWeeklyCalendar.map((day) => (
                        <div key={day.key} className="rounded-lg border border-slate-200/60 bg-slate-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{day.label}</p>
                          <div className="mt-2 space-y-1.5">
                            {day.items.slice(0, 3).map((item) => (
                              <Link
                                key={item.id}
                                to={item.link}
                                className="flex items-center justify-between gap-2 rounded-md border border-slate-200/60 bg-white px-2 py-1.5 text-xs text-slate-700 transition hover:border-sky-200 hover:text-sky-700"
                              >
                                <span className="truncate">{item.title}</span>
                                <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                  {item.badge}
                                </span>
                              </Link>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              </div>

              <aside className="space-y-4">
                <article
                  className={`rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm transition-all duration-500 ease-out ${entryMotionClass}`}
                  style={entryMotionStyle(250)}
                >
                  <div className="text-center">
                    <div className="mx-auto inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-slate-200/60 bg-sky-100 text-2xl shadow-sm">
                      {user?.avatarUrl && !avatarLoadFailed ? (
                        <img
                          src={user.avatarUrl}
                          alt={studentName}
                          className="h-full w-full object-cover"
                          onError={() => setAvatarLoadFailed(true)}
                        />
                      ) : user?.avatarEmoji ? (
                        <span>{user.avatarEmoji}</span>
                      ) : (
                        studentInitial
                      )}
                    </div>
                    <h3 className="mt-3 text-base font-bold text-slate-900">{studentName}</h3>
                    <p className="text-xs text-slate-500">Member since {memberSinceLabel}</p>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      { label: "Passing", value: scopedPassingCourses },
                      { label: "At Risk", value: scopedAtRiskCourses },
                      { label: "Failing", value: scopedFailingCourses },
                      { label: "Pending", value: scopedPendingRealWork.length },
                    ].map((item) => (
                      <div key={item.label} className="rounded-lg border border-slate-200/60 bg-slate-50 p-2 text-center">
                        <p className="text-base font-bold text-slate-900">{item.value}</p>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          {item.label}
                        </p>
                      </div>
                    ))}
                  </div>
                </article>

                <article
                  className={`rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm transition-all duration-500 ease-out ${entryMotionClass}`}
                  style={entryMotionStyle(270)}
                >
                  <p className="text-base font-bold text-slate-900">Live Snapshot</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Instant context for today and this week.
                  </p>
                  <div className="mt-3 space-y-2">
                    <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Today classes
                      </p>
                      <p className="text-lg font-bold text-slate-900">{scopedTodayClasses.length}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Weekly events
                      </p>
                      <p className="text-lg font-bold text-slate-900">{scopedWeeklyCalendar.length}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Published sheets
                      </p>
                      <p className="text-lg font-bold text-slate-900">{scopedRecentGrades.length}</p>
                    </div>
                  </div>
                </article>

                <article
                  className={`rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm transition-all duration-500 ease-out ${entryMotionClass}`}
                  style={entryMotionStyle(290)}
                >
                  <h2 className="text-base font-bold text-slate-900">Today Classes</h2>
                  <p className="mt-0.5 text-xs text-slate-500">{todayClassesDateLabel}</p>
                  <div className="mt-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    {scopedTodayClasses.length} classes
                  </div>
                  {scopedTodayClasses.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-600">No classes scheduled for today.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {scopedTodayClasses.slice(0, 3).map((item) => (
                        <Link
                          key={item.id}
                          to={item.link}
                          className="block rounded-lg border border-slate-200/60 bg-slate-50 p-2.5 transition hover:border-slate-300/60 hover:bg-white"
                        >
                          <p className="text-sm font-semibold text-slate-900">{item.timeLabel}</p>
                          <p className="truncate text-xs text-slate-500">{item.courseLabel}</p>
                        </Link>
                      ))}
                      {scopedTodayClasses.length > 3 && (
                        <span className="inline-flex rounded-full border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                          +{scopedTodayClasses.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </article>

                <article
                  className={`rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm transition-all duration-500 ease-out ${entryMotionClass}`}
                  style={entryMotionStyle(330)}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="text-base font-bold text-slate-900">Recent Grades</h2>
                    <Link to="/grades" className="text-xs font-semibold text-sky-700 hover:text-sky-800">
                      See all
                    </Link>
                  </div>
                  {scopedRecentGrades.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300/60 bg-slate-50 px-3 py-5 text-center text-sm text-slate-600">
                      No grades available yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {scopedRecentGrades.map((sheet) => {
                        const studentData = sheet.students.find((student) => student.studentId === user?.id);
                        const grade = studentData?.total;
                        const gradeText =
                          typeof grade === "number" ? `${grade.toFixed(1)}/5.0` : "No grade";
                        const gradeTone = getStatusToneClass(
                          resolveGradeTone(typeof grade === "number", grade || 0),
                        );

                        return (
                          <Link key={sheet.id} to="/grades">
                            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/60 bg-slate-50 p-2.5 transition hover:border-slate-300/60 hover:bg-white">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">{sheet.title}</p>
                                <p className="truncate text-xs text-slate-500">{sheet.courseName}</p>
                              </div>
                              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${gradeTone}`}>
                                {gradeText}
                              </span>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </article>

                <article
                  className={`rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm transition-all duration-500 ease-out ${entryMotionClass}`}
                  style={entryMotionStyle(370)}
                >
                  <h2 className="mb-3 text-base font-bold text-slate-900">Quick Access</h2>
                  <div className="space-y-1.5">
                    <Link
                      to="/grades"
                      className="flex items-center justify-between rounded-lg border border-slate-200/60 bg-slate-50 px-2.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Trophy className="h-4 w-4" />
                        Grades Center
                      </span>
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                    <Link
                      to="/courses"
                      className="flex items-center justify-between rounded-lg border border-slate-200/60 bg-slate-50 px-2.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                    >
                      <span className="inline-flex items-center gap-2">
                        <GraduationCap className="h-4 w-4" />
                        Course Catalog
                      </span>
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                    <Link
                      to={profileHref}
                      className="flex items-center justify-between rounded-lg border border-slate-200/60 bg-slate-50 px-2.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Bell className="h-4 w-4" />
                        Profile Settings
                      </span>
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                </article>
              </aside>
            </section>

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
