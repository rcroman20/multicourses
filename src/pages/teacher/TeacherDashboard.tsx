// TeacherDashboard.tsx - VERSIÓN CORREGIDA CON VALIDACIONES
import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  BookOpen,
  Users,
  TrendingUp,
  Plus,
  BarChart3,
  AlertTriangle,
  Presentation,
  FileSpreadsheet,
  CheckCircle2,
  FileText,
  ChevronRight,
  Loader2,
  Sparkles,
  Zap,
  Megaphone,
  CalendarClock,
  ArrowUpRight,
  UserCheck,
  FileCheck,
  ChevronDown,
  Building,
  AlertCircle,
} from "lucide-react";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";
import { firebaseDB } from "@/lib/firebase";
import { format, isToday, isTomorrow, differenceInDays } from "date-fns";
import { enUS } from "date-fns/locale";

// Interfaces
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

interface Slide {
  id: string;
  title: string;
  description: string;
  canvaUrl: string;
  createdAt: Timestamp;
  weekId: string;
  order: number;
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
}

interface Student {
  id: string;
  name: string;
  email: string;
  idNumber: string;
  whatsApp?: string;
  courses?: string[];
}

export default function TeacherDashboard() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [gradeSheets, setGradeSheets] = useState<GradeSheet[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [showCourseDropdown, setShowCourseDropdown] = useState(false);

  // Redirigir estudiantes
  useEffect(() => {
    if (isAuthenticated && user?.role === "estudiante") {
      navigate("/students", { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  // Cargar todos los datos
  useEffect(() => {
    const loadAllData = async () => {
      if (!user?.id) return;

      setLoading(true);

      try {
        await Promise.all([
          fetchCourses(),
          fetchGradeSheets(),
          fetchAssessments(),
          fetchAllSlides(),
          fetchAllUnits(),
          fetchAllWeeks(),
          fetchStudents(),
        ]);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };

    if (isAuthenticated && user?.role === "docente") {
      loadAllData();
    }
  }, [isAuthenticated, user]);

  // Cuando se cargan los cursos, seleccionar el primero automáticamente
  useEffect(() => {
    if (courses.length > 0 && !selectedCourse) {
      setSelectedCourse(courses[0]);
    }
  }, [courses, selectedCourse]);

  // Función para convertir Timestamp a Date
  const convertTimestamp = (timestamp: Timestamp | Date | string): Date => {
    if (timestamp instanceof Date) return timestamp;
    if (timestamp instanceof Timestamp) return timestamp.toDate();
    if (typeof timestamp === "string") return new Date(timestamp);
    return new Date();
  };

  const fetchCourses = async () => {
    try {
      const coursesRef = collection(firebaseDB, "cursos");
      const q = query(coursesRef, where("teacherId", "==", user?.id));
      const querySnapshot = await getDocs(q);

      const coursesData: Course[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        coursesData.push({
          id: doc.id,
          name: data.name || "",
          code: data.code || "",
          group: data.group || "",
          enrolledStudents: data.enrolledStudents || [],
          credits: data.credits || 0,
          description: data.description || "",
          teacherId: data.teacherId || "",
          teacherName: data.teacherName || "",
          semester: data.semester || "",
          status: data.status || "active",
          createdAt: data.createdAt || Timestamp.now(),
        });
      });

      setCourses(coursesData);
    } catch (err) {
      console.error("Error loading courses:", err);
    }
  };

  const fetchGradeSheets = async () => {
    if (!user?.id) return;

    try {
      const gradeSheetsRef = collection(firebaseDB, "gradeSheets");
      const q = query(gradeSheetsRef, where("teacherId", "==", user.id));

      const querySnapshot = await getDocs(q);
      const sheets: GradeSheet[] = [];

      querySnapshot.forEach((doc) => {
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

      setGradeSheets(sheets);
    } catch (error) {
      console.error("Error loading grade sheets:", error);
    }
  };

  const fetchAssessments = async () => {
    if (!user?.id) return;

    try {
      const assessmentsRef = collection(firebaseDB, "assessments");
      const q = query(assessmentsRef, where("createdBy", "==", user.id));

      const querySnapshot = await getDocs(q);
      const assessmentList: Assessment[] = [];

      querySnapshot.forEach((doc) => {
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

      // Ordenar por fecha de vencimiento
      assessmentList.sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });

      setAssessments(assessmentList);
    } catch (error) {
      console.error("Error loading assessments:", error);
    }
  };

  const fetchAllSlides = async () => {
    try {
      const slidesRef = collection(firebaseDB, "diapositivas");
      const q = query(slidesRef, orderBy("createdAt", "desc"));

      const querySnapshot = await getDocs(q);
      const slideList: Slide[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        slideList.push({
          id: doc.id,
          title: data.title || "",
          description: data.description || "",
          canvaUrl: data.canvaUrl || "",
          createdAt: data.createdAt || Timestamp.now(),
          weekId: data.weekId || "",
          order: data.order || 0,
        });
      });

      setSlides(slideList);
    } catch (error) {
      console.error("Error loading slides:", error);
    }
  };

  const fetchAllUnits = async () => {
    try {
      const unitsRef = collection(firebaseDB, "unidades");
      const q = query(unitsRef);

      const querySnapshot = await getDocs(q);
      const unitList: Unit[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        unitList.push({
          id: doc.id,
          name: data.name || "",
          description: data.description || "",
          courseId: data.courseId || "",
          order: data.order || 0,
          createdAt: data.createdAt || Timestamp.now(),
        });
      });

      setUnits(unitList);
    } catch (error) {
      console.error("Error loading units:", error);
    }
  };

  const fetchAllWeeks = async () => {
    try {
      const weeksRef = collection(firebaseDB, "semanas");
      const q = query(weeksRef);

      const querySnapshot = await getDocs(q);
      const weekList: Week[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        weekList.push({
          id: doc.id,
          number: data.number || 1,
          topic: data.topic || "",
          unitId: data.unitId || "",
          createdAt: data.createdAt || Timestamp.now(),
        });
      });

      setWeeks(weekList);
    } catch (error) {
      console.error("Error loading weeks:", error);
    }
  };

  const fetchStudents = async () => {
    if (!user?.id) return;

    try {
      const studentsRef = collection(firebaseDB, "estudiantes");
      const querySnapshot = await getDocs(studentsRef);

      const studentList: Student[] = [];
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

      setStudents(studentList);
    } catch (error) {
      console.error("Error loading students:", error);
    }
  };

  // Filtrar estudiantes del curso seleccionado
  const getCourseStudents = () => {
    if (!selectedCourse) return [];

    return students.filter((student) =>
      student.courses?.includes(selectedCourse.id),
    );
  };

  // Filtrar evaluaciones del curso seleccionado
  const getCourseAssessments = () => {
    if (!selectedCourse) return [];

    return assessments.filter((a) => a.courseId === selectedCourse.id);
  };

  // Hojas de calificación del curso seleccionado
  const getCourseGradeSheets = () => {
    if (!selectedCourse) return [];

    return gradeSheets.filter((sheet) => sheet.courseId === selectedCourse.id);
  };

  // Obtener materiales del curso seleccionado usando la jerarquía
  const getCourseSlides = () => {
    if (!selectedCourse) return [];

    console.log("Buscando slides para curso:", selectedCourse.id);
    console.log("Total slides cargadas:", slides.length);
    console.log("Total unidades cargadas:", units.length);
    console.log("Total semanas cargadas:", weeks.length);

    // 1. Obtener unidades del curso seleccionado
    const courseUnits = units.filter(
      (unit) => unit.courseId === selectedCourse.id,
    );
    console.log(
      "Unidades del curso:",
      courseUnits.map((u) => ({ id: u.id, name: u.name })),
    );

    if (courseUnits.length === 0) {
      console.log("No hay unidades para este curso");
      return [];
    }

    // 2. Obtener weeks de esas unidades
    const unitIds = courseUnits.map((unit) => unit.id);
    console.log("IDs de unidades del curso:", unitIds);

    const courseWeeks = weeks.filter((week) => unitIds.includes(week.unitId));
    console.log(
      "Semanas del curso:",
      courseWeeks.map((w) => ({
        id: w.id,
        unitId: w.unitId,
        number: w.number,
      })),
    );

    if (courseWeeks.length === 0) {
      console.log("No hay semanas para las unidades de este curso");
      // Verificar si hay semanas con unitIds que no existen en las unidades
      const orphanWeeks = weeks.filter((w) => !unitIds.includes(w.unitId));
      console.log(
        "Semanas huérfanas (unitId no encontrado):",
        orphanWeeks.map((w) => ({ id: w.id, unitId: w.unitId })),
      );
      return [];
    }

    // 3. Obtener slides de esas weeks
    const weekIds = courseWeeks.map((week) => week.id);
    console.log("IDs de semanas del curso:", weekIds);

    const courseSlides = slides.filter((slide) =>
      weekIds.includes(slide.weekId),
    );
    console.log(
      "Slides encontradas:",
      courseSlides.map((s) => ({ id: s.id, title: s.title, weekId: s.weekId })),
    );

    // 4. Agregar información de unidad y semana a cada slide
    const slidesWithInfo = courseSlides.map((slide) => {
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

    console.log("Slides con información:", slidesWithInfo);

    // 5. Ordenar por fecha y limitar a 4
    const result = slidesWithInfo
      .sort((a, b) => {
        const dateA = convertTimestamp(a.createdAt).getTime();
        const dateB = convertTimestamp(b.createdAt).getTime();
        return dateB - dateA;
      })
      .slice(0, 4);

    console.log("Resultado final:", result);
    return result;
  };

  // Calcular estadísticas del curso seleccionado
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

    const totalStudents = courseStudents.length;
    let totalPassing = 0;
    let totalAtRisk = 0;
    let totalFailing = 0;
    let totalGradeSum = 0;
    let gradedCount = 0;

    // Calcular estadísticas desde las hojas de calificación
    if (courseGradeSheets.length > 0) {
      const studentGrades: { [key: string]: number[] } = {};

      // Inicializar estudiantes
      courseStudents.forEach((student) => {
        studentGrades[student.id] = [];
      });

      // Acumular calificaciones de todas las hojas
      courseGradeSheets.forEach((sheet) => {
        if (sheet.isPublished) {
          sheet.students.forEach((student) => {
            if (student.total !== undefined && student.total > 0) {
              studentGrades[student.studentId]?.push(student.total);
            }
          });
        }
      });

      // Calcular promedios y categorías
      Object.entries(studentGrades).forEach(([studentId, grades]) => {
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
          totalFailing++; // Sin calificaciones = reprobando
        }
      });
    } else {
      // Valores por defecto si no hay hojas de calificación
      totalPassing = Math.floor(totalStudents * 0.6);
      totalAtRisk = Math.floor(totalStudents * 0.25);
      totalFailing = Math.floor(totalStudents * 0.15);
      totalGradeSum =
        totalPassing * 4.0 + totalAtRisk * 2.8 + totalFailing * 1.5;
      gradedCount = totalStudents;
    }

    // Calcular promedios y tasas
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

  // Función para formatear fechas (CORREGIDA PARA ZONA HORARIA)
  const formatDueDate = (dateString: string): string => {
    try {
      if (!dateString) return "No due date";

      // Crear fecha en UTC para evitar problemas de zona horaria
      const date = new Date(dateString + "T00:00:00Z"); // Forzar UTC
      const today = new Date();

      // Configurar ambas fechas a medianoche en UTC para comparación
      const dueDateUTC = Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
      );
      const todayUTC = Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
      );

      const diffTime = dueDateUTC - todayUTC;
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      console.log("FormatDueDate Debug:", {
        dateString,
        dateUTC: new Date(dueDateUTC).toISOString(),
        todayUTC: new Date(todayUTC).toISOString(),
        diffDays,
        dueDateText:
          diffDays === 0
            ? "today"
            : diffDays === 1
              ? "tomorrow"
              : diffDays > 1 && diffDays <= 7
                ? `in ${diffDays} days`
                : diffDays < 0
                  ? "overdue"
                  : format(date, "MMM dd", { locale: enUS }),
      });

      if (diffDays === 0) {
        return "today";
      } else if (diffDays === 1) {
        return "tomorrow";
      } else if (diffDays > 1 && diffDays <= 7) {
        return `in ${diffDays} days`;
      } else if (diffDays < 0) {
        return "overdue";
      }
      return format(date, "MMM dd", { locale: enUS });
    } catch {
      return "Invalid date";
    }
  };

  // OBTENER PRÓXIMAS EVALUACIONES del curso seleccionado
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
      .slice(0, 3); // Mostrar solo las próximas 3
  };

  const courseStats = calculateCourseStats();
  const upcomingAssessments = getUpcomingAssessments();
  const courseStudents = getCourseStudents();
  const courseGradeSheets = getCourseGradeSheets();
  const courseAssessments = getCourseAssessments();
  const courseSlides = getCourseSlides();

  // Mostrar loading
  if (loading) {
    return (
      <DashboardLayout
        title={`Welcome, ${user?.name?.split(" ")[0]}`}
        subtitle="Teacher Dashboard"
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary-500 mx-auto" />
            <div className="space-y-2">
              <p className="text-lg font-semibold text-gray-900">
                Loading your dashboard
              </p>
              <p className="text-sm text-gray-600">
                Preparing your personalized teaching overview
              </p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title={`Hello, ${user?.name?.split(" ")[0]}!`}
      subtitle="Teacher Dashboard"
    >
      <div className="space-y-2">
        {/* Selector de Curso y Banner */}
        <div className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-2xl p-6 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-1 sm:gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center hidden sm:flex">
                  <BookOpen className="h-6 w-6 text-white" />
                </div>
                <div>
                  <div className="relative">
                    <button
                      onClick={() => setShowCourseDropdown(!showCourseDropdown)}
                      className="flex items-center gap-2 text-left hover:bg-white/10 rounded-lg p-2 transition-colors"
                    >
                      <div>
                        <h1 className="text-xl font-bold">
                          {selectedCourse?.name || "Select a course"}
                        </h1>
                        <p className="text-blue-100 text-sm mt-1">
                          {selectedCourse
                            ? `${selectedCourse.code} • Group ${selectedCourse.group} • ${courseStats.totalStudents} students • ${selectedCourse.credits} credits`
                            : "No courses available"}
                        </p>
                      </div>
                      <ChevronDown
                        className={`h-5 w-5 transition-transform ${showCourseDropdown ? "rotate-180" : ""}`}
                      />
                    </button>

                    {/* Dropdown de cursos */}
                    {showCourseDropdown && courses.length > 1 && (
                      <div className="absolute z-10 mt-2 w-96 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                        <div className="p-2">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">
                            Your Courses ({courses.length})
                          </p>
                          {courses.map((course) => (
                            <button
                              key={course.id}
                              onClick={() => {
                                setSelectedCourse(course);
                                setShowCourseDropdown(false);
                              }}
                              className={`w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors ${
                                selectedCourse?.id === course.id
                                  ? "bg-blue-50 border border-blue-100"
                                  : ""
                              }`}
                            >
                              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center flex-shrink-0">
                                <Building className="h-5 w-5 text-blue-600" />
                              </div>
                              <div className="flex-1 text-left">
                                <p className="font-semibold text-gray-900">
                                  {course.name}
                                </p>
                                <p className="text-sm text-gray-500">
                                  {course.code} • Group {course.group} •{" "}
                                  {course.enrolledStudents.length} students
                                </p>
                              </div>
                              {selectedCourse?.id === course.id && (
                                <CheckCircle2 className="h-5 w-5 text-blue-500" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {selectedCourse?.description && (
                    <p className="text-blue-200 text-sm mt-2 max-w-2xl">
                      {selectedCourse.description}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="text-center md:text-right mt-2 md:mt-0">
              <div className="text-2xl font-bold mb-1">
                {courseStats.averageGrade}
                <span className="text-lg text-blue-200"> / 5.0</span>
              </div>
              <div className="text-blue-200 text-sm">Course Average</div>
              <div className="flex items-center justify-center md:justify-end gap-2 mt-2">
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
                  {courseStats.approvalRate}% approval
                </span>
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
                  {courseStats.totalAssessments} assessments
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Indicador del curso seleccionado */}
        {courses.length > 1 && (
          <div className="flex items-center justify-between bg-white border border-gray-100 rounded-xl p-3 shadow-sm hidden sm:flex">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <BookOpen className="h-4 w-4" />
              <span>Showing data for: </span>
              <span className="font-semibold text-gray-900">
                {selectedCourse?.name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {courses.map((course, index) => (
                <button
                  key={course.id}
                  onClick={() => setSelectedCourse(course)}
                  className={`h-2 w-2 rounded-full transition-all ${
                    selectedCourse?.id === course.id
                      ? "bg-blue-600 w-6"
                      : "bg-gray-300 hover:bg-gray-400"
                  }`}
                  title={course.name}
                />
              ))}
            </div>
          </div>
        )}

        {/* Stats Overview - Modern Design */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-amber-50 to-amber-50 border border-amber-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="h-4 w-4 text-amber-500" />
                  <p className="text-xs font-semibold text-amber-600 tracking-wide">
                    Active Courses
                  </p>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {courses.length}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {selectedCourse?.code || "Select a course"}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-100 to-amber-100 flex items-center justify-center">
                <BookOpen className="h-6 w-6 text-amber-500" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-purple-500" />
                  <p className="text-xs font-semibold text-purple-600 tracking-wide">
                    Enrolled Students
                  </p>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {courseStats.totalStudents}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {courseStudents.length} in selected course
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                <Users className="h-6 w-6 text-purple-500" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-green-500" />
                  <p className="text-xs font-semibold text-green-600 tracking-wide">
                    Active Assessments
                  </p>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {courseStats.totalAssessments}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {courseStats.publishedAssessments} published
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center">
                <FileText className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  <p className="text-xs font-semibold text-blue-600 tracking-wide">
                    Approval Rate
                  </p>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {courseStats.approvalRate}%
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {courseStats.totalPassing} of {courseStats.totalStudents}{" "}
                  students
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Sección Principal */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna Izquierda */}

          <div className="lg:col-span-2 space-y-2">
            {/* Evaluaciones Próximas */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                    <CalendarClock className="h-6 w-6 text-blue-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      Upcoming Assessments
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                      {selectedCourse?.name || "No course selected"} • Total:{" "}
                      {courseAssessments.length}
                    </p>
                  </div>
                </div>
                {selectedCourse && (
                  <Link
                    to={`/courses/${selectedCourse.code}/assessments/`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium text-sm"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:flex">New</span>
                  </Link>
                )}
              </div>

              {!selectedCourse ? (
                <div className="text-center py-8">
                  <BookOpen className="h-16 w-16 mx-auto text-gray-300 mb-2" />
                  <p className="text-gray-500 mb-2 font-medium">
                    Select a course to view assessments
                  </p>
                  <p className="text-sm text-gray-500">
                    Choose a course from the dropdown above
                  </p>
                </div>
              ) : courseAssessments.length === 0 ? (
                <div className="text-center py-8">
                  <CalendarClock className="h-16 w-16 mx-auto text-gray-300 mb-2" />
                  <p className="text-gray-500 mb-2 font-medium">
                    No assessments in this course
                  </p>
                  <p className="text-sm text-gray-500 max-w-md mx-auto">
                    Create your first assessment to track student progress
                  </p>
                </div>
              ) : upcomingAssessments.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-16 w-16 mx-auto text-emerald-300 mb-2" />
                  <p className="text-gray-500 mb-2 font-medium">
                    No upcoming assessments
                  </p>
                  <p className="text-sm text-gray-500">
                    Great! All assessments are completed
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {upcomingAssessments.map((assessment) => {
                    const dueDateText = formatDueDate(assessment.dueDate);
                    const isToday = dueDateText === "today";
                    const isTomorrow = dueDateText === "tomorrow";
                    const isUpcoming = dueDateText.startsWith("in");

                    return (
                      <Link
                        key={assessment.id}
                        to={`/courses/${selectedCourse?.code}/assessments/${assessment.id}`}
                        className="block group"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-cyan-50/50 hover:border-blue-200 rounded-xl transition-all duration-300 border border-gray-200 group-hover:shadow-sm">
                          <div className="flex items-center gap-4 mb-2 sm:mb-0">
                           
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                                  {assessment.name}
                                </p>
                                <span
                                  className={`px-2 py-1 rounded-full text-xs font-bold ${
                                    isToday
                                      ? "bg-gradient-to-r from-red-100 to-pink-100 text-red-700"
                                      : isTomorrow
                                        ? "bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700"
                                        : isUpcoming
                                          ? "bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700"
                                          : "bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700"
                                  }`}
                                >
                                  {dueDateText}
                                </span>
                              </div>
                             <p className="text-sm text-gray-500">
  {assessment.type === "quiz"
    ? "Quiz"
    : assessment.type === "exam"
      ? "Exam"
      : assessment.type === "participation"
        ? "Participation"
        : assessment.type === "homework"
          ? "Homework"
          : assessment.type === "project"
            ? "Project"
            : "Assessment"}{" "}
  •{assessment.percentage}% of grade • Due:{" "}
  {assessment.dueDate 
    ? (() => {
        // Crear fecha en UTC para mostrar correctamente
        const date = new Date(assessment.dueDate + 'T00:00:00Z');
        return format(date, "MMM dd, yyyy", { locale: enUS });
      })()
    : "No due date"}
</p>
                              {assessment.description && (
                                <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                                  {assessment.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}

                  {courseAssessments.length > 3 && selectedCourse && (
                    <Link
                      to={`/courses/${selectedCourse.code}/assessments`}
                      className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 hover:gap-3 transition-all duration-300"
                    >
                      View all assessments ({courseAssessments.length})
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Materiales de Clase DEL CURSO SELECCIONADO */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                    <Presentation className="h-6 w-6 text-purple-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      Course Materials
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                      {selectedCourse?.name || "Select a course"} •{" "}
                      {courseSlides.length} recent slides
                    </p>
                  </div>
                </div>
                {selectedCourse && (
                  <Link
                    to={`/courses/${selectedCourse.code}/slides`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium text-sm"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:flex">New</span>
                  </Link>
                )}
              </div>

              {!selectedCourse ? (
                <div className="text-center py-8">
                  <Presentation className="h-16 w-16 mx-auto text-gray-300 mb-2" />
                  <p className="text-gray-500 mb-2 font-medium">
                    Select a course to view materials
                  </p>
                  <p className="text-sm text-gray-500">
                    Choose a course from the dropdown above
                  </p>
                </div>
              ) : courseSlides.length === 0 ? (
                <div className="text-center py-8">
                  <Presentation className="h-16 w-16 mx-auto text-gray-300 mb-2" />
                  <p className="text-gray-500 mb-2 font-medium">
                    No materials for this course
                  </p>
                  <p className="text-sm text-gray-500 max-w-md mx-auto">
                    Share your slides and resources with students for{" "}
                    {selectedCourse.name}
                  </p>
                  <Link
                    to={`/courses/${selectedCourse.code}/slides`}
                    className="inline-flex items-center gap-2 px-4 py-2 mt-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium text-sm"
                  >
                    <Plus className="h-4 w-4" />
                    Create First Material
                  </Link>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {courseSlides.map((slide: any) => (
                      <a
                        key={slide.id}
                        href={slide.canvaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group block"
                      >
                        <div className="border border-gray-200 rounded-xl p-4 hover:bg-gradient-to-r hover:from-purple-50/50 hover:to-pink-50/50 hover:border-purple-200 transition-all duration-300 group-hover:shadow-sm">
                          <div className="flex items-center gap-3">
                            <div className="flex-1">
                              <p className="font-semibold text-gray-900 line-clamp-1 group-hover:text-purple-600 transition-colors">
                                {slide.title}
                              </p>
                              <p className="text-sm text-gray-500 line-clamp-2 mt-1">
                                {slide.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>

                  {selectedCourse && courseSlides.length > 0 && (
                    <Link
                      to={`/courses/${selectedCourse.code}/slides`}
                      className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-purple-600 hover:text-purple-700 hover:gap-3 transition-all duration-300"
                    >
                      View all materials
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Columna Derecha */}
          <div className="space-y-2">
            {/* Notificación de próxima evaluación */}

            {selectedCourse && upcomingAssessments.length > 0 && (
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5 shadow-sm hidden sm:flex">
                <div className="flex items-start gap-3">
                  
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="font-bold text-amber-800">Urgent</p>
                      
                    </div>
                    <p className="text-sm text-amber-700 mb-2 line-clamp-2">
                      "{upcomingAssessments[0].name}" is due{" "}
                      {upcomingAssessments[0].dueDate
                        ? formatDueDate(
                            upcomingAssessments[0].dueDate,
                          ).toLowerCase()
                        : "soon"}
                    </p>
                    <div className="flex items-center gap-4">
                      {selectedCourse && (
                        <Link
                          to={`/courses/${selectedCourse.code}/assessments/${upcomingAssessments[0].id}`}
                          className="text-sm text-amber-600 font-semibold hover:text-amber-800 flex items-center gap-1"
                        >
                          View details
                          <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      )}
                  
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Estado de Estudiantes */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <UserCheck className="h-5 w-5 text-gray-400" />
                  <h2 className="text-xl font-bold text-gray-900">
                    Student Status
                  </h2>
                </div>
             
              </div>

              {!selectedCourse ? (
                <div className="text-center py-8">
                  <Users className="h-16 w-16 mx-auto text-gray-300 mb-2" />
                  <p className="text-gray-500 font-medium">
                    Select a course to view student status
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-100 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                          <div>
                            <p className="font-medium text-gray-900">Passing</p>
                            <p className="text-xs text-emerald-600">≥ 3.5</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-emerald-600">
                            {courseStats.totalPassing}
                          </p>
                          <p className="text-sm text-emerald-600">
                            {courseStats.totalStudents > 0
                              ? Math.round(
                                  (courseStats.totalPassing /
                                    courseStats.totalStudents) *
                                    100,
                                )
                              : 0}
                            %
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-5 w-5 text-amber-600" />
                          <div>
                            <p className="font-medium text-gray-900">At Risk</p>
                            <p className="text-xs text-amber-600">2.5 - 3.4</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-amber-600">
                            {courseStats.totalAtRisk}
                          </p>
                          <p className="text-sm text-amber-600">
                            {courseStats.totalStudents > 0
                              ? Math.round(
                                  (courseStats.totalAtRisk /
                                    courseStats.totalStudents) *
                                    100,
                                )
                              : 0}
                            %
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-red-50 to-pink-50 border border-red-100 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-5 w-5 text-red-600" />
                          <div>
                            <p className="font-medium text-gray-900">Failing</p>
                            <p className="text-xs text-red-600">≤ 2.4</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-red-600">
                            {courseStats.totalFailing}
                          </p>
                          <p className="text-sm text-red-600">
                            {courseStats.totalStudents > 0
                              ? Math.round(
                                  (courseStats.totalFailing /
                                    courseStats.totalStudents) *
                                    100,
                                )
                              : 0}
                            %
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Barra de progreso */}
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <div className="flex justify-between text-sm text-gray-500 mb-2">
                      <span className="font-medium">Student Distribution</span>
                      <span>{courseStats.totalStudents} students</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div className="flex h-full">
                        <div
                          className="bg-gradient-to-r from-emerald-500 to-green-500 transition-all duration-500"
                          style={{
                            width:
                              courseStats.totalStudents > 0
                                ? `${(courseStats.totalPassing / courseStats.totalStudents) * 100}%`
                                : "0%",
                          }}
                          title={`Passing: ${courseStats.totalPassing} students`}
                        />
                        <div
                          className="bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500"
                          style={{
                            width:
                              courseStats.totalStudents > 0
                                ? `${(courseStats.totalAtRisk / courseStats.totalStudents) * 100}%`
                                : "0%",
                          }}
                          title={`At Risk: ${courseStats.totalAtRisk} students`}
                        />
                        <div
                          className="bg-gradient-to-r from-red-500 to-pink-500 transition-all duration-500"
                          style={{
                            width:
                              courseStats.totalStudents > 0
                                ? `${(courseStats.totalFailing / courseStats.totalStudents) * 100}%`
                                : "0%",
                          }}
                          title={`Failing: ${courseStats.totalFailing} students`}
                        />
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mt-2">
                      <span>Passing</span>
                      <span>At Risk</span>
                      <span>Failing</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Acciones Rápidas */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <Zap className="h-5 w-5 text-blue-400" />
                  <h2 className="text-xl font-bold text-gray-900">
                    Quick Actions
                  </h2>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Link
                  to="/grades"
                  className="group flex flex-col items-center justify-center p-4 border border-gray-200 rounded-xl hover:border-blue-200 hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-cyan-50/50 transition-all duration-300"
                >
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-300">
                    <FileSpreadsheet className="h-6 w-6 text-blue-600" />
                  </div>
                  <p className="font-semibold text-sm text-gray-900">Grades</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {courseGradeSheets.length} sheets
                  </p>
                </Link>

                <Link
                  to="/students/list"
                  className="group flex flex-col items-center justify-center p-4 border border-gray-200 rounded-xl hover:border-emerald-200 hover:bg-gradient-to-r hover:from-emerald-50/50 hover:to-green-50/50 transition-all duration-300"
                >
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-100 to-green-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-300">
                    <Users className="h-6 w-6 text-emerald-600" />
                  </div>
                  <p className="font-semibold text-sm text-gray-900">
                    Students
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {courseStudents.length} enrolled
                  </p>
                </Link>

                <Link
                  to={
                    selectedCourse
                      ? `/courses/${selectedCourse.code}/assessments`
                      : "/assessments"
                  }
                  className="group flex flex-col items-center justify-center p-4 border border-gray-200 rounded-xl hover:border-purple-200 hover:bg-gradient-to-r hover:from-purple-50/50 hover:to-pink-50/50 transition-all duration-300"
                >
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-300">
                    <FileText className="h-6 w-6 text-purple-600" />
                  </div>
                  <p className="font-semibold text-sm text-gray-900">
                    Assessments
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {courseAssessments.length} active
                  </p>
                </Link>

                <Link
                  to="/statistics"
                  className="group flex flex-col items-center justify-center p-4 border border-gray-200 rounded-xl hover:border-amber-200 hover:bg-gradient-to-r hover:from-amber-50/50 hover:to-orange-50/50 transition-all duration-300"
                >
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-300">
                    <BarChart3 className="h-6 w-6 text-amber-600" />
                  </div>
                  <p className="font-semibold text-sm text-gray-900">Reports</p>
                  <p className="text-xs text-gray-500 mt-1">View statistics</p>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
