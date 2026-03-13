import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademic } from "@/contexts/AcademicContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  BookOpen,
  Target,
  FileText,
  GraduationCap,
  AlertTriangle,
  Sparkles,
  Trophy,
  Rocket,
  BarChart,
  PieChart,
  ChevronDown,
  School,
  Hash,
  Activity,
  UserCircle2,
} from "lucide-react";
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Legend,
  ReferenceLine,
} from "recharts";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { firebaseDB } from "@/lib/firebase";
import { cn } from "@/lib/utils";

interface GradeSheetData {
  id: string;
  courseId: string;
  courseName: string;
  students?: StudentStats[];
  [key: string]: any;
}

interface StudentStats {
  studentId: string;
  name: string;
  total?: number;
  status: string;
  grades?: Record<
    string,
    { value?: number | null; comment?: string } | number | null | undefined
  >;
}

interface AssessmentData {
  id: string;
  name: string;
  courseId: string;
  type: string;
  maxPoints: number;
  passingScore: number;
  dueDate: string;
  status: string;
  description: string;
  createdBy: string;
  [key: string]: any;
}

interface SubmissionData {
  id: string;
  assessmentId: string;
  courseId: string;
  studentId: string;
  status?: string;
  grade?: number | null;
  submittedAt?: any;
  gradedAt?: any;
  updatedAt?: any;
  [key: string]: any;
}

interface StudentDetail {
  studentId: string;
  studentName?: string;
  average: number;
  gradeCount: number;
  details: Array<{
    sheetId: string;
    sheetTitle: string;
    grade: number;
    status: string;
  }>;
}

interface CourseStats {
  courseId: string;
  courseName: string;
  courseCode: string;
  totalStudents: number;
  averageGrade: number;
  passingCount: number;
  atRiskCount: number;
  failingCount: number;
  enrolledStudents?: string[];
  studentDetails?: StudentDetail[];
  assessmentCount?: number;
}

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const normalizeMatchText = (value: unknown): string =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const resolveCourseIdForRecord = (
  record: { courseId?: unknown; courseCode?: unknown; courseName?: unknown },
  teacherCourses: Array<{ id: string; code?: string; name?: string }>,
): string => {
  const directCourseId = String(record.courseId || "").trim();
  if (directCourseId && teacherCourses.some((course) => course.id === directCourseId)) {
    return directCourseId;
  }

  const normalizedCode = normalizeMatchText(record.courseCode);
  if (normalizedCode) {
    const codeMatch = teacherCourses.find(
      (course) => normalizeMatchText(course.code) === normalizedCode,
    );
    if (codeMatch) return codeMatch.id;
  }

  const normalizedName = normalizeMatchText(record.courseName);
  if (normalizedName) {
    const nameMatch = teacherCourses.find(
      (course) => normalizeMatchText(course.name) === normalizedName,
    );
    if (nameMatch) return nameMatch.id;
  }

  return directCourseId;
};

const resolveStudentTotal = (
  student: StudentStats,
  activities: Array<{ id?: string; maxScore?: unknown }> = [],
): { total: number | null; hasEvidence: boolean } => {
  const directTotal = toFiniteNumber(student.total);
  if (directTotal !== null) {
    return { total: clamp(directTotal, 0, 5), hasEvidence: true };
  }

  const gradeRows = student.grades || {};
  if (!gradeRows || typeof gradeRows !== "object") {
    return { total: null, hasEvidence: false };
  }

  let normalizedSum = 0;
  let gradedCount = 0;

  if (activities.length > 0) {
    activities.forEach((activity) => {
      const activityId = String(activity.id || "").trim();
      if (!activityId) return;

      const gradeRow = gradeRows[activityId];
      const rawValue =
        typeof gradeRow === "object" && gradeRow !== null
          ? toFiniteNumber((gradeRow as { value?: unknown }).value)
          : toFiniteNumber(gradeRow);

      if (rawValue === null) return;

      const maxScoreRaw = toFiniteNumber(activity.maxScore);
      const safeMax = maxScoreRaw && maxScoreRaw > 0 ? maxScoreRaw : 5;
      const normalized = clamp((clamp(rawValue, 0, safeMax) / safeMax) * 5, 0, 5);

      normalizedSum += normalized;
      gradedCount += 1;
    });
  } else {
    Object.values(gradeRows).forEach((gradeRow) => {
      const rawValue =
        typeof gradeRow === "object" && gradeRow !== null
          ? toFiniteNumber((gradeRow as { value?: unknown }).value)
          : toFiniteNumber(gradeRow);
      if (rawValue === null) return;
      normalizedSum += clamp(rawValue, 0, 5);
      gradedCount += 1;
    });
  }

  if (gradedCount === 0) {
    return { total: null, hasEvidence: false };
  }

  return {
    total: clamp(normalizedSum / gradedCount, 0, 5),
    hasEvidence: true,
  };
};

export default function StatsPage() {
  const { user } = useAuth();
  const { courses, selectedCourseId, setSelectedCourseId } = useAcademic();
  const [gradeSheets, setGradeSheets] = useState<GradeSheetData[]>([]);
  const [assessments, setAssessments] = useState<AssessmentData[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [courseStats, setCourseStats] = useState<CourseStats[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>(
    selectedCourseId || "all",
  );
  const [selectedCourseStats, setSelectedCourseStats] =
    useState<CourseStats | null>(null);
  const [selectedCourseStudents, setSelectedCourseStudents] = useState<
    StudentDetail[]
  >([]);
  const [selectedCourseAssessments, setSelectedCourseAssessments] = useState<
    AssessmentData[]
  >([]);
  const [selectedCourseGradeSheets, setSelectedCourseGradeSheets] = useState<
    GradeSheetData[]
  >([]);
  const [allStudents, setAllStudents] = useState<Map<string, string>>(
    new Map(),
  );
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");

  const teacherOwnedCourses = useMemo(
    () =>
      courses.filter(
        (course) =>
          String(course.teacherId || "").trim() === String(user?.id || "").trim(),
      ),
    [courses, user?.id],
  );

  const fetchStudentNames = async () => {
    try {
      const enrolledStudentIds = Array.from(
        new Set(
          teacherOwnedCourses.flatMap((course) =>
            (course.enrolledStudents || [])
              .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
              .filter(Boolean),
          ),
        ),
      );

      if (enrolledStudentIds.length === 0) {
        setAllStudents(new Map());
        return;
      }

      const studentDocs = await Promise.all(
        enrolledStudentIds.map((studentId) =>
          getDoc(doc(firebaseDB, "estudiantes", studentId)),
        ),
      );

      const studentMap = new Map<string, string>();
      studentDocs.forEach((studentDoc, index) => {
        const studentId = enrolledStudentIds[index];
        if (!studentDoc.exists()) {
          studentMap.set(studentId, "Unknown student");
          return;
        }
        const data = studentDoc.data();
        studentMap.set(studentId, data.name || "Unknown student");
      });

      setAllStudents(studentMap);
    } catch {}
  };

  useEffect(() => {
    fetchStudentNames();
  }, [teacherOwnedCourses]);

  useEffect(() => {
    const teacherCourses = teacherOwnedCourses;

    if (teacherCourses.length === 0) {
      setSelectedCourse("all");
      return;
    }

    const globalValid =
      selectedCourseId &&
      teacherCourses.some((course) => course.id === selectedCourseId);

    if (!globalValid) {
      if (
        selectedCourse !== "all" &&
        teacherCourses.some((course) => course.id === selectedCourse)
      ) {
        setSelectedCourseId(selectedCourse);
        return;
      }

      const fallbackCourseId = teacherCourses[0].id;
      setSelectedCourseId(fallbackCourseId);

      if (selectedCourse === "all") {
        setSelectedCourse(fallbackCourseId);
      }
      return;
    }

    if (selectedCourse === "all") return;

    if (selectedCourse !== selectedCourseId) {
      setSelectedCourse(selectedCourseId);
    }
  }, [teacherOwnedCourses, selectedCourse, selectedCourseId, setSelectedCourseId]);

  useEffect(() => {
    const fetchData = async () => {
      if (!user?.id) return;

      setLoading(true);
      try {
        const teacherCourses = teacherOwnedCourses;
        if (teacherCourses.length === 0) {
          setGradeSheets([]);
          setAssessments([]);
          setSubmissions([]);
          setCourseStats([]);
          return;
        }

        const courseIds = teacherCourses.map((course) => course.id).filter(Boolean);

        const dedupeById = <T extends { id: string }>(items: T[]): T[] => {
          const map = new Map<string, T>();
          items.forEach((item) => map.set(item.id, item));
          return Array.from(map.values());
        };

        let gradeData: GradeSheetData[] = [];
        try {
          const [gradeSnapshotsByCourse, gradeSnapshotsByTeacher] = await Promise.all([
            Promise.all(
              courseIds.map((courseId) =>
                getDocs(
                  query(
                    collection(firebaseDB, "gradeSheets"),
                    where("courseId", "==", courseId),
                  ),
                ),
              ),
            ),
            getDocs(
              query(collection(firebaseDB, "gradeSheets"), where("teacherId", "==", user.id)),
            ),
          ]);
          const gradeSnapshots = [...gradeSnapshotsByCourse, gradeSnapshotsByTeacher];
          gradeData = dedupeById(
            gradeSnapshots.flatMap((snapshot) =>
              snapshot.docs.map((doc) => {
                const data = doc.data() as GradeSheetData;
                const resolvedCourseId = resolveCourseIdForRecord(
                  {
                    courseId: data.courseId,
                    courseCode: (data as Record<string, unknown>).courseCode,
                    courseName: data.courseName,
                  },
                  teacherCourses,
                );
                return {
                  id: doc.id,
                  ...data,
                  courseId: resolvedCourseId || String(data.courseId || ""),
                };
              }) as GradeSheetData[],
            ),
          );
        } catch {
          gradeData = [];
        }
        setGradeSheets(gradeData);

        let assessmentData: AssessmentData[] = [];
        try {
          const assessmentQueryResults = await Promise.allSettled([
            ...courseIds.map((courseId) =>
              getDocs(
                query(
                  collection(firebaseDB, "assessments"),
                  where("courseId", "==", courseId),
                ),
              ),
            ),
            ...courseIds.map((courseId) =>
              getDocs(
                query(
                  collection(firebaseDB, "evaluaciones"),
                  where("courseId", "==", courseId),
                ),
              ),
            ),
          ]);

          const assessmentSnapshots = assessmentQueryResults
            .filter(
              (
                result,
              ): result is PromiseFulfilledResult<Awaited<ReturnType<typeof getDocs>>> =>
                result.status === "fulfilled",
            )
            .map((result) => result.value);

          assessmentData = dedupeById(
            assessmentSnapshots.flatMap((snapshot) =>
              snapshot.docs.map((doc) => {
                const data = doc.data() as Record<string, unknown>;
                const resolvedCourseId = resolveCourseIdForRecord(
                  {
                    courseId: data.courseId,
                    courseCode: data.courseCode,
                    courseName: data.courseName,
                  },
                  teacherCourses,
                );

                return {
                  id: doc.id,
                  ...data,
                  name: String(data.name || data.title || "Untitled assessment"),
                  type: String(data.type || data.assessmentType || "assessment"),
                  maxPoints: Number(data.maxPoints || 0),
                  passingScore: Number(data.passingScore || 0),
                  dueDate: String(data.dueDate || ""),
                  status: String(data.status || ""),
                  description: String(data.description || ""),
                  createdBy: String(data.createdBy || ""),
                  courseId: resolvedCourseId || String(data.courseId || ""),
                } as AssessmentData;
              }),
            ),
          );
        } catch {
          assessmentData = [];
        }
        setAssessments(assessmentData);

        let submissionData: SubmissionData[] = [];
        try {
          const assessmentIds = assessmentData.map((assessment) => assessment.id).filter(Boolean);
          const submissionSnapshots =
            assessmentIds.length > 0
              ? await Promise.all(
                  chunkArray(assessmentIds, 10).map((assessmentIdChunk) =>
                    getDocs(
                      query(
                        collection(firebaseDB, "submissions"),
                        where("assessmentId", "in", assessmentIdChunk),
                      ),
                    ),
                  ),
                )
              : [];
          const assessmentCourseIdById = new Map(
            assessmentData.map((assessment) => [assessment.id, assessment.courseId]),
          );
          submissionData = dedupeById(
            submissionSnapshots.flatMap((snapshot) =>
              snapshot.docs.map((doc) => {
                const data = doc.data() as SubmissionData;
                const linkedCourseId = assessmentCourseIdById.get(String(data.assessmentId || ""));
                return {
                  id: doc.id,
                  ...data,
                  courseId:
                    (linkedCourseId && String(linkedCourseId).trim()) ||
                    String(data.courseId || "").trim(),
                };
              }) as SubmissionData[],
            ),
          );
        } catch {
          submissionData = [];
        }
        setSubmissions(submissionData);

        const stats = teacherCourses.map((course) => {
          const courseSheets = gradeData.filter(
            (sheet) => sheet.courseId === course.id,
          );

          const studentScores = new Map<
            string,
            { total: number; count: number; details: any[] }
          >();

          courseSheets.forEach((sheet) => {
            if (sheet.students && Array.isArray(sheet.students)) {
              sheet.students.forEach((student: StudentStats) => {
                const studentId = String(student.studentId || "").trim();
                if (!studentId) return;

                const computed = resolveStudentTotal(
                  student,
                  (sheet.activities || []) as Array<{ id?: string; maxScore?: unknown }>,
                );
                if (!computed.hasEvidence || computed.total === null) return;

                const existing = studentScores.get(studentId) || {
                  total: 0,
                  count: 0,
                  details: [],
                };
                studentScores.set(studentId, {
                  total: existing.total + computed.total,
                  count: existing.count + 1,
                  details: [
                    ...existing.details,
                    {
                      sheetId: sheet.id,
                      sheetTitle: sheet.title,
                      grade: computed.total,
                      status: String(student.status || "graded"),
                    },
                  ],
                });
              });
            }
          });

          const totalStudents = course.enrolledStudents?.length || 0;
          let totalSum = 0;
          let passingCount = 0;
          let atRiskCount = 0;
          let failingCount = 0;
          let studentCount = 0;

          const studentDetails: StudentDetail[] = [];

          studentScores.forEach((value, studentId) => {
            const average = value.total / value.count;
            totalSum += average;
            studentCount++;

            studentDetails.push({
              studentId,
              average,
              gradeCount: value.count,
              details: value.details,
            });

            if (average >= 3.6) {
              passingCount++;
            } else if (average >= 3.0) {
              atRiskCount++;
            } else {
              failingCount++;
            }
          });

          const averageGrade = studentCount > 0 ? totalSum / studentCount : 0;

          return {
            courseId: course.id,
            courseName: course.name,
            courseCode: course.code || "N/A",
            totalStudents,
            averageGrade,
            passingCount,
            atRiskCount,
            failingCount,
            enrolledStudents: course.enrolledStudents,
            studentDetails,
            assessmentCount: assessmentData.filter(
              (a) => a.courseId === course.id,
            ).length,
          } as CourseStats;
        });

        setCourseStats(stats);
      } catch {
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, teacherOwnedCourses]);

  useEffect(() => {
    if (selectedCourse === "all" || courseStats.length === 0) return;
    const courseStillExists = courseStats.some(
      (course) => course.courseId === selectedCourse,
    );
    if (!courseStillExists) {
      setSelectedCourse("all");
    }
  }, [courseStats, selectedCourse]);

  useEffect(() => {
    if (selectedCourse && selectedCourse !== "all") {
      const stats = courseStats.find((s) => s.courseId === selectedCourse);
      setSelectedCourseStats(stats || null);

      const courseAssessments = assessments.filter(
        (a) => a.courseId === selectedCourse,
      );
      setSelectedCourseAssessments(courseAssessments);

      const courseGradeSheets = gradeSheets.filter(
        (g) => g.courseId === selectedCourse,
      );
      setSelectedCourseGradeSheets(courseGradeSheets);

      if (stats?.studentDetails) {
        setSelectedCourseStudents(stats.studentDetails);
      } else {
        setSelectedCourseStudents([]);
      }
    } else {
      setSelectedCourseStats(null);
      setSelectedCourseStudents([]);
      setSelectedCourseAssessments([]);
      setSelectedCourseGradeSheets([]);
    }
  }, [selectedCourse, courseStats, assessments, gradeSheets]);

  const averageByCoursesData = courseStats.map((s) => ({
    name: s.courseCode,
    promedio: s.averageGrade,
    cursoId: s.courseId,
  }));

  const totalPassing = courseStats.reduce((sum, s) => sum + s.passingCount, 0);
  const totalAtRisk = courseStats.reduce((sum, s) => sum + s.atRiskCount, 0);
  const totalFailing = courseStats.reduce((sum, s) => sum + s.failingCount, 0);
  const totalStudents = courseStats.reduce(
    (sum, s) => sum + s.totalStudents,
    0,
  );

  const distributionData = [
    { name: "Passing", value: totalPassing, color: "hsl(160 84% 39%)" },
    { name: "At Risk", value: totalAtRisk, color: "hsl(38 92% 50%)" },
    { name: "Failing", value: totalFailing, color: "hsl(349 89% 60%)" },
  ];

  const selectedCourseDistributionData = selectedCourseStats
    ? [
        {
          name: "Passing",
          value: selectedCourseStats.passingCount,
          color: "hsl(160 84% 39%)",
        },
        {
          name: "At Risk",
          value: selectedCourseStats.atRiskCount,
          color: "hsl(38 92% 50%)",
        },
        {
          name: "Failing",
          value: selectedCourseStats.failingCount,
          color: "hsl(349 89% 60%)",
        },
      ]
    : [];

  const distributionTotal = distributionData.reduce((sum, item) => sum + item.value, 0);
  const selectedCourseDistributionTotal = selectedCourseDistributionData.reduce(
    (sum, item) => sum + item.value,
    0,
  );

  const assessmentTypeData = selectedCourseAssessments.reduce(
    (acc, assessment) => {
      const type = assessment.type || "other";
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const assessmentTypesData = Object.entries(assessmentTypeData).map(
    ([name, value]) => ({
      name: name
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase()),
      value,
      color: getAssessmentColor(name),
    }),
  );

  function getAssessmentColor(type: string): string {
    const normalized = type.trim().toLowerCase();
    const colors: Record<string, string> = {
      homework: "hsl(198 93% 60%)",
      quiz: "hsl(262 83% 58%)",
      exam: "hsl(12 76% 61%)",
      participation: "hsl(160 84% 39%)",
      project: "hsl(38 92% 50%)",
      forum: "hsl(224 76% 48%)",
      self_evaluation: "hsl(332 84% 60%)",
      selfevaluation: "hsl(332 84% 60%)",
    };
    return colors[normalized] || "hsl(215 16% 47%)";
  }

  const studentPerformanceData = selectedCourseStudents
    .map((student) => {
      const studentName =
        allStudents.get(student.studentId) ||
        `Student ${student.studentId.substring(0, 6)}...`;

      const shortName = studentName.split(" ")[0];

      return {
        name: shortName,
        fullName: studentName,
        promedio: student.average,
        calificaciones: student.gradeCount,
        studentId: student.studentId,
      };
    })
    .sort((a, b) => b.promedio - a.promedio)
    .slice(0, 10);

  const toDate = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === "function") return value.toDate();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const selectedCourseSubmissions = useMemo(() => {
    if (selectedCourse === "all") return [];
    const selectedAssessmentIds = new Set(
      selectedCourseAssessments.map((assessment) => assessment.id),
    );
    return submissions.filter(
      (submission) =>
        submission.courseId === selectedCourse ||
        selectedAssessmentIds.has(submission.assessmentId),
    );
  }, [selectedCourse, selectedCourseAssessments, submissions]);

  const assessmentById = useMemo(() => {
    const map = new Map<string, AssessmentData>();
    assessments.forEach((assessment) => map.set(assessment.id, assessment));
    return map;
  }, [assessments]);

  const selectedCourseAssessmentById = useMemo(() => {
    const map = new Map<string, AssessmentData>();
    selectedCourseAssessments.forEach((assessment) =>
      map.set(assessment.id, assessment),
    );
    return map;
  }, [selectedCourseAssessments]);


  useEffect(() => {
    if (selectedCourseStudents.length === 0) {
      setSelectedStudentId("");
      return;
    }
    const exists = selectedCourseStudents.some(
      (student) => student.studentId === selectedStudentId,
    );
    if (!exists) {
      setSelectedStudentId(selectedCourseStudents[0].studentId);
    }
  }, [selectedCourseStudents, selectedStudentId]);

  const selectedStudentProfile = useMemo(() => {
    if (!selectedStudentId) return null;
    const detail = selectedCourseStudents.find(
      (student) => student.studentId === selectedStudentId,
    );
    if (!detail) return null;

    const name =
      allStudents.get(selectedStudentId) ||
      `Student ${selectedStudentId.substring(0, 6)}...`;
    const studentRows = selectedCourseSubmissions.filter(
      (submission) => submission.studentId === selectedStudentId,
    );
    const gradedRows = studentRows.filter((submission) => typeof submission.grade === "number");
    const onTimeCount = studentRows.filter((submission) => {
      const assessment = selectedCourseAssessmentById.get(submission.assessmentId);
      if (!assessment?.dueDate) return false;
      const submittedAt = toDate(submission.submittedAt);
      if (!submittedAt) return false;
      const due = new Date(`${assessment.dueDate}T23:59:59`);
      return submittedAt.getTime() <= due.getTime();
    }).length;

    const latestSubmission = studentRows
      .slice()
      .sort(
        (a, b) =>
          (toDate(b.submittedAt)?.getTime() || 0) -
          (toDate(a.submittedAt)?.getTime() || 0),
      )[0];

    return {
      ...detail,
      name,
      submissions: studentRows.length,
      gradedSubmissions: gradedRows.length,
      onTimeRate:
        studentRows.length > 0 ? (onTimeCount / studentRows.length) * 100 : 0,
      latestSubmissionDate: latestSubmission
        ? toDate(latestSubmission.submittedAt)
        : null,
      latestGrade:
        latestSubmission && typeof latestSubmission.grade === "number"
          ? Number(latestSubmission.grade)
          : null,
    };
  }, [
    selectedStudentId,
    selectedCourseStudents,
    allStudents,
    selectedCourseSubmissions,
    selectedCourseAssessmentById,
  ]);

  const gradeTrendData = useMemo(() => {
    if (!selectedStudentId) return [];
    const sortedAssessments = [...selectedCourseAssessments].sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    );
    return sortedAssessments
      .map((assessment) => {
      const rows = selectedCourseSubmissions.filter(
        (submission) =>
          submission.assessmentId === assessment.id &&
          submission.studentId === selectedStudentId &&
          typeof submission.grade === "number",
      );
      const latest = rows.sort(
        (a, b) =>
          (toDate(b.submittedAt)?.getTime() || 0) -
          (toDate(a.submittedAt)?.getTime() || 0),
      )[0];
      const courseRows = selectedCourseSubmissions.filter(
        (submission) =>
          submission.assessmentId === assessment.id &&
          typeof submission.grade === "number",
      );
      const courseAvg =
        courseRows.length > 0
          ? courseRows.reduce((sum, row) => sum + Number(row.grade || 0), 0) /
            courseRows.length
          : 0;

      return {
        assessmentName: assessment.name,
        shortName:
          assessment.name.length > 28
            ? `${assessment.name.slice(0, 28)}...`
            : assessment.name,
        studentGrade:
          latest && typeof latest.grade === "number" ? Number(latest.grade) : null,
        courseAverage: courseAvg > 0 ? courseAvg : null,
      };
      })
      .filter(
        (item) => item.studentGrade !== null || item.courseAverage !== null,
      );
  }, [selectedStudentId, selectedCourseAssessments, selectedCourseSubmissions]);

  const gradeTrendSummary = useMemo(() => {
    if (gradeTrendData.length === 0) {
      return {
        items: 0,
        studentAvg: 0,
        courseAvg: 0,
        deltaAvg: 0,
      };
    }

    const studentRows = gradeTrendData.filter(
      (item) => typeof item.studentGrade === "number",
    );
    const courseRows = gradeTrendData.filter(
      (item) => typeof item.courseAverage === "number",
    );
    const pairedRows = gradeTrendData.filter(
      (item) =>
        typeof item.studentGrade === "number" &&
        typeof item.courseAverage === "number",
    );

    const studentAvg =
      studentRows.length > 0
        ? studentRows.reduce(
            (sum, item) => sum + Number(item.studentGrade || 0),
            0,
          ) / studentRows.length
        : 0;

    const courseAvg =
      courseRows.length > 0
        ? courseRows.reduce(
            (sum, item) => sum + Number(item.courseAverage || 0),
            0,
          ) / courseRows.length
        : 0;

    const deltaAvg =
      pairedRows.length > 0
        ? pairedRows.reduce(
            (sum, item) =>
              sum + Number(item.studentGrade || 0) - Number(item.courseAverage || 0),
            0,
          ) / pairedRows.length
        : 0;

    return {
      items: gradeTrendData.length,
      studentAvg,
      courseAvg,
      deltaAvg,
    };
  }, [gradeTrendData]);

  const gradeOverviewData = useMemo(() => {
    if (gradeTrendSummary.items === 0) return [];
    return [
      {
        label: "General Average",
        studentAvg: gradeTrendSummary.studentAvg,
        courseAvg: gradeTrendSummary.courseAvg,
      },
    ];
  }, [gradeTrendSummary]);


  const overallAverage =
    courseStats.length > 0
      ? courseStats.reduce((sum, s) => sum + s.averageGrade, 0) /
        courseStats.length
      : 0;

  const approvalRate =
    totalStudents > 0 ? (totalPassing / totalStudents) * 100 : 0;

  const formatGrade = (grade: number): string => {
    const truncated = Math.trunc(grade * 10) / 10;
    return truncated.toFixed(1);
  };

  const getGradeColor = (grade: number): string => {
    if (grade >= 3.6) return "text-emerald-600";
    if (grade >= 3.0) return "text-amber-600";
    return "text-rose-600";
  };

  const getGradeStatus = (grade: number): string => {
    if (grade >= 3.6) return "Passing";
    if (grade >= 3.0) return "At Risk";
    return "Failing";
  };

  const selectedCourseMeta =
    selectedCourse !== "all"
      ? courses.find((course) => course.id === selectedCourse) || null
      : null;

  const selectedCourseApprovalRate =
    selectedCourseStats && selectedCourseStats.totalStudents > 0
      ? (selectedCourseStats.passingCount / selectedCourseStats.totalStudents) * 100
      : 0;

  const scopedStudents = selectedCourseStats
    ? selectedCourseStats.totalStudents
    : totalStudents;
  const scopedAverage = selectedCourseStats
    ? selectedCourseStats.averageGrade
    : overallAverage;
  const scopedAssessments = selectedCourseStats
    ? selectedCourseAssessments.length
    : assessments.length;
  const scopedGradeSheets = selectedCourseStats
    ? selectedCourseGradeSheets.length
    : gradeSheets.length;

  if (user?.role !== "docente") {
    return (
      <DashboardLayout contentClassName="pt-0 lg:pt-1">
        <div className="relative overflow-x-hidden">
          <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
          <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />
          <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
            <div className="flex min-h-[400px] items-center justify-center">
              <div className="text-center">
                <div className="h-20 w-20 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <AlertTriangle className="h-10 w-10 text-slate-400" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">
                  Restricted access
                </h3>
                <p className="text-slate-600 max-w-md mx-auto">
                  This page is only available to users with the teacher role.
                </p>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (loading) {
    return (
      <DashboardLayout contentClassName="pt-0 lg:pt-1">
        <div className="relative overflow-x-hidden">
          <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
          <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />
          <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
            <div className="flex min-h-[400px] items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto"></div>
                <div className="space-y-2">
                  <p className="text-lg font-semibold text-slate-900">
                    Analyzing academic data
                  </p>
                  <p className="text-xs text-slate-600">
                    Processing {assessments.length} assessments and{" "}
                    {gradeSheets.length} grade sheets
                  </p>
                </div>
              </div>
            </div>
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

        <div className="relative flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">

          <div className="flex flex-col gap-3">
            <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-3 sm:p-4 shadow-sm">
              <div className="pointer-events-none absolute -left-[70px] -top-[90px] h-[180px] w-[180px] rounded-full bg-sky-300/25" />
              <div className="pointer-events-none absolute -right-[90px] -bottom-[90px] h-[200px] w-[200px] rounded-full bg-violet-300/20" />

              <div className="relative z-10 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                    <Sparkles className="h-3.5 w-3.5" />
                    Analytics Workspace
                  </div>
                  <h2 className="mt-3 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                    {selectedCourse === "all"
                      ? "Academic Statistics Center"
                      : selectedCourseStats?.courseName || "Course Statistics"}
                  </h2>
                  <p className="mt-1.5 text-xs text-slate-600">
                    {selectedCourse === "all"
                      ? `Track performance across ${courseStats.length} courses with real-time grade, status and trend analytics.`
                      : `${selectedCourseStats?.courseCode || selectedCourseMeta?.code || "Course"} performance overview with students, assessments and grading trends.`}
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                    <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5">
                      <p className="text-[11px] font-semibold leading-4 text-slate-500">Students</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                          <Users className="h-3.5 w-3.5" />
                        </span>
                        <p className="text-lg font-extrabold leading-5 text-slate-900">{scopedStudents}</p>
                      </div>
                    </div>
                    <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5">
                      <p className="text-[11px] font-semibold leading-4 text-slate-500">Average</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                          <Trophy className="h-3.5 w-3.5" />
                        </span>
                        <p className="text-lg font-extrabold leading-5 text-slate-900">
                          {formatGrade(scopedAverage)} <span className="text-xs font-semibold text-slate-500">/5.0</span>
                        </p>
                      </div>
                    </div>
                    <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5">
                      <p className="text-[11px] font-semibold leading-4 text-slate-500">Assessments</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                          <FileText className="h-3.5 w-3.5" />
                        </span>
                        <p className="text-lg font-extrabold leading-5 text-slate-900">{scopedAssessments}</p>
                      </div>
                    </div>
                    <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5">
                      <p className="text-[11px] font-semibold leading-4 text-slate-500">Grade Sheets</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                          <BookOpen className="h-3.5 w-3.5" />
                        </span>
                        <p className="text-lg font-extrabold leading-5 text-slate-900">{scopedGradeSheets}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <aside className="rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">Scope</p>
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {selectedCourse === "all"
                        ? `${courseStats.length} courses`
                        : selectedCourseStats?.courseCode || selectedCourseMeta?.code || "Course"}
                    </span>
                  </div>
                  <div className="relative">
                    <School className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <select
                      value={selectedCourse}
                      onChange={(e) => {
                        const nextCourse = e.target.value;
                        setSelectedCourse(nextCourse);
                        if (nextCourse !== "all") {
                          setSelectedCourseId(nextCourse);
                        }
                      }}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-300 bg-white pl-9 pr-9 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    >
                      <option value="all">All courses</option>
                      {courseStats.map((course) => (
                        <option key={course.courseId} value={course.courseId}>
                          {course.courseCode} - {course.courseName}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Passing</p>
                      <p className="mt-1 text-base font-extrabold leading-none text-emerald-700">
                        {selectedCourseStats ? selectedCourseStats.passingCount : totalPassing}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Approval</p>
                      <p className="mt-1 text-base font-extrabold leading-none text-sky-700">
                        {(selectedCourseStats ? selectedCourseApprovalRate : approvalRate).toFixed(0)}%
                      </p>
                    </div>
                  </div>
                </aside>
              </div>
            </section>

        {selectedCourse !== "all" && selectedCourseStats && (
          <>
            <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Code</p>
                    <p className="mt-1 text-base font-bold text-slate-900">{selectedCourseStats.courseCode}</p>
                  </div>
                  <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                    <Hash className="h-4 w-4" />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm sm:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Passing</p>
                    <p className="mt-1 text-base font-bold text-emerald-800">{selectedCourseStats.passingCount}</p>
                  </div>
                  <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/90 text-emerald-700">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 shadow-sm sm:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">At Risk</p>
                    <p className="mt-1 text-base font-bold text-amber-800">{selectedCourseStats.atRiskCount}</p>
                  </div>
                  <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/90 text-amber-700">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 shadow-sm sm:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Failing</p>
                    <p className="mt-1 text-base font-bold text-rose-800">{selectedCourseStats.failingCount}</p>
                  </div>
                  <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/90 text-rose-700">
                    <TrendingDown className="h-4 w-4" />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 shadow-sm sm:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Approval</p>
                    <p className="mt-1 text-base font-bold text-sky-800">{selectedCourseApprovalRate.toFixed(0)}%</p>
                  </div>
                  <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/90 text-sky-700">
                    <Target className="h-4 w-4" />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
                      <PieChart className="h-5 w-5 text-slate-700" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Course Distribution
                      </h3>
                      <p className="text-xs text-slate-600">
                        Students' academic status
                      </p>
                    </div>
                  </div>
                  <Users className="h-5 w-5 text-slate-500" />
                </div>

                {selectedCourseDistributionTotal > 0 ? (
                  <div className="h-[250px] lg:h-[270px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={selectedCourseDistributionData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={2}
                          dataKey="value"
                          label={({ name, percent }) =>
                            `${name}: ${(percent * 100).toFixed(0)}%`
                          }
                          labelLine={false}
                        >
                          {selectedCourseDistributionData.map(
                            (entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ),
                          )}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "white",
                            border: "1px solid hsl(214 32% 91%)",
                            borderRadius: "0.75rem",
                            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                          }}
                          formatter={(value) => [`${value} students`, "Count"]}
                        />
                        <Legend
                          verticalAlign="bottom"
                          height={36}
                          formatter={(value, entry, index) => {
                            const data = selectedCourseDistributionData[index];
                            return (
                              <span className="text-sm font-medium text-slate-700">
                                {value}{" "}
                                <span className="text-slate-500">
                                  ({data?.value || 0})
                                </span>
                              </span>
                            );
                          }}
                        />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[250px] lg:h-[270px] text-slate-500">
                    <div className="h-20 w-20 mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
                      <Users className="h-10 w-10 text-slate-400" />
                    </div>
                    <p className="font-medium text-slate-900">No student data</p>
                    <p className="text-xs text-slate-600">
                      No grades recorded for this course
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-violet-100 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-violet-700" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Assessments by Type
                      </h3>
                      <p className="text-xs text-slate-600">
                        Activity distribution by category
                      </p>
                    </div>
                  </div>
                  <Target className="h-5 w-5 text-violet-500" />
                </div>

                {assessmentTypesData.length > 0 ? (
                  <div className="h-[250px] lg:h-[270px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={assessmentTypesData}
                          cx="50%"
                          cy="50%"
                          innerRadius={70}
                          outerRadius={102}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {assessmentTypesData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "white",
                            border: "1px solid hsl(214 32% 91%)",
                            borderRadius: "0.75rem",
                            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                          }}
                          formatter={(value, _name, props) => {
                            const percent = props.payload?.percent;
                            const label =
                              typeof percent === "number"
                                ? `${value} (${Math.round(percent * 100)}%)`
                                : String(value);
                            return [label, "Assessments"];
                          }}
                        />
                        <Legend
                          verticalAlign="bottom"
                          height={44}
                          formatter={(value) => (
                            <span className="text-xs font-semibold text-slate-600">{value}</span>
                          )}
                        />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[250px] lg:h-[270px] text-slate-500">
                    <FileText className="h-12 w-12 text-slate-400 mb-4" />
                    <p className="font-medium text-slate-900">
                      No assessments recorded
                    </p>
                    <p className="text-xs text-slate-600">
                      Create assessments to see type-based stats
                    </p>
                  </div>
                )}
              </div>
            </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                      <BarChart className="h-5 w-5 text-indigo-700" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Student Performance
                    </h3>
                    <p className="text-xs text-slate-600">
                      Top 10 students in the course
                    </p>
                  </div>
                </div>
                <GraduationCap className="h-5 w-5 text-indigo-500" />
              </div>

              {studentPerformanceData.length > 0 ? (
                <div className="h-[250px] lg:h-[270px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart data={studentPerformanceData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(214 32% 91%)"
                      />
                      <XAxis
                        dataKey="name"
                        stroke="hsl(215 16% 47%)"
                        fontSize={12}
                      />
                      <YAxis
                        domain={[0, 5]}
                        stroke="hsl(215 16% 47%)"
                        fontSize={12}
                        label={{
                          value: "Average",
                          angle: -90,
                          position: "insideLeft",
                          offset: -5,
                          style: { fill: "hsl(215 16% 47%)" },
                        }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "white",
                          border: "1px solid hsl(214 32% 91%)",
                          borderRadius: "0.75rem",
                          boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                        }}
                        formatter={(value, _name, props) => {
                          const numeric =
                            typeof value === "number" ? value : Number(value);
                          return [
                            Number.isFinite(numeric)
                              ? `${numeric.toFixed(2)} / 5.0`
                              : String(value),
                            `${props.payload.fullName || props.payload.name}`,
                          ];
                        }}
                        labelFormatter={() => "Student"}
                      />
                      <Bar
                        dataKey="promedio"
                        fill="url(#colorStudentPerformance)"
                        radius={[8, 8, 0, 0]}
                        name="Average"
                      />
                      <defs>
                        <linearGradient
                          id="colorStudentPerformance"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="hsl(224 76% 48%)"
                            stopOpacity={0.8}
                          />
                          <stop
                            offset="95%"
                            stopColor="hsl(198 93% 60%)"
                            stopOpacity={0.8}
                          />
                        </linearGradient>
                      </defs>
                    </RechartsBarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[250px] lg:h-[270px] text-slate-500">
                  <div className="h-20 w-20 mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
                    <GraduationCap className="h-10 w-10 text-slate-400" />
                  </div>
                  <p className="font-medium text-slate-900">
                    No performance data
                  </p>
                  <p className="text-xs text-slate-600">No grades recorded</p>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:gap-5">
                <section className="space-y-3 xl:border-r xl:border-slate-200 xl:pr-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-cyan-100 flex items-center justify-center">
                        <Activity className="h-4.5 w-4.5 text-cyan-700" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-900">
                          Grade Trend by Student
                        </h3>
                        <p className="text-xs text-slate-600">
                          Compare selected student against course average
                        </p>
                      </div>
                    </div>
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="min-h-[2.25rem] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 sm:w-auto"
                    >
                      {selectedCourseStudents.map((student) => (
                        <option key={student.studentId} value={student.studentId}>
                          {allStudents.get(student.studentId) ||
                            `Student ${student.studentId.slice(0, 6)}...`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {gradeTrendData.length > 0 ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Items</p>
                          <p className="mt-1 text-base font-bold text-slate-900">{gradeTrendSummary.items}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Student Avg</p>
                          <p className="mt-1 text-base font-bold text-cyan-700">{gradeTrendSummary.studentAvg.toFixed(2)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Course Avg</p>
                          <p className="mt-1 text-base font-bold text-indigo-700">{gradeTrendSummary.courseAvg.toFixed(2)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Delta</p>
                          <p
                            className={cn(
                              "mt-1 text-base font-bold",
                              gradeTrendSummary.deltaAvg >= 0
                                ? "text-emerald-700"
                                : "text-rose-700",
                            )}
                          >
                            {gradeTrendSummary.deltaAvg >= 0 ? "+" : ""}
                            {gradeTrendSummary.deltaAvg.toFixed(2)}
                          </p>
                        </div>
                      </div>

                      <div className="h-[210px] lg:h-[230px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsBarChart
                            data={gradeOverviewData}
                            margin={{ top: 8, right: 18, bottom: 4, left: 0 }}
                            barGap={10}
                            barCategoryGap="36%"
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 24% 84%)" />
                            <XAxis
                              dataKey="label"
                              stroke="hsl(215 16% 47%)"
                              fontSize={11}
                              tickLine={false}
                              axisLine={false}
                            />
                            <YAxis
                              domain={[0, 5]}
                              ticks={[0, 1, 2, 3, 4, 5]}
                              stroke="hsl(215 16% 47%)"
                              fontSize={11}
                              tickLine={false}
                              axisLine={false}
                            />
                            <ReferenceLine y={3.6} stroke="hsl(160 84% 39%)" strokeDasharray="6 4" />
                            <ReferenceLine y={3} stroke="hsl(38 92% 50%)" strokeDasharray="6 4" />
                            <Tooltip
                              cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
                              contentStyle={{
                                backgroundColor: "white",
                                border: "1px solid hsl(214 32% 91%)",
                                borderRadius: "0.75rem",
                              }}
                              labelFormatter={(value) => String(value)}
                              formatter={(value, name) => {
                                const numeric =
                                  typeof value === "number" ? value : Number(value);
                                const formatted = Number.isFinite(numeric)
                                  ? `${numeric.toFixed(2)} / 5.0`
                                  : String(value);
                                return [
                                  formatted,
                                  name === "studentGrade"
                                    ? "Selected Student"
                                    : "Course Average",
                                ];
                              }}
                            />
                            <Legend
                              formatter={(value) => (
                                <span className="text-xs font-semibold text-slate-600">{value}</span>
                              )}
                            />
                            <Bar
                              dataKey="studentAvg"
                              name="Selected Student"
                              fill="hsl(198 93% 60%)"
                              radius={[6, 6, 0, 0]}
                              barSize={26}
                            />
                            <Bar
                              dataKey="courseAvg"
                              name="Course Average"
                              fill="hsl(224 76% 48%)"
                              radius={[6, 6, 0, 0]}
                              barSize={26}
                            />
                          </RechartsBarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
                      <p className="text-sm font-semibold text-slate-700">No trend data available yet.</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Add graded submissions to compare student and course performance.
                      </p>
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center">
                      <UserCircle2 className="h-4.5 w-4.5 text-amber-700" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Student Profile
                      </h3>
                      <p className="text-xs text-slate-600">Drill-down details</p>
                    </div>
                  </div>

                  {selectedStudentProfile ? (
                    <div className="space-y-2.5">
                      <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                        <p className="text-sm text-sky-700">Student</p>
                        <p className="font-bold text-slate-900">{selectedStudentProfile.name}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                          <p className="text-xs text-slate-500">Average</p>
                          <p className="text-[1.7rem] leading-tight font-bold">{selectedStudentProfile.average.toFixed(2)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                          <p className="text-xs text-slate-500">On-time Rate</p>
                          <p className="text-[1.7rem] leading-tight font-bold">{selectedStudentProfile.onTimeRate.toFixed(0)}%</p>
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                        <p className="text-xs text-slate-500">Submissions</p>
                        <p className="text-[1.7rem] leading-tight font-bold">
                          {selectedStudentProfile.gradedSubmissions}/{selectedStudentProfile.submissions}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                          <p className="text-xs text-slate-500">Last Submission</p>
                          <p className="text-sm font-semibold text-slate-900">
                            {selectedStudentProfile.latestSubmissionDate
                              ? selectedStudentProfile.latestSubmissionDate.toLocaleDateString(
                                  "en-US",
                                  {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  },
                                )
                              : "No submissions"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                          <p className="text-xs text-slate-500">Latest Grade</p>
                          <p className="text-sm font-semibold text-slate-900">
                            {typeof selectedStudentProfile.latestGrade === "number"
                              ? `${selectedStudentProfile.latestGrade.toFixed(2)} / 5.0`
                              : "Ungraded"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Select a student to open profile details.</p>
                  )}
                </section>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
                    <Users className="h-5 w-5 text-slate-700" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Course Students
                    </h3>
                    <p className="text-xs text-slate-600">
                      Individual performance details
                    </p>
                  </div>
                </div>
                <span className="text-sm font-medium text-slate-600">
                  {selectedCourseStudents.length} students with grades
                </span>
              </div>

              {selectedCourseStudents.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-[740px] w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="py-2.5 px-4 text-left font-bold text-slate-900">
                          Student ID
                        </th>
                        <th className="py-2.5 px-4 text-left font-bold text-slate-900">
                          Average
                        </th>
                        <th className="py-2.5 px-4 text-left font-bold text-slate-900">
                          Status
                        </th>
                        <th className="py-2.5 px-4 text-left font-bold text-slate-900">
                          Grades
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCourseStudents.map((student) => (
                        <tr
                          key={student.studentId}
                          onClick={() => setSelectedStudentId(student.studentId)}
                          className={cn(
                            "hover:bg-slate-50 cursor-pointer",
                            selectedStudentId === student.studentId &&
                              "bg-sky-50/40",
                          )}
                        >
                          <td className="py-2.5 px-4">
                            <div className="font-medium text-slate-900">
                              {allStudents.get(student.studentId) ||
                                student.studentId.substring(0, 12) + "..."}
                            </div>
                          </td>
                          <td className="py-2.5 px-4">
                            <div
                              className={`text-lg font-bold ${getGradeColor(student.average)}`}
                            >
                              {formatGrade(student.average)} / 5.0
                            </div>
                          </td>
                          <td className="py-2.5 px-4">
                            <span
                              className={cn(
                                "inline-flex px-3 py-1 rounded-full text-xs font-bold",
                                student.average >= 3.6
                                  ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                  : student.average >= 3.0
                                    ? "bg-amber-100 text-amber-700 border border-amber-200"
                                    : "bg-rose-100 text-rose-700 border border-rose-200",
                              )}
                            >
                              {getGradeStatus(student.average)}
                            </span>
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="text-center">
                              <span className="font-bold text-slate-900">
                                {student.gradeCount}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <Users className="h-12 w-12 text-slate-400 mb-4" />
                  <p className="font-medium text-slate-900">
                    No students with grades
                  </p>
                  <p className="text-xs text-slate-600">
                    Record grades to view detailed statistics
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {selectedCourse === "all" && (
          <>
            <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold mb-1 text-center md:text-left text-slate-500 tracking-wide">
                      Active Courses
                    </p>
                    <p className="text-xl md:text-xl font-bold text-slate-900 text-center md:text-left">
                      {courseStats.length}
                    </p>
                    <p className="text-xs text-slate-600 mt-1 hidden md:block">
                      {courses.find((c) => c.code === "ENG-A1")?.name ||
                        "English"}{" "}
                      and more
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-sky-100 flex items-center justify-center">
                    <BookOpen className="h-5 w-5 text-sky-700" />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold mb-1 text-center md:text-left text-slate-500 tracking-wide">
                      Total Students
                    </p>
                    <p className="text-xl md:text-xl font-bold text-slate-900 text-center md:text-left">
                      {totalStudents}
                    </p>
                    <p className="text-xs text-slate-600 mt-1 hidden md:block">
                      {courseStats.find((c) => c.courseCode === "ENG-A1")
                        ?.totalStudents || 0}{" "}
                      in the primary course
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                    <Users className="h-5 w-5 text-indigo-700" />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold mb-1 text-center md:text-left text-slate-500 tracking-wide">
                      Overall Average
                    </p>
                    <p className="text-xl md:text-xl font-bold text-slate-900 text-center md:text-left">
                      {overallAverage.toFixed(2)} / 5.0
                    </p>
                    <p className="text-xs text-slate-600 mt-1 hidden md:block">
                      {formatGrade(overallAverage)} overall average
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
                    <Trophy className="h-5 w-5 text-amber-700" />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold mb-1 text-center md:text-left text-slate-500 tracking-wide">
                      Passing Rate
                    </p>
                    <p className="text-xl md:text-xl font-bold text-slate-900 text-center md:text-left">
                      {approvalRate.toFixed(0)}%
                    </p>
                    <p className="text-xs text-slate-600 mt-1 hidden md:block">
                      {totalPassing} of {totalStudents} students
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                    {approvalRate >= 70 ? (
                      <TrendingUp className="h-5 w-5 text-emerald-700" />
                    ) : (
                      <TrendingDown className="h-5 w-5 text-amber-700" />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
                      <BarChart className="h-5 w-5 text-slate-700" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Average by Course
                      </h3>
                      <p className="text-xs text-slate-600">
                        Academic performance comparison
                      </p>
                    </div>
                  </div>
                  <Sparkles className="h-5 w-5 text-slate-500 hidden lg:block" />
                </div>

                {averageByCoursesData.length > 0 ? (
                  <div className="h-[250px] lg:h-[270px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsBarChart data={averageByCoursesData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="hsl(214 32% 91%)"
                        />
                        <XAxis
                          dataKey="name"
                          stroke="hsl(215 16% 47%)"
                          fontSize={12}
                        />
                        <YAxis
                          domain={[0, 5]}
                          stroke="hsl(215 16% 47%)"
                          fontSize={12}
                          label={{
                            value: "Average",
                            angle: -90,
                            position: "insideLeft",
                            offset: -5,
                            style: { fill: "hsl(215 16% 47%)" },
                          }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "white",
                            border: "1px solid hsl(214 32% 91%)",
                            borderRadius: "0.75rem",
                            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                          }}
                          formatter={(value) => [
                            `${Number(value).toFixed(2)} / 5.0`,
                            "Average",
                          ]}
                        />
                        <Bar
                          dataKey="promedio"
                          fill="url(#colorPromedio)"
                          radius={[8, 8, 0, 0]}
                          name="Average"
                        />
                        <defs>
                          <linearGradient
                            id="colorPromedio"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="hsl(217 91% 60%)"
                              stopOpacity={0.8}
                            />
                            <stop
                              offset="95%"
                              stopColor="hsl(215 20% 65%)"
                              stopOpacity={0.8}
                            />
                          </linearGradient>
                        </defs>
                      </RechartsBarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[250px] lg:h-[270px] text-slate-500">
                    <div className="h-20 w-20 mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
                      <BarChart3 className="h-10 w-10 text-slate-400" />
                    </div>
                    <p className="font-medium text-slate-900">No course data</p>
                    <p className="text-xs text-slate-600">
                      Create assessments to see statistics
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
                      <PieChart className="h-5 w-5 text-slate-700" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Student Distribution
                      </h3>
                      <p className="text-xs text-slate-600">
                        Overall academic status
                      </p>
                    </div>
                  </div>
                  <Users className="h-5 w-5 text-slate-500 hidden lg:block" />
                </div>

                {distributionTotal > 0 ? (
                  <div className="h-[250px] lg:h-[270px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={distributionData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={2}
                          dataKey="value"
                          label={({ name, percent }) =>
                            `${name}: ${(percent * 100).toFixed(0)}%`
                          }
                          labelLine={false}
                        >
                          {distributionData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "white",
                            border: "1px solid hsl(214 32% 91%)",
                            borderRadius: "0.75rem",
                            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                          }}
                          formatter={(value, _name, props) => [
                            `${value} students`,
                            props.payload.name,
                          ]}
                        />
                        <Legend
                          verticalAlign="bottom"
                          height={36}
                          formatter={(value, _entry, index) => {
                            const data = distributionData[index];
                            return (
                              <span className="text-sm font-medium text-slate-700">
                                {value}{" "}
                                <span className="text-slate-500">
                                  ({data?.value || 0})
                                </span>
                              </span>
                            );
                          }}
                        />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[250px] lg:h-[270px] text-slate-500">
                    <div className="h-20 w-20 mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
                      <Users className="h-10 w-10 text-slate-400" />
                    </div>
                    <p className="font-medium text-slate-900">No student data</p>
                    <p className="text-xs text-slate-600">No grades recorded</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {selectedCourse === "all" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-slate-700" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Course Breakdown
                  </h3>
                  <p className="text-xs text-slate-600">
                    Full statistics per subject
                  </p>
                </div>
              </div>
              <Rocket className="h-5 w-5 text-slate-500 hidden lg:block" />
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-[980px] w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="py-3 px-4 text-left font-bold text-slate-900 tracking-wide">
                      Course
                    </th>
                    <th className="py-3 px-4 text-left font-bold text-slate-900 tracking-wide">
                      Students
                    </th>
                    <th className="py-3 px-4 text-left font-bold text-slate-900 tracking-wide">
                      Average
                    </th>
                    <th className="py-3 px-4 text-left font-bold text-slate-900 tracking-wide">
                      Passing
                    </th>
                    <th className="py-3 px-4 text-left font-bold text-slate-900 tracking-wide">
                      At Risk
                    </th>
                    <th className="py-3 px-4 text-left font-bold text-slate-900 tracking-wide">
                      Failing
                    </th>
                    <th className="py-3 px-4 text-left font-bold text-slate-900 tracking-wide">
                      Passing Rate
                    </th>
                    <th className="py-3 px-4 text-left font-bold text-slate-900 tracking-wide">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {courseStats.map((stat) => {
                    const approvalRate =
                      stat.totalStudents > 0
                        ? (stat.passingCount / stat.totalStudents) * 100
                        : 0;

                    return (
                      <tr
                        key={stat.courseId}
                        className="hover:bg-slate-50"
                      >
                        <td className="py-3 px-4">
                          <div>
                            <p className="font-medium text-slate-900">
                              {stat.courseName}
                            </p>
                            <p className="text-sm text-slate-500">
                              {stat.courseCode}
                            </p>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-center">
                            <span className="font-bold text-slate-900">
                              {stat.totalStudents}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-center">
                            <span
                              className={cn(
                                "text-lg font-bold",
                                stat.averageGrade >= 3.6
                                  ? "text-emerald-600"
                                  : stat.averageGrade >= 3.0
                                    ? "text-amber-600"
                                    : "text-rose-600",
                              )}
                            >
                              {formatGrade(stat.averageGrade)} / 5.0
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-center">
                            <span className="font-bold text-emerald-700">
                              {stat.passingCount}
                            </span>
                            <div className="text-xs text-slate-500">
                              (
                              {stat.totalStudents > 0
                                ? (
                                    (stat.passingCount / stat.totalStudents) *
                                    100
                                  ).toFixed(0)
                                : 0}
                              %)
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-center">
                            <span className="font-bold text-amber-700">
                              {stat.atRiskCount}
                            </span>
                            <div className="text-xs text-slate-500">
                              (
                              {stat.totalStudents > 0
                                ? (
                                    (stat.atRiskCount / stat.totalStudents) *
                                    100
                                  ).toFixed(0)
                                : 0}
                              %)
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-center">
                            <span className="font-bold text-rose-700">
                              {stat.failingCount}
                            </span>
                            <div className="text-xs text-slate-500">
                              (
                              {stat.totalStudents > 0
                                ? (
                                    (stat.failingCount / stat.totalStudents) *
                                    100
                                  ).toFixed(0)
                                : 0}
                              %)
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-center gap-2">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-20 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full transition-all duration-500",
                                    approvalRate >= 70
                                      ? "bg-emerald-500"
                                      : approvalRate >= 50
                                        ? "bg-amber-500"
                                        : "bg-rose-500",
                                  )}
                                  style={{
                                    width: `${Math.min(approvalRate, 100)}%`,
                                  }}
                                />
                              </div>
                              <span
                                className={cn(
                                  "font-bold text-sm",
                                  approvalRate >= 70
                                    ? "text-emerald-600"
                                    : approvalRate >= 50
                                      ? "text-amber-600"
                                      : "text-rose-600",
                                )}
                              >
                                {approvalRate.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => {
                              setSelectedCourse(stat.courseId);
                              setSelectedCourseId(stat.courseId);
                            }}
                            className="whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
