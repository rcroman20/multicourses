// courses/:courseCode/assessments
// courses/ENG-A1/assessments
import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademic } from "@/contexts/AcademicContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { assessmentService } from "@/lib/services/assessmentService";
import { gradeSheetService, GradeSheet } from "@/lib/services/gradeSheetService";
import { enrollmentService } from "@/lib/firestore";
import { format, parseISO } from "date-fns";
import { enUS } from "date-fns/locale";
import {
  Plus,
  Calendar,
  FileText,
  Edit,
  Trash2,
  Users,
  BarChart3,
  Search,
  CheckCircle,
  Clock,
  AlertCircle,
  FileCheck,
  Percent,
  TrendingUp,
  Eye,
  X,
  BookOpen,
  ArrowLeft,
  Filter,
  Loader2,
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  Megaphone,
  Upload,
  Zap,
  Sparkles,
  Target,
  Trophy,
  Flag,
  Award,
  Bell,
  ChevronRight,
  Download,
  Share2,
  Bookmark,
  Star,
  ChevronDown,
  Book,
  School,
  GraduationCap
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function AssessmentsPage() {
  const { courseCode } = useParams<{ courseCode: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { courses } = useAcademic();
  const [assessments, setAssessments] = useState<any[]>([]);
  const [enrolledStudents, setEnrolledStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<any>(null);
  
  // Nuevo estado para manejar la selección de curso
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [showCourseSelector, setShowCourseSelector] = useState(false);

  // Filtramos los cursos disponibles para el usuario
  const availableCourses = useMemo(() => {
    if (!user) return [];
    
    if (user.role === "docente") {
      // Docentes ven solo los cursos que ellos enseñan
      return courses.filter(course => course.teacherId === user.id);
    } else {
      // Estudiantes ven solo los cursos en los que están inscritos
      return courses.filter(course => 
        course.enrolledStudents?.includes(user.id) || 
        course.enrolledStudents?.some((student: any) => typeof student === 'string' ? student === user.id : student.id === user.id)
      );
    }
  }, [courses, user]);

  // Efecto para inicializar el curso seleccionado
  useEffect(() => {
    if (availableCourses.length > 0) {
      if (courseCode) {
        // Si hay un código de curso en la URL, usarlo
        const courseFromUrl = availableCourses.find(c => c.code === courseCode);
        if (courseFromUrl) {
          setSelectedCourse(courseFromUrl);
          setSelectedCourseId(courseFromUrl.id);
        } else {
          // Si no se encuentra, usar el primer curso disponible
          const firstCourse = availableCourses[0];
          setSelectedCourse(firstCourse);
          setSelectedCourseId(firstCourse.id);
          // Actualizar URL
          navigate(`/courses/${firstCourse.code}/assessments`, { replace: true });
        }
      } else {
        // Si no hay código en la URL, usar el primer curso disponible
        const firstCourse = availableCourses[0];
        setSelectedCourse(firstCourse);
        setSelectedCourseId(firstCourse.id);
        // Actualizar URL
        navigate(`/courses/${firstCourse.code}/assessments`, { replace: true });
      }
    }
  }, [availableCourses, courseCode, navigate]);

  // Cargar evaluaciones cuando cambia el curso seleccionado
  useEffect(() => {
    if (!selectedCourseId) return;
    
    loadAssessments();
    loadEnrolledStudents();
  }, [selectedCourseId]);

  // Función para cambiar de curso
  const handleCourseChange = (course: any) => {
    setSelectedCourse(course);
    setSelectedCourseId(course.id);
    setShowCourseSelector(false);
    // Actualizar URL
    navigate(`/courses/${course.code}/assessments`);
    // Resetear filtros
    setSearchTerm('');
    setFilterType('all');
  };

  // Función para clasificar las actividades por fecha
  const categorizedAssessments = useMemo(() => {
    if (!selectedCourseId) return { today: [], upcoming: [], past: [], noDueDate: [] };
    
    const now = new Date();
    
    const upcoming = [];
    const today = [];
    const past = [];
    const noDueDate = [];

    assessments.forEach(assessment => {
      if (!assessment.dueDate) {
        noDueDate.push(assessment);
        return;
      }

      const dueDate = new Date(assessment.dueDate);
      
      const dueDateNormalized = new Date(
        dueDate.getUTCFullYear(),
        dueDate.getUTCMonth(),
        dueDate.getUTCDate()
      );
      
      const nowNormalized = new Date(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate()
      );

      if (dueDateNormalized.getTime() === nowNormalized.getTime()) {
        today.push(assessment);
      } else if (dueDateNormalized > nowNormalized) {
        const thirtyDaysFromNow = new Date(nowNormalized);
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 15);
        
        if (dueDateNormalized <= thirtyDaysFromNow) {
          upcoming.push(assessment);
        }
      } else if (dueDateNormalized < nowNormalized) {
        past.push(assessment);
      }
    });

    const sortByDate = (a: any, b: any) => {
      if (!a.dueDate || !b.dueDate) return 0;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    };

    return {
      today: today.sort(sortByDate),
      upcoming: upcoming.sort(sortByDate),
      past: past.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()),
      noDueDate: noDueDate.sort((a, b) => a.name.localeCompare(b.name))
    };
  }, [assessments, selectedCourseId]);

  // Función para aplicar filtros y búsqueda
  const filterAssessments = useCallback((assessmentsList: any[]) => {
    return assessmentsList.filter((assessment) => {
      const matchesSearch = assessment.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        assessment.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === "all" || assessment.type === filterType || assessment.assessmentType === filterType;
      return matchesSearch && matchesType;
    });
  }, [searchTerm, filterType]);

  // Aplicar filtros a cada categoría
  const filteredToday = useMemo(() => filterAssessments(categorizedAssessments.today), 
    [categorizedAssessments.today, filterAssessments]);
  const filteredUpcoming = useMemo(() => filterAssessments(categorizedAssessments.upcoming), 
    [categorizedAssessments.upcoming, filterAssessments]);
  const filteredPast = useMemo(() => filterAssessments(categorizedAssessments.past), 
    [categorizedAssessments.past, filterAssessments]);
  const filteredNoDueDate = useMemo(() => filterAssessments(categorizedAssessments.noDueDate), 
    [categorizedAssessments.noDueDate, filterAssessments]);

  // Estadísticas
  const stats = useMemo(() => {
    const todayCount = categorizedAssessments.today.length;
    const upcomingCount = categorizedAssessments.upcoming.length;
    const pastCount = categorizedAssessments.past.length;
    const noDueDateCount = categorizedAssessments.noDueDate.length;
    const totalPercentage = assessments.reduce((sum, a) => sum + (a.percentage || 0), 0);
    
    return { todayCount, upcomingCount, pastCount, noDueDateCount, totalPercentage };
  }, [categorizedAssessments, assessments]);

  const loadAssessments = async () => {
    if (!selectedCourseId) return;
    
    setLoading(true);
    try {
      const data = await assessmentService.getCourseAssessments(selectedCourseId);
      setAssessments(data);
    } catch (error) {
      console.error("Error loading assessments:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadEnrolledStudents = async () => {
    if (!selectedCourseId) return;
    try {
      const students = await enrollmentService.getEnrolledStudents(selectedCourseId);
      setEnrolledStudents(students);
    } catch (error) {
      console.error("Error loading students:", error);
    }
  };

  const handleCreateAssessment = async (data: any) => {
    try {
      if (!user) return;

      const targetCourseId = data.courseId || selectedCourseId;
      if (!targetCourseId) {
        alert("Please select a course");
        return;
      }

      let dueDateValue = data.dueDate;
      if (dueDateValue) {
        const date = new Date(dueDateValue);
        if (isNaN(date.getTime())) {
          alert("Invalid date");
          return;
        }
      }

      let startDateValue = null;
      if (data.type === "delivery" && data.startDate) {
        const date = new Date(data.startDate);
        if (isNaN(date.getTime())) {
          alert("Invalid start date");
          return;
        }
        startDateValue = data.startDate;
      }
 
      const assessmentData: any = {
        courseId: targetCourseId,
        name: data.name,
        description: data.description,
        type: data.type,
        percentage: parseFloat(data.percentage || 0),
        maxPoints: parseFloat(data.maxPoints || 0),
        passingScore: parseFloat(data.passingScore || 0),
        dueDate: dueDateValue || null,
        status: "draft",
        createdBy: user.id,
        gradeSheetId: data.gradeSheetId,
        assessmentType: data.assessmentType,
        deliveryType: data.deliveryType || 'text',
        startDate: startDateValue,
      };

      if (data.assessmentType === 'announcement') {
        assessmentData.percentage = 0;
        assessmentData.maxPoints = 0;
        assessmentData.passingScore = 0;
        assessmentData.gradeSheetId = null;
      }

      await assessmentService.createAssessment(assessmentData);

      setShowCreateModal(false);
      loadAssessments();
    } catch (error) {
      console.error("Error creating assessment:", error);
      alert("Error creating assessment");
    }
  };

  const handleUpdateAssessment = async (data: any) => {
    try {
      if (!editingAssessment) return;

      let dueDateValue = data.dueDate;
      if (dueDateValue) {
        const date = new Date(dueDateValue);
        if (isNaN(date.getTime())) {
          alert("Invalid date");
          return;
        }
      }

      let startDateValue = null;
      if (data.assessmentType === "delivery" && data.startDate) {
        const date = new Date(data.startDate);
        if (isNaN(date.getTime())) {
          alert("Invalid start date");
          return;
        }
        startDateValue = data.startDate;
      }

      await assessmentService.updateAssessment(editingAssessment.id, {
        name: data.name,
        description: data.description,
        type: data.type,
        percentage: parseFloat(data.percentage || 0),
        maxPoints: parseFloat(data.maxPoints || 0),
        passingScore: parseFloat(data.passingScore || 0),
        dueDate: dueDateValue || null,
        gradeSheetId: data.gradeSheetId,
        assessmentType: data.assessmentType,
        deliveryType: data.deliveryType || 'text',
        startDate: startDateValue,
      });

      setShowEditModal(false);
      setEditingAssessment(null);
      loadAssessments();
    } catch (error) {
      console.error("Error updating assessment:", error);
      alert("Error updating assessment");
    }
  };

  const handleDeleteAssessment = async () => {
    if (!selectedAssessment) return;

    try {
      await assessmentService.deleteAssessment(selectedAssessment.id);
      setShowDeleteModal(false);
      setSelectedAssessment(null);
      loadAssessments();
    } catch (error) {
      console.error("Error deleting assessment:", error);
      alert("Error deleting assessment");
    }
  };

  // ========== VALIDACIONES ==========
  if (!user) {
    return (
      <DashboardLayout title="Assessments" subtitle="Please log in">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-2">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
              <AlertCircle className="h-10 w-10 text-gray-400" />
            </div>
            <div className="space-y-2">
              <p className="text-xl font-bold text-gray-900">Please log in</p>
              <p className="text-gray-500">You need to be logged in to view assessments</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (availableCourses.length === 0) {
    return (
      <DashboardLayout title="Assessments" subtitle="No courses available">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-2">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
              <Book className="h-10 w-10 text-gray-400" />
            </div>
            <div className="space-y-2">
              <p className="text-xl font-bold text-gray-900">
                {user.role === "docente"  
                  ? "No courses assigned" 
                  : "No enrolled courses"}
              </p>
              <p className="text-gray-500">
                {user.role === "docente" 
                  ? "You are not teaching any courses yet" 
                  : "You are not enrolled in any courses yet"}
              </p>
            </div>
            <Link
              to={user.role === "docente" ? "/courses" : "/dashboard"}
              className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium hover:shadow-lg transition-all duration-300"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to {user.role === "docente" ? "Courses" : "Dashboard"}
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Loading state
  if (loading && selectedCourseId) {
    return (
      <DashboardLayout 
        title="Assessments"
        subtitle={`${selectedCourse?.name || "Loading..."}`}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-2">
            <Loader2 className="h-10 w-10 animate-spin text-blue-500 mx-auto" />
            <div className="space-y-2">
              <p className="text-lg font-semibold text-gray-900">Loading assessments</p>
              <p className="text-sm text-gray-500">Please wait while we load the assessment data</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Assessments"
      subtitle={selectedCourse ? `${selectedCourse.name} • ${selectedCourse.code}` : "Select a course"}
    >
     

      <div className="space-y-2">
        {/* Course Selector Modal */}
        {showCourseSelector && (
          <CourseSelectorModal
            courses={availableCourses}
            selectedCourseId={selectedCourseId}
            onSelectCourse={handleCourseChange}
            onClose={() => setShowCourseSelector(false)}
            userRole={user.role}
          />
        )}

        {/* Header with stats */}
        <div className="grid grid-cols-4 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold text-blue-600 tracking-wide">Today</p>
                </div>
                <p className="text-xl font-bold text-gray-900">{stats.todayCount}</p>
              </div>
              <div className="hidden sm:flex h-12 w-12 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 items-center justify-center">
                <CalendarDays className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold text-purple-600 tracking-wide">Upcoming</p>
                </div>
                <p className="text-xl font-bold text-gray-900">{stats.upcomingCount}</p>
              </div>
              <div className="hidden sm:flex h-12 w-12 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 items-center justify-center">
                <CalendarClock className="h-6 w-6 text-purple-500" />
              </div>
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold text-amber-600 tracking-wide">Past</p>
                </div>
                <p className="text-xl font-bold text-gray-900">{stats.pastCount}</p>
              </div>
              <div className="hidden sm:flex h-12 w-12 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 items-center justify-center">
                <CalendarOff className="h-6 w-6 text-amber-500" />
              </div>
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold text-gray-600 tracking-wide">No Date</p>
                </div>
                <p className="text-xl font-bold text-gray-900">{stats.noDueDateCount}</p>
              </div>
              <div className="hidden sm:flex h-12 w-12 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 items-center justify-center">
                <Calendar className="h-6 w-6 text-gray-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Search and filter bar */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
    <div className="flex-1 flex flex-col sm:flex-row gap-4">
      <div className="flex-1">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search assessments..."
            className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      
      {/* Selector de cursos - Agregado aquí */}
      <div className="relative min-w-[180px]">
        <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
          <School className="h-5 w-5 text-gray-400" />
        </div>
        <select
          value={selectedCourseId || ""}
          onChange={(e) => {
            const course = availableCourses.find(c => c.id === e.target.value);
            if (course) {
              handleCourseChange(course);
            }
          }}
          className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium appearance-none"
        >
          <option value="">Select course...</option>
          {availableCourses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.code} 
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
      </div>
    </div>
    
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative hidden md:block">
        <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <select
          className="pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none text-sm font-medium"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)} 
        >
          <option value="all">All Types</option>
          <option value="announcement">Announcements</option>
          <option value="delivery">Delivery Activities</option>
          <option value="exam">Exams</option>
          <option value="quiz">Quizzes</option>
          <option value="homework">Homework</option>
          <option value="project">Projects</option>
          <option value="participation">Participation</option>
        </select>
      </div>
      
      {user.role === "docente" && (
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
    </div>
  </div>
</div>

        {/* Assessments list - Organized by date */}
        {assessments.length === 0 ? (
          <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-2xl p-8 text-center shadow-sm">
            <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
              <FileText className="h-12 w-12 text-gray-400" />
            </div>
            <h3 className="font-bold text-xl mb-3 text-gray-900">No assessments available</h3>
            <p className="text-gray-500 max-w-md mx-auto mb-6">
              {user.role === "docente"
                ? "Create your first assessment to get started"
                : "There are no assessments scheduled yet"}
            </p>
            {user.role === "docente" && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
              >
                <Plus className="h-4 w-4" />
                Create First Assessment
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {/* Today's Assessments */}
            {filteredToday.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-red-50 to-pink-50 flex items-center justify-center border border-red-100">
                      <AlertTriangle className="h-6 w-6 text-red-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-xl text-gray-900">Today's Assessments</h3>
                        <span className="px-2 py-1 bg-gradient-to-r from-red-100 to-pink-100 text-red-700 text-xs font-bold rounded-full">
                          {filteredToday.length} URGENT
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">Due today • Submit before deadline</p>
                    </div>
                  </div>
                  <Zap className="h-5 w-5 text-red-400 hidden lg:block" />
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  {filteredToday.map((assessment) => (
                    <AssessmentCard
                      key={assessment.id}
                      assessment={assessment}
                      courseCode={selectedCourse?.code || ''}
                      isTeacher={user.role === "docente"}
                      onEdit={() => {
                        setEditingAssessment(assessment);
                        setShowEditModal(true);
                      }}
                      onDelete={() => {
                        setSelectedAssessment(assessment);
                        setShowDeleteModal(true);
                      }}
                      isToday={true}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming Assessments */}
            {filteredUpcoming.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center border border-blue-100">
                      <CalendarClock className="h-6 w-6 text-blue-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-xl text-gray-900">Upcoming Assessments</h3>
                        <span className="px-2 py-1 bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 text-xs font-bold rounded-full">
                          {filteredUpcoming.length} Coming
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">Next 15 days • Plan ahead</p>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  {filteredUpcoming.map((assessment) => (
                    <AssessmentCard
                      key={assessment.id}
                      assessment={assessment}
                      courseCode={selectedCourse?.code || ''}
                      isTeacher={user.role === "docente"}
                      onEdit={() => {
                        setEditingAssessment(assessment);
                        setShowEditModal(true);
                      }}
                      onDelete={() => {
                        setSelectedAssessment(assessment);
                        setShowDeleteModal(true);
                      }}
                      isUpcoming={true}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Past Assessments */}
            {filteredPast.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center border border-green-100">
                      <CalendarOff className="h-6 w-6 text-green-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-xl text-gray-900">Completed Assessments</h3>
                        <span className="px-2 py-1 bg-gradient-to-r from-green-100 to-emerald-100 text-green-700 text-xs font-bold rounded-full">
                          {filteredPast.length} Done
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">Previously completed • Review results</p>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  {filteredPast.map((assessment) => (
                    <AssessmentCard
                      key={assessment.id}
                      assessment={assessment}
                      courseCode={selectedCourse?.code || ''}
                      isTeacher={user.role === "docente"}
                      onEdit={() => {
                        setEditingAssessment(assessment);
                        setShowEditModal(true);
                      }}
                      onDelete={() => {
                        setSelectedAssessment(assessment);
                        setShowDeleteModal(true);
                      }}
                      isPast={true}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Assessments without due date */}
            {filteredNoDueDate.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center border border-gray-200">
                      <Calendar className="h-6 w-6 text-gray-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-xl text-gray-900">No Deadline</h3>
                        <span className="px-2 py-1 bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 text-xs font-bold rounded-full">
                          {filteredNoDueDate.length} FLEXIBLE
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">Activities without deadline • Take your time</p>
                    </div>
                  </div>
                  <Clock className="h-5 w-5 text-gray-400 hidden lg:block" />
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  {filteredNoDueDate.map((assessment) => (
                    <AssessmentCard
                      key={assessment.id}
                      assessment={assessment}
                      courseCode={selectedCourse?.code || ''}
                      isTeacher={user.role === "docente"}
                      onEdit={() => {
                        setEditingAssessment(assessment);
                        setShowEditModal(true);
                      }}
                      onDelete={() => {
                        setSelectedAssessment(assessment);
                        setShowDeleteModal(true);
                      }}
                      noDueDate={true}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* No results message */}
            {filteredToday.length === 0 && 
             filteredUpcoming.length === 0 && 
             filteredPast.length === 0 && 
             filteredNoDueDate.length === 0 && (
              <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-2xl p-8 text-center shadow-sm">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                  <Search className="h-10 w-10 text-gray-400" />
                </div>
                <h3 className="font-bold text-xl mb-3 text-gray-900">No matching assessments</h3>
                <p className="text-gray-500 max-w-md mx-auto mb-6">
                  Try different search terms or filters
                </p>
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setFilterType('all');
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && selectedCourseId && (
        <CreateAssessmentModal
          courseId={selectedCourseId}
          courseName={selectedCourse?.name || ''}
          onSubmit={handleCreateAssessment}
          onClose={() => setShowCreateModal(false)}
        />
      )}
      
      {showEditModal && editingAssessment && selectedCourseId && (
        <EditAssessmentModal
          assessment={editingAssessment}
          courseId={selectedCourseId}
          onSubmit={handleUpdateAssessment}
          onClose={() => {
            setShowEditModal(false);
            setEditingAssessment(null);
          }}
        />
      )}
      
      {showDeleteModal && selectedAssessment && (
        <DeleteConfirmationModal
          title={`Delete "${selectedAssessment.name}"?`}
          message="This action will delete the assessment and all associated grades. This cannot be undone."
          onConfirm={handleDeleteAssessment}
          onCancel={() => {
            setShowDeleteModal(false);
            setSelectedAssessment(null);
          }}
        />
      )}
    </DashboardLayout>
  );
}

// Course Selector Modal Component
function CourseSelectorModal({ courses, selectedCourseId, onSelectCourse, onClose, userRole }: any) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredCourses = useMemo(() => {
    return courses.filter(course =>
      course.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      course.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      course.teacherName?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [courses, searchTerm]);

  const getCourseIcon = (course: any) => {
    if (userRole === "docente") {
      return <School className="h-5 w-5 text-blue-500" />;
    }
    const firstLetter = course.name.charAt(0).toUpperCase();
    return (
      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center text-blue-600 font-bold">
        {firstLetter}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200 max-h-[80vh] flex flex-col">
        <div className="p-6 border-b bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                <Book className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900">Select Course</h3>
                <p className="text-sm text-gray-500 mt-1">Choose a course to view assessments</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search courses..."
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <div className="space-y-2">
            {filteredCourses.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                  <Search className="h-8 w-8 text-gray-400" />
                </div>
                <h4 className="font-medium text-gray-900 mb-2">No courses found</h4>
                <p className="text-sm text-gray-500">Try different search terms</p>
              </div>
            ) : (
              filteredCourses.map((course) => (
                <button
                  key={course.id}
                  onClick={() => onSelectCourse(course)}
                  className={`w-full text-left p-4 rounded-xl transition-all duration-300 flex items-center gap-4 hover:bg-gray-50 border ${
                    selectedCourseId === course.id
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-transparent hover:border-gray-200'
                  }`}
                >
                  {getCourseIcon(course)}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-gray-900">{course.name}</h4>
                      {selectedCourseId === course.id && (
                        <CheckCircle className="h-5 w-5 text-blue-500" />
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-sm text-gray-500">{course.code}</span>
                      <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
                        {course.semester} Semester
                      </span>
                      <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
                        {course.credits} Credits
                      </span>
                    </div>
                    {course.teacherName && (
                      <p className="text-sm text-gray-500 mt-2">
                        <span className="font-medium">Teacher:</span> {course.teacherName}
                      </p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="p-4 border-t">
          <button
            onClick={onClose}
            className="w-full px-4 py-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-all duration-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Assessment Card Component (sin cambios)
function AssessmentCard({ assessment, courseCode, isTeacher, onEdit, onDelete, isToday, isUpcoming, isPast, noDueDate }: any) {
  const dueDate = assessment.dueDate ? new Date(assessment.dueDate) : null;
  const startDate = assessment.startDate ? new Date(assessment.startDate) : null;
  
  const getTimeStatus = () => {
    const now = new Date();
    
    if (!dueDate) {
      return { text: "NO DEADLINE", color: "bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700" };
    }
    
    const dueDateNormalized = new Date(
      dueDate.getFullYear(),
      dueDate.getMonth(),
      dueDate.getDate()
    );
    
    const nowNormalized = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    
    if (dueDateNormalized.getTime() === nowNormalized.getTime()) {
      return { text: "Today", color: "bg-gradient-to-r from-red-100 to-pink-100 text-red-700" };
    }
    
    if (dueDateNormalized > nowNormalized) {
      return { text: "Upcoming", color: "bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700" };
    }
    
    return { text: "Completed", color: "bg-gradient-to-r from-green-100 to-emerald-100 text-green-700" };
  };

  const getAssessmentIcon = () => {
    if (assessment.assessmentType === 'announcement') {
      return <Megaphone className="h-6 w-6" />;
    } else if (assessment.assessmentType === 'delivery') {
      return <Upload className="h-6 w-6" />;
    } else {
      return assessment.type === "exam" ? <FileText className="h-6 w-6" /> :
             assessment.type === "quiz" ? <BookOpen className="h-6 w-6" /> :
             assessment.type === "homework" ? <FileCheck className="h-6 w-6" /> :
             assessment.type === "project" ? <TrendingUp className="h-6 w-6" /> :
             <Users className="h-6 w-6" />;
    }
  };

  const getAssessmentTypeLabel = () => {
    if (assessment.assessmentType === 'announcement') {
      return "Announcement";
    } else if (assessment.assessmentType === 'delivery') {
      return "Delivery Activity";
    } else {
      return assessment.type === "exam" ? "Exam" :
             assessment.type === "quiz" ? "Quiz" :
             assessment.type === "homework" ? "Homework" :
             assessment.type === "project" ? "Project" :
             "Participation";
    }
  };

  const getIconColor = () => {
    if (assessment.assessmentType === "announcement") {
      return "from-blue-500 to-cyan-500";
    } else if (assessment.assessmentType === "delivery") {
      return "from-purple-500 to-pink-500";
    } else {
      return assessment.type === "exam" ? "from-red-500 to-orange-500" :
             assessment.type === "quiz" ? "from-blue-500 to-cyan-500" :
             assessment.type === "homework" ? "from-green-500 to-emerald-500" :
             assessment.type === "project" ? "from-purple-500 to-pink-500" :
             "from-amber-500 to-yellow-500";
    }
  };

  const timeStatus = getTimeStatus();

  return (
    <div className={cn(
      "bg-white border rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 group",
      isToday ? "border-red-200 hover:border-red-300" :
      isUpcoming ? "border-blue-200 hover:border-blue-300" :
      isPast ? "border-green-200 hover:border-green-300" :
      "border-gray-200 hover:border-gray-300"
    )}>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-start gap-4">
            <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${getIconColor()} flex items-center justify-center text-white shadow-sm`}>
              {getAssessmentIcon()}
            </div>
            
            <div className="flex-1 ">
              <div className="flex flex-wrap items-center gap-3 mb-3 ">
                <h3 className="font-bold text-lg text-gray-900 group-hover:text-blue-600 transition-colors">
                  {assessment.name}
                </h3>
              </div>
              
              <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                {assessment.assessmentType === 'delivery' && startDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <span className="font-medium">
                      Starts: {format(parseISO(assessment.startDate), "MMM dd", { locale: enUS })}
                    </span>
                  </div>
                )}
                {dueDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className={cn(
                      "h-4 w-4",
                      isToday ? "text-red-500" :
                      isUpcoming ? "text-blue-500" :
                      "text-gray-400"
                    )} />
                    <span className={cn(
                      "font-medium",
                      isToday ? "text-red-600" :
                      isUpcoming ? "text-blue-600" :
                      "text-gray-600"
                    )}>
                      {assessment.assessmentType === 'delivery' ? 'Deadline: ' : 'Due: '}
                      {format(parseISO(assessment.dueDate), "MMM dd, yyyy", { locale: enUS })}
                    </span>
                  </div>
                )}
                {assessment.percentage > 0 && (
                  <div className="flex items-center gap-2">
                    <Percent className="h-4 w-4 text-gray-400" />
                    <span className="font-medium text-gray-600">{assessment.percentage}% of grade</span>
                  </div>
                )} 
              </div>

              {assessment.description && (
                <p className="text-sm text-gray-500 mt-3 line-clamp-2">
                  {assessment.description}
                </p>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 lg:flex-col lg:items-end">
          <div className="">
            <Link
            to={`/courses/${courseCode}/assessments/${assessment.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100 text-gray-700 hover:text-gray-900 hover:shadow-sm transition-all duration-300 font-medium text-sm border border-gray-200 group/view "
          >
            <Eye className="h-4 w-4 group-hover/view:scale-110 transition-transform" />
            View Details
          </Link>
          </div>
          
          {isTeacher && (
            <div className="flex items-center gap-1">
              {assessment.assessmentType !== 'announcement' && (
                <Link
                  to={`/courses/${courseCode}/assessments/${assessment.id}/grade`}
                  className="p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors hover:scale-110"
                  title="Grade"
                >
                  <BarChart3 className="h-5 w-5" />
                </Link>
              )}
              
              <button
                onClick={onEdit}
                className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors hover:scale-110"
                title="Edit"
              >
                <Edit className="h-5 w-5" />
              </button>
              
              <button
                onClick={onDelete}
                className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors hover:scale-110"
                title="Delete"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Assessment Stats Component (sin cambios)
function AssessmentStats({ assessment, courseId, enrolledStudents }: any) {
  const [stats, setStats] = useState({
    average: 0,
    gradedCount: 0,
    totalCount: 0,
    passingRate: 0,
    loading: true,
  });

  useEffect(() => {
    const loadStats = async () => {
      try {
        setTimeout(() => {
          setStats({
            average: 8.5,
            gradedCount: 15,
            totalCount: 20,
            passingRate: 75,
            loading: false,
          });
        }, 500);
      } catch (error) {
        setStats({
          average: 0,
          gradedCount: 0,
          totalCount: enrolledStudents.length,
          passingRate: 0,
          loading: false,
        });
      }
    };

    loadStats();
  }, [assessment, courseId, enrolledStudents]);

  if (stats.loading) {
    return (
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          <span className="ml-2 text-sm text-gray-500">Loading statistics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 pt-6 border-t border-gray-200">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-gray-500" />
            <span className="text-xs font-medium text-gray-600">Graded</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{stats.gradedCount}/{stats.totalCount}</p>
        </div>
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-medium text-gray-600">Average</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{stats.average.toFixed(1)}</p>
        </div>
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <Percent className="h-4 w-4 text-green-500" />
            <span className="text-xs font-medium text-gray-600">Passing Rate</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{stats.passingRate}%</p>
        </div>
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <Award className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-medium text-gray-600">Status</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{stats.passingRate >= 70 ? "Good" : "Needs Attention"}</p>
        </div>
      </div>
    </div>
  );
}

// Create Assessment Modal (sin cambios)
function CreateAssessmentModal({ courseId, courseName, onSubmit, onClose }: any) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    type: "exam",
    percentage: "",
    maxPoints: "",
    passingScore: "",
    dueDate: "",
    startDate: "",
    gradeSheetId: "",
    assessmentType: "assessment",
    deliveryType: "text",
  });

  const [gradeSheets, setGradeSheets] = useState<GradeSheet[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [errorSheets, setErrorSheets] = useState("");

  useEffect(() => {
    const loadGradeSheets = async () => {
      setLoadingSheets(true);
      setErrorSheets("");
      try {
        const sheets = await gradeSheetService.getByCourse(courseId);
        setGradeSheets(sheets);
        if (sheets.length === 0) {
          setErrorSheets("No grade sheets available for this course");
        }
      } catch (error: any) {
        setErrorSheets("Error loading grade sheets");
      } finally {
        setLoadingSheets(false);
      }
    };

    loadGradeSheets();
  }, [courseId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.assessmentType !== 'announcement' && !formData.gradeSheetId && gradeSheets.length > 0) {
      alert("Please select a grade sheet");
      return;
    }
    onSubmit(formData);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const getCurrentDate = () => {
    const now = new Date();
    return now.toISOString().split('T')[0];
  };

  const getMaxDate = () => {
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(today.getFullYear() + 1);
    return nextYear.toISOString().split('T')[0];
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200">
        <div className="p-6 border-b bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                <Plus className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900">New Assessment</h3>
                <p className="text-sm text-gray-500 mt-1">{courseName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-2">
            {/* Tipo de evaluación */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Assessment Type *</label>
              <select
                name="assessmentType"
                required
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                value={formData.assessmentType}
                onChange={handleChange}
              >
                <option value="assessment">Regular Assessment</option>
                <option value="announcement">Announcement</option>
                <option value="delivery">Delivery Activity</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
              <input
                type="text"
                name="name"
                required
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                placeholder="Assessment name"
                value={formData.name}
                onChange={handleChange}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
              <textarea
                name="description"
                rows={3}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                placeholder="Description (optional)"
                value={formData.description}
                onChange={handleChange}
              />
            </div>

            {/* Solo mostrar tipo de evaluación regular si no es anuncio o entrega */}
            {formData.assessmentType === 'assessment' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Type *</label>
                  <select
                    name="type"
                    required
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    value={formData.type}
                    onChange={handleChange}
                  >
                    <option value="exam">Exam</option>
                    <option value="quiz">Quiz</option>
                    <option value="homework">Homework</option>
                    <option value="project">Project</option>
                    <option value="participation">Participation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Percentage *</label>
                  <input
                    type="number"
                    name="percentage"
                    required
                    min="0"
                    max="100"
                    step="0.1"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    placeholder="5%"
                    value={formData.percentage}
                    onChange={handleChange}
                  />
                </div>
              </div>
            )}

            {/* Para actividades de entrega, mostrar tipo de entrega */}
            {formData.assessmentType === 'delivery' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Type *</label>
                <select
                  name="deliveryType"
                  required
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                  value={formData.deliveryType}
                  onChange={handleChange}
                >
                  <option value="text">Text Only</option>
                </select>
                <p className="text-xs text-gray-500 mt-2">Delivery activities only accept text submissions</p>
              </div>
            )}

            {/* Solo mostrar Grade Sheet si no es un anuncio */}
            {formData.assessmentType !== 'announcement' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Grade Sheet *</label>
                <div className="relative">
                  <select
                    name="gradeSheetId"
                    required={gradeSheets.length > 0}
                    disabled={loadingSheets}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all disabled:bg-gray-100 text-sm font-medium"
                    value={formData.gradeSheetId}
                    onChange={handleChange}
                  >
                    <option value="">
                      {loadingSheets ? "Loading..." : gradeSheets.length === 0 ? "No grade sheets" : "Select grade sheet"}
                    </option>
                    {gradeSheets.map((sheet) => (
                      <option key={sheet.id} value={sheet.id}>
                        {sheet.title}
                      </option>
                    ))}
                  </select>
                  {loadingSheets && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-blue-500" />
                  )}
                </div>
                {errorSheets && (
                  <p className="text-sm text-gray-500 mt-2">{errorSheets}</p>
                )}
              </div>
            )}

            {/* Fechas para actividades de entrega */}
            {formData.assessmentType === 'delivery' && (
              <div className="space-y-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Date *</label>
                  <input
                    type="date"
                    name="startDate"
                    required
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    value={formData.startDate}
                    onChange={handleChange}
                    min={getCurrentDate()}
                    max={getMaxDate()}
                  />
                  <p className="text-xs text-gray-500 mt-2">Date when students can start submitting</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Deadline *</label>
                  <input
                    type="date"
                    name="dueDate"
                    required
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    value={formData.dueDate}
                    onChange={handleChange}
                    min={formData.startDate || getCurrentDate()}
                    max={getMaxDate()}
                  />
                  <p className="text-xs text-gray-500 mt-2">Final submission deadline</p>
                </div>
              </div>
            )}

            {/* Fecha de vencimiento para evaluaciones regulares */}
            {formData.assessmentType === 'assessment' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Due Date</label>
                <input
                  type="date"
                  name="dueDate"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                  value={formData.dueDate}
                  onChange={handleChange}
                  min={getCurrentDate()}
                  max={getMaxDate()}
                />
              </div>
            )}

            {/* Fecha de vencimiento para anuncios */}
            {formData.assessmentType === 'announcement' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Expiration Date (Optional)</label>
                <input
                  type="date"
                  name="dueDate"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                  value={formData.dueDate}
                  onChange={handleChange}
                  min={getCurrentDate()}
                  max={getMaxDate()}
                />
                <p className="text-xs text-gray-500 mt-2">Date when announcement expires (optional)</p>
              </div>
            )}

            {/* Solo mostrar puntos y calificación para evaluaciones regulares y entregas */}
            {(formData.assessmentType === 'assessment' || formData.assessmentType === 'delivery') && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Max Points *</label>
                  <input
                    type="number"
                    name="maxPoints"
                    required
                    min="0"
                    step="0.1"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    placeholder="4.5"
                    value={formData.maxPoints}
                    onChange={handleChange}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Passing Score *</label>
                  <input
                    type="number"
                    name="passingScore"
                    required
                    min="0"
                    step="0.1"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    placeholder="4.3"
                    value={formData.passingScore}
                    onChange={handleChange}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-6 mt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-all duration-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:shadow-lg font-medium transition-all duration-300 flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Create Assessment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Edit Assessment Modal (sin cambios)
function EditAssessmentModal({ assessment, courseId, onSubmit, onClose }: any) {
  const [formData, setFormData] = useState({
    name: assessment?.name || "",
    description: assessment?.description || "",
    type: assessment?.type || "exam",
    percentage: assessment?.percentage?.toString() || "",
    maxPoints: assessment?.maxPoints?.toString() || "",
    passingScore: assessment?.passingScore?.toString() || "",
    dueDate: assessment?.dueDate ? new Date(assessment.dueDate).toISOString().split('T')[0] : "",
    startDate: assessment?.startDate ? new Date(assessment.startDate).toISOString().split('T')[0] : "",
    gradeSheetId: assessment?.gradeSheetId || "",
    assessmentType: assessment?.assessmentType || "assessment",
    deliveryType: assessment?.deliveryType || "text",
  });

  const [gradeSheets, setGradeSheets] = useState<GradeSheet[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);

  useEffect(() => {
    const loadGradeSheets = async () => {
      setLoadingSheets(true);
      try {
        const sheets = await gradeSheetService.getByCourse(courseId);
        setGradeSheets(sheets);
      } catch (error) {
        console.error("Error loading grade sheets:", error);
      } finally {
        setLoadingSheets(false);
      }
    };

    loadGradeSheets();
  }, [courseId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const getCurrentDate = () => {
    const now = new Date();
    return now.toISOString().split('T')[0];
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200">
        <div className="p-6 border-b bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                <Edit className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900">Edit Assessment</h3>
                <p className="text-sm text-gray-500 mt-1">Update assessment details</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-2">
            {/* Tipo de evaluación */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Assessment Type</label>
              <select
                name="assessmentType"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                value={formData.assessmentType}
                onChange={handleChange}
              >
                <option value="assessment">Regular Assessment</option>
                <option value="announcement">Announcement</option>
                <option value="delivery">Delivery Activity</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
              <input
                type="text"
                name="name"
                required
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                value={formData.name}
                onChange={handleChange}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
              <textarea
                name="description"
                rows={3}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                value={formData.description}
                onChange={handleChange}
              />
            </div>

            {/* Solo mostrar tipo de evaluación regular si no es anuncio o entrega */}
            {formData.assessmentType === 'assessment' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Type *</label>
                  <select
                    name="type"
                    required
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    value={formData.type}
                    onChange={handleChange}
                  >
                    <option value="exam">Exam</option>
                    <option value="quiz">Quiz</option>
                    <option value="homework">Homework</option>
                    <option value="project">Project</option>
                    <option value="participation">Participation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Percentage *</label>
                  <input
                    type="number"
                    name="percentage"
                    required
                    min="0"
                    max="100"
                    step="0.1"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    value={formData.percentage}
                    onChange={handleChange}
                  />
                </div>
              </div>
            )}

            {/* Para actividades de entrega, mostrar tipo de entrega */}
            {formData.assessmentType === 'delivery' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Type</label>
                <select
                  name="deliveryType"
                  required
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                  value={formData.deliveryType}
                  onChange={handleChange}
                >
                  <option value="text">Text Only</option>
                </select>
              </div>
            )}

            {/* Solo mostrar Grade Sheet si no es un anuncio */}
            {formData.assessmentType !== 'announcement' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Grade Sheet</label>
                <div className="relative">
                  <select
                    name="gradeSheetId"
                    disabled={loadingSheets}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    value={formData.gradeSheetId}
                    onChange={handleChange}
                  >
                    <option value="">No grade sheet</option>
                    {gradeSheets.map((sheet) => (
                      <option key={sheet.id} value={sheet.id}>
                        {sheet.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Fechas para actividades de entrega */}
            {formData.assessmentType === 'delivery' && (
              <div className="space-y-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                  <input
                    type="date"
                    name="startDate"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    value={formData.startDate}
                    onChange={handleChange}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Deadline</label>
                  <input
                    type="date"
                    name="dueDate"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    value={formData.dueDate}
                    onChange={handleChange}
                  />
                </div>
              </div>
            )}

            {/* Fecha de vencimiento para evaluaciones regulares */}
            {formData.assessmentType === 'assessment' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Due Date</label>
                <input
                  type="date"
                  name="dueDate"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                  value={formData.dueDate}
                  onChange={handleChange}
                />
              </div>
            )}

            {/* Fecha de vencimiento para anuncios */}
            {formData.assessmentType === 'announcement' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Expiration Date</label>
                <input
                  type="date"
                  name="dueDate"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                  value={formData.dueDate}
                  onChange={handleChange}
                />
              </div>
            )}

            {/* Solo mostrar puntos y calificación para evaluaciones regulares y entregas */}
            {(formData.assessmentType === 'assessment' || formData.assessmentType === 'delivery') && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Max Points *</label>
                  <input
                    type="number"
                    name="maxPoints"
                    required
                    min="0"
                    step="0.1"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    value={formData.maxPoints}
                    onChange={handleChange}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Passing Score *</label>
                  <input
                    type="number"
                    name="passingScore"
                    required
                    min="0"
                    step="0.1"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    value={formData.passingScore}
                    onChange={handleChange}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-6 mt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-all duration-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:shadow-lg font-medium transition-all duration-300 flex items-center justify-center gap-2"
            >
              <Edit className="h-4 w-4" />
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Delete Confirmation Modal (sin cambios)
function DeleteConfirmationModal({ title, message, onConfirm, onCancel }: any) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-200">
        <div className="text-center">
          <div className="h-20 w-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-red-50 to-pink-50 flex items-center justify-center border border-red-100">
            <AlertCircle className="h-10 w-10 text-red-500" />
          </div>
          
          <h3 className="font-bold text-xl text-gray-900 mb-3">{title}</h3>
          <p className="text-gray-600 mb-6">{message}</p>
          
          <div className="flex justify-center gap-3">
            <button
              onClick={onCancel}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium transition-all duration-300"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-6 py-3 bg-gradient-to-r from-red-600 to-pink-600 text-white rounded-xl hover:shadow-lg font-medium transition-all duration-300"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}