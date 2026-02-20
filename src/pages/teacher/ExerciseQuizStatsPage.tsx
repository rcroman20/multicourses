import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { collection, deleteDoc, doc, getDocs, query, where } from "firebase/firestore";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAcademic } from "@/contexts/AcademicContext";
import { useAuth } from "@/contexts/AuthContext";
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
  School,
  Brain,
  HelpCircle,
  Edit3,
  BookMarked,
  Layers,
  TrendingDown,
  ArrowUp,
  ArrowDown,
  Filter,
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
  const isTeacher = user?.role === "docente";

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

  const availableCourses = useMemo(() => {
    if (!user) return [];
    if (isTeacher) {
      return courses.filter((course) => course.teacherId === user.id);
    }
    return courses.filter(
      (course) =>
        course.enrolledStudents?.includes(user.id) ||
        course.enrolledStudents?.some((student: unknown) => {
          if (typeof student === "string") return student === user.id;
          if (student && typeof student === "object" && "id" in student) {
            return (student as { id: string }).id === user.id;
          }
          return false;
        }),
    );
  }, [courses, isTeacher, user]);

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

  useEffect(() => {
    if (availableCourses.length === 0) {
      if (selectedCourseId) setSelectedCourseId("");
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

    const globalCourse = availableCourses.find((course) => course.id === selectedCourseId);
    if (globalCourse) {
      if (courseCode !== globalCourse.code) {
        navigate(`/courses/${globalCourse.code}/exercise-bank/stats`, { replace: true });
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
    const loadData = async () => {
      if (!selectedCourseId) return;

      setLoading(true);
      try {
        const attemptsQuery = isTeacher
          ? query(
              collection(firebaseDB, "quizAttempts"),
              where("courseId", "==", selectedCourseId),
            )
          : query(
              collection(firebaseDB, "quizAttempts"),
              where("courseId", "==", selectedCourseId),
              where("studentId", "==", user?.id || ""),
            );

        const [attemptsSnapshot, studentsSnapshot, questionsSnapshot] = await Promise.all([
          getDocs(attemptsQuery),
          isTeacher ? getDocs(collection(firebaseDB, "estudiantes")) : Promise.resolve(null),
          getDocs(
            query(
              collection(firebaseDB, "exerciseQuestions"),
              where("courseId", "==", selectedCourseId),
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

        setAttempts(loadedAttempts);
        setQuestions(loadedQuestions);
        setStudentNames(names);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isTeacher, selectedCourseId, user?.email, user?.id, user?.name]);

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
    <DashboardLayout
      title="Quiz Statistics"
      subtitle={selectedCourse ? `${selectedCourse.name} • ${selectedCourse.code}` : "Select a course"}
      contentClassName="pt-0 lg:pt-1"
    >
      <div className="space-y-2">
        {/* Header con gradiente - Estilo StudentDashboard */}
        <div className="bg-blue-600 rounded-2xl p-4 md:p-5 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <BarChart3 className="h-4 w-4 text-white" />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg">
                  {isTeacher ? "Student Performance Analytics" : "My Quiz Attempts"}
                </h3>
                <p className="text-blue-100 text-sm">
                  {isTeacher
                    ? "Track quiz attempts, averages, and identify areas for improvement."
                    : "Review your attempts, scores, and mistakes by theme."}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                to={selectedCourse ? `/courses/${selectedCourse.code}/exercise-bank` : "/courses"}
                className="inline-flex items-center gap-2 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm px-4 py-2.5 text-sm font-medium text-white transition-all"
              >
                <ChevronLeft className="h-4 w-4" />
                Back to Exercise Bank
              </Link>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center min-h-[400px] bg-white border border-gray-200 rounded-2xl p-8">
            <div className="text-center space-y-2">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
              <div className="space-y-2">
                <p className="text-lg font-semibold text-gray-900">Loading statistics</p>
                <p className="text-sm text-gray-600">Preparing your performance data...</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
              <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow duration-300">
                <div className="flex items-center justify-between">
                  <div className="w-full sm:w-auto text-center sm:text-left">
                    <p className="text-xs font-semibold mb-1 text-blue-600 tracking-wide">
                      Total Themes
                    </p>
                    <p className="text-xl md:text-xl font-bold text-gray-900">
                      {themeStats.length}
                    </p>
                  </div>
                  <div className="hidden sm:flex h-8 w-8 rounded-xl bg-blue-100 items-center justify-center flex-shrink-0">
                    <Layers className="h-4 w-4 text-blue-500" />
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow duration-300">
                <div className="flex items-center justify-between">
                  <div className="w-full sm:w-auto text-center sm:text-left">
                    <p className="text-xs font-semibold mb-1 text-blue-600 tracking-wide">
                      Total Attempts
                    </p>
                    <p className="text-xl md:text-xl font-bold text-gray-900">
                      {attempts.length}
                    </p>
                  </div>
                  <div className="hidden sm:flex h-8 w-8 rounded-xl bg-blue-100 items-center justify-center flex-shrink-0">
                    <Activity className="h-4 w-4 text-blue-500" />
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow duration-300">
                <div className="flex items-center justify-between">
                  <div className="w-full sm:w-auto text-center sm:text-left">
                    <p className="text-xs font-semibold mb-1 text-blue-600 tracking-wide">
                      Average Score
                    </p>
                    <p className="text-xl md:text-xl font-bold text-gray-900">
                      {averageScore.toFixed(1)}%
                    </p>
                  </div>
                  <div className="hidden sm:flex h-8 w-8 rounded-xl bg-blue-100 items-center justify-center flex-shrink-0">
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow duration-300">
                <div className="flex items-center justify-between">
                  <div className="w-full sm:w-auto text-center sm:text-left">
                    <p className="text-xs font-semibold mb-1 text-blue-600 tracking-wide">
                      Pass Rate
                    </p>
                    <p className="text-xl md:text-xl font-bold text-gray-900">
                      {passRate.toFixed(1)}%
                    </p>
                  </div>
                  <div className="hidden sm:flex h-8 w-8 rounded-xl bg-blue-100 items-center justify-center flex-shrink-0">
                    <AwardIcon className="h-4 w-4 text-blue-500" />
                  </div>
                </div>
              </div>
            </div>

            {/* Contenido principal */}
            <div className="space-y-6">
              {/* Filtros y temas */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Selector de temas */}
                <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300 h-full">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                        <Filter className="h-4 w-4 text-blue-500" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">
                          {isTeacher ? "Filter by Theme" : "My Themes"}
                        </h2>
                        <p className="text-sm text-gray-600"> 
                          {themeStats.length} themes available
                        </p>
                      </div>
                    </div>
                  </div>
 
                  <div className="space-y-2">
                    <button
                      onClick={() => setSelectedTheme("all")}
                      className={`w-full text-left px-4 py-3 rounded-xl transition-all ${
                        selectedTheme === "all"
                          ? "bg-blue-600 text-white shadow-md"
                          : "bg-gray-50 hover:bg-gray-100 text-gray-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{isTeacher ? "All Themes" : "All My Themes"}</span>
                        <span className="text-sm opacity-80">{attempts.length} attempts</span>
                      </div>
                    </button>

                    {themeStats.map((item) => (
                      <button
                        key={item.theme}
                        onClick={() => setSelectedTheme(item.theme)}
                        className={`w-full text-left px-4 py-3 rounded-xl transition-all ${
                          selectedTheme === item.theme
                            ? "bg-blue-600 text-white shadow-md"
                            : "bg-gray-50 hover:bg-gray-100 text-gray-700"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium whitespace-normal break-words pr-2">{item.theme}</span>
                          <span className="text-sm opacity-80">{item.attempts} attempts</span>
                        </div>
                      </button>
                    ))}

                    {themeStats.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">
                        No themes with attempts yet
                      </p>
                    )}
                  </div>
                </div>

                {/* Resumen de tema seleccionado */}
                {selectedTheme !== "all" && (
                  <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm h-full">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Target className="h-4 w-4 text-blue-500" />
                      </div>
                        <h3 className="font-semibold text-gray-900">Theme Overview</h3>
                    </div>

                    {themeStats.filter(t => t.theme === selectedTheme).map(stat => (
                      <div key={stat.theme} className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Students</span>
                          <span className="font-semibold text-gray-900">{stat.uniqueStudents}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Avg. Score</span>
                          <span className="font-semibold text-blue-600">{stat.avgScore.toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Best Score</span>
                          <span className="font-semibold text-gray-700">{stat.bestScore}%</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Total Questions</span>
                          <span className="font-semibold text-gray-900">{stat.totalQuestions}</span>
                        </div>

                        <div className="pt-3 mt-3 border-t border-gray-200">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${stat.avgScore}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-2 text-center">
                            Average performance
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              </div>

              

              {/* Debajo de filtros: Intentos y detalles */}
              <div>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                        {isTeacher ? (
                          <Users className="h-4 w-4 text-blue-500" />
                        ) : (
                          <BookOpen className="h-4 w-4 text-blue-500" />
                        )}
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">
                          {isTeacher ? "Quiz Attempts" : "My Attempts"}
                        </h2>
                        <p className="text-sm text-gray-600">
                          {visibleAttempts.length} attempts found
                        </p>
                      </div>
                    </div>
                    
                    {/* Controles de búsqueda y ordenamiento */}
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {isTeacher && (
                        <input
                          type="text"
                          value={studentSearchQuery}
                          onChange={(event) => setStudentSearchQuery(event.target.value)}
                          placeholder="Search student..."
                          className="w-full sm:w-52 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        />
                      )}
                      <button
                        onClick={() => toggleSort("date")}
                        className={`p-2 rounded-lg text-sm flex items-center gap-1 ${
                          sortBy === "date" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                        title="Sort by date"
                      >
                        <Clock className="h-4 w-4" />
                        {sortBy === "date" && (sortOrder === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                      </button>
                      <button
                        onClick={() => toggleSort("score")}
                        className={`p-2 rounded-lg text-sm flex items-center gap-1 ${
                          sortBy === "score" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                        title="Sort by score"
                      >
                        <Trophy className="h-4 w-4" />
                        {sortBy === "score" && (sortOrder === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                      </button>
                      <button
                        onClick={() => toggleSort("student")}
                        disabled={!isTeacher}
                        className={`p-2 rounded-lg text-sm flex items-center gap-1 ${
                          sortBy === "student"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                        title={isTeacher ? "Sort by student" : "Only for teacher view"}
                      >
                        <Users className="h-4 w-4" />
                        {sortBy === "student" && (sortOrder === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          {isTeacher && <th className="px-4 py-3">Student</th>}
                          <th className="px-4 py-3">Theme</th>
                          <th className="px-4 py-3">Score</th>
                          <th className="px-4 py-3">Result</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3 text-right">Attempt Details</th>
                          {isTeacher && <th className="px-4 py-3 text-right">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {visibleAttempts.map((attempt) => {
                          const isExpanded = expandedAttemptId === attempt.id;
                          return (
                            <Fragment key={attempt.id}>
                              <tr
                                onClick={() => {
                                  setExpandedAttemptId((prev) => (prev === attempt.id ? null : attempt.id));
                                }}
                                className={`cursor-pointer transition-colors ${
                                  isExpanded ? "bg-blue-50 hover:bg-blue-100" : "hover:bg-gray-50"
                                }`}
                              >
                                {isTeacher && (
                                  <td className="px-4 py-3 font-medium text-gray-900">
                                    {studentNames[attempt.studentId] || attempt.studentId}
                                  </td>
                                )}
                                <td className="px-4 py-3">
                                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                                    {attempt.theme}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`font-semibold ${
                                    attempt.percentage >= 80 ? 'text-blue-600' :
                                    attempt.percentage >= 60 ? 'text-gray-700' : 'text-gray-800'
                                  }`}>
                                    {attempt.percentage}%
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="text-sm">
                                    {attempt.correct}/{attempt.total}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-gray-500 text-xs">
                                  {formatDate(attempt.createdAt)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setExpandedAttemptId((prev) => (prev === attempt.id ? null : attempt.id));
                                    }}
                                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                                  >
                                    {isExpanded ? "Hide" : "Show"}
                                    <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                  </button>
                                </td>
                                {isTeacher && (
                                  <td className="px-4 py-3 text-right">
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void handleDeleteAttempt(attempt.id);
                                      }}
                                      disabled={deletingAttemptId === attempt.id}
                                      className="inline-flex items-center justify-center rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                      title="Delete attempt"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </td>
                                )}
                              </tr>

                              {isExpanded && (
                                <tr className="bg-gray-50/70">
                                  <td colSpan={isTeacher ? 7 : 5} className="px-4 py-3">
                                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                                      <p className="text-xs text-gray-600 mb-3">
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
                                            <div key={`${answer.questionId}-${index}`} className="rounded-lg border border-gray-200 p-2.5">
                                              <p className="text-xs font-medium text-gray-900">
                                                {index + 1}. {question?.question || answer.questionId}
                                              </p>
                                              <p className={`mt-1 text-xs ${answer.isCorrect ? "text-blue-700" : "text-gray-700"}`}>
                                                {answer.isCorrect ? "Correct" : "Incorrect"} • Student: {selectedText}
                                              </p>
                                              {!answer.isCorrect && (
                                                <p className="text-xs text-gray-600">Correct: {correctText}</p>
                                              )}
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
                            <td colSpan={isTeacher ? 7 : 5} className="px-4 py-8 text-center text-gray-500">
                              <div className="flex flex-col items-center">
                                <HelpCircle className="h-8 w-8 text-gray-400 mb-2" />
                                <p>
                                  {isTeacher
                                    ? "No quiz attempts found for this course."
                                    : "You have no attempts in this course yet."}
                                </p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
