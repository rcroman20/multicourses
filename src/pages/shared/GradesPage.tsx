import { useState, useEffect, useMemo, useCallback } from"react";
import { Link } from"react-router-dom";
import { useAuth } from"@/contexts/AuthContext";
import { useAcademic } from"@/contexts/AcademicContext";
import { DashboardLayout } from"@/components/layout/DashboardLayout";
import { getAccessibleCoursesForUser } from"@/lib/courseAccess";
import {
  GraduationCap,
  ChevronDown,
  FileSpreadsheet,
  Users,
  AlertCircle,
  Filter,
  Search,
  Download, 
  User,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  SortAsc,
  SortDesc,
  Percent,
  Loader2,
  AlertTriangle,
  Target,
  Sparkles,
  Trophy,
  Star,
  CalendarDays,
  X,
} from"lucide-react";
import { cn } from"@/lib/utils";
import { collection, getDocs, doc, getDoc, query, where } from"firebase/firestore";
import { firebaseDB } from"@/lib/firebase";
import { Button } from"@/components/ui/button";
import { Badge } from"@/components/ui/badge";
import * as XLSX from"xlsx";

interface GradeSheetActivity {
  id: string;
  name: string;
  maxScore: number;
  type: string;
}

interface StudentGrade {
  studentId: string;
  name: string;
  grades: Record<
    string,
    {
      value?: number;
      comment?: string;
      submittedAt?: any;
    }
  >;
  total?: number;
  status: string;
}

interface GradeSheet {
  id: string;
  title: string;
  courseId?: string;
  courseCode?: string;
  courseName: string;
  teacherId: string;
  teacherName: string;
  gradingPeriod: string;
  activities: GradeSheetActivity[];
  students: StudentGrade[];
  createdAt: any;
  updatedAt: any;
  isPublished: boolean;
  weightPercentage: number;
}

interface StudentWithGrades {
  id: string;
  name: string;
  systemProgress: {
    currentGrade: number;
    status:"passing" |"at-risk" |"failing";
  };
  completedAssessments: number;
  totalAssessments: number;
  firstTermAverage: number;
  secondTermAverage: number;
  firstTermEquivalence: number;
  secondTermEquivalence: number;
}

const firestoreTimestampToDate = (timestamp: any): Date => {
  if (!timestamp) return new Date();
  if (timestamp instanceof Date) return timestamp;
  if (timestamp.toDate && typeof timestamp.toDate ==="function") {
    return timestamp.toDate();
  }
  if (typeof timestamp ==="number") return new Date(timestamp);
  if (typeof timestamp ==="string") return new Date(timestamp);
  return new Date();
};

const DISPLAY_MAX_SCORE = 5.0;
type SupportedTerm ="1st Term" |"2nd Term";

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value ==="number" && Number.isFinite(value)) return value;
  if (typeof value ==="string" && value.trim() !=="") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const normalizeText = (value: unknown): string =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const normalizeIdentityValue = (value: unknown): string =>
  String(value || "").trim().toLowerCase();

const parseGradeValueFromUnknown = (entry: unknown): number | null => {
  if (entry && typeof entry === "object") {
    const payload = entry as Record<string, unknown>;
    return (
      parseLooseNumber(payload.value) ??
      parseLooseNumber(payload.grade) ??
      parseLooseNumber(payload.score) ??
      parseLooseNumber(payload.nota) ??
      parseLooseNumber(payload.total) ??
      parseLooseNumber(payload.average)
    );
  }
  return parseLooseNumber(entry);
};

const getActivityGradeValue = (
  grades: Record<string, { value?: number; comment?: string; submittedAt?: any }> = {},
  activity: GradeSheetActivity,
): number | null => {
  const directCandidates = [activity.id, activity.name]
    .map((key) => String(key || "").trim())
    .filter(Boolean);

  for (const key of directCandidates) {
    if (key in grades) {
      const parsed = parseGradeValueFromUnknown(grades[key]);
      if (parsed !== null) return parsed;
    }
  }

  const normalizedEntries = new Map<string, unknown>();
  Object.entries(grades).forEach(([key, value]) => {
    const normalizedKey = normalizeText(key).replace(/\s+/g, " ");
    if (normalizedKey) normalizedEntries.set(normalizedKey, value);
  });

  for (const candidate of directCandidates) {
    const normalizedCandidate = normalizeText(candidate).replace(/\s+/g, " ");
    if (!normalizedCandidate) continue;
    const matched = normalizedEntries.get(normalizedCandidate);
    if (matched !== undefined) {
      const parsed = parseGradeValueFromUnknown(matched);
      if (parsed !== null) return parsed;
    }
  }

  return null;
};

const isSheetPublished = (payload: Record<string, unknown>): boolean => {
  const publishedRaw =
    payload.isPublished ?? payload.published ?? payload.status ?? payload.estado;
  const normalizedText = normalizeIdentityValue(publishedRaw);

  if (typeof publishedRaw === "boolean") return publishedRaw;
  if (typeof publishedRaw === "number") return publishedRaw === 1;

  return (
    normalizedText === "true" ||
    normalizedText === "1" ||
    normalizedText === "published" ||
    normalizedText === "publicado" ||
    normalizedText === "active" ||
    normalizedText === "activo" ||
    normalizedText === "yes" ||
    normalizedText === "si"
  );
};

const normalizeGradingPeriod = (period: string): string => {
  const normalized = (period ||"").trim().toLowerCase();
  const periodMap: Record<string, string> = {"first term":"1st Term","1st term":"1st Term",
    q1:"1st Term",
    quarter1:"1st Term",
    quarter_1:"1st Term","second term":"2nd Term","2nd term":"2nd Term",
    q2:"2nd Term",
    quarter2:"2nd Term",
    quarter_2:"2nd Term",
    "third term":"3rd Term",
    "3rd term":"3rd Term",
    q3:"3rd Term",
    quarter3:"3rd Term",
    quarter_3:"3rd Term",
    "fourth term":"4th Term",
    "4th term":"4th Term",
    q4:"4th Term",
    quarter4:"4th Term",
    quarter_4:"4th Term",
    final:"Final",
  };

  return periodMap[normalized] || period ||"Final";
};

const getGradingPeriodOrder = (period: string): number => {
  const normalized = normalizeGradingPeriod(period);
  if (normalized ==="Final") return -1;

  const match = normalized.match(/^(\d+)(st|nd|rd|th)\s+term$/i);
  if (!match) return -2;

  const termNumber = Number(match[1]);
  return Number.isFinite(termNumber) ? termNumber : -2;
};

const getSupportedTerm = (period: string): SupportedTerm | null => {
  const normalized = normalizeGradingPeriod(period);
  if (normalized ==="1st Term") return"1st Term";
  if (normalized ==="2nd Term") return"2nd Term";
  return null;
};

const getTermEquivalences = (
  sheets: Array<
    Pick<GradeSheet,"gradingPeriod" |"weightPercentage"> & {
      activities?: unknown[];
    }
  >
): Record<SupportedTerm, number> => {
  const weightedTotal = sheets.reduce(
    (sum, sheet) => sum + Math.max(0, Number(sheet.weightPercentage) || 0),
    0
  );

  if (weightedTotal > 0) {
    return sheets.reduce(
      (acc, sheet) => {
        const term = getSupportedTerm(sheet.gradingPeriod);
        if (!term) return acc;
        acc[term] += Math.max(0, Number(sheet.weightPercentage) || 0);
        return acc;
      },
      {"1st Term": 0,"2nd Term": 0 } as Record<SupportedTerm, number>
    );
  }

  const termActivityCounts: Record<SupportedTerm, number> = {"1st Term": 0,"2nd Term": 0,
  };
  const termSheetCounts: Record<SupportedTerm, number> = {"1st Term": 0,"2nd Term": 0,
  };

  sheets.forEach((sheet) => {
    const term = getSupportedTerm(sheet.gradingPeriod);
    if (!term) return;

    termSheetCounts[term] += 1;
    const activityCount = Array.isArray(sheet.activities)
      ? sheet.activities.length
      : 0;
    termActivityCounts[term] += Math.max(0, activityCount);
  });

  const totalActivities =
    termActivityCounts["1st Term"] + termActivityCounts["2nd Term"];

  if (totalActivities > 0) {
    return {"1st Term": (termActivityCounts["1st Term"] / totalActivities) * 100,"2nd Term": (termActivityCounts["2nd Term"] / totalActivities) * 100,
    };
  }

  const totalSheets = termSheetCounts["1st Term"] + termSheetCounts["2nd Term"];
  if (totalSheets > 0) {
    return {"1st Term": (termSheetCounts["1st Term"] / totalSheets) * 100,"2nd Term": (termSheetCounts["2nd Term"] / totalSheets) * 100,
    };
  }

  if (sheets.length === 0) {
    return {"1st Term": 0,"2nd Term": 0 };
  }
  return {"1st Term": 0,"2nd Term": 0 };
};

const calculateNormalizedSheetAverage = (
  grades: Record<string, { value?: number }> = {},
  activities: GradeSheetActivity[]
): number => {
  let normalizedSum = 0;
  let gradedActivities = 0;

  for (const activity of activities) {
    const rawValue = getActivityGradeValue(grades, activity);
    if (rawValue === null) continue;

    const safeMax = Math.max(1, Number(activity.maxScore) || DISPLAY_MAX_SCORE);
    const clampedRaw = clamp(rawValue, 0, safeMax);
    const normalized = clamp((clampedRaw / safeMax) * DISPLAY_MAX_SCORE, 0, DISPLAY_MAX_SCORE);
    normalizedSum += normalized;
    gradedActivities += 1;
  }

  return gradedActivities > 0 ? normalizedSum / gradedActivities : 0;
};

interface StudentCourseMetrics {
  currentGrade: number;
  evaluatedPercentage: number;
  remainingPercentage: number;
  totalWeightPercentage: number;
  completedActivities: number;
  totalActivities: number;
  firstTermAverage: number;
  secondTermAverage: number;
  firstTermEquivalence: number;
  secondTermEquivalence: number;
}

interface WeightDistributionGroup {
  term: string;
  sheets: GradeSheet[];
  totalWeight: number;
}

const groupGradeSheetsByTerm = (
  sheets: GradeSheet[],
): WeightDistributionGroup[] => {
  const grouped = sheets.reduce<Record<string, GradeSheet[]>>((acc, sheet) => {
    const term = normalizeGradingPeriod(sheet.gradingPeriod || "Final");
    if (!acc[term]) acc[term] = [];
    acc[term].push(sheet);
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([term, termSheets]) => ({
      term,
      sheets: [...termSheets].sort(
        (a, b) =>
          (Number(b.weightPercentage) || 0) - (Number(a.weightPercentage) || 0),
      ),
      totalWeight: termSheets.reduce(
        (sum, sheet) => sum + (Number(sheet.weightPercentage) || 0),
        0,
      ),
    }))
    .sort((a, b) => {
      const orderA = getGradingPeriodOrder(a.term);
      const orderB = getGradingPeriodOrder(b.term);
      if (orderA !== orderB) return orderB - orderA;
      return a.term.localeCompare(b.term);
    });
};

export default function GradesPage() {
  const { user } = useAuth();
  const { courses, selectedCourseId, setSelectedCourseId } = useAcademic();
  const [gradeSheets, setGradeSheets] = useState<GradeSheet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [courseStudents, setCourseStudents] = useState<Record<string, string>>(
    {},
  );
  const [showFilter, setShowFilter] = useState(false);
  const [filterByStatus, setFilterByStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" |"grade" |"status">("name");
  const [sortOrder, setSortOrder] = useState<"asc" |"desc">("asc");
  const [searchTerm, setSearchTerm] = useState("");
  const [collapsedWeightTerms, setCollapsedWeightTerms] = useState<
    Record<string, boolean>
  >({});

  const isTeacher = user?.role ==="docente";

  const userCourses = useMemo(() => {
    if (!user) return [];
    return getAccessibleCoursesForUser(courses, user, {
      includeAllForAdmin: user.role === "admin",
      includeEnrolledForTeacher: false,
    });
  }, [courses, user]);

  const selectedCourse = useMemo(
    () => userCourses.find((c) => c.id === selectedCourseId),
    [userCourses, selectedCourseId],
  );

  const studentWeightTermGroups = useMemo(
    () =>
      groupGradeSheetsByTerm(
        gradeSheets.filter((sheet) => (sheet.weightPercentage || 0) > 0),
      ),
    [gradeSheets],
  );

  const teacherWeightTermGroups = useMemo(
    () => groupGradeSheetsByTerm(gradeSheets),
    [gradeSheets],
  );

  useEffect(() => {
    if (userCourses.length === 0) {
      if (selectedCourseId) setSelectedCourseId("");
      return;
    }

    if (!selectedCourseId || !userCourses.some((course) => course.id === selectedCourseId)) {
      setSelectedCourseId(userCourses[0].id);
    }
  }, [selectedCourseId, setSelectedCourseId, userCourses]);

  const fetchStudentNames = async (studentIds: string[]) => {
    try {
      const uniqueIds = [...new Set(studentIds)];
      const studentsRef = collection(firebaseDB,"estudiantes");

      const studentDocs = await Promise.all(
        uniqueIds.map((id) => getDoc(doc(studentsRef, id))),
      );

      const studentNames: Record<string, string> = {};
      studentDocs.forEach((docSnapshot, index) => {
        const studentId = uniqueIds[index];
        if (docSnapshot?.exists()) {
          const data = docSnapshot.data();
          studentNames[studentId] =
            data.name || `Student ${studentId.slice(-1)}`;
        } else {
          studentNames[studentId] = `Student ${studentId.slice(-1)}`;
        }
      });

      return studentNames;
    } catch {
      return {};
    }
  };
  useEffect(() => {
    const fetchGradeSheets = async () => {
      if (!selectedCourseId || !user) {
        setGradeSheets([]);
        return;
      }

      setIsLoading(true);

      try {
        const gradeSheetsRef = collection(firebaseDB,"gradeSheets");
        const selectedCourseCodeKey = normalizeText(selectedCourse?.code || "");
        const selectedCourseNameKey = normalizeText(selectedCourse?.name || "");
        const selectedCourseIdKey = String(selectedCourseId || "").trim();

        const [userDocSnapshot, studentDocSnapshot] = !isTeacher
          ? await Promise.all([
              getDoc(doc(firebaseDB, "usuarios", user.id)),
              getDoc(doc(firebaseDB, "estudiantes", user.id)),
            ])
          : [null, null];

        const userDocData = userDocSnapshot?.exists() ? userDocSnapshot.data() : {};
        const studentDocData = studentDocSnapshot?.exists()
          ? studentDocSnapshot.data()
          : {};
        const studentIdentityAliases = new Set<string>(
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
        const currentUserNameKey = normalizeText(user.name).replace(/\s+/g, " ");

        const matchesCurrentStudent = (payload: Record<string, unknown>): boolean => {
          if (isTeacher) return true;

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

          if (directIdentifiers.some((key) => studentIdentityAliases.has(key))) return true;

          const payloadName = normalizeText(payload.name).replace(/\s+/g, " ");
          return Boolean(payloadName) && payloadName === currentUserNameKey;
        };

        const matchesSelectedCourse = (payload: Record<string, unknown>): boolean => {
          const sheetCourseId = String(
            payload.courseId ?? payload.course_id ?? payload.cursoId ?? "",
          ).trim();
          if (sheetCourseId && selectedCourseIdKey && sheetCourseId === selectedCourseIdKey) {
            return true;
          }

          const sheetCourseCode = normalizeText(
            payload.courseCode ?? payload.course_code ?? payload.codigoCurso ?? "",
          );
          if (sheetCourseCode && selectedCourseCodeKey && sheetCourseCode === selectedCourseCodeKey) {
            return true;
          }

          const sheetCourseName = normalizeText(
            payload.courseName ?? payload.course_name ?? payload.nombreCurso ?? "",
          );
          if (sheetCourseName && selectedCourseNameKey && sheetCourseName === selectedCourseNameKey) {
            return true;
          }

          return false;
        };

        const querySnapshot = isTeacher
          ? await getDocs(query(gradeSheetsRef, where("courseId","==", selectedCourseId)))
          : await getDocs(gradeSheetsRef);

        const sheets: GradeSheet[] = [];
        const studentIdsToFetch = new Set<string>();

        querySnapshot.forEach((doc) => {
          const data = doc.data() as Record<string, unknown>;

          if (!isTeacher && !isSheetPublished(data)) return;
          if (!isTeacher && !matchesSelectedCourse(data)) return;

          const rawActivities = Array.isArray(data.activities)
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
                      name: String(activityPayload || activityKey || "Activity"),
                    };
                  },
                )
              : [];

          const activities: GradeSheetActivity[] = rawActivities
            .map((entry: unknown, index: number) => {
              if (!entry || typeof entry !== "object") return null;
              const payload = entry as Record<string, unknown>;
              const activityId = String(
                payload.id ??
                  payload.activityId ??
                  payload.assessmentId ??
                  payload.__activityKey ??
                  payload.name ??
                  `activity_${doc.id}_${index + 1}`,
              ).trim();
              const activityName = String(
                (payload.name ?? payload.title ?? payload.activityName ?? activityId) || "Activity",
              ).trim();
              if (!activityId && !activityName) return null;
              const maxScore =
                parseLooseNumber(payload.maxScore ?? payload.maxPoints ?? payload.puntajeMaximo) ??
                5;

              return {
                id: activityId || activityName,
                name: activityName || activityId,
                maxScore: Math.max(1, maxScore),
                type: String(payload.type || "quiz"),
              };
            })
            .filter((activity): activity is GradeSheetActivity => activity !== null);

          const students: StudentGrade[] = [];
          const rawStudents = Array.isArray(data.students)
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

          rawStudents.forEach((studentPayload) => {
            if (!studentPayload || typeof studentPayload !== "object") return;
            const student = studentPayload as Record<string, unknown>;
            if (!isTeacher && !matchesCurrentStudent(student)) return;

            const studentId = String(
              student.studentId ??
                student.studentID ??
                student.student_id ??
                student.userId ??
                student.userID ??
                student.user_id ??
                student.uid ??
                student.id ??
                student.__studentKey ??
                "",
            ).trim();
            const studentName = String(
              student.name ??
                student.studentName ??
                student.fullName ??
                `Student ${studentId ? studentId.slice(-1) : "Unknown"}`,
            ).trim();

            if (isTeacher && studentId) studentIdsToFetch.add(studentId);

            const grades: Record<
              string,
              { value?: number; comment?: string; submittedAt?: any }
            > = {};

            if (Array.isArray(student.grades)) {
              (student.grades as unknown[]).forEach((gradeData, index) => {
                const parsedValue = parseGradeValueFromUnknown(gradeData);
                if (parsedValue === null) return;

                const activityId = activities[index]?.id || `activity_${index + 1}`;
                grades[activityId] = { value: parsedValue };
              });
            } else if (student.grades && typeof student.grades === "object") {
              Object.entries(student.grades as Record<string, unknown>).forEach(
                ([key, gradeData]) => {
                  const parsedValue = parseGradeValueFromUnknown(gradeData);
                  const normalizedGrade = {
                    value: parsedValue === null ? undefined : parsedValue,
                    comment:
                      gradeData && typeof gradeData === "object" && typeof (gradeData as Record<string, unknown>).comment === "string"
                        ? ((gradeData as Record<string, unknown>).comment as string)
                        : undefined,
                    submittedAt:
                      gradeData && typeof gradeData === "object"
                        ? (gradeData as Record<string, unknown>).submittedAt || null
                        : null,
                  };

                  if (normalizedGrade.value !== undefined || normalizedGrade.comment || normalizedGrade.submittedAt) {
                    grades[key] = normalizedGrade;
                  }
                },
              );
            }

            const parsedTotal =
              parseLooseNumber(
                student.total ??
                  student.grade ??
                  student.finalGrade ??
                  student.average ??
                  student.promedio ??
                  student.notaFinal ??
                  student.nota ??
                  student.score,
              ) ?? 0;

            students.push({
              studentId: !isTeacher
                ? user.id
                : studentId || `unknown_${doc.id}_${students.length + 1}`,
              name: studentName,
              grades,
              total: Math.max(0, Math.min(5.0, parsedTotal)),
              status: String(student.status || student.estado || "pending"),
            });
          });

          if (students.length > 0) {
            sheets.push({
              id: doc.id,
              title: String(data.title || "Grade sheet"),
              courseId: String(data.courseId || data.course_id || data.cursoId || ""),
              courseCode:
                String(data.courseCode || data.course_code || data.codigoCurso || selectedCourse?.code || ""),
              courseName: String(data.courseName || data.course_name || data.nombreCurso || "Course"),
              teacherId: String(data.teacherId || ""),
              teacherName: String(data.teacherName || ""),
              gradingPeriod: normalizeGradingPeriod(String(data.gradingPeriod || "1st Term")),
              activities,
              students,
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
              isPublished: isSheetPublished(data),
              weightPercentage:
                parseLooseNumber(
                  data.weightPercentage ?? data.weight ?? data.percentage ?? data.porcentaje,
                ) ?? 0,
            });
          }
        });

        sheets.sort((a, b) => {
          const dateA = firestoreTimestampToDate(a.updatedAt).getTime();
          const dateB = firestoreTimestampToDate(b.updatedAt).getTime();
          return dateB - dateA;
        });

        if (isTeacher && studentIdsToFetch.size > 0) {
          const studentNames = await fetchStudentNames(
            Array.from(studentIdsToFetch),
          );

          setCourseStudents(studentNames);

          sheets.forEach((sheet) => {
            sheet.students.forEach((student) => {
              if (studentNames[student.studentId]) {
                student.name = studentNames[student.studentId];
              }
            });
          });
        }

        setGradeSheets(sheets);
      } catch {
      } finally {
        setIsLoading(false);
      }
    };

    fetchGradeSheets();
  }, [selectedCourse, selectedCourseId, user, isTeacher]);

  const formatGradingPeriod = (period: string): string => {
    return normalizeGradingPeriod(period);
  };

  const formatGrade = (grade: number): string => {
    return grade.toFixed(1);
  };

  const validateWeightPercentages = (): { isValid: boolean; total: number } => {
    const total = gradeSheets.reduce((sum, sheet) => {
      const weight = Number(sheet.weightPercentage) || 0;
      return sum + weight;
    }, 0);

    const numericTotal = Number(total);

    return {
      isValid: Math.abs(numericTotal - 100) < 0.01,
      total: isNaN(numericTotal) ? 0 : parseFloat(numericTotal.toFixed(1)),
    };
  };

  const weightValidation =
    gradeSheets.length > 0
      ? validateWeightPercentages()
      : { isValid: false, total: 0 };

  const calculateStudentCourseMetrics = useCallback(
    (studentId: string, sheets: GradeSheet[]): StudentCourseMetrics | null => {
      const sheetMetrics = sheets
        .map((sheet) => {
          const studentInSheet = sheet.students.find((s) => s.studentId === studentId);
          if (!studentInSheet) return null;

          const gradedActivities = sheet.activities.filter(
            (activity) => getActivityGradeValue(studentInSheet.grades || {}, activity) !== null
          ).length;

          return {
            term: getSupportedTerm(sheet.gradingPeriod),
            weight: Math.max(0, Number(sheet.weightPercentage) || 0),
            hasGrades: gradedActivities > 0,
            gradedActivities,
            totalActivities: sheet.activities.length,
            average: calculateNormalizedSheetAverage(studentInSheet.grades || {}, sheet.activities),
          };
        })
        .filter(
          (
            metric
          ): metric is {
            term: SupportedTerm | null;
            weight: number;
            hasGrades: boolean;
            gradedActivities: number;
            totalActivities: number;
            average: number;
          } => metric !== null
        );

      if (sheetMetrics.length === 0) return null;

      const totalConfiguredWeight = sheets.reduce(
        (sum, sheet) => sum + Math.max(0, Number(sheet.weightPercentage) || 0),
        0
      );
      const hasConfiguredWeights = totalConfiguredWeight > 0;
      const completedActivities = sheetMetrics.reduce(
        (sum, metric) => sum + metric.gradedActivities,
        0
      );
      const totalActivities = sheetMetrics.reduce(
        (sum, metric) => sum + metric.totalActivities,
        0
      );

      let currentGrade = 0;
      let evaluatedPercentage = 0;

      if (hasConfiguredWeights) {
        const weightedSum = sheetMetrics.reduce((sum, metric) => {
          if (!metric.hasGrades || metric.weight <= 0) return sum;
          return sum + metric.average * (metric.weight / 100);
        }, 0);

        const evaluatedWeight = sheetMetrics.reduce((sum, metric) => {
          if (!metric.hasGrades || metric.weight <= 0) return sum;
          return sum + metric.weight;
        }, 0);

        currentGrade = evaluatedWeight > 0 ? weightedSum / (evaluatedWeight / 100) : 0;
        evaluatedPercentage = evaluatedWeight;
      } else {
        const gradedSheets = sheetMetrics.filter((metric) => metric.hasGrades);
        currentGrade =
          gradedSheets.length > 0
            ? gradedSheets.reduce((sum, metric) => sum + metric.average, 0) /
              gradedSheets.length
            : 0;
        evaluatedPercentage =
          totalActivities > 0 ? (completedActivities / totalActivities) * 100 : 0;
      }

      const buildTermAverage = (term: SupportedTerm): number | null => {
        const termMetrics = sheetMetrics.filter(
          (metric) => metric.term === term && metric.hasGrades
        );
        if (termMetrics.length === 0) return null;

        if (!hasConfiguredWeights) {
          return (
            termMetrics.reduce((sum, metric) => sum + metric.average, 0) /
            termMetrics.length
          );
        }

        const weightedTermSum = termMetrics.reduce((sum, metric) => {
          if (metric.weight <= 0) return sum;
          return sum + metric.average * (metric.weight / 100);
        }, 0);

        const termWeight = termMetrics.reduce((sum, metric) => {
          if (metric.weight <= 0) return sum;
          return sum + metric.weight;
        }, 0);

        if (termWeight > 0) {
          return weightedTermSum / (termWeight / 100);
        }

        return (
          termMetrics.reduce((sum, metric) => sum + metric.average, 0) /
          termMetrics.length
        );
      };

      const firstTermAverage = buildTermAverage("1st Term");
      const secondTermAverage = buildTermAverage("2nd Term");
      const termAveragesForFinal = [firstTermAverage, secondTermAverage].filter(
        (value): value is number => value !== null
      );
      const termBasedFinalGrade =
        termAveragesForFinal.length > 0
          ? termAveragesForFinal.reduce((sum, grade) => sum + grade, 0) /
            termAveragesForFinal.length
          : currentGrade;
      const termShare =
        termAveragesForFinal.length > 0 ? 100 / termAveragesForFinal.length : 0;
      const firstTermEquivalence = firstTermAverage !== null ? termShare : 0;
      const secondTermEquivalence = secondTermAverage !== null ? termShare : 0;

      return {
        currentGrade: Number(clamp(termBasedFinalGrade, 0, DISPLAY_MAX_SCORE).toFixed(1)),
        evaluatedPercentage: Number(clamp(evaluatedPercentage, 0, 100).toFixed(1)),
        remainingPercentage: Number(clamp(100 - evaluatedPercentage, 0, 100).toFixed(1)),
        totalWeightPercentage: Number(totalConfiguredWeight.toFixed(1)),
        completedActivities,
        totalActivities,
        firstTermAverage: Number((firstTermAverage ?? 0).toFixed(1)),
        secondTermAverage: Number((secondTermAverage ?? 0).toFixed(1)),
        firstTermEquivalence: Number(firstTermEquivalence.toFixed(1)),
        secondTermEquivalence: Number(secondTermEquivalence.toFixed(1)),
      };
    },
    []
  );

  const studentData = useMemo(() => {
    if (!user || isTeacher || !selectedCourseId || gradeSheets.length === 0)
      return null;

    const publishedSheets = gradeSheets.filter((sheet) => sheet.isPublished);
    if (publishedSheets.length === 0) return null;

    const metrics = calculateStudentCourseMetrics(user.id, publishedSheets);
    if (!metrics) return null;

    let status:"passing" |"at-risk" |"failing";
    if (metrics.currentGrade >= 3.6) {
      status ="passing";
    } else if (metrics.currentGrade >= 3.0) {
      status ="at-risk";
    } else {
      status ="failing";
    }

    return {
      studentId: user.id,
      courseId: selectedCourseId,
      currentGrade: metrics.currentGrade,
      evaluatedPercentage: metrics.evaluatedPercentage,
      remainingPercentage: metrics.remainingPercentage,
      minGradeToPass: metrics.currentGrade >= 3.6 ? 0 : 3.6,
      status,
      totalWeightPercentage: metrics.totalWeightPercentage,
      firstTermAverage: metrics.firstTermAverage,
      secondTermAverage: metrics.secondTermAverage,
      firstTermEquivalence: metrics.firstTermEquivalence,
      secondTermEquivalence: metrics.secondTermEquivalence,
    };
  }, [user, isTeacher, selectedCourseId, gradeSheets, calculateStudentCourseMetrics]);

  const studentsWithGrades = useMemo((): StudentWithGrades[] => {
    if (!isTeacher || !selectedCourse) return [];

    const courseTermEquivalences = getTermEquivalences(gradeSheets);

    return selectedCourse.enrolledStudents
      .map((studentId) => {
        const studentName =
          courseStudents[studentId] ||
          gradeSheets.reduce(
            (foundName: string, sheet) => {
              if (foundName.includes("Student")) {
                const studentInSheet = sheet.students.find(
                  (s) => s.studentId === studentId,
                );
                return studentInSheet?.name || foundName;
              }
              return foundName;
            },
            `Estudiante ${studentId.slice(-6)}`,
          );

        const metrics = calculateStudentCourseMetrics(studentId, gradeSheets);

        if (!metrics) {
          return {
            id: studentId,
            name: studentName,
            systemProgress: {
              currentGrade: 0,
              status:"failing" as const,
            },
            completedAssessments: 0,
            totalAssessments: 0,
            firstTermAverage: 0,
            secondTermAverage: 0,
            firstTermEquivalence: courseTermEquivalences["1st Term"],
            secondTermEquivalence: courseTermEquivalences["2nd Term"],
          };
        }

        let status:"passing" |"at-risk" |"failing";
        if (metrics.currentGrade >= 3.6) {
          status ="passing";
        } else if (metrics.currentGrade >= 3.0) {
          status ="at-risk";
        } else {
          status ="failing";
        }

        return {
          id: studentId,
          name: studentName,
          systemProgress: {
            currentGrade: metrics.currentGrade,
            status,
          },
          completedAssessments: metrics.completedActivities,
          totalAssessments: metrics.totalActivities,
          firstTermAverage: metrics.firstTermAverage,
          secondTermAverage: metrics.secondTermAverage,
          firstTermEquivalence: metrics.firstTermEquivalence,
          secondTermEquivalence: metrics.secondTermEquivalence,
        };
      })
      .filter(Boolean) as StudentWithGrades[];
  }, [isTeacher, selectedCourse, courseStudents, gradeSheets, calculateStudentCourseMetrics]);

  const getCourseCode = (): string => {
    if (!selectedCourse) return"";
    return (
      selectedCourse.code ||
      selectedCourse.name?.replace(/\s+/g,"-").toUpperCase() ||
      selectedCourseId
    );
  };

  const filteredStudents = useMemo(() => {
    let filtered = studentsWithGrades;

    if (filterByStatus !=="all") {
      filtered = filtered.filter(
        (student) => student.systemProgress.status === filterByStatus,
      );
    }

    if (searchTerm) {
      filtered = filtered.filter((student) =>
        student.name.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    }

    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case"name":
          comparison = a.name.localeCompare(b.name);
          break;
        case"grade":
          comparison =
            a.systemProgress.currentGrade - b.systemProgress.currentGrade;
          break;
        case"status": {
          const statusOrder = { passing: 0,"at-risk": 1, failing: 2 };
          comparison =
            statusOrder[a.systemProgress.status] -
            statusOrder[b.systemProgress.status];
          break;
        }
      }

      return sortOrder ==="asc" ? comparison : -comparison;
    });

    return filtered;
  }, [studentsWithGrades, filterByStatus, searchTerm, sortBy, sortOrder]);
  const teacherStats = useMemo(() => {
    const passing = filteredStudents.filter(
      (s) => s.systemProgress.status ==="passing",
    ).length;
    const atRisk = filteredStudents.filter(
      (s) => s.systemProgress.status ==="at-risk",
    ).length;
    const failing = filteredStudents.filter(
      (s) => s.systemProgress.status ==="failing",
    ).length;
    const totalStudents = filteredStudents.length;

    return {
      passing,
      atRisk,
      failing,
      totalStudents,
      averageGrade:
        totalStudents > 0
          ? filteredStudents.reduce(
              (sum, s) => sum + s.systemProgress.currentGrade,
              0,
            ) / totalStudents
          : 0,
      publishedSheets: gradeSheets.filter((s) => s.isPublished).length,
      totalActivities: gradeSheets.reduce(
        (total, sheet) => total + sheet.activities.length,
        0,
      ),
      totalWeightPercentage: weightValidation.total,
    };
  }, [filteredStudents, gradeSheets, weightValidation]);
  const exportToExcel = () => {
    if (!selectedCourse || filteredStudents.length === 0) return;

    const exportData = filteredStudents.map((student) => ({
      Student: student.name,
      Average: student.systemProgress.currentGrade,"1st Term Avg": student.firstTermAverage,"1st Term Equiv (%)": student.firstTermEquivalence,"2nd Term Avg": student.secondTermAverage,"2nd Term Equiv (%)": student.secondTermEquivalence,
      Status:
        student.systemProgress.status ==="passing"
          ?"Passing"
          : student.systemProgress.status ==="at-risk"
            ?"At Risk"
            :"Failing","Completed Activities": student.completedAssessments,"Total Activities": student.totalAssessments,"Completion Percentage":
        student.totalAssessments > 0
          ? `${((student.completedAssessments / student.totalAssessments) * 100).toFixed(1)}%`
          :"0.0%",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);

    XLSX.utils.book_append_sheet(wb, ws,"Grades");

    const wscols = [
      { wch: 30 },
      { wch: 10 },
      { wch: 12 },
      { wch: 15 },
      { wch: 12 },
      { wch: 15 },
      { wch: 15 },
      { wch: 20 },
      { wch: 15 },
      { wch: 20 },
    ];
    ws["!cols"] = wscols;

    XLSX.writeFile(
      wb,
      `Grades_${selectedCourse.code}_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  };

  const handleSortClick = (field:"name" |"grade" |"status") => {
    if (sortBy === field) {
      setSortOrder(sortOrder ==="asc" ?"desc" :"asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  const handleCourseChange = (courseId: string) => {
    setSelectedCourseId(courseId);
    setShowFilter(false);
    setFilterByStatus("all");
    setSortBy("name");
    setSortOrder("asc");
  };

  const getGradePalette = (grade: number) => {
    if (grade >= 3.6) {
      return {
        gradeText: "text-emerald-600",
        statusBadge: "bg-emerald-100 text-emerald-700 border border-emerald-200",
        progressFill: "bg-emerald-500",
      };
    }

    if (grade >= 3.0) {
      return {
        gradeText: "text-amber-600",
        statusBadge: "bg-amber-100 text-amber-700 border border-amber-200",
        progressFill: "bg-amber-500",
      };
    }

    return {
      gradeText: "text-rose-600",
      statusBadge: "bg-rose-100 text-rose-700 border border-rose-200",
      progressFill: "bg-rose-500",
    };
  };

  const getStatusBadgeClass = (status: string, grade?: number) => {
    if (typeof grade === "number" && Number.isFinite(grade)) {
      return getGradePalette(grade).statusBadge;
    }

    switch (status) {
      case "passing":
        return "bg-emerald-100 text-emerald-700 border border-emerald-200";
      case "at-risk":
        return "bg-amber-100 text-amber-700 border border-amber-200";
      case "failing":
        return "bg-rose-100 text-rose-700 border border-rose-200";
      default:
        return "bg-slate-100 text-slate-700 border border-slate-300";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case"passing":
        return"Passing";
      case"at-risk":
        return"At Risk";
      case"failing":
        return"Failing";
      default:
        return"Unknown";
    }
  };

  const formatWeightPercentage = (value: number): string => {
    if (!Number.isFinite(value)) return "0";
    const rounded = Number(value.toFixed(1));
    return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
  };

  const isWeightTermCollapsed = (scope:"student" |"teacher", term: string) =>
    collapsedWeightTerms[`${scope}:${term}`] ?? false;

  const toggleWeightTerm = (scope:"student" |"teacher", term: string) => {
    const key = `${scope}:${term}`;
    setCollapsedWeightTerms((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? false),
    }));
  };

  if (isLoading) {
    return (
      <DashboardLayout contentClassName="pt-0 lg:pt-1">
        <div className="relative overflow-x-clip">
          <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
          <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />
          <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
            <div className="flex min-h-[320px] items-center justify-center">
              <div className="space-y-2 text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
                <p className="text-lg font-semibold text-slate-900">Loading grades</p>
                <p className="text-sm text-slate-600">Preparing your academic overview.</p>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout contentClassName="pt-0 lg:pt-1">
      <div className="relative overflow-x-clip">
        <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
        <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />
        <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3">
              <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
                <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-sky-200/35" />
                <div className="pointer-events-none absolute -right-24 -bottom-24 h-64 w-64 rounded-full bg-indigo-200/35" />
                <div className="relative z-10">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                        <Sparkles className="h-3.5 w-3.5" />
                        Grades Workspace
                      </div>
                      <h2 className="mt-3 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                        {isTeacher ?"Academic performance center" :"My academic progress"}
                      </h2>
                      <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                        {isTeacher
                          ?"Review student performance, adjust filters, and track grade-sheet weights."
                          :"Track your averages, weighted periods, and activity completion in one place."}
                      </p>
                      {selectedCourse && (
                        <p className="mt-2 text-xs font-medium text-slate-500">
                          Course: {selectedCourse.code} · {selectedCourse.name}
                        </p>
                      )}
                    </div>
                    {isTeacher && selectedCourseId && (
                      <Link
                        to={`/courses/${getCourseCode()}/grade-sheets`}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                      >
                        <FileSpreadsheet className="h-4 w-4" />
                        Manage sheets
                      </Link>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {isTeacher ? (
                      <>
                        <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                              <Users className="h-4 w-4" />
                            </div>
                            <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{teacherStats.totalStudents}</p>
                          </div>
                          <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Students</p>
                        </div>
                        <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                              <BarChart3 className="h-4 w-4" />
                            </div>
                            <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{teacherStats.averageGrade.toFixed(1)}</p>
                          </div>
                          <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Average</p>
                        </div>
                        <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                              <CheckCircle2 className="h-4 w-4" />
                            </div>
                            <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{teacherStats.publishedSheets}</p>
                          </div>
                          <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Published</p>
                        </div>
                        <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                              <FileSpreadsheet className="h-4 w-4" />
                            </div>
                            <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{teacherStats.totalActivities}</p>
                          </div>
                          <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Activities</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                              <BarChart3 className="h-4 w-4" />
                            </div>
                            <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">
                              {studentData ? formatGrade(studentData.currentGrade) :"--"}
                            </p>
                          </div>
                          <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Average</p>
                        </div>
                        <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                              <Percent className="h-4 w-4" />
                            </div>
                            <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">
                              {studentData ? `${studentData.evaluatedPercentage.toFixed(0)}%` :"--"}
                            </p>
                          </div>
                          <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Evaluated</p>
                        </div>
                        <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                              <Clock className="h-4 w-4" />
                            </div>
                            <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">
                              {studentData ? `${studentData.remainingPercentage.toFixed(0)}%` :"--"}
                            </p>
                          </div>
                          <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Remaining</p>
                        </div>
                        <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                              <Trophy className="h-4 w-4" />
                            </div>
                            <p className="truncate text-sm font-bold leading-5 text-slate-900">
                              {studentData ? getStatusText(studentData.status) :"No data"}
                            </p>
                          </div>
                          <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Status</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </section>

        {isTeacher && selectedCourse && (
          <section className="order-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Student status distribution</h3>
              <p className="text-xs text-slate-500">Based on current course average</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    Passing
                  </div>
                  <span className="text-lg font-extrabold leading-none text-emerald-700">{teacherStats.passing}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-emerald-100">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{
                      width: `${teacherStats.totalStudents > 0 ? (teacherStats.passing / teacherStats.totalStudents) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-amber-800">
                    <Clock className="h-4 w-4" />
                    At Risk
                  </div>
                  <span className="text-lg font-extrabold leading-none text-amber-700">{teacherStats.atRisk}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-amber-100">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all"
                    style={{
                      width: `${teacherStats.totalStudents > 0 ? (teacherStats.atRisk / teacherStats.totalStudents) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-rose-800">
                    <AlertCircle className="h-4 w-4" />
                    Failing
                  </div>
                  <span className="text-lg font-extrabold leading-none text-rose-700">{teacherStats.failing}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-rose-100">
                  <div
                    className="h-full rounded-full bg-rose-500 transition-all"
                    style={{
                      width: `${teacherStats.totalStudents > 0 ? (teacherStats.failing / teacherStats.totalStudents) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="order-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-4 sm:flex-row">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder={isTeacher ?"Search students..." :"Search grades..."}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-medium text-slate-700 transition-all focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="relative min-w-[180px]">
                <select
                  value={selectedCourseId}
                  onChange={(e) => handleCourseChange(e.target.value)}
                  className="h-10 w-full appearance-none rounded-xl border border-slate-300 bg-white px-3 pr-9 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                >
                  {userCourses.length === 0 ? (
                    <option value="">No courses available</option>
                  ) : (
                    <>
                      <option value="">Select a course...</option>
                      {userCourses
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.code}
                          </option>
                        ))}
                    </>
                  )}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>

            {isTeacher && selectedCourseId && (
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/courses/${getCourseCode()}/grade-sheets`}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>Manage</span>
                </Link>
                <button
                  onClick={exportToExcel}
                  disabled={filteredStudents.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:bg-white disabled:hover:text-slate-700"
                >
                  <Download className="h-4 w-4" />
                  <span>Export</span>
                </button>
                <button
                  onClick={() => setShowFilter(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <Filter className="h-4 w-4" />
                  <span>Filters</span>
                </button>
              </div>
            )}
          </div>
        </section>

        
        {!selectedCourseId && userCourses.length === 0 && (
          <div className="order-3 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
              <GraduationCap className="h-4 w-4 text-blue-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">
              No courses available
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {isTeacher
                ?"You have no courses assigned as a teacher. Contact the administrator."
                :"You are not enrolled in any course. Contact your teacher."}
            </p>
          </div>
        )}

        
        {isTeacher &&
          selectedCourseId &&
          filteredStudents.length === 0 &&
          studentsWithGrades.length > 0 && (
            <div className="order-3 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
              <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                <Search className="h-4 w-4 text-gray-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                No students found
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                {searchTerm
                  ? `No students match "${searchTerm}". Try a different search term.`
                  :"No students match the selected filters."}
              </p>
              {(searchTerm || filterByStatus !=="all") && (
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setFilterByStatus("all");
                  }}
                  className="mt-3 inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

        
        {!isLoading && !isTeacher && studentData && selectedCourse && (
          <div className="order-3 grid gap-3">
            
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Your Progress
                  </h3>
                  <p className="text-sm text-gray-500">{selectedCourse.name}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    className={`${getStatusBadgeClass(studentData.status, studentData.currentGrade)} hidden sm:block`}
                  >
                    {getStatusText(studentData.status)}
                  </Badge>
                  {studentData.status ==="passing" &&
                    studentData.currentGrade >= 4.0 && (
                      <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200">
                        <Trophy className="h-3 w-3 mr-1" />
                        Excellent
                      </Badge>
                    )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
                  <p className="text-xs font-semibold text-blue-600  tracking-wide mb-2">
                    Current Average
                  </p>
                  <div className="flex items-end gap-2">
                    <p
                      className={cn(
                        "text-lg font-bold text-center md:text-left",
                        getGradePalette(studentData.currentGrade).gradeText,
                      )}
                    >
                      {formatGrade(studentData.currentGrade)}
                    </p>
                    <span className="text-sm text-gray-500 mb-1 hidden md:block">
                      /5.0
                    </span>
                  </div>
                  {studentData.currentGrade >= 4.0 && (
                    <div className="flex items-center gap-1 mt-2">
                      <Star className="h-3 w-3 text-gray-700" />
                      <span className="text-xs text-gray-700 font-medium">
                        Top Performance
                      </span>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
                  <p className="text-xs font-semibold text-blue-600  tracking-wide mb-2">
                    Evaluated
                  </p>
                  <p className="text-lg font-bold text-gray-900 text-center md:text-left">
                    {studentData.evaluatedPercentage.toFixed(0)}%
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-gray-700  tracking-wide mb-2">
                    Remaining
                  </p>
                  <p className="text-lg font-bold text-gray-900 text-center md:text-left">
                    {studentData.remainingPercentage.toFixed(0)}%
                  </p>
                </div>

                <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
                  <p className="text-xs font-semibold text-blue-600  tracking-wide mb-2">
                    To Pass
                  </p>
                  <p className="text-lg font-bold text-gray-900 text-center md:text-left">
                    {studentData.minGradeToPass > 0
                      ? studentData.minGradeToPass.toFixed(1)
                      :"3.6"}
                  </p>
                </div>

                <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
                  <p className="text-xs font-semibold text-blue-600 tracking-wide mb-2">
                    1st Term Avg
                  </p>
                  <p className="text-lg font-bold text-gray-900 text-center md:text-left">
                    {studentData.firstTermAverage > 0
                      ? formatGrade(studentData.firstTermAverage)
                      :"--"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {studentData.firstTermEquivalence.toFixed(0)}% equivalent
                  </p>
                </div>

                <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
                  <p className="text-xs font-semibold text-blue-600 tracking-wide mb-2">
                    2nd Term Avg
                  </p>
                  <p className="text-lg font-bold text-gray-900 text-center md:text-left">
                    {studentData.secondTermAverage > 0
                      ? formatGrade(studentData.secondTermAverage)
                      :"--"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {studentData.secondTermEquivalence.toFixed(0)}% equivalent
                  </p>
                </div>
              </div>
            </div>

            
          

            
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 border-b border-slate-100 pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                      <FileSpreadsheet className="h-4 w-4 text-blue-500" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">
                        Grades by Period
                      </h3>
                      <p className="text-sm text-gray-500">
                        Detailed breakdown of all your grades
                      </p>
                    </div>
                  </div>
                  <Badge className="bg-blue-100 text-blue-700 border border-blue-200 flex items-center gap-1 max-w-[25%]">
                    <CalendarDays className="h-3 w-3" />
                    {selectedCourse.semester
                      ? `${selectedCourse.semester} Term`
                      :"Current"}
                  </Badge>
                </div>
              </div>

              <div className="space-y-3">
                {gradeSheets.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                    <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                      <AlertCircle className="h-4 w-4 text-gray-400" />
                    </div>
                    <p className="text-gray-900 font-semibold text-lg mb-2">
                      No grades have been published
                    </p>
                    <p className="text-sm text-gray-600 max-w-md mx-auto">
                      Your grades will appear here once the teacher publishes
                      evaluations for this course.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {gradeSheets.map((sheet) => {
                      const updatedAt = firestoreTimestampToDate(
                        sheet.updatedAt,
                      );
                      const studentSheetData = sheet.students[0];
                      const gradedActivities = sheet.activities.filter(
                        (activity) =>
                          getActivityGradeValue(
                            studentSheetData?.grades || {},
                            activity,
                          ) !== null,
                      ).length;
                      const periodAverage =
                        studentSheetData && gradedActivities > 0
                          ? calculateNormalizedSheetAverage(
                              studentSheetData.grades || {},
                              sheet.activities
                            )
                          : 0;

                      return (
                        <div
                          key={sheet.id}
                          className="rounded-xl border border-slate-200 bg-white p-3 transition hover:shadow-sm"
                        >
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-3 gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                                  {sheet.title}
                                </h4>
                                <Badge className="bg-blue-100 text-blue-700 border border-blue-200 hidden sm:block">
                                  {formatGradingPeriod(sheet.gradingPeriod)}
                                </Badge>
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                                <div className="flex items-center gap-1">
                                  <User className="h-4 w-4" />
                                  <span>Teacher: {sheet.teacherName}</span>
                                </div>
                                <span>•</span>
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-4 w-4" />
                                  <span>
                                    {updatedAt.toLocaleDateString("en-US", {
                                      month:"short",
                                      day:"numeric",
                                      year:"numeric",
                                    })}
                                  </span>
                                </div>
                                {(sheet.weightPercentage || 0) > 0 && (
                                  <>
                                    <span className="hidden sm:block">•</span>
                                    <div className="flex items-center gap-1 hidden sm:block">
                                      <span className="font-semibold text-blue-600">
                                        {sheet.weightPercentage || 0}%
                                      </span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                              <p className="text-xs text-blue-600 font-semibold">Period Average</p>
                              <p
                                className={cn("text-lg font-bold",
                                  periodAverage >= 3.6
                                    ?"text-emerald-600"
                                    : periodAverage >= 3.0
                                      ?"text-amber-600"
                                      :"text-rose-600",
                                )}
                              >
                                {gradedActivities > 0 ? formatGrade(periodAverage) :"--"}
                              </p>
                            </div>
                            <div className="rounded-lg border border-sky-100 bg-sky-50 p-2">
                              <p className="text-xs text-blue-600 font-semibold">Graded Activities</p>
                              <p className="text-lg font-bold text-gray-900">
                                {gradedActivities}/{sheet.activities.length}
                              </p>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                              <p className="text-xs text-blue-600 font-semibold">Weight</p>
                              <p className="text-lg font-bold text-gray-900">
                                {sheet.weightPercentage || 0}%
                              </p>
                            </div>
                          </div>

                          <div className="hidden sm:grid grid-cols-12 px-3 pb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            <div className="col-span-6">Activity</div>
                            <div className="col-span-3 text-center">Type</div>
                            <div className="col-span-3 text-right">Grade</div>
                          </div>

                          <div className="space-y-2">
                            {sheet.activities.map((activity) => {
                              const gradeValue = getActivityGradeValue(
                                studentSheetData?.grades || {},
                                activity,
                              );
                              const safeGradeValue = gradeValue ?? 0;
                              const isExcellent = safeGradeValue >= 4.0;
                              const isPassing =
                                safeGradeValue >= 3.6 && safeGradeValue < 4.0;
                              const isAtRisk =
                                safeGradeValue >= 3.0 && safeGradeValue < 3.6;

                              return (
                                <div
                                  key={activity.id}
                                  className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 sm:grid-cols-12 sm:items-center"
                                >
                                  <div className="sm:col-span-6 min-w-0">
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
                                      <p className="font-semibold text-gray-900 text-xs sm:text-sm">
                                        {activity.name}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="sm:col-span-3">
                                    <Badge
                                      className={`text-xs w-fit sm:mx-auto ${
                                        activity.type ==="exam"
                                          ?"bg-gray-200 text-gray-800 border border-gray-300"
                                          : activity.type ==="quiz"
                                            ?"bg-blue-100 text-blue-700 border border-blue-200"
                                            : activity.type ==="homework"
                                              ?"bg-blue-100 text-blue-700 border border-blue-200"
                                              : activity.type ==="project"
                                                ?"bg-blue-100 text-blue-700 border border-blue-200"
                                                :"bg-gray-100 text-gray-700 border border-gray-200"
                                      }`}
                                    >
                                      {activity.type ==="exam"
                                        ?"Exam"
                                        : activity.type ==="quiz"
                                          ?"Quiz"
                                          : activity.type ==="homework"
                                            ?"Homework"
                                            : activity.type ==="project"
                                              ?"Project"
                                              : activity.type ==="participation"
                                                ?"Participation"
                                                : activity.type}
                                    </Badge>
                                  </div>

                                  <div className="sm:col-span-3 text-right sm:ml-4">
                                    {gradeValue !== null ? (
                                      <div className="flex flex-col items-end">
                                        <div className="flex items-center gap-2">
                                          <span
                                            className={cn("text-lg font-bold",
                                              isExcellent
                                                ?"text-emerald-700"
                                                : isPassing
                                                  ?"text-emerald-600"
                                                  : isAtRisk
                                                    ?"text-amber-600"
                                                    :"text-rose-600",
                                            )}
                                          >
                                            {formatGrade(safeGradeValue)}
                                          </span>
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-gray-400 italic">
                                        Pending
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {studentWeightTermGroups.length > 0 && (
              <div className="sticky top-24 self-start rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                      <Percent className="h-3.5 w-3.5 text-slate-500" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800">
                        Weight Distribution
                      </h4>
                      <p className="text-xs text-slate-500">
                        How each period contributes to your final grade
                      </p>
                    </div>
                  </div>
                  {studentData.totalWeightPercentage !== 100 && (
                    <Badge className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0 text-[11px] font-medium text-slate-600">
                      {studentData.totalWeightPercentage < 100
                        ?"Incomplete"
                        :"Over 100%"}
                    </Badge>
                  )}
                </div>

                <div className="space-y-1.5">
                  {studentWeightTermGroups.map((group) => {
                    const collapsed = isWeightTermCollapsed("student", group.term);
                    return (
                      <div
                        key={`student-${group.term}`}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-2"
                      >
                        <button
                          type="button"
                          onClick={() => toggleWeightTerm("student", group.term)}
                          className="flex w-full items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-1.5">
                            <ChevronDown
                              className={cn(
                                "h-3.5 w-3.5 text-slate-500 transition-transform",
                                collapsed && "-rotate-90",
                              )}
                            />
                            <span className="text-xs font-semibold text-slate-700">
                              {group.term}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {group.sheets.length} sheets
                            </span>
                          </div>
                          <span className="text-xs font-semibold text-slate-600">
                            {formatWeightPercentage(group.totalWeight)}%
                          </span>
                        </button>

                        {!collapsed && (
                          <div className="mt-2 space-y-1.5 pl-4">
                            {group.sheets.map((sheet) => (
                              <div
                                key={sheet.id}
                                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2.5"
                              >
                                <div className="flex items-center gap-2">
                                  <div className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                                    <FileSpreadsheet className="h-3.5 w-3.5 text-slate-500" />
                                  </div>
                                  <p className="text-sm font-medium leading-tight text-slate-800">
                                    {sheet.title}
                                  </p>
                                </div>
                                <span className="text-base font-semibold text-slate-600">
                                  {formatWeightPercentage(sheet.weightPercentage || 0)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div className="pt-4 mt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-gray-900">
                          Total weight:
                        </span>
                        <p className="text-sm text-gray-500">
                          Sum of all periods
                        </p>
                      </div>
                      <span
                        className={`text-lg font-bold  ${
                          studentData.totalWeightPercentage === 100
                            ?"text-blue-600"
                            : studentData.totalWeightPercentage > 100
                              ?"text-gray-700"
                              :"text-blue-600"
                        }`}
                      >
                        {studentData.totalWeightPercentage}%
                      </span>
                    </div>
                    {studentData.totalWeightPercentage !== 100 && (
                      <div
                        className={`mt-2 p-3 rounded-xl ${
                          studentData.totalWeightPercentage > 100
                            ?"bg-gray-50 border border-gray-200"
                            :"bg-blue-50 border border-blue-200"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {studentData.totalWeightPercentage > 100 ? (
                            <>
                              <AlertTriangle className="h-4 w-4 text-gray-700 mt-0.5 flex-shrink-0" />
                              <p className="text-sm text-gray-700">
                                Exceeds 100% by{" "}
                                {(
                                  studentData.totalWeightPercentage - 100
                                ).toFixed(1)}
                                %
                              </p>
                            </>
                          ) : (
                            <>
                              <Target className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                              <p className="text-sm text-blue-700">
                                {(
                                  100 - studentData.totalWeightPercentage
                                ).toFixed(1)}
                                % remaining to complete
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        

        
        {!isLoading && isTeacher && selectedCourse && (
          <div className="order-4 grid gap-3">
       

 

            
            {(searchTerm || filterByStatus !=="all") &&
              filteredStudents.length > 0 && (
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Search className="h-4 w-4 text-blue-500" />
                      <div>
                        <p className="font-medium text-blue-700">
                          Showing {filteredStudents.length} of{" "}
                          {studentsWithGrades.length} students
                        </p>
                        <p className="text-sm text-blue-600">
                          {searchTerm && `Search: "${searchTerm}" • `}
                          {filterByStatus !=="all" &&
                            `Filter: ${filterByStatus} • `}
                          Sort: {sortBy} ({sortOrder})
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setSearchTerm("");
                        setFilterByStatus("all");
                      }}
                      className="inline-flex items-center rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-sm font-semibold text-sky-700 hover:bg-sky-100"
                    >
                      Clear all
                    </button>
                  </div>
                </div>
              )}

            {gradeSheets.length > 0 && (
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_330px]">
              {filteredStudents.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 border-b border-slate-100 pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <FileSpreadsheet className="h-4 w-4 text-blue-500" />
                        <h3 className="text-lg font-bold text-gray-900">
                          Student Weighted Averages
                        </h3>
                      </div>
                      <p className="text-sm text-gray-500">
                        {selectedCourse.code} - {selectedCourse.name}
                        {filterByStatus !=="all" &&
                          ` • Filtered by: ${filterByStatus ==="passing" ?"Passing" : filterByStatus ==="at-risk" ?"At Risk" :"Failing"}`}
                      </p>
                    </div>
                    <div className="text-sm font-medium text-gray-600">
                      {filteredStudents.length} of{" "}
                      {selectedCourse.enrolledStudents.length} students
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-50">
                        <th className="min-w-[220px] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <button
                            onClick={() => handleSortClick("name")}
                            className="flex items-center gap-2 hover:text-blue-600 transition-colors"
                          >
                            <Users className="h-4 w-4 text-gray-500" />
                            Student
                            {sortBy ==="name" &&
                              (sortOrder ==="asc" ? (
                                <SortAsc className="h-3 w-3" />
                              ) : (
                                <SortDesc className="h-3 w-3" />
                              ))}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <button
                            onClick={() => handleSortClick("grade")}
                            className="hover:text-blue-600 transition-colors"
                          >
                            Final Grade
                            {sortBy ==="grade" &&
                              (sortOrder ==="asc" ? (
                                <SortAsc className="h-3 w-3 ml-1" />
                              ) : (
                                <SortDesc className="h-3 w-3 ml-1" />
                              ))}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                          1st Term
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                          2nd Term
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <button
                            onClick={() => handleSortClick("status")}
                            className="hover:text-blue-600 transition-colors"
                          >
                            Status
                            {sortBy ==="status" &&
                              (sortOrder ==="asc" ? (
                                <SortAsc className="h-3 w-3 ml-1" />
                              ) : (
                                <SortDesc className="h-3 w-3 ml-1" />
                              ))}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Activities
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((student, index) => {
                        const finalGradePalette = getGradePalette(
                          student.systemProgress.currentGrade,
                        );
                        const firstTermPalette =
                          student.firstTermAverage > 0
                            ? getGradePalette(student.firstTermAverage)
                            : null;
                        const secondTermPalette =
                          student.secondTermAverage > 0
                            ? getGradePalette(student.secondTermAverage)
                            : null;

                        return (
                        <tr
                          key={student.id}
                          className={cn("border-t border-slate-200",
                            index % 2 === 0 ?"bg-white" :"bg-slate-50/40",
                          )}
                        >
                          <td className="min-w-[220px] px-4 py-3 align-middle">
                            <div className="flex items-center gap-3">
                              <div className="flex flex-col">
                                <span className="font-semibold text-gray-900">
                                  {student.name}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-middle text-center">
                            <div className="flex flex-col items-center">
                              <span
                                className={cn(
                                  "text-lg font-bold",
                                  finalGradePalette.gradeText,
                                )}
                              >
                                {formatGrade(
                                  student.systemProgress.currentGrade,
                                )}
                              </span>
                             
                            </div>
                          </td>
                          <td className="px-4 py-3 align-middle text-center">
                            <div className="flex flex-col items-center">
                              <span
                                className={cn(
                                  "text-sm font-bold",
                                  firstTermPalette
                                    ? firstTermPalette.gradeText
                                    : "text-gray-400",
                                )}
                              >
                                {student.firstTermAverage > 0
                                  ? formatGrade(student.firstTermAverage)
                                  :"--"}
                              </span>
                              <span className="text-xs text-gray-500">
                                {student.firstTermEquivalence.toFixed(0)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-middle text-center">
                            <div className="flex flex-col items-center">
                              <span
                                className={cn(
                                  "text-sm font-bold",
                                  secondTermPalette
                                    ? secondTermPalette.gradeText
                                    : "text-gray-400",
                                )}
                              >
                                {student.secondTermAverage > 0
                                  ? formatGrade(student.secondTermAverage)
                                  :"--"}
                              </span>
                              <span className="text-xs text-gray-500">
                                {student.secondTermEquivalence.toFixed(0)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-middle text-center">
                            <Badge
                              className={getStatusBadgeClass(
                                student.systemProgress.status,
                                student.systemProgress.currentGrade,
                              )}
                            >
                              {student.systemProgress.status ==="passing" &&
                                student.systemProgress.currentGrade >= 4.0 && (
                                  <Sparkles className="h-3 w-3 mr-1" />
                                )}
                              {getStatusText(student.systemProgress.status)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 align-middle text-center">
                            <div className="flex flex-col items-center">
                              <span className="font-semibold text-gray-900">
                                {student.completedAssessments}/
                                {student.totalAssessments}
                              </span>
                              <span className="text-xs text-gray-500">
                                Activities
                              </span>
                              {student.totalAssessments > 0 && (
                                <div className="mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                                  <div
                                    className={cn(
                                      "h-full rounded-full",
                                      finalGradePalette.progressFill,
                                    )}
                                    style={{
                                      width: `${(student.completedAssessments / student.totalAssessments) * 100}%`,
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              )}

              <div
                className={cn(
                  "sticky top-24 self-start h-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm",
                  filteredStudents.length === 0 &&"lg:col-span-2",
                )}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                      <Percent className="h-3.5 w-3.5 text-slate-500" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800">
                        Weight Distribution
                      </h4>
                      <p className="text-xs text-slate-500">
                        How each period contributes to final grades
                      </p>
                    
                    </div>
                  </div>
                  <Badge
                    className={`rounded-full border px-2 py-0 text-[11px] font-medium ${
                      weightValidation.isValid
                        ?"border-slate-200 bg-slate-100 text-slate-600"
                        :"border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {weightValidation.total}%
                  </Badge>
                </div>

                <div className="space-y-1.5">
                  {teacherWeightTermGroups.map((group) => {
                    const collapsed = isWeightTermCollapsed("teacher", group.term);
                    return (
                      <div
                        key={`teacher-${group.term}`}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-2"
                      >
                        <button
                          type="button"
                          onClick={() => toggleWeightTerm("teacher", group.term)}
                          className="flex w-full items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-1.5">
                            <ChevronDown
                              className={cn(
                                "h-3.5 w-3.5 text-slate-500 transition-transform",
                                collapsed && "-rotate-90",
                              )}
                            />
                            <span className="text-xs font-semibold text-slate-700">
                              {group.term}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {group.sheets.length} sheets
                            </span>
                          </div>
                          <span className="text-xs font-semibold text-slate-600">
                            {formatWeightPercentage(group.totalWeight)}%
                          </span>
                        </button>

                        {!collapsed && (
                          <div className="mt-2 space-y-1.5 pl-4">
                            {group.sheets.map((sheet) => (
                              <div
                                key={sheet.id}
                                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2.5"
                              >
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`flex h-7 w-7 items-center justify-center rounded-md ${
                                      sheet.isPublished
                                        ?"bg-sky-50"
                                        :"bg-slate-100"
                                    }`}
                                  >
                                    <FileSpreadsheet
                                      className={`h-3.5 w-3.5 ${sheet.isPublished ?"text-sky-600" :"text-slate-500"}`}
                                    />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium leading-tight text-slate-800">
                                      {sheet.title}
                                    </p>
                                    {!sheet.isPublished && (
                                      <div className="mt-0.5">
                                        <Badge className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0 text-[11px] font-medium text-slate-600">
                                          Draft
                                        </Badge>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span
                                    className={`text-base font-semibold ${(sheet.weightPercentage || 0) > 0 ?"text-slate-600" :"text-slate-400"}`}
                                  >
                                    {formatWeightPercentage(sheet.weightPercentage || 0)}%
                                  </span>
                                  <Link
                                    to={`/courses/${getCourseCode()}/grade-sheets/${sheet.id}/edit`}
                                    onClick={() => {
                                      console.log("Navigating to edit:", {
                                        courseCode: getCourseCode(),
                                        sheetId: sheet.id,
                                        sheetCourseCode: sheet.courseCode,
                                        sheetCourseId: sheet.courseId,
                                      });
                                    }}
                                    className="text-xs font-medium text-slate-500 hover:text-slate-700 hover:underline"
                                  >
                                    Edit
                                  </Link>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div className="pt-4 mt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-gray-900">
                          Total weight:
                        </span>
                        <p className="text-sm text-gray-500">
                          Sum of all periods
                        </p>
                      </div>
                      <span
                        className={`text-lg font-bold  ${
                          weightValidation.isValid
                            ?"text-blue-600"
                            : weightValidation.total > 100
                              ?"text-gray-700"
                              :"text-blue-600"
                        }`}
                      >
                        {weightValidation.total}%
                      </span>
                    </div>
                    {!weightValidation.isValid && (
                      <div
                        className={`mt-3 p-3 rounded-xl ${
                          weightValidation.total > 100
                            ?"bg-gray-50 border border-gray-200"
                            :"bg-blue-50 border border-blue-200"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {weightValidation.total > 100 ? (
                            <>
                              <AlertTriangle className="h-4 w-4 text-gray-700 mt-0.5 flex-shrink-0" />
                              <p className="text-sm text-gray-700">
                                Exceeds 100% by{" "}
                                {(weightValidation.total - 100).toFixed(1)}%
                              </p>
                            </>
                          ) : (
                            <>
                              <Target className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                              <p className="text-sm text-blue-700">
                                {(100 - weightValidation.total).toFixed(1)}%
                                below target (should be 100%)
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  </div>
                </div>
              </div>
            )}

            
            {gradeSheets.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
                  <FileSpreadsheet className="h-4 w-4 text-blue-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  No grade sheets
                </h3>
                <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">
                  No grade sheets have been created for this course yet. Start
                  by creating your first grade sheet to manage grades.
                </p>
                <Link to={`/courses/${getCourseCode()}/grade-sheets`}>
                  <Button className="td-backups-button inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
                    <FileSpreadsheet className="td-btn-icon" />
                    <span>Create Grade Sheet</span>
                  </Button>
                </Link>
              </div>
            )}

            {selectedCourse.enrolledStudents.length > 0 &&
              filteredStudents.length === 0 &&
              gradeSheets.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                  <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                    <AlertCircle className="h-4 w-4 text-gray-500" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">
                    No students match the filters
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Try changing your filter criteria to see more results.
                  </p>
                </div>
              )}

            {selectedCourse.enrolledStudents.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
                  <Users className="h-4 w-4 text-blue-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  No enrolled students
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  No students are enrolled in this course. Add students to start
                  managing grades.
                </p>
              </div>
            )}
            </div>
        )}
          </div>
        </div>
      </div>

      {showFilter && isTeacher && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
          onClick={() => setShowFilter(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-[0_32px_72px_-40px_rgba(15,23,42,0.6)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Grade filters</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Refine the student list with status and sorting.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowFilter(false)}
                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                aria-label="Close filters"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Filter by Status
                </label>
                <select
                  value={filterByStatus}
                  onChange={(e) => setFilterByStatus(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="all">All Statuses</option>
                  <option value="passing">Passing</option>
                  <option value="at-risk">At Risk</option>
                  <option value="failing">Failing</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Sort by
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="name">Name</option>
                  <option value="grade">Grade</option>
                  <option value="status">Status</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Sort Order
                </label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as any)}
                  className="h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  setFilterByStatus("all");
                  setSortBy("name");
                  setSortOrder("asc");
                }}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setShowFilter(false)}
                className="inline-flex items-center rounded-lg border border-sky-300 bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-600"
              >
                Apply filters
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </DashboardLayout>
  );
}
