// src/App.tsx
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AcademicProvider } from "@/contexts/AcademicContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

// Importar páginas en orden lógico
// 1. Páginas públicas
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import AuthPage from "./pages/shared/AuthPage";

// 2. Dashboards principales
import StudentDashboard from "./pages/students/StudentDashboard";
import TeacherDashboard from "./pages/teacher/TeacherDashboard";

// 3. Páginas compartidas (estudiantes y profesores)
import CoursesPage from "./pages/shared/CoursesPage";
import GradesPage from "./pages/shared/GradesPage";
import SlidesPage from "./pages/shared/SlidesPage";
import CourseFilesPage from "./pages/shared/CourseFilesPage";
import AssessmentsPage from "./pages/shared/AssessmentsPage";
import AssessmentDetailPage from "./pages/shared/AssessmentDetailPage";

// 4. Páginas exclusivas de profesores (organizadas por categoría)
// 4.1 Gestión de cursos
import CreateCoursePage from "./pages/teacher/CreateCoursePage";
import CoursesEditPage from "./pages/teacher/CoursesEditPage";

// 4.2 Gestión de estudiantes
import StudentsList from "./pages/teacher/StudentsList";
import StudentDetailPage from "./pages/teacher/StudentDetailPage";
import EnrollStudentPage from "./pages/teacher/EnrollStudentPage";

// 4.3 Gestión de calificaciones
import GradeSheetsPage from "./pages/teacher/GradeSheetsPage";
import GradeSheetEditPage from "./pages/teacher/GradeSheetEditPage";
import GradeAssessmentPage from "./pages/teacher/GradeAssessmentPage";

// 4.4 Estadísticas
import StatsPage from "./pages/teacher/StatsPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <AcademicProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
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
                    <CourseFilesPage />
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
                element={<Navigate to="/courses/:courseCode/assessments" replace />} 
              />
              <Route 
                path="/cursos/:courseCode/homework/:assessmentId" 
                element={<Navigate to="/courses/:courseCode/assessments/:assessmentId" replace />} 
              />
              <Route 
                path="/cursos/:courseCode/homework/:assessmentId/calificar" 
                element={<Navigate to="/courses/:courseCode/assessments/:assessmentId/grade" replace />} 
              />

              {/* ========== 404 ========== */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AcademicProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;