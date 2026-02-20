// src/pages/StudentDashboard.tsx - VERSIÓN CON PALETA JUVENIL VIBRANTE
import { useEffect, useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademic } from "@/contexts/AcademicContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { calculateStudentProgress } from "@/utils/gradeCalculations";
import type { Assessment, Course, Grade } from "@/types/academic";
import {
  BookOpen,
  GraduationCap,
  CheckCircle2,
  AlertCircle,
  ChevronRight, ArrowRight,
  BarChart3,
  FileText, 
  CalendarDays,
  Clock,
  Target,
  Award,
  Loader2,
  AlertTriangle,
  Presentation,
  ExternalLink,
  TrendingUp,
  Calendar,
  Zap,
  Rocket,
  Sparkles,
  UserPlus,
  Target as TargetIcon,
  Trophy,
} from "lucide-react";
import { collection, query, getDocs, orderBy } from "firebase/firestore";
import { firebaseDB } from "@/lib/firebase";
import { Timestamp } from "firebase/firestore";

interface GradeSheet {
  id: string;
  title: string;
  courseId: string;
  courseName: string;
  gradingPeriod: string;
  isPublished: boolean;
  students: Array<{
    studentId: string;
    total?: number;
    status: string;
  }>;
  updatedAt: Timestamp | Date;
}

interface StudentCourse extends Course {
  enrolledStudents: string[];
}

interface Slide {
  id: string;
  title: string;
  description: string;
  canvaUrl: string;
  createdAt: Timestamp | Date;
  weekId: string;
}

// Función para convertir timestamp de Firestore a Date
const convertToDate = (timestamp: Timestamp | Date | string | number): Date => {
  if (timestamp instanceof Date) return timestamp;
  if (timestamp instanceof Timestamp) return timestamp.toDate();
  if (typeof timestamp === 'string') return new Date(timestamp);
  if (typeof timestamp === 'number') return new Date(timestamp);
  return new Date();
};

const stripHtmlPreview = (value?: string): string => {
  if (!value) return "";
  try {
    const doc = new DOMParser().parseFromString(value, "text/html");
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  } catch {
    return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
};

export default function StudentDashboard() {
  const { user, isAuthenticated } = useAuth();
  const { courses, assessments, grades, loading } = useAcademic();
  const navigate = useNavigate();
  const [studentCourses, setStudentCourses] = useState<StudentCourse[]>([]);
  const [gradeSheets, setGradeSheets] = useState<GradeSheet[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [recentSlides, setRecentSlides] = useState<Slide[]>([]);
  const [loadingSlides, setLoadingSlides] = useState(false);
  const [upcomingAssessments, setUpcomingAssessments] = useState<Assessment[]>(
    [],
  );

  // Redirección para docentes
  useEffect(() => {
    if (isAuthenticated && user?.role === "docente") {
      navigate("/teacher", { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  // Cargar cursos del estudiante
  useEffect(() => {
    const loadStudentCourses = async () => {
      if (!user?.id) {
        console.log('❌ No hay usuario');
        return;
      }

      console.log('👤 Usuario:', user.id, user.name);
      console.log('📚 Todos los cursos:', courses.length);
      
      const enrolledCourses = courses.filter((course) => {
        const enrolledStudents = course.enrolledStudents || [];
        const isEnrolled = enrolledStudents.includes(user.id);
        console.log(`Curso ${course.code} - ${course.name}: ${isEnrolled ? 'INSCRITO' : 'NO inscrito'}`);
        return isEnrolled;
      }) as StudentCourse[];
      
      console.log('🎯 Cursos inscritos:', enrolledCourses.length);
      setStudentCourses(enrolledCourses);
    };

    if (user?.id) {
      loadStudentCourses();
    }
  }, [user, courses]);

  // Cargar hojas de calificaciones
  useEffect(() => {
    const loadGradeSheets = async () => {
      if (!user?.id) return;

      setLoadingSheets(true);
      try {
        const gradeSheetsRef = collection(firebaseDB, "gradeSheets");
        const q = query(gradeSheetsRef);
        const querySnapshot = await getDocs(q);

        const sheets: GradeSheet[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (!data.isPublished) return;

          const studentInSheet = data.students?.find(
            (s: any) => s.studentId === user.id,
          );
          if (!studentInSheet) return;

          sheets.push({
            id: doc.id,
            title: data.title || "Hoja de calificaciones",
            courseId: data.courseId || "",
            courseName: data.courseName || "Curso",
            gradingPeriod: data.gradingPeriod || "First Term",
            isPublished: data.isPublished,
            students: data.students || [],
            updatedAt: data.updatedAt || new Date(),
          });
        });

        console.log('📊 Hojas de calificación cargadas:', sheets.length);
        setGradeSheets(sheets);
      } catch (error) {
        console.error('Error loading grade sheets:', error);
      } finally {
        setLoadingSheets(false);
      }
    };

    if (user?.id) loadGradeSheets();
  }, [user]);

  // Cargar slides más recientes
  useEffect(() => {
    const loadRecentSlides = async () => {
      if (!user?.id || studentCourses.length === 0) {
        setRecentSlides([]);
        return;
      }

      setLoadingSlides(true);
      try {
        const slidesRef = collection(firebaseDB, "diapositivas");

        const slides: Slide[] = [];
        const q = query(slidesRef, orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (slides.length < 3) {
            slides.push({
              id: doc.id,
              title: data.title || "Slide",
              description: data.description || "",
              canvaUrl: data.canvaUrl || "",
              createdAt: data.createdAt || new Date(),
              weekId: data.weekId || "",
            });
          }
        });

        console.log('📰 Slides cargados:', slides.length);
        setRecentSlides(slides);
      } catch (error) {
        console.error('Error loading slides:', error);
      } finally {
        setLoadingSlides(false);
      }
    };

    if (user?.id && studentCourses.length > 0) {
      loadRecentSlides();
    }
  }, [user, studentCourses]);

  // Filtrar actividades próximas a vencer
  useEffect(() => {
    console.log('🔍 Calculando actividades próximas...');
    console.log('📝 Usuario:', user?.id);
    console.log('📋 Assessments disponibles:', assessments.length);
    console.log('📚 Cursos del estudiante:', studentCourses.length);
    
    if (!user?.id || !assessments.length || !studentCourses.length) {
      console.log('❌ No hay datos suficientes');
      setUpcomingAssessments([]);
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    const studentCourseIds = studentCourses.map((course) => course.id);
    console.log('🎯 IDs de cursos del estudiante:', studentCourseIds);

    const upcoming = assessments
      .filter((assessment) => {
        console.log(`\n📝 Assessment: ${assessment.name}`);
        console.log('  Course ID:', assessment.courseId);
        console.log('  Due Date:', assessment.dueDate);
        console.log('  Status:', assessment.status);
        
        const isInStudentCourse = studentCourseIds.includes(assessment.courseId);
        console.log('  ¿Pertenece a curso del estudiante?', isInStudentCourse);
        
        if (!isInStudentCourse) {
          console.log('  ❌ No pertenece a curso del estudiante');
          return false;
        }
        
        if (!assessment.dueDate) {
          console.log('  ❌ No tiene fecha de vencimiento');
          return false;
        }

        // Parsear fecha
        let dueDate: Date;
        try {
          dueDate = convertToDate(assessment.dueDate);
        } catch (error) {
          console.log('  ❌ Error parseando fecha:', error);
          return false;
        }
        
        dueDate.setHours(0, 0, 0, 0);
        console.log('  📅 Fecha parseada:', dueDate);
        console.log('  📅 Hoy:', today);
        console.log('  📅 Próxima semana:', nextWeek);
        
        const isUpcoming = dueDate >= today && dueDate <= nextWeek;
        console.log('  ¿Está entre hoy y próxima semana?', isUpcoming);
        
        // Definir tipos de status válidos
        type AssessmentStatus = 'draft' | 'published' | 'graded' | 'deleted' | 'archived';
        const status = assessment.status as AssessmentStatus;
        
        const isValidStatus = status !== 'deleted' && status !== 'archived';
        console.log('  ¿Status válido?', isValidStatus);
        
        const shouldInclude = isUpcoming && isValidStatus;
        console.log('  ¿Incluir?', shouldInclude);
        
        return shouldInclude;
      })
      .sort((a, b) => {
        const dateA = convertToDate(a.dueDate || '').getTime();
        const dateB = convertToDate(b.dueDate || '').getTime();
        return dateA - dateB;
      })
      .slice(0, 3);

    console.log('✅ Actividades próximas encontradas:', upcoming.length);
    console.log('📋 Lista:', upcoming.map(a => ({
      name: a.name,
      courseId: a.courseId,
      dueDate: a.dueDate,
      status: a.status
    })));
    
    setUpcomingAssessments(upcoming);
  }, [assessments, user, studentCourses]);

  // Calcular promedios desde hojas de calificaciones
  const calculateCourseAverages = useMemo(() => {
    const averages = new Map<
      string,
      { average: number; sheets: GradeSheet[] }
    >();

    if (!user?.id) return averages;

    gradeSheets.forEach((sheet) => {
      const studentData = sheet.students.find((s) => s.studentId === user.id);
      if (!studentData || studentData.total === undefined) return;

      if (!averages.has(sheet.courseId)) {
        averages.set(sheet.courseId, { average: 0, sheets: [] });
      }

      const courseData = averages.get(sheet.courseId)!;
      courseData.sheets.push(sheet);
      courseData.average =
        courseData.sheets.reduce((sum, s) => {
          const student = s.students.find((st) => st.studentId === user.id);
          return sum + (student?.total || 0);
        }, 0) / courseData.sheets.length;
    });

    return averages;
  }, [gradeSheets, user?.id]);

  // Calcular progreso por curso
  const courseProgress = useMemo(() => {
    if (!user?.id) return [];

    return studentCourses.map((course) => {
      const courseAssessments = assessments.filter(
        (a) => a.courseId === course.id,
      );
      const realAverage = calculateCourseAverages.get(course.id);

      let progress;
      if (realAverage && realAverage.sheets.length > 0) {
        progress = {
          studentId: user.id,
          courseId: course.id,
          currentGrade: realAverage.average,
          evaluatedPercentage: 100,
          remainingPercentage: 0,
          minGradeToPass: realAverage.average >= 3.0 ? 0 : 3.0,
          status:
            realAverage.average >= 3.5
              ? "passing"
              : realAverage.average >= 2.5
                ? "at-risk"
                : "failing",
          grades: [] as Grade[],
        };
      } else {
        progress = calculateStudentProgress(
          user.id,
          course.id,
          grades,
          courseAssessments,
        );
      }

      return {
        course,
        progress,
        realSheets: realAverage?.sheets || [],
        hasRealGrades:
          realAverage?.sheets.length > 0 ||
          (progress.grades && progress.grades.length > 0) ||
          grades.filter(
            (g) => g.courseId === course.id && g.studentId === user.id,
          ).length > 0,
      };
    });
  }, [studentCourses, assessments, grades, calculateCourseAverages, user?.id]);

  // Estadísticas calculadas
  const totalCourses = studentCourses.length;

  const {
    passingCourses,
    atRiskCourses,
    failingCourses,
    averageGrade,
    completedCourses,
  } = useMemo(() => {
    let passing = 0;
    let atRisk = 0;
    let failing = 0;
    let completed = 0;
    let totalGrade = 0;
    let coursesWithGrades = 0;

    courseProgress.forEach((cp) => {
      // Solo contar cursos con datos reales
      if (cp.hasRealGrades) {
        coursesWithGrades++;
        totalGrade += cp.progress.currentGrade;

        if (cp.progress.currentGrade >= 3.0) {
          completed++;
        }

        if (cp.progress.status === "passing") passing++;
        else if (cp.progress.status === "at-risk") atRisk++;
        else if (cp.progress.status === "failing") failing++;
      }
    });

    return {
      passingCourses: passing,
      atRiskCourses: atRisk,
      failingCourses: failing,
      completedCourses: completed,
      averageGrade: coursesWithGrades > 0 ? totalGrade / coursesWithGrades : 0,
    };
  }, [courseProgress]);

  // Últimas calificaciones
  const recentGrades = useMemo(() => {
    return gradeSheets
      .sort((a, b) => {
        const dateA = convertToDate(a.updatedAt).getTime();
        const dateB = convertToDate(b.updatedAt).getTime();
        return dateB - dateA;
      })
      .slice(0, 3);
  }, [gradeSheets]);

  // Mostrar loading
  if (loading.courses || loadingSheets) {
    return (
      <DashboardLayout
        title={`Welcome, ${user?.name?.split(" ")[0]}`}
        subtitle="Your academic progress"
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary-500 mx-auto" />
            <div className="space-y-2">
              <p className="text-lg font-semibold text-gray-900">Loading your dashboard</p>
              <p className="text-sm text-gray-600">
                Preparing your personalized academic overview
              </p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (studentCourses.length === 0) {
    return (
      <DashboardLayout
        title={`Hello, ${user?.name?.split(" ")[0]}!`}
        subtitle="Join a course to unlock your dashboard"
      >
<div className="min-h-[60vh] flex items-center justify-center px-4">
  <div className="w-full max-w-lg">
    {/* Tarjeta principal */}
    <div className="rounded-3xl border border-blue-100 bg-white p-8 text-center shadow-sm">
      
      {/* Contenido */}
      <div className="relative">
        {/* Icono principal animado */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100">
          <GraduationCap className="h-8 w-8 text-blue-600" />
        </div>

        {/* Textos */}
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Start your learning journey
        </h2>
        <p className="text-gray-600 max-w-sm mx-auto mb-8">
          Join your first course to access grades, activities, and study materials.
        </p> 
        <Link
          to="/courses"
          className="group mx-auto inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition-colors duration-300 hover:bg-blue-700"
        >
          <UserPlus className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
          <span>Join course</span>
          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
        </Link>

        {/* Botón con icono - VERSIÓN MEJORADA */}
        {/* Línea decorativa inferior */}
        <div className="mt-8 flex justify-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
          <div className="h-1.5 w-1.5 rounded-full bg-blue-300 animate-pulse delay-150" />
          <div className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-pulse delay-300" />
        </div>
      </div>
    </div>
  </div>
</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title={`Hello, ${user?.name?.split(" ")[0]}!`}
      subtitle="Your academic dashboard"
      contentClassName="pt-0 lg:pt-1"
    >
      <div className="space-y-2">
        {/* Header Stats - Responsive */}
<div className="grid grid-cols-4 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
  <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow duration-300">
    <div className="flex items-center justify-between">
      <div className="w-full sm:w-auto text-center sm:text-left">
        <p className="text-xs font-semibold mb-1 text-blue-600 tracking-wide">Total Courses</p>
        <p className="text-2xl md:text-2xl font-bold text-gray-900">
          {totalCourses}
        </p>
      </div>
      <div className="hidden sm:flex h-8 w-8 rounded-lg bg-blue-100 items-center justify-center flex-shrink-0">
        <BookOpen className="h-4 w-4 text-blue-600" />
      </div>
    </div>
  </div>

  <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow duration-300">
    <div className="flex items-center justify-between">
      <div className="w-full sm:w-auto text-center sm:text-left">
        <p className="text-xs font-semibold mb-1 text-blue-600 tracking-wide">Academic Average</p>
        <p className="text-2xl md:text-2xl font-bold text-gray-900">
          {averageGrade > 0 ? averageGrade.toFixed(1) : "0.0"}
        </p>
      </div>
      <div className="hidden sm:flex h-8 w-8 rounded-lg bg-blue-100 items-center justify-center flex-shrink-0">
        <GraduationCap className="h-4 w-4 text-blue-600" />
      </div>
    </div>
  </div>

  <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow duration-300">
    <div className="flex items-center justify-between">
      <div className="w-full sm:w-auto text-center sm:text-left">
        <p className="text-xs font-semibold mb-1 text-blue-600 tracking-wide">Courses Passed</p>
        <p className="text-2xl md:text-2xl font-bold text-gray-900">
          {completedCourses}
        </p>
      </div>
      <div className="hidden sm:flex h-8 w-8 rounded-lg bg-blue-100 items-center justify-center flex-shrink-0">
        <CheckCircle2 className="h-4 w-4 text-blue-600" />
      </div>
    </div>
  </div>

  <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow duration-300">
    <div className="flex items-center justify-between">
      <div className="w-full sm:w-auto text-center sm:text-left">
        <p className="text-xs font-semibold mb-1 text-blue-600 tracking-wide">Attention Needed</p>
        <p className="text-2xl md:text-2xl font-bold text-gray-900">
          {atRiskCourses + failingCourses}
        </p>
      </div>
      <div className="hidden sm:flex h-8 w-8 rounded-lg bg-blue-100 items-center justify-center flex-shrink-0">
        <AlertCircle className="h-4 w-4 text-blue-600" />
      </div>
    </div>
  </div>
</div>

        <Link
          to={
            studentCourses.length > 0
              ? `/courses/${studentCourses[0].code}/exercise-bank/stats`
              : "/courses"
          }
          className="block group"
        >
          <div className="bg-blue-600 border border-blue-500 rounded-2xl p-4 shadow-sm hover:shadow-md hover:bg-blue-700 transition-all duration-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-white/20 flex items-center justify-center">
                  <BarChart3 className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white transition-colors">
                    Quiz Statistics
                  </p>
                  <p className="text-xs text-blue-100">
                    Review your attempts and performance
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-blue-100 transition-colors" />
            </div>
          </div>
        </Link>

        {/* Sección Principal - Responsive */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Columna Izquierda: Cursos */}
          <div className="lg:col-span-2 space-y-2">
            {/* Mis Cursos */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <BookOpen className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      My Courses
                    </h2>
                    <p className="text-sm text-gray-600">Your enrolled courses</p>
                  </div>
                </div>
                {user?.role !== "docente" ? (
                  <Link
                    to="/courses"
                    className="hidden md:inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Join another course
                  </Link>
                ) : (
                  <Sparkles className="h-5 w-5 text-blue-400 hidden md:block" />
                )}
              </div>

              {studentCourses.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                    <BookOpen className="h-8 w-8 text-gray-400" />
                  </div>
                  <p className="text-gray-900 font-semibold text-lg">
                    No courses enrolled
                  </p>
                  <p className="text-sm text-gray-600 mt-2 max-w-md mx-auto">
                    Contact your academic advisor to get started with your courses
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {studentCourses.slice(0, 4).map((course) => {
                    const cp = courseProgress.find(
                      (c) => c.course.id === course.id,
                    );

                    return (
                      <Link
                        key={course.id}
                        to={`/courses/view/${course.code}`}
                        className="block group"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-blue-50 hover:border-blue-200 rounded-xl transition-colors duration-200 border border-gray-200 cursor-pointer group-hover:shadow-sm">
                          <div className="flex items-center gap-4 mb-1 sm:mb-0">
                          
                            <div >
                              <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                                {course.name}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs font-semibold px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full">
                                  {course.code}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {course.credits} credits
                                </span>
                                 <div className="flex items-center gap-2  block sm:hidden">
                              <span className="text-lg font-bold text-gray-900">
                                {cp?.hasRealGrades
                                  ? cp.progress.currentGrade.toFixed(1)
                                  : "--"}
                              </span>
                            
                            </div>
                              </div>
                            </div>
                          </div>
                          <div className="text-left sm:text-right">
                            <div className="flex items-center gap-2 sm:justify-end hidden sm:block">
                              <span className="text-2xl font-bold text-gray-900">
                                {cp?.hasRealGrades
                                  ? cp.progress.currentGrade.toFixed(1)
                                  : "--"}
                              </span>
                              {cp?.hasRealGrades && cp.progress.currentGrade >= 3.5 && (
                                <Sparkles className="h-4 w-4 text-blue-500" />
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-1 hidden sm:block">
                              Current grade
                            </p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                  {studentCourses.length > 4 && (
                    <Link
                      to="/courses"
                      className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 hover:gap-3 transition-all duration-300"
                    >
                      View all courses ({studentCourses.length})
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Actividades Próximas */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Calendar className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      Upcoming Activities
                    </h2>
                    <p className="text-sm text-gray-600">Due this week</p>
                  </div>
                </div>
                <Zap className="h-4 w-4 text-blue-500 hidden md:block" />
              </div>

              {upcomingAssessments.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
                    <Calendar className="h-8 w-8 text-blue-500" />
                  </div>
                  <p className="text-gray-900 font-semibold text-lg">
                    No upcoming activities
                  </p>
                  <p className="text-sm text-gray-600 mt-2 max-w-md mx-auto">
                    Great! You're all caught up. Check back later for new assignments
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {upcomingAssessments.map((assessment) => {
                      const dueDate = convertToDate(assessment.dueDate || '');
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      dueDate.setHours(0, 0, 0, 0);
                      
                      const diffDays = Math.ceil(
                        (dueDate.getTime() - today.getTime()) /
                          (1000 * 3600 * 24),
                      );
                      const isToday = diffDays === 0;
                      const isTomorrow = diffDays === 1;
                      
                      const course = studentCourses.find(
                        (c) => c.id === assessment.courseId,
                      );
                      const descriptionPreview = stripHtmlPreview(assessment.description);
                      
                      return (
                        <Link
                          key={assessment.id}
                          to={`/courses/${course?.code}/assessments/${assessment.id}`}
                          className="block group"
                        >
                          <div className="bg-white rounded-xl p-4 border border-gray-200 hover:bg-blue-50 hover:border-blue-200 transition-colors duration-200 group-hover:shadow-sm">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-start gap-3">
                                
                                  <div>
                                    <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                                      {assessment.name}
                                    </p>
                                    <div className="flex flex-wrap gap-2 mt-3">
                                      <span className="text-xs font-semibold px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full">
                                        {course?.code || "Course"}
                                      </span>
                                      <span className="text-xs font-semibold px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full">
                                        {assessment.type}
                                      </span>
                                      <span className="text-xs font-semibold px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full">
                                        {assessment.status}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                {descriptionPreview && (
                                  <p className="text-sm text-gray-600 mt-3 line-clamp-2">
                                    {descriptionPreview}
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-col items-start sm:items-end pl-6 sm:pl-0 hidden sm:block">
                                <div className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                                  isToday 
                                    ? "bg-red-100 text-red-700 border border-red-200"
                                    : isTomorrow 
                                      ? "bg-gray-100 text-gray-700 border border-gray-200"
                                      : "bg-blue-100 text-blue-700 border border-blue-200"
                                }`}>
                                  {isToday
                                    ? "🎯 today"
                                    : isTomorrow
                                    ? "⏰ tomorrow"
                                    : `📅 in ${diffDays} days`}
                                </div>
                                <p className="text-xs font-medium text-gray-600 mt-2">
                                  {dueDate.toLocaleDateString("en-US", {
                                    weekday: "short",
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </p>
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>

                  <Link
                    to={
                      studentCourses.length > 0
                        ? `/courses/${studentCourses[0].code}/assessments`
                        : "/courses"
                    }
                    className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 hover:gap-3 transition-all duration-300"
                  >
                    View all activities
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Columna Derecha: Calificaciones y Slides */}
          <div className="space-y-2 lg:col-span-2">
            {/* Calificaciones Recientes */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex  items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Trophy className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      Recent Grades
                    </h2>
                    <p className="text-sm text-gray-600">Latest evaluations</p>
                  </div>
                </div>
                <TrendingUp className="h-4 w-4 text-blue-500 hidden md:block" />
              </div>
   
              {recentGrades.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
                    <FileText className="h-8 w-8 text-blue-500" />
                  </div>
                  <p className="text-gray-900 font-semibold text-lg">
                    No grades available
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    Check back after your first evaluations
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentGrades.map((sheet) => {
                    const studentData = sheet.students.find(
                      (s) => s.studentId === user?.id,
                    );
                    const grade = studentData?.total || 0;
                    const isExcellent = grade >= 4.0;
                    const isGood = grade >= 3.0 && grade < 4.0;

                    return (
                      <Link
                        key={sheet.id}
                        to="/grades"
                        className="block group"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-blue-50 hover:border-blue-200 rounded-xl transition-colors duration-200 group-hover:shadow-sm border border-gray-200">
                          <div className="flex items-center gap-3 mb-3 sm:mb-0">
                           
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                                {sheet.title}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs font-semibold px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                                  {sheet.courseName}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3  sm:pl-0">
                            <div className={`text-xl font-bold  hidden sm:block ${
                              isExcellent ? "text-blue-700" :
                              isGood ? "text-blue-600" : "text-gray-700"
                            }`}>
                              {grade.toFixed(1)} 
                            </div>
                            {isExcellent && (
                              <Sparkles className="h-4 w-4 text-blue-500" />
                            )}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                  <Link
                    to="/grades"
                    className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 hover:gap-3 transition-all duration-300"
                  >
                    View all grades
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </div>

            {/* Slides Recientes */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Presentation className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      Study Materials
                    </h2>
                    <p className="text-sm text-gray-600">
                      Recent slides & resources
                    </p>
                  </div>
                </div>
                <Rocket className="h-4 w-4 text-blue-500 hidden md:block" />
              </div>

              {recentSlides.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
                    <Presentation className="h-8 w-8 text-blue-500" />
                  </div>
                  <p className="text-gray-900 font-semibold text-lg">
                    No study materials
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    Materials will appear here when available
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {recentSlides.map((slide) => (
                      <a
                        key={slide.id}
                        href={slide.canvaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block group"
                      >
                        <div className="bg-white rounded-xl p-4 border border-gray-200 hover:bg-blue-50 hover:border-blue-200 transition-colors duration-200 group-hover:shadow-sm">
                          <div className="flex items-center gap-3">
                            
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 line-clamp-2 group-hover:text-blue-600 transition-colors">
                                {slide.title}
                              </p>
                              {slide.description && (
                                <p className="text-sm text-gray-600 truncate mt-1">
                                  {slide.description}
                                </p>
                              )}
                            </div>
                            <ExternalLink className="h-4 w-4 text-gray-400 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>

                  {studentCourses.length > 0 && (
                    <Link
                      to={`/slides`}
                      className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 hover:gap-3 transition-all duration-300"
                    >
                      View all materials
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
