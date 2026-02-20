// src/App.tsx
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, matchPath, useParams } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AcademicProvider } from "@/contexts/AcademicContext";
import { useAuth } from "@/contexts/AuthContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { CookieConsentBanner } from "@/components/common/CookieConsentBanner";

// Importar páginas en orden lógico
// 1. Páginas públicas
const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AuthPage = lazy(() => import("./pages/shared/AuthPage"));

// 2. Dashboards principales
const StudentDashboard = lazy(() => import("./pages/students/StudentDashboard"));
const TeacherDashboard = lazy(() => import("./pages/teacher/TeacherDashboard"));
 
// 3. Páginas compartidas (estudiantes y profesores)
const CoursesPage = lazy(() => import("./pages/shared/CoursesPage"));
const GradesPage = lazy(() => import("./pages/shared/GradesPage"));
const SlidesPage = lazy(() => import("./pages/shared/SlidesPage"));
const CalendarPage = lazy(() => import("./pages/shared/CalendarPage"));
const AssessmentsPage = lazy(() => import("./pages/shared/AssessmentsPage"));
const AssessmentDetailPage = lazy(() => import("./pages/shared/AssessmentDetailPage"));

const FileManager = lazy(() => import("./pages/shared/FileManager"));
const ExerciseBankPage = lazy(() => import("./pages/shared/ExerciseBankPage"));
const ExerciseQuizStatsPage = lazy(() => import("./pages/teacher/ExerciseQuizStatsPage"));
const ProfileSettingsPage = lazy(() => import("./pages/shared/ProfileSettingsPage"));

// 4. Páginas exclusivas de profesores (organizadas por categoría)
// 4.1 Gestión de cursos
const CreateCoursePage = lazy(() => import("./pages/teacher/CreateCoursePage"));
const CoursesEditPage = lazy(() => import("./pages/teacher/CoursesEditPage"));

// 4.2 Gestión de estudiantes
const StudentsList = lazy(() => import("./pages/teacher/StudentsList"));
const StudentDetailPage = lazy(() => import("./pages/teacher/StudentDetailPage"));
const EnrollStudentPage = lazy(() => import("./pages/teacher/EnrollStudentPage"));

// 4.3 Gestión de calificaciones
const GradeSheetsPage = lazy(() => import("./pages/teacher/GradeSheetsPage"));
const GradeSheetEditPage = lazy(() => import("./pages/teacher/GradeSheetEditPage"));
const GradeAssessmentPage = lazy(() => import("./pages/teacher/GradeAssessmentPage"));

// 4.4 Estadísticas
const StatsPage = lazy(() => import("./pages/teacher/StatsPage"));
const NotificationsPage = lazy(() => import("./pages/teacher/NotificationsPage"));

const queryClient = new QueryClient();
const APP_NAME = "MultiCourses";

type TitleRule = {
  path: string;
  title: string | ((params: Record<string, string | undefined>) => string);
};

const titleRules: TitleRule[] = [
  { path: "/", title: "Home" },
  { path: "/auth", title: "Authentication" },
  { path: "/student", title: "Students Dashboard" },
  { path: "/teacher", title: "Teacher Dashboard" },
  { path: "/courses", title: "Courses" },
  { path: "/courses/view/:courseCode", title: ({ courseCode }) => `Course Detail ${courseCode ? `(${courseCode})` : ""}`.trim() },
  { path: "/courses/create", title: "Create Course" },
  { path: "/courses/:courseCode/edit", title: "Edit Course" },
  {
    path: "/courses/:courseCode/files",
    title: ({ courseCode }) => `Files ${courseCode ? `(${courseCode})` : ""}`.trim(),
  },
  {
    path: "/courses/:courseCode/exercise-bank/stats",
    title: ({ courseCode }) => `Exercise Quiz Statistics ${courseCode ? `(${courseCode})` : ""}`.trim(),
  },
  {
    path: "/courses/:courseCode/exercise-bank",
    title: ({ courseCode }) => `Exercise Bank ${courseCode ? `(${courseCode})` : ""}`.trim(),
  },
  {
    path: "/courses/:courseCode/assessments/:assessmentId/grade",
    title: "Grade Assessment",
  },
  {
    path: "/courses/:courseCode/assessments/:assessmentId",
    title: "Assessment Detail",
  },
  {
    path: "/courses/:courseCode/assessments",
    title: ({ courseCode }) => `Assessments ${courseCode ? `(${courseCode})` : ""}`.trim(),
  },
  { path: "/grades", title: "Grades" },
  { path: "/slides", title: "Slides" },
  { path: "/calendar", title: "Calendar" },
  { path: "/profile", title: "Profile" },
  { path: "/teacher/profile/:userId", title: "Profile" },
  { path: "/student/profile/:userId", title: "Profile" },
  { path: "/students/list", title: "Students List" },
  { path: "/students/:studentId", title: "Student Detail" },
  { path: "/students/:studentId/enroll", title: "Enroll Student" },
  {
    path: "/courses/:courseCode/grade-sheets",
    title: ({ courseCode }) => `Grade Sheets ${courseCode ? `(${courseCode})` : ""}`.trim(),
  },
  {
    path: "/courses/:courseCode/grade-sheets/new",
    title: ({ courseCode }) => `Grade Sheets ${courseCode ? `(${courseCode})` : ""}`.trim(),
  },
  {
    path: "/courses/:courseCode/grade-sheets/:gradeSheetId/edit",
    title: "Edit Grade Sheet",
  },
  { path: "/statistics", title: "Academic Statistics" },
  { path: "/teacher/notifications", title: "Notifications Center" },
  { path: "*", title: "Page Not Found" },
];

function getDocumentTitle(pathname: string): string {
  for (const rule of titleRules) {
    const match = matchPath({ path: rule.path, end: true }, pathname);
    if (match) {
      const pageTitle =
        typeof rule.title === "function" ? rule.title(match.params) : rule.title;
      return `${pageTitle} | ${APP_NAME}`;
    }
  }

  return APP_NAME;
}

function DocumentTitleManager() {
  const { pathname } = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    const isProfilePath =
      pathname === "/profile" ||
      pathname.startsWith("/teacher/profile/") ||
      pathname.startsWith("/student/profile/");

    if (isProfilePath && user?.name) {
      document.title = `${user.name} | ${APP_NAME}`;
      return;
    }

    document.title = getDocumentTitle(pathname);
  }, [pathname, user?.name]);

  return null;
}

function GradeSheetsNewRedirect() {
  const { courseCode } = useParams<{ courseCode: string }>();
  return <Navigate to={`/courses/${courseCode || ""}/grade-sheets`} replace />;
}

function HomeworkAssessmentsRedirect() {
  const { courseCode } = useParams<{ courseCode: string }>();
  return <Navigate to={`/courses/${courseCode || ""}/assessments`} replace />;
}

function HomeworkAssessmentDetailRedirect() {
  const { courseCode, assessmentId } = useParams<{ courseCode: string; assessmentId: string }>();
  return <Navigate to={`/courses/${courseCode || ""}/assessments/${assessmentId || ""}`} replace />;
}

function HomeworkAssessmentGradeRedirect() {
  const { courseCode, assessmentId } = useParams<{ courseCode: string; assessmentId: string }>();
  return <Navigate to={`/courses/${courseCode || ""}/assessments/${assessmentId || ""}/grade`} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
          <AcademicProvider>
            <NotificationProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter future={{ v7_relativeSplatPath: true }}>
              <DocumentTitleManager />
              <Suspense fallback={<div className="min-h-screen bg-background" />}>
                <Routes>
              {/* ========== RUTAS PÚBLICAS ========== */}
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<AuthPage />} />

              {/* ========== RUTAS DE DASHBOARD PRINCIPAL ========== */}
              <Route
                path="/student"
                element={
                  <ProtectedRoute requiredRole="estudiante">
                    <StudentDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/teacher"
                element={
                  <ProtectedRoute requiredRole="docente">
                    <TeacherDashboard />
                  </ProtectedRoute>
                }
              />

              

              {/* ========== RUTAS COMPARTIDAS ========== */}
              {/* Cursos */}
              <Route
                path="/courses"
                element={
                  <ProtectedRoute>
                    <CoursesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/courses/view/:courseCode"
                element={
                  <ProtectedRoute>
                    <CoursesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/courses/:courseCode/files"
                element={
                  <ProtectedRoute>
                    <FileManager />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/courses/:courseCode/exercise-bank"
                element={
                  <ProtectedRoute>
                    <ExerciseBankPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/courses/:courseCode/exercise-bank/stats"
                element={
                  <ProtectedRoute>
                    <ExerciseQuizStatsPage />
                  </ProtectedRoute>
                }
              />

              {/* Evaluaciones/Homework */}
              <Route
                path="/courses/:courseCode/assessments"
                element={
                  <ProtectedRoute>
                    <AssessmentsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/courses/:courseCode/assessments/:assessmentId"
                element={
                  <ProtectedRoute>
                    <AssessmentDetailPage />
                  </ProtectedRoute>
                }
              />
 
              {/* Calificaciones */}
              <Route
                path="/grades"
                element={
                  <ProtectedRoute>
                    <GradesPage />
                  </ProtectedRoute>
                }
              />

              {/* Diapositivas */}
              <Route
                path="/slides"
                element={
                  <ProtectedRoute>
                    <SlidesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/calendar"
                element={
                  <ProtectedRoute>
                    <CalendarPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <ProfileSettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/teacher/profile/:userId"
                element={
                  <ProtectedRoute requiredRole="docente">
                    <ProfileSettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/student/profile/:userId"
                element={
                  <ProtectedRoute requiredRole="estudiante">
                    <ProfileSettingsPage />
                  </ProtectedRoute>
                }
              />
          

              {/* ========== RUTAS EXCLUSIVAS DE PROFESORES ========== */}
              {/* Gestión de Cursos */}
              <Route
                path="/courses/create"
                element={
                  <ProtectedRoute requiredRole="docente">
                    <CreateCoursePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/courses/:courseCode/edit"
                element={
                  <ProtectedRoute requiredRole="docente">
                    <CoursesEditPage />
                  </ProtectedRoute>
                }
              />

              {/* Gestión de Estudiantes */}
              <Route
                path="/students/list"
                element={
                  <ProtectedRoute requiredRole="docente">
                    <StudentsList />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/students/:studentId"
                element={
                  <ProtectedRoute requiredRole="docente">
                    <StudentDetailPage />
                  </ProtectedRoute>
                }
              />



              <Route
                path="/students/:studentId/enroll"
                element={
                  <ProtectedRoute requiredRole="docente">
                    <EnrollStudentPage />
                  </ProtectedRoute>
                }
              />

              {/* Gestión de Calificaciones */}
              <Route
                path="/courses/:courseCode/grade-sheets"
                element={
                  <ProtectedRoute requiredRole="docente">
                    <GradeSheetsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/courses/:courseCode/grade-sheets/new"
                element={<GradeSheetsNewRedirect />}
              />
              <Route
                path="/courses/:courseCode/grade-sheets/:gradeSheetId/edit"
                element={
                  <ProtectedRoute requiredRole="docente">
                    <GradeSheetEditPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/courses/:courseCode/assessments/:assessmentId/grade"
                element={
                  <ProtectedRoute requiredRole="docente">
                    <GradeAssessmentPage />
                  </ProtectedRoute>
                }
              />

              {/* Estadísticas */}
              <Route
                path="/statistics"
                element={
                  <ProtectedRoute requiredRole="docente">
                    <StatsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/teacher/notifications"
                element={
                  <ProtectedRoute requiredRole="docente">
                    <NotificationsPage />
                  </ProtectedRoute>
                }
              />

              {/* ========== REDIRECCIONES ========== */}
              {/* Redirigir rutas antiguas */}
              <Route path="/estudiante" element={<Navigate to="/student" replace />} />
              <Route path="/docente" element={<Navigate to="/teacher" replace />} />
              <Route path="/estadisticas" element={<Navigate to="/statistics" replace />} />
              <Route path="/cursos/nuevo" element={<Navigate to="/courses/create" replace />} />
              <Route path="/estudiantes/lista" element={<Navigate to="/students/list" replace />} />
              <Route path="/notas" element={<Navigate to="/grades" replace />} />
              <Route path="/inscribir-estudiante" element={<Navigate to="/students/list" replace />} />
              <Route path="/diapositivas" element={<Navigate to="/slides" replace />} />
              
              {/* Redirigir rutas antiguas de homework */}
              <Route 
                path="/cursos/:courseCode/homework" 
                element={<HomeworkAssessmentsRedirect />} 
              />
              <Route 
                path="/cursos/:courseCode/homework/:assessmentId" 
                element={<HomeworkAssessmentDetailRedirect />} 
              />
              <Route 
                path="/cursos/:courseCode/homework/:assessmentId/calificar" 
                element={<HomeworkAssessmentGradeRedirect />} 
              />

              {/* ========== 404 ========== */}
              <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
              <CookieConsentBanner />
            </BrowserRouter>
          </NotificationProvider>
        </AcademicProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
