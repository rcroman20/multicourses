import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { collection, deleteDoc, doc, getDocs, query, where } from "firebase/firestore";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAcademic } from "@/contexts/AcademicContext";
import { useAuth } from "@/contexts/AuthContext";
import { getAccessibleCoursesForUser } from "@/lib/courseAccess";
import { firebaseDB } from "@/lib/firebase";
import {
  BarChart3,
  ChevronLeft,
  Users,
  Trophy,
  Clock,
  BookOpen,
  GraduationCap,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  FileText,
  CalendarDays,
  Target,
  Award,
  Loader2,
  Presentation,
  ExternalLink,
  TrendingUp,
  Calendar,
  Zap,
  Rocket,
  Sparkles,
  UserPlus,
  CheckCircle,
  Brain,
  HelpCircle,
  Edit3,
  BookMarked,
  Layers,
  TrendingDown,
  ArrowUp,
  ArrowDown,
  Filter,
  Search,
  Download,
  Printer,
  Trash2,
  Eye,
  EyeOff,
  PieChart,
  LineChart,
  Activity,
  Award as AwardIcon,
} from "lucide-react";

interface QuizAttemptAnswer {
  questionId: string;
  selectedOptionIndex: number;
  correctOptionIndex: number;
  isCorrect: boolean;
}

interface QuizAttempt {
  id: string;
  courseId: string;
  theme: string;
  studentId: string;
  total: number;
  correct: number;
  percentage: number;
  answers: QuizAttemptAnswer[];
  createdAt: Date;
}

interface ThemeStats {
  theme: string;
  attempts: number;
  uniqueStudents: number;
  avgScore: number;
  bestScore: number;
  totalQuestions: number;
}

interface ExerciseQuestion {
  id: string;
  courseId: string;
  theme: string;
  question: string;
  options: string[];
  correctOptionIndex: number;
}

function toDate(value: unknown): Date {
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (value instanceof Date) return value;
  return new Date();
}

function formatDateTime(date: Date) {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildAttemptFingerprint(attempt: QuizAttempt): string {
  const answerSignature = [...attempt.answers]
    .sort((a, b) => a.questionId.localeCompare(b.questionId))
    .map((answer) => `${answer.questionId}:${answer.selectedOptionIndex}`)
    .join("|");
  const minuteBucket = Math.floor(attempt.createdAt.getTime() / 60000);
  return [
    attempt.studentId,
    attempt.theme,
    attempt.total,
    attempt.correct,
    attempt.percentage,
    answerSignature,
    minuteBucket,
  ].join("|");
}

function dedupeAttempts(items: QuizAttempt[]): QuizAttempt[] {
  const seenFingerprints = new Set<string>();
  const seenIds = new Set<string>();
  const deduped: QuizAttempt[] = [];
  const sorted = [...items].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  sorted.forEach((attempt) => {
    if (seenIds.has(attempt.id)) return;
    seenIds.add(attempt.id);

    const fingerprint = buildAttemptFingerprint(attempt);

    if (seenFingerprints.has(fingerprint)) return;
    seenFingerprints.add(fingerprint);
    deduped.push(attempt);
  });

  return deduped;
}

export default function ExerciseQuizStatsPage() {
  const { courseCode } = useParams<{ courseCode?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { courses, selectedCourseId, setSelectedCourseId } = useAcademic();
  const isAdmin = user?.role === "admin";
  const isTeacher = user?.role === "docente" || isAdmin;

  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [questions, setQuestions] = useState<ExerciseQuestion[]>([]);
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<string>("all");
  const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"date" | "score" | "student">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [deletingAttemptId, setDeletingAttemptId] = useState<string | null>(null);
  const latestStatsRequestRef = useRef(0);

  const availableCourses = useMemo(() => {
    if (!user) return [];
    return getAccessibleCoursesForUser(courses, user, {
      includeAllForAdmin: isAdmin,
      includeEnrolledForTeacher: false,
    });
  }, [courses, isAdmin, user]);

  const selectedCourse = useMemo(
    () => availableCourses.find((course) => course.id === selectedCourseId),
    [availableCourses, selectedCourseId],
  );

  const themeStats = useMemo<ThemeStats[]>(() => {
    const grouped: Record<string, QuizAttempt[]> = {};
    attempts.forEach((attempt) => {
      if (!grouped[attempt.theme]) grouped[attempt.theme] = [];
      grouped[attempt.theme].push(attempt);
    });

    return Object.entries(grouped)
      .map(([theme, list]) => {
        const total = list.reduce((sum, item) => sum + item.percentage, 0);
        const best = Math.max(...list.map((item) => item.percentage));
        const totalQuestions = questions.filter(q => q.theme === theme).length;
        
        return {
          theme,
          attempts: list.length,
          uniqueStudents: new Set(list.map((item) => item.studentId)).size,
          avgScore: list.length ? total / list.length : 0,
          bestScore: best,
          totalQuestions,
        };
      })
      .sort((a, b) => b.attempts - a.attempts);
  }, [attempts, questions]);

  const visibleAttempts = useMemo(() => {
    const themeFiltered =
      selectedTheme === "all"
        ? attempts
        : attempts.filter((attempt) => attempt.theme === selectedTheme);

    const studentQuery = studentSearchQuery.trim().toLowerCase();
    const filtered =
      isTeacher && studentQuery
        ? themeFiltered.filter((attempt) => {
            const name = (studentNames[attempt.studentId] || attempt.studentId).toLowerCase();
            return name.includes(studentQuery);
          })
        : themeFiltered;

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "date") {
        return sortOrder === "desc" 
          ? b.createdAt.getTime() - a.createdAt.getTime()
          : a.createdAt.getTime() - b.createdAt.getTime();
      }
      if (sortBy === "score") {
        return sortOrder === "desc"
          ? b.percentage - a.percentage
          : a.percentage - b.percentage;
      }
      if (sortBy === "student") {
        const nameA = studentNames[a.studentId] || a.studentId;
        const nameB = studentNames[b.studentId] || b.studentId;
        return sortOrder === "desc"
          ? nameB.localeCompare(nameA)
          : nameA.localeCompare(nameB);
      }
      return 0;
    });

    return sorted;
  }, [attempts, isTeacher, selectedTheme, sortBy, sortOrder, studentNames, studentSearchQuery]);

  const questionsById = useMemo(() => {
    const map: Record<string, ExerciseQuestion> = {};
    questions.forEach((question) => {
      map[question.id] = question;
    });
    return map;
  }, [questions]);

  const averageScore = useMemo(() => {
    if (attempts.length === 0) return 0;
    const total = attempts.reduce((sum, a) => sum + a.percentage, 0);
    return total / attempts.length;
  }, [attempts]);

  const passRate = useMemo(() => {
    if (attempts.length === 0) return 0;
    const passed = attempts.filter(a => a.percentage >= 60).length;
    return (passed / attempts.length) * 100;
  }, [attempts]);

  const uniqueStudentCount = useMemo(
    () => new Set(attempts.map((attempt) => attempt.studentId)).size,
    [attempts],
  );

  const strongestTheme = useMemo(
    () =>
      [...themeStats]
        .sort((left, right) => {
          if (right.avgScore !== left.avgScore) {
            return right.avgScore - left.avgScore;
          }
          return right.attempts - left.attempts;
        })
        .find((item) => item.attempts > 0) || null,
    [themeStats],
  );

  const weakestTheme = useMemo(
    () =>
      [...themeStats]
        .sort((left, right) => {
          if (left.avgScore !== right.avgScore) {
            return left.avgScore - right.avgScore;
          }
          return right.attempts - left.attempts;
        })
        .find((item) => item.attempts > 0) || null,
    [themeStats],
  );

  const latestAttempt = useMemo(
    () =>
      [...attempts].sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      )[0] || null,
    [attempts],
  );

  const selectedThemeStats = useMemo(
    () => themeStats.find((themeItem) => themeItem.theme === selectedTheme) || null,
    [selectedTheme, themeStats],
  );

  useEffect(() => {
    if (availableCourses.length === 0) {
      if (selectedCourseId) setSelectedCourseId("");
      return;
    }

    const globalCourse = availableCourses.find((course) => course.id === selectedCourseId);
    if (globalCourse) {
      if (courseCode !== globalCourse.code) {
        navigate(`/courses/${globalCourse.code}/exercise-bank/stats`, { replace: true });
      }
      return;
    }

    const fromUrl = courseCode
      ? availableCourses.find((course) => course.code === courseCode)
      : null;

    if (fromUrl) {
      if (fromUrl.id !== selectedCourseId) {
        setSelectedCourseId(fromUrl.id);
      }
      return;
    }

    const fallback = availableCourses[0];
    setSelectedCourseId(fallback.id);
    if (courseCode !== fallback.code) {
      navigate(`/courses/${fallback.code}/exercise-bank/stats`, { replace: true });
    }
  }, [availableCourses, courseCode, navigate, selectedCourseId, setSelectedCourseId]);

  useEffect(() => {
    latestStatsRequestRef.current += 1;
    setExpandedAttemptId(null);
    setSelectedTheme("all");
    setStudentSearchQuery("");

    if (!selectedCourseId) {
      setAttempts([]);
      setQuestions([]);
      setLoading(false);
      return;
    }

    setAttempts([]);
    setQuestions([]);
    setLoading(true);
  }, [selectedCourseId]);

  useEffect(() => {
    const loadData = async () => {
      const targetCourseId = String(selectedCourseId || "").trim();
      if (!targetCourseId) return;

      const requestId = latestStatsRequestRef.current + 1;
      latestStatsRequestRef.current = requestId;
      try {
        const attemptsQuery = isTeacher
          ? query(
              collection(firebaseDB, "quizAttempts"),
              where("courseId", "==", targetCourseId),
            )
          : query(
              collection(firebaseDB, "quizAttempts"),
              where("courseId", "==", targetCourseId),
              where("studentId", "==", user?.id || ""),
            );

        const [attemptsSnapshot, studentsSnapshot, questionsSnapshot] = await Promise.all([
          getDocs(attemptsQuery),
          isTeacher ? getDocs(collection(firebaseDB, "estudiantes")) : Promise.resolve(null),
          getDocs(
            query(
              collection(firebaseDB, "exerciseQuestions"),
              where("courseId", "==", targetCourseId),
            ),
          ),
        ]);

        const loadedAttemptsRaw: QuizAttempt[] = attemptsSnapshot.docs.map((docItem) => {
          const data = docItem.data();
          return {
            id: docItem.id,
            courseId: String(data.courseId || ""),
            theme: String(data.theme || ""),
            studentId: String(data.studentId || ""),
            total: Number(data.total || 0),
            correct: Number(data.correct || 0),
            percentage: Number(data.percentage || 0),
            answers: Array.isArray(data.answers)
              ? data.answers.map((item: unknown) => {
                  const parsed = item as Record<string, unknown>;
                  return {
                    questionId: String(parsed.questionId || ""),
                    selectedOptionIndex: Number(parsed.selectedOptionIndex ?? -1),
                    correctOptionIndex: Number(parsed.correctOptionIndex ?? -1),
                    isCorrect: Boolean(parsed.isCorrect),
                  };
                })
              : [],
            createdAt: toDate(data.createdAt),
          };
        });
        const loadedAttempts = dedupeAttempts(loadedAttemptsRaw);
        loadedAttempts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        const names: Record<string, string> = {};
        if (studentsSnapshot) {
          studentsSnapshot.forEach((docItem) => {
            const data = docItem.data();
            names[docItem.id] = String(data.name || data.fullName || data.email || docItem.id);
          });
        }
        if (user?.id) {
          names[user.id] = user.name || user.email || user.id;
        }

        const loadedQuestions: ExerciseQuestion[] = questionsSnapshot.docs.map((docItem) => {
          const data = docItem.data();
          return {
            id: docItem.id,
            courseId: String(data.courseId || ""),
            theme: String(data.theme || ""),
            question: String(data.question || ""),
            options: Array.isArray(data.options)
              ? data.options.map((option: unknown) => String(option))
              : [],
            correctOptionIndex: Number(data.correctOptionIndex || 0),
          };
        });

        if (requestId !== latestStatsRequestRef.current) return;
        setAttempts(loadedAttempts);
        setQuestions(loadedQuestions);
        setStudentNames(names);
      } finally {
        if (requestId !== latestStatsRequestRef.current) return;
        setLoading(false);
      }
    };

    void loadData();
  }, [isTeacher, selectedCourseId, user?.email, user?.id, user?.name]);

  const handleCourseChange = (courseId: string) => {
    const nextCourse = availableCourses.find((course) => course.id === courseId);
    if (!nextCourse) return;
    setSelectedCourseId(nextCourse.id);
    navigate(`/courses/${nextCourse.code}/exercise-bank/stats`);
  };

  const toggleSort = (field: "date" | "score" | "student") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const handleDeleteAttempt = async (attemptId: string) => {
    if (!isTeacher || deletingAttemptId) return;
    const confirmed = window.confirm("Delete this attempt permanently?");
    if (!confirmed) return;

    setDeletingAttemptId(attemptId);
    try {
      await deleteDoc(doc(firebaseDB, "quizAttempts", attemptId));
      setAttempts((prev) => prev.filter((attempt) => attempt.id !== attemptId));
      setExpandedAttemptId((prev) => {
        if (!prev) return null;
        return prev === attemptId ? null : prev;
      });
    } catch (error) {
      console.error("Could not delete attempt:", error);
      alert("Could not delete attempt. Check your Firestore permissions.");
    } finally {
      setDeletingAttemptId(null);
    }
  };

  return (
    <DashboardLayout contentClassName="pt-0 lg:pt-1">
      <div className="relative overflow-x-hidden">
        <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
        <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />

        <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-4">
          <section className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
            <div className="pointer-events-none absolute -left-[70px] -top-[90px] h-[180px] w-[180px] rounded-full bg-sky-300/25" />
            <div className="pointer-events-none absolute -right-[90px] -bottom-[90px] h-[200px] w-[200px] rounded-full bg-violet-300/20" />
            <div className="relative z-10 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  Quiz Analytics
                </div>
                <h2 className="mt-3 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                  Exercise Performance Center
                </h2>
                <p className="mt-1.5 text-xs text-slate-500">
                  Review attempts, sort outcomes, and inspect detailed answers by theme.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/60 bg-white/90 p-3">
                <label
                  htmlFor="quiz-stats-course-select"
                  className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                >
                  Course Scope
                </label>
                <div className="relative">
                  <BookOpen className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    id="quiz-stats-course-select"
                    className="h-10 w-full rounded-xl border border-slate-300/60 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    value={selectedCourseId}
                    onChange={(e) => handleCourseChange(e.target.value)}
                  >
                    {availableCourses.length === 0 && (
                      <option value="">No courses available</option>
                    )}
                    {availableCourses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.code} - {course.name}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedCourse?.code ? (
                  <Link
                    to={`/courses/${selectedCourse.code}/exercise-bank`}
                    className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Back to Quiz Bank Studio
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200/60 bg-slate-50 px-3 text-xs font-semibold text-slate-400"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Back to Quiz Bank Studio
                  </button>
                )}
              </div>
            </div>
          </section>

          {loading ? (
            <div className="mt-4 flex min-h-[320px] items-center justify-center rounded-2xl border border-slate-200/60 bg-white p-8 shadow-sm">
              <div className="space-y-2 text-center">
                <Loader2 className="mx-auto h-7 w-7 animate-spin text-sky-600" />
                <p className="text-base font-semibold text-slate-900">Loading statistics</p>
                <p className="text-sm text-slate-600">Preparing your performance data...</p>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <section className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
                <div className="border-b border-slate-200/60 bg-gradient-to-r from-slate-50 via-white to-sky-50/60 px-4 py-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-2xl">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                        Analytics Studio
                      </p>
                      <h3 className="mt-1 text-xl font-bold text-slate-900">
                        Course attempt analytics
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Track participation, compare theme performance, and inspect each quiz attempt in one workspace.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-xl border border-slate-200/60 bg-white px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Course
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {selectedCourse?.code || "--"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200/60 bg-white px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Students
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {uniqueStudentCount}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200/60 bg-white px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Attempts
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {attempts.length}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200/60 bg-white px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Last activity
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {latestAttempt ? formatDate(latestAttempt.createdAt) : "--"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 px-4 py-4 md:grid-cols-4">
                  <div className="rounded-xl border border-slate-200/60 bg-white p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                        <Layers className="h-4 w-4" />
                      </div>
                      <p className="text-lg font-extrabold leading-5 text-slate-900">{themeStats.length}</p>
                    </div>
                    <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Themes in analytics</p>
                  </div>

                  <div className="rounded-xl border border-slate-200/60 bg-white p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                        <Activity className="h-4 w-4" />
                      </div>
                      <p className="text-lg font-extrabold leading-5 text-slate-900">{attempts.length}</p>
                    </div>
                    <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total attempts</p>
                  </div>

                  <div className="rounded-xl border border-slate-200/60 bg-white p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                        <TrendingUp className="h-4 w-4" />
                      </div>
                      <p className="text-lg font-extrabold leading-5 text-slate-900">{averageScore.toFixed(1)}%</p>
                    </div>
                    <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Average score</p>
                  </div>

                  <div className="rounded-xl border border-slate-200/60 bg-white p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                        <AwardIcon className="h-4 w-4" />
                      </div>
                      <p className="text-lg font-extrabold leading-5 text-slate-900">{passRate.toFixed(1)}%</p>
                    </div>
                    <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pass rate</p>
                  </div>
                </div>
              </section>

              <div className="space-y-4">
                <section className="rounded-2xl border border-slate-200/60 bg-white shadow-sm">
                  <div className="border-b border-slate-200/60 px-4 py-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Filter className="h-4 w-4 text-sky-700" />
                          <p className="text-base font-bold text-slate-900">
                            {isTeacher ? "Theme filters and trends" : "My theme filters"}
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Focus on one theme or keep the full course view to compare results.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div className="rounded-xl border border-slate-200/60 bg-slate-50/70 px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Strongest theme
                          </p>
                          <p className="mt-1 truncate text-sm font-semibold text-emerald-700">
                            {strongestTheme ? strongestTheme.theme : "--"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200/60 bg-slate-50/70 px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Needs attention
                          </p>
                          <p className="mt-1 truncate text-sm font-semibold text-rose-700">
                            {weakestTheme ? weakestTheme.theme : "--"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200/60 bg-slate-50/70 px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Selected scope
                          </p>
                          <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                            {selectedTheme === "all" ? "All themes" : selectedTheme}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 px-4 py-4 xl:grid-cols-[minmax(0,1.15fr)_360px]">
                    <div className="rounded-xl border border-slate-200/60 bg-slate-50/50 p-3">
                      <label
                        htmlFor="quiz-stats-theme-select"
                        className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500"
                      >
                        {isTeacher ? "Theme scope" : "My theme"}
                      </label>
                      <div className="relative mt-3">
                        <BookMarked className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <select
                          id="quiz-stats-theme-select"
                          value={selectedTheme}
                          onChange={(event) => setSelectedTheme(event.target.value)}
                          className="h-10 w-full rounded-xl border border-slate-300/60 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                        >
                          <option value="all">{isTeacher ? `All themes (${attempts.length})` : `All my themes (${attempts.length})`}</option>
                          {themeStats.map((item) => (
                            <option key={item.theme} value={item.theme}>
                              {item.theme} ({item.attempts})
                            </option>
                          ))}
                        </select>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {selectedTheme === "all"
                          ? `${attempts.length} attempts across all themes`
                          : `${visibleAttempts.length} attempts in ${selectedTheme}`}
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200/60 bg-white p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                        Current theme snapshot
                      </p>
                      {selectedThemeStats ? (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Students</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{selectedThemeStats.uniqueStudents}</p>
                          </div>
                          <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Attempts</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{selectedThemeStats.attempts}</p>
                          </div>
                          <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Average</p>
                            <p className="mt-1 text-sm font-semibold text-indigo-700">{selectedThemeStats.avgScore.toFixed(1)}%</p>
                          </div>
                          <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Best</p>
                            <p className="mt-1 text-sm font-semibold text-emerald-700">{selectedThemeStats.bestScore}%</p>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-lg border border-dashed border-slate-300/60 bg-slate-50 px-3 py-5 text-center text-xs text-slate-500">
                          Select one theme to see its summary here.
                        </div>
                      )}
                    </div>
                  </div>

                  {themeStats.length === 0 && (
                    <div className="px-4 pb-4">
                      <p className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 px-3 py-5 text-center text-xs text-slate-500">
                        No themes with attempts yet.
                      </p>
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-sky-700" />
                        <p className="text-base font-bold text-slate-900">{isTeacher ? "Quiz Attempts" : "My Attempts"}</p>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">{visibleAttempts.length} attempts in view</p>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {isTeacher && (
                        <div className="relative w-full sm:w-56">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={studentSearchQuery}
                            onChange={(event) => setStudentSearchQuery(event.target.value)}
                            placeholder="Search student..."
                            className="h-9 w-full rounded-xl border border-slate-300/60 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                          />
                        </div>
                      )}

                      <button
                        onClick={() => toggleSort("date")}
                        className={`inline-flex h-9 items-center gap-1 rounded-xl border px-2.5 text-xs font-semibold transition ${
                          sortBy === "date"
                            ? "border-sky-300 bg-sky-50 text-sky-700"
                            : "border-slate-200/60 bg-slate-50 text-slate-600 hover:border-sky-200 hover:bg-sky-50"
                        }`}
                        title="Sort by date"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        Date
                        {sortBy === "date" && (sortOrder === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                      </button>

                      <button
                        onClick={() => toggleSort("score")}
                        className={`inline-flex h-9 items-center gap-1 rounded-xl border px-2.5 text-xs font-semibold transition ${
                          sortBy === "score"
                            ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                            : "border-slate-200/60 bg-slate-50 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50"
                        }`}
                        title="Sort by score"
                      >
                        <Trophy className="h-3.5 w-3.5" />
                        Score
                        {sortBy === "score" && (sortOrder === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                      </button>

                      <button
                        onClick={() => toggleSort("student")}
                        disabled={!isTeacher}
                        className={`inline-flex h-9 items-center gap-1 rounded-xl border px-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          sortBy === "student"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-slate-200/60 bg-slate-50 text-slate-600 hover:border-emerald-200 hover:bg-emerald-50"
                        }`}
                        title={isTeacher ? "Sort by student" : "Only for teacher view"}
                      >
                        <Users className="h-3.5 w-3.5" />
                        Student
                        {sortBy === "student" && (sortOrder === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200/60">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          {isTeacher && <th className="px-3 py-2.5">Student</th>}
                          <th className="px-3 py-2.5">Theme</th>
                          <th className="px-3 py-2.5">Score</th>
                          <th className="px-3 py-2.5">Result</th>
                          <th className="px-3 py-2.5">Date</th>
                          <th className="px-3 py-2.5 text-right">Details</th>
                          {isTeacher && <th className="px-3 py-2.5 text-right">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {visibleAttempts.map((attempt) => {
                          const isExpanded = expandedAttemptId === attempt.id;
                          return (
                            <Fragment key={attempt.id}>
                              <tr
                                onClick={() => {
                                  setExpandedAttemptId((prev) => (prev === attempt.id ? null : attempt.id));
                                }}
                                className={`cursor-pointer transition ${
                                  isExpanded ? "bg-sky-50/60 hover:bg-sky-50" : "hover:bg-slate-50"
                                }`}
                              >
                                {isTeacher && (
                                  <td className="px-3 py-2.5 font-medium text-slate-900">
                                    {studentNames[attempt.studentId] || attempt.studentId}
                                  </td>
                                )}
                                <td className="px-3 py-2.5">
                                  <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                                    {attempt.theme}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5">
                                  <span
                                    className={`font-semibold ${
                                      attempt.percentage >= 80
                                        ? "text-emerald-700"
                                        : attempt.percentage >= 60
                                        ? "text-amber-700"
                                        : "text-rose-700"
                                    }`}
                                  >
                                    {attempt.percentage}%
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-slate-700">
                                  {attempt.correct}/{attempt.total}
                                </td>
                                <td className="px-3 py-2.5 text-xs text-slate-500">{formatDate(attempt.createdAt)}</td>
                                <td className="px-3 py-2.5 text-right">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setExpandedAttemptId((prev) => (prev === attempt.id ? null : attempt.id));
                                    }}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200/60 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50"
                                  >
                                    {isExpanded ? "Hide" : "Show"}
                                    <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                  </button>
                                </td>
                                {isTeacher && (
                                  <td className="px-3 py-2.5 text-right">
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void handleDeleteAttempt(attempt.id);
                                      }}
                                      disabled={deletingAttemptId === attempt.id}
                                      className="inline-flex items-center justify-center rounded-lg p-1.5 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                                      title="Delete attempt"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </td>
                                )}
                              </tr>

                              {isExpanded && (
                                <tr className="bg-slate-50/70">
                                  <td colSpan={isTeacher ? 7 : 5} className="px-3 py-3">
                                    <div className="rounded-xl border border-slate-200/60 bg-white p-3">
                                      <p className="mb-2 text-xs text-slate-600">
                                        {isTeacher && (
                                          <>
                                            {studentNames[attempt.studentId] || attempt.studentId}
                                            {" • "}
                                          </>
                                        )}
                                        {attempt.theme}
                                        {" • "}
                                        {attempt.correct}/{attempt.total} ({attempt.percentage}%)
                                        {" • "}
                                        {formatDateTime(attempt.createdAt)}
                                      </p>

                                      <div className="space-y-2">
                                        {attempt.answers.map((answer, index) => {
                                          const question = questionsById[answer.questionId];
                                          const selectedText =
                                            answer.selectedOptionIndex >= 0 && question?.options?.[answer.selectedOptionIndex]
                                              ? question.options[answer.selectedOptionIndex]
                                              : "No answer";
                                          const correctText =
                                            answer.correctOptionIndex >= 0 && question?.options?.[answer.correctOptionIndex]
                                              ? question.options[answer.correctOptionIndex]
                                              : "N/A";

                                          return (
                                            <div key={`${answer.questionId}-${index}`} className="rounded-lg border border-slate-200/60 bg-slate-50/50 p-2.5">
                                              <p className="text-xs font-medium text-slate-900">
                                                {index + 1}. {question?.question || answer.questionId}
                                              </p>
                                              <p className={`mt-1 text-xs ${answer.isCorrect ? "text-emerald-700" : "text-rose-700"}`}>
                                                {answer.isCorrect ? "Correct" : "Incorrect"} • Student: {selectedText}
                                              </p>
                                              {!answer.isCorrect && <p className="text-xs text-slate-600">Correct: {correctText}</p>}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}

                        {visibleAttempts.length === 0 && (
                          <tr>
                            <td colSpan={isTeacher ? 7 : 5} className="px-3 py-10 text-center">
                              <HelpCircle className="mx-auto mb-2 h-7 w-7 text-slate-400" />
                              <p className="text-sm font-semibold text-slate-700">
                                {isTeacher
                                  ? "No quiz attempts found for this course."
                                  : "You have no attempts in this course yet."}
                              </p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                {selectedThemeStats && (
                  <section className="rounded-2xl border border-slate-200/60 bg-white shadow-sm">
                    <div className="border-b border-slate-200/60 px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-indigo-700" />
                        <p className="text-base font-bold text-slate-900">
                          Theme performance detail
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        A focused look at {selectedThemeStats.theme} within this course.
                      </p>
                    </div>

                    <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                      <div className="rounded-xl border border-slate-200/60 bg-slate-50/50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              Average performance
                            </p>
                            <p className="text-xs text-slate-500">
                              Based on all recorded attempts for this theme.
                            </p>
                          </div>
                          <p className="text-lg font-extrabold text-indigo-700">
                            {selectedThemeStats.avgScore.toFixed(1)}%
                          </p>
                        </div>
                        <progress
                          max={100}
                          value={Math.max(0, Math.min(100, selectedThemeStats.avgScore))}
                          className="mt-3 h-2.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-indigo-500 [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-indigo-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-slate-200/60 bg-white px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Students
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {selectedThemeStats.uniqueStudents}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200/60 bg-white px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Questions
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {selectedThemeStats.totalQuestions}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200/60 bg-white px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Best score
                          </p>
                          <p className="mt-1 text-sm font-semibold text-emerald-700">
                            {selectedThemeStats.bestScore}%
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200/60 bg-white px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Attempts
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {selectedThemeStats.attempts}
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
