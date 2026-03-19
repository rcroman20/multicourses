import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileSpreadsheet,
  GraduationCap,
  Loader2,
  School,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { firebaseDB } from "@/lib/firebase";
import {
  getInstitutionDashboardData,
  type InstitutionDashboardData,
} from "@/lib/services/institutionService";
import { cn } from "@/lib/utils";

type InstitutionGradeSheet = {
  id: string;
  courseId: string;
  courseName: string;
  title: string;
  isPublished: boolean;
  weightPercentage: number;
  updatedAt: Date | null;
  students: Array<{
    studentId: string;
    total: number | null;
    status: string;
  }>;
};

type InstitutionAssessment = {
  id: string;
  courseId: string;
  name: string;
  type: string;
  status: string;
  dueDate: Date | null;
};

type InstitutionSubmission = {
  id: string;
  assessmentId: string;
  courseId: string;
  studentId: string;
  status: string;
  grade: number | null;
};

const chunkValues = <T,>(items: T[], size = 10): T[][] => {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
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
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const dedupeById = <T extends { id: string }>(items: T[]): T[] =>
  Array.from(new Map(items.map((item) => [item.id, item])).values());

const formatCompactDate = (value: Date | null): string =>
  value
    ? value.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "No date";

const formatDueLabel = (value: Date | null): string => {
  if (!value) return "No due date";
  const diffMs = value.getTime() - Date.now();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  return `In ${diffDays}d`;
};

const getReadableAnalyticsError = (error: unknown): string => {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? String((error as { code: string }).code).toLowerCase()
      : "";
  const message =
    error instanceof Error && error.message.trim().length > 0
      ? error.message.trim()
      : "";

  if (code.includes("permission-denied") || /insufficient permissions/i.test(message)) {
    return "The institution can load the dashboard, but one or more academic collections are still blocked for this account. Refresh after deploying the latest Firestore rules, or verify that the selected courses belong to this institution.";
  }

  return message || "Could not load institution analytics.";
};

export default function InstitutionAnalyticsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dashboardData, setDashboardData] = useState<InstitutionDashboardData | null>(null);
  const [gradeSheets, setGradeSheets] = useState<InstitutionGradeSheet[]>([]);
  const [assessments, setAssessments] = useState<InstitutionAssessment[]>([]);
  const [submissions, setSubmissions] = useState<InstitutionSubmission[]>([]);

  useEffect(() => {
    if (!user || user.role !== "institucion") return;

    let cancelled = false;

    const loadAnalytics = async () => {
      setLoading(true);
      setError("");
      setWarnings([]);

      try {
        const data = await getInstitutionDashboardData(user);
        const courseIds = data.courses.map((course) => course.id).filter(Boolean);

        const nextWarnings: string[] = [];

        const loadedGradeSheets =
          courseIds.length > 0
            ? await (async () => {
                try {
                  const snapshots = await Promise.all(
                    chunkValues(courseIds).map((chunk) =>
                      getDocs(
                        query(collection(firebaseDB, "gradeSheets"), where("courseId", "in", chunk)),
                      ),
                    ),
                  );

                  return dedupeById(
                    snapshots.flatMap((snapshot) =>
                      snapshot.docs.map((docSnap) => {
                        const raw = docSnap.data() as Record<string, unknown>;
                        const rawStudents = Array.isArray(raw.students) ? raw.students : [];
                        return {
                          id: docSnap.id,
                          courseId: String(raw.courseId || "").trim(),
                          courseName: String(raw.courseName || "Course").trim(),
                          title: String(raw.title || "Grade sheet").trim(),
                          isPublished: Boolean(raw.isPublished),
                          weightPercentage: toFiniteNumber(raw.weightPercentage) ?? 0,
                          updatedAt: toDate(raw.updatedAt || raw.createdAt),
                          students: rawStudents
                            .filter(
                              (entry): entry is Record<string, unknown> =>
                                Boolean(entry && typeof entry === "object"),
                            )
                            .map((entry) => ({
                              studentId: String(entry.studentId || entry.userId || entry.id || "").trim(),
                              total: toFiniteNumber(entry.total),
                              status: String(entry.status || "pending").trim(),
                            })),
                        } satisfies InstitutionGradeSheet;
                      }),
                    ),
                  );
                } catch (collectionError) {
                  nextWarnings.push(
                    `Grade sheets are temporarily unavailable: ${getReadableAnalyticsError(collectionError)}`,
                  );
                  return [];
                }
              })()
            : [];

        const loadedAssessments =
          courseIds.length > 0
            ? await (async () => {
                try {
                  const snapshots = await Promise.all(
                    chunkValues(courseIds).map((chunk) =>
                      getDocs(
                        query(collection(firebaseDB, "assessments"), where("courseId", "in", chunk)),
                      ),
                    ),
                  );

                  return dedupeById(
                    snapshots.flatMap((snapshot) =>
                      snapshot.docs.map((docSnap) => {
                        const raw = docSnap.data() as Record<string, unknown>;
                        return {
                          id: docSnap.id,
                          courseId: String(raw.courseId || "").trim(),
                          name: String(raw.name || raw.title || "Assessment").trim(),
                          type: String(raw.type || raw.assessmentType || "assessment").trim(),
                          status: String(raw.status || "draft").trim(),
                          dueDate: toDate(raw.dueDate),
                        } satisfies InstitutionAssessment;
                      }),
                    ),
                  );
                } catch (collectionError) {
                  nextWarnings.push(
                    `Assessments are temporarily unavailable: ${getReadableAnalyticsError(collectionError)}`,
                  );
                  return [];
                }
              })()
            : [];

        const loadedSubmissions =
          courseIds.length > 0
            ? await (async () => {
                try {
                  const snapshots = await Promise.all(
                    chunkValues(courseIds).map((chunk) =>
                      getDocs(
                        query(collection(firebaseDB, "submissions"), where("courseId", "in", chunk)),
                      ),
                    ),
                  );

                  return dedupeById(
                    snapshots.flatMap((snapshot) =>
                      snapshot.docs.map((docSnap) => {
                        const raw = docSnap.data() as Record<string, unknown>;
                        return {
                          id: docSnap.id,
                          assessmentId: String(raw.assessmentId || "").trim(),
                          courseId: String(raw.courseId || "").trim(),
                          studentId: String(raw.studentId || "").trim(),
                          status: String(raw.status || "pending").trim().toLowerCase(),
                          grade: toFiniteNumber(raw.grade),
                        } satisfies InstitutionSubmission;
                      }),
                    ),
                  );
                } catch (collectionError) {
                  nextWarnings.push(
                    `Submissions are temporarily unavailable: ${getReadableAnalyticsError(collectionError)}`,
                  );
                  return [];
                }
              })()
            : [];

        if (cancelled) return;
        setDashboardData(data);
        setGradeSheets(loadedGradeSheets);
        setAssessments(loadedAssessments);
        setSubmissions(loadedSubmissions);
        setWarnings(nextWarnings);
      } catch (loadError) {
        if (cancelled) return;
        setError(getReadableAnalyticsError(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadAnalytics();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const institutionSummary = useMemo(() => {
    if (!dashboardData) return null;

    const studentsWithoutCourses = dashboardData.students.filter(
      (student) => student.enrolledCoursesCount === 0,
    ).length;
    const coursesWithoutTeacher = dashboardData.courses.filter(
      (course) => !course.teacherId,
    ).length;
    const idleTeachers = dashboardData.teachers.filter(
      (teacher) => teacher.approvalStatus === "approved" && teacher.activeCoursesCount === 0,
    ).length;

    const studentAverages = new Map<string, { total: number; count: number }>();
    gradeSheets.forEach((sheet) => {
      sheet.students.forEach((student) => {
        if (!student.studentId || student.total === null) return;
        const current = studentAverages.get(student.studentId) || { total: 0, count: 0 };
        current.total += student.total;
        current.count += 1;
        studentAverages.set(student.studentId, current);
      });
    });

    const averageRows = Array.from(studentAverages.entries()).map(([studentId, value]) => ({
      studentId,
      average: value.count > 0 ? value.total / value.count : 0,
    }));

    const failingStudents = averageRows.filter((entry) => entry.average < 3).length;
    const atRiskStudents = averageRows.filter(
      (entry) => entry.average >= 3 && entry.average < 3.6,
    ).length;
    const passingStudents = averageRows.filter((entry) => entry.average >= 3.6).length;
    const institutionAverage =
      averageRows.length > 0
        ? averageRows.reduce((sum, entry) => sum + entry.average, 0) / averageRows.length
        : 0;

    const now = Date.now();
    const nextWeek = now + 7 * 24 * 60 * 60 * 1000;
    const upcomingAssessments = assessments.filter((assessment) => {
      const dueTime = assessment.dueDate?.getTime();
      return Boolean(dueTime && dueTime >= now && dueTime <= nextWeek);
    }).length;

    const pendingGrading = submissions.filter((submission) => {
      const normalizedStatus = submission.status;
      return (
        normalizedStatus === "submitted" ||
        normalizedStatus === "pending" ||
        normalizedStatus === "in_review" ||
        normalizedStatus === "in-review" ||
        (submission.grade === null && normalizedStatus !== "draft")
      );
    }).length;

    return {
      studentsWithoutCourses,
      coursesWithoutTeacher,
      idleTeachers,
      institutionAverage,
      failingStudents,
      atRiskStudents,
      passingStudents,
      evaluatedStudents: averageRows.length,
      upcomingAssessments,
      pendingGrading,
    };
  }, [assessments, dashboardData, gradeSheets, submissions]);

  const courseHealth = useMemo(() => {
    if (!dashboardData) return [];

    return dashboardData.courses
      .map((course) => {
        const courseSheets = gradeSheets.filter((sheet) => sheet.courseId === course.id);
        const courseAssessments = assessments.filter((assessment) => assessment.courseId === course.id);
        const courseSubmissions = submissions.filter((submission) => submission.courseId === course.id);

        const studentAverages = new Map<string, { total: number; count: number }>();
        courseSheets.forEach((sheet) => {
          sheet.students.forEach((student) => {
            if (!student.studentId || student.total === null) return;
            const current = studentAverages.get(student.studentId) || { total: 0, count: 0 };
            current.total += student.total;
            current.count += 1;
            studentAverages.set(student.studentId, current);
          });
        });

        const averages = Array.from(studentAverages.values()).map((value) =>
          value.count > 0 ? value.total / value.count : 0,
        );
        const averageGrade =
          averages.length > 0
            ? averages.reduce((sum, value) => sum + value, 0) / averages.length
            : null;
        const atRiskCount = averages.filter((value) => value >= 3 && value < 3.6).length;
        const failingCount = averages.filter((value) => value < 3).length;
        const pendingGrading = courseSubmissions.filter((submission) => {
          const normalizedStatus = submission.status;
          return (
            normalizedStatus === "submitted" ||
            normalizedStatus === "pending" ||
            normalizedStatus === "in_review" ||
            normalizedStatus === "in-review" ||
            (submission.grade === null && normalizedStatus !== "draft")
          );
        }).length;

        const nextDueAssessment = courseAssessments
          .filter((assessment) => assessment.dueDate)
          .sort((left, right) => {
            const leftTime = left.dueDate?.getTime() || 0;
            const rightTime = right.dueDate?.getTime() || 0;
            return leftTime - rightTime;
          })[0] || null;

        return {
          id: course.id,
          name: course.name,
          code: course.code,
          teacherName: course.teacherName || "Unassigned",
          enrolledStudentsCount: course.enrolledStudentsCount,
          averageGrade,
          atRiskCount,
          failingCount,
          gradeSheetCount: courseSheets.length,
          publishedSheetCount: courseSheets.filter((sheet) => sheet.isPublished).length,
          assessmentCount: courseAssessments.length,
          pendingGrading,
          nextDueAssessment,
          needsAttention:
            !course.teacherId ||
            failingCount > 0 ||
            pendingGrading > 0 ||
            (averageGrade !== null && averageGrade < 3.4),
        };
      })
      .sort((left, right) => {
        if (left.needsAttention !== right.needsAttention) {
          return left.needsAttention ? -1 : 1;
        }
        const leftScore =
          (left.averageGrade ?? 5) - left.failingCount * 0.5 - left.pendingGrading * 0.05;
        const rightScore =
          (right.averageGrade ?? 5) - right.failingCount * 0.5 - right.pendingGrading * 0.05;
        return leftScore - rightScore;
      });
  }, [assessments, dashboardData, gradeSheets, submissions]);

  const upcomingAssessments = useMemo(() => {
    return [...assessments]
      .filter((assessment) => assessment.dueDate)
      .sort((left, right) => {
        const leftTime = left.dueDate?.getTime() || 0;
        const rightTime = right.dueDate?.getTime() || 0;
        return leftTime - rightTime;
      })
      .slice(0, 6);
  }, [assessments]);

  const alertItems = useMemo(() => {
    if (!dashboardData || !institutionSummary) return [];

    const items: Array<{
      id: string;
      title: string;
      description: string;
      tone: string;
    }> = [];

    if (dashboardData.institution.planStatus !== "active") {
      items.push({
        id: "plan-status",
        title: "Institution plan needs attention",
        description: `The workspace is currently ${dashboardData.institution.planStatus.replace("_", " ")}.`,
        tone: "border-amber-200 bg-amber-50 text-amber-800",
      });
    }

    if (institutionSummary.coursesWithoutTeacher > 0) {
      items.push({
        id: "courses-without-teacher",
        title: "Courses without assigned teacher",
        description: `${institutionSummary.coursesWithoutTeacher} course(s) still need instructor assignment.`,
        tone: "border-rose-200 bg-rose-50 text-rose-800",
      });
    }

    if (institutionSummary.studentsWithoutCourses > 0) {
      items.push({
        id: "students-without-courses",
        title: "Students without enrollment",
        description: `${institutionSummary.studentsWithoutCourses} student(s) are linked to the institution but not enrolled.`,
        tone: "border-amber-200 bg-amber-50 text-amber-800",
      });
    }

    if (dashboardData.pendingTeacherRequests.length > 0) {
      items.push({
        id: "teacher-requests",
        title: "Pending teacher approvals",
        description: `${dashboardData.pendingTeacherRequests.length} request(s) are waiting for review.`,
        tone: "border-sky-200 bg-sky-50 text-sky-800",
      });
    }

    if (institutionSummary.failingStudents > 0) {
      items.push({
        id: "failing-students",
        title: "Students currently failing",
        description: `${institutionSummary.failingStudents} evaluated student(s) are below the passing threshold.`,
        tone: "border-rose-200 bg-rose-50 text-rose-800",
      });
    }

    return items.slice(0, 4);
  }, [dashboardData, institutionSummary]);

  const capacityRows = useMemo(() => {
    if (!dashboardData) return [];
    return [
      {
        label: "Courses",
        current: dashboardData.courses.length,
        limit: dashboardData.institution.courseLimit,
        tone: "bg-sky-500",
      },
      {
        label: "Teachers",
        current: dashboardData.teachers.length,
        limit: dashboardData.institution.teacherLimit,
        tone: "bg-violet-500",
      },
      {
        label: "Students",
        current: dashboardData.students.length,
        limit: dashboardData.institution.studentLimit,
        tone: "bg-emerald-500",
      },
    ];
  }, [dashboardData]);

  const summaryCards = useMemo(() => {
    if (!dashboardData || !institutionSummary) return [];

    return [
      {
        id: "courses",
        label: "Active courses",
        value: dashboardData.courses.length.toString(),
        detail: `${institutionSummary.coursesWithoutTeacher} without teacher`,
        icon: School,
        accent: "bg-sky-100 text-sky-700",
      },
      {
        id: "students",
        label: "Linked students",
        value: dashboardData.students.length.toString(),
        detail: `${institutionSummary.studentsWithoutCourses} pending enrollment`,
        icon: Users,
        accent: "bg-emerald-100 text-emerald-700",
      },
      {
        id: "average",
        label: "Evaluated average",
        value:
          institutionSummary.evaluatedStudents > 0
            ? institutionSummary.institutionAverage.toFixed(1)
            : "--",
        detail: `${institutionSummary.evaluatedStudents} graded profiles`,
        icon: TrendingUp,
        accent: "bg-indigo-100 text-indigo-700",
      },
      {
        id: "grading",
        label: "Pending grading",
        value: institutionSummary.pendingGrading.toString(),
        detail: `${institutionSummary.upcomingAssessments} due in 7 days`,
        icon: ClipboardCheck,
        accent: "bg-amber-100 text-amber-700",
      },
    ];
  }, [dashboardData, institutionSummary]);

  const approvedTeachersCount = useMemo(() => {
    if (!dashboardData) return 0;
    return dashboardData.teachers.filter((teacher) => teacher.approvalStatus === "approved").length;
  }, [dashboardData]);

  const publishedSheetsCount = useMemo(
    () => gradeSheets.filter((sheet) => sheet.isPublished).length,
    [gradeSheets],
  );

  const draftSheetsCount = useMemo(
    () => gradeSheets.filter((sheet) => !sheet.isPublished).length,
    [gradeSheets],
  );

  const topAttentionCourses = useMemo(() => courseHealth.slice(0, 8), [courseHealth]);

  const recentGradeSheets = useMemo(
    () =>
      gradeSheets
        .slice()
        .sort((left, right) => {
          const leftTime = left.updatedAt?.getTime() || 0;
          const rightTime = right.updatedAt?.getTime() || 0;
          return rightTime - leftTime;
        })
        .slice(0, 6),
    [gradeSheets],
  );

  if (loading) {
    return (
      <DashboardLayout contentClassName="pt-0 lg:pt-1">
        <div className="relative overflow-x-hidden">
          <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
          <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />
          <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
            <div className="flex min-h-[360px] items-center justify-center">
              <div className="space-y-2 text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
                <p className="text-lg font-semibold text-slate-900">Loading institution analytics</p>
                <p className="text-sm text-slate-600">
                  Preparing academic signals for your institution workspace.
                </p>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !dashboardData || !institutionSummary) {
    return (
      <DashboardLayout contentClassName="pt-0 lg:pt-1">
        <div className="relative overflow-x-hidden">
          <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
          <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />
          <div className="relative border border-slate-200/60 bg-white p-6 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)]">
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 text-rose-700" />
                <div>
                  <h2 className="text-base font-semibold text-rose-900">
                    Institution analytics could not be loaded
                  </h2>
                  <p className="mt-1 text-sm text-rose-800">
                    {error || "Try again in a moment."}
                  </p>
                  <div className="mt-4">
                    <Link
                      to="/institution"
                      className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                    >
                      <ArrowRight className="h-4 w-4" />
                      Back to institution dashboard
                    </Link>
                  </div>
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

        <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <section className="space-y-4">
            <section className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
              <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-sky-200/35" />
              <div className="pointer-events-none absolute -right-24 -bottom-24 h-64 w-64 rounded-full bg-indigo-200/35" />

              <div className="relative space-y-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                      <Sparkles className="h-3.5 w-3.5" />
                      Institution Module
                    </div>
                    <h1 className="mt-3 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                      Institution Analytics
                    </h1>
                    <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                      Academic oversight for {dashboardData.institution.name}. Track course ownership,
                      grading flow, staffing pressure, and enrollment coverage from one workspace.
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <Link
                      to="/courses"
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <BookOpen className="h-4 w-4" />
                      Courses
                    </Link>
                    <Link
                      to="/students/list"
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <Users className="h-4 w-4" />
                      Students
                    </Link>
                    <Link
                      to="/grades"
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <GraduationCap className="h-4 w-4" />
                      Grades
                    </Link>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {summaryCards.map((card) => {
                    const Icon = card.icon;
                    return (
                      <div
                        key={card.id}
                        className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div
                            className={cn(
                              "inline-flex h-7 w-7 items-center justify-center rounded-lg",
                              card.accent,
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">
                            {card.value}
                          </p>
                        </div>
                        <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">
                          {card.label}
                        </p>
                        <p className="mt-1 text-xs leading-4 text-slate-600">{card.detail}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {warnings.length > 0 && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 text-amber-700" />
                  <div>
                    <h2 className="text-sm font-semibold text-amber-900">Partial analytics loaded</h2>
                    <div className="mt-1 space-y-1 text-sm text-amber-800">
                      {warnings.map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <article className="space-y-4 xl:col-span-2">
                <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Course Health</p>
                      <p className="text-xs text-slate-500">
                        Prioritized by missing ownership, academic risk, and grading backlog.
                      </p>
                    </div>
                    <Link
                      to="/courses"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700 hover:text-sky-800"
                    >
                      Open courses
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>

                  {topAttentionCourses.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
                      <School className="mx-auto h-8 w-8 text-slate-400" />
                      <p className="mt-3 text-sm font-semibold text-slate-900">No courses available</p>
                      <p className="mt-1 text-xs text-slate-600">
                        Course-level academic monitoring will appear here once the institution adds courses.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {topAttentionCourses.map((course) => (
                        <div
                          key={course.id}
                          className={cn(
                            "rounded-xl border px-3 py-2.5 transition-colors",
                            course.needsAttention
                              ? "border-amber-200 bg-amber-50/70"
                              : "border-slate-200/60 bg-white hover:bg-slate-50",
                          )}
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <p className="truncate text-sm font-semibold text-slate-900">
                                  {course.name}
                                </p>
                                <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                                  {course.code}
                                </span>
                                {!course.teacherName || course.teacherName === "Unassigned" ? (
                                  <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                                    Unassigned
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-xs text-slate-500">
                                Teacher: {course.teacherName} · {course.enrolledStudentsCount} student(s) ·{" "}
                                {course.assessmentCount} assessment(s)
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                                <span>
                                  Grade sheets: {course.gradeSheetCount} total / {course.publishedSheetCount} published
                                </span>
                                <span>
                                  Next due:{" "}
                                  {course.nextDueAssessment
                                    ? formatDueLabel(course.nextDueAssessment.dueDate)
                                    : "No upcoming assessment"}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              <div className="rounded-lg border border-slate-200/60 bg-white px-2.5 py-2 text-center">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                  Avg
                                </p>
                                <p className="text-sm font-bold text-slate-900">
                                  {course.averageGrade !== null ? course.averageGrade.toFixed(1) : "--"}
                                </p>
                              </div>
                              <div className="rounded-lg border border-slate-200/60 bg-white px-2.5 py-2 text-center">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                  At Risk
                                </p>
                                <p className="text-sm font-bold text-amber-700">{course.atRiskCount}</p>
                              </div>
                              <div className="rounded-lg border border-slate-200/60 bg-white px-2.5 py-2 text-center">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                  Failing
                                </p>
                                <p className="text-sm font-bold text-rose-700">{course.failingCount}</p>
                              </div>
                              <div className="rounded-lg border border-slate-200/60 bg-white px-2.5 py-2 text-center">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                  Queue
                                </p>
                                <p className="text-sm font-bold text-slate-900">{course.pendingGrading}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Teacher Load</p>
                        <p className="text-xs text-slate-500">
                          Approved staff, pending requests, and current course ownership.
                        </p>
                      </div>
                      <UserCheck className="h-4.5 w-4.5 text-slate-400" />
                    </div>

                    {dashboardData.teachers.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
                        <UserCheck className="mx-auto h-8 w-8 text-slate-400" />
                        <p className="mt-3 text-sm font-semibold text-slate-900">No teachers linked yet</p>
                        <p className="mt-1 text-xs text-slate-600">
                          Teacher staffing analytics will appear once the institution approves or adds teachers.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {dashboardData.teachers.map((teacher) => (
                          <div
                            key={teacher.id}
                            className="rounded-xl border border-slate-200/60 bg-white px-3 py-2.5 transition-colors hover:bg-slate-50"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">
                                  {teacher.name}
                                </p>
                                <p className="truncate text-xs text-slate-500">{teacher.email}</p>
                              </div>
                              <span
                                className={cn(
                                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                  teacher.approvalStatus === "approved"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-amber-200 bg-amber-50 text-amber-700",
                                )}
                              >
                                {teacher.approvalStatus}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                              <span>{teacher.activeCoursesCount} active course(s)</span>
                              <span>
                                {teacher.institutionManaged ? "Institution managed" : "Independent"}
                              </span>
                            </div>
                          </div>
                        ))}

                        {dashboardData.pendingTeacherRequests.length > 0 ? (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                            <p className="text-sm font-semibold text-amber-900">
                              {dashboardData.pendingTeacherRequests.length} pending teacher request(s)
                            </p>
                            <p className="mt-1 text-xs text-amber-800">
                              Review requests from the institution dashboard to unblock staffing.
                            </p>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </section>

                  <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Assessment Timeline</p>
                        <p className="text-xs text-slate-500">
                          Upcoming due dates and short-term grading pressure.
                        </p>
                      </div>
                      <Clock3 className="h-4.5 w-4.5 text-slate-400" />
                    </div>

                    {upcomingAssessments.length > 0 ? (
                      <div className="space-y-2">
                        {upcomingAssessments.map((assessment) => {
                          const course = dashboardData.courses.find(
                            (entry) => entry.id === assessment.courseId,
                          );
                          return (
                            <div
                              key={assessment.id}
                              className="rounded-xl border border-slate-200/60 bg-white px-3 py-2.5 transition-colors hover:bg-slate-50"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900">
                                    {assessment.name}
                                  </p>
                                  <p className="truncate text-xs text-slate-500">
                                    {course?.code || "No course code"} · {course?.name || "Course"}
                                  </p>
                                </div>
                                <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                                  {assessment.type}
                                </span>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                                <span>{formatCompactDate(assessment.dueDate)}</span>
                                <span>{formatDueLabel(assessment.dueDate)}</span>
                                <span>Status: {assessment.status || "draft"}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
                        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                        <p className="mt-3 text-sm font-semibold text-slate-900">
                          No upcoming assessments
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          The institution has no near-term due dates in the tracked courses.
                        </p>
                      </div>
                    )}
                  </section>
                </div>

                <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Grade-Sheet Activity</p>
                      <p className="text-xs text-slate-500">
                        Draft versus published grading coverage across tracked courses.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2.5 py-1">
                        {gradeSheets.length} total
                      </span>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">
                        {publishedSheetsCount} published
                      </span>
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">
                        {draftSheetsCount} draft
                      </span>
                    </div>
                  </div>

                  {recentGradeSheets.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
                      <FileSpreadsheet className="mx-auto h-8 w-8 text-slate-400" />
                      <p className="mt-3 text-sm font-semibold text-slate-900">No grade sheets yet</p>
                      <p className="mt-1 text-xs text-slate-600">
                        Grade-sheet analytics will appear once teachers begin grading institution courses.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-3">
                      {recentGradeSheets.map((sheet) => (
                        <div
                          key={sheet.id}
                          className="rounded-xl border border-slate-200/60 bg-white p-3 transition-colors hover:bg-slate-50"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {sheet.title}
                              </p>
                              <p className="truncate text-xs text-slate-500">{sheet.courseName}</p>
                            </div>
                            <span
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                sheet.isPublished
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-amber-200 bg-amber-50 text-amber-700",
                              )}
                            >
                              {sheet.isPublished ? "Published" : "Draft"}
                            </span>
                          </div>
                          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-600">
                            <span>Weight {sheet.weightPercentage.toFixed(1)}%</span>
                            <span>{sheet.students.length} rows</span>
                          </div>
                          <div className="mt-2 text-[11px] text-slate-500">
                            Updated {formatCompactDate(sheet.updatedAt)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </article>

              <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
                <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-slate-900">Institution Snapshot</p>
                    <p className="text-xs text-slate-500">
                      Capacity use, staffing state, and plan health in one glance.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Plan
                      </p>
                      <p className="mt-1 text-sm font-bold capitalize text-slate-900">
                        {dashboardData.institution.planStatus.replace(/_/g, " ")}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Teachers
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-900">
                        {approvedTeachersCount}/{dashboardData.teachers.length} approved
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {capacityRows.map((row) => {
                      const percentage =
                        row.limit && row.limit > 0
                          ? Math.min(100, (row.current / row.limit) * 100)
                          : null;
                      return (
                        <div key={row.label}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-700">{row.label}</span>
                            <span className="text-slate-500">
                              {row.current}/{row.limit ?? "Unlimited"}
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={cn("h-full rounded-full", row.tone)}
                              style={{ width: `${percentage ?? 28}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-slate-900">Academic Signals</p>
                    <p className="text-xs text-slate-500">
                      Student performance distribution from evaluated records only.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                          Passing
                        </span>
                        <TrendingUp className="h-4 w-4 text-emerald-700" />
                      </div>
                      <p className="mt-1 text-lg font-extrabold text-emerald-900">
                        {institutionSummary.passingStudents}
                      </p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                          At risk
                        </span>
                        <AlertCircle className="h-4 w-4 text-amber-700" />
                      </div>
                      <p className="mt-1 text-lg font-extrabold text-amber-900">
                        {institutionSummary.atRiskStudents}
                      </p>
                    </div>
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                          Failing
                        </span>
                        <TrendingDown className="h-4 w-4 text-rose-700" />
                      </div>
                      <p className="mt-1 text-lg font-extrabold text-rose-900">
                        {institutionSummary.failingStudents}
                      </p>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-slate-900">Operational Alerts</p>
                    <p className="text-xs text-slate-500">
                      Items that still need attention in staffing, enrollment, or performance.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {alertItems.length > 0 ? (
                      alertItems.map((item) => (
                        <div key={item.id} className={cn("rounded-xl border px-3 py-2.5", item.tone)}>
                          <p className="text-sm font-semibold">{item.title}</p>
                          <p className="mt-1 text-xs">{item.description}</p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                        No critical alerts right now. Institutional academic flow looks stable.
                      </div>
                    )}
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200/60 bg-sky-50 p-4 shadow-sm">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-slate-900">Recommended next moves</p>
                    <p className="text-xs text-slate-600">
                      Use the highest-signal actions first to keep operations healthy.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Link
                      to="/students/list"
                      className="block rounded-xl border border-sky-200 bg-white p-3 transition hover:bg-sky-50"
                    >
                      <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                        <Users className="h-4 w-4" />
                      </div>
                      <p className="mt-3 text-sm font-semibold text-slate-900">
                        Resolve enrollment gaps
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Focus on the {institutionSummary.studentsWithoutCourses} student(s) without active course links.
                      </p>
                    </Link>

                    <Link
                      to="/courses"
                      className="block rounded-xl border border-sky-200 bg-white p-3 transition hover:bg-sky-50"
                    >
                      <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                        <BookOpen className="h-4 w-4" />
                      </div>
                      <p className="mt-3 text-sm font-semibold text-slate-900">
                        Assign course ownership
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Review the {institutionSummary.coursesWithoutTeacher} course(s) still missing a teacher.
                      </p>
                    </Link>

                    <Link
                      to="/grades"
                      className="block rounded-xl border border-sky-200 bg-white p-3 transition hover:bg-sky-50"
                    >
                      <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                        <GraduationCap className="h-4 w-4" />
                      </div>
                      <p className="mt-3 text-sm font-semibold text-slate-900">
                        Review academic performance
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Follow institution-wide grade trends and inspect course-level performance in Grades.
                      </p>
                    </Link>
                  </div>
                </section>
              </aside>
            </section>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
