// src/pages/CoursesPage.tsx - VERSIÓN COMPLETA CON ELIMINACIÓN DE CURSOS
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademic } from "@/contexts/AcademicContext";
import { collection, query, getDocs, deleteDoc, doc, updateDoc, arrayRemove } from "firebase/firestore";
import { firebaseDB } from "@/lib/firebase";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { calculateCourseRealStats } from "@/utils/gradeCalculations";
import type { Assessment, Grade } from "@/types/academic";
import { enrollmentService, deleteCourseCompletely , courseService} from "@/lib/firestore";


import {
  ArrowLeft,
  BookOpen,
  CreditCard,
  Calendar,
  Users,
  Presentation,
  FileText,
  Plus,
  ExternalLink,
  UserPlus,
  UserMinus,
  Search,
  Edit,
  ChevronRight,
  Download,
  MoreVertical,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  X,
  BookMarked,
  FileCheck,
  FolderOpen,
  Clock,
  Bell,
  TrendingUp,
  FileBarChart,
  Percent,
  CheckCircle,
  AlertCircle,
  Eye,
  Filter,
  SortAsc,
  Phone,
  Mail,
  User,
  Zap,
  Sparkles,
  Target,
  Trophy,
  Rocket,
  Star,
  Book,
  File,
  CalendarDays,
  Award,
  TrendingDown,
  Loader2Icon,
  Trash2
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";

export default function CoursesPage() {
  const { courseCode } = useParams<{ courseCode?: string }>();
  const { user } = useAuth();
  const { courses, assessments, grades, units } = useAcademic();
  const [enrolledStudents, setEnrolledStudents] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [availableStudents, setAvailableStudents] = useState<any[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [gradeSheets, setGradeSheets] = useState<any[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [gradeFilter, setGradeFilter] = useState<'all' | 'passing' | 'at-risk' | 'failing'>('all');
  const [filteredStudents, setFilteredStudents] = useState<any[]>([]);

  const isTeacher = user?.role === "docente";

  const course = courseCode ? courses.find((c) => c.code === courseCode) : null;
  const id = course ? course.id : null;
  const [loading, setLoading] = useState(true);

  const sampleFiles = [
    {
      id: "file-1",
      name: "100 Verbs in English",
      url: "/pdf/100-verbs.pdf",
      size: 119000,
      type: "application/pdf",
      uploadedBy: "Roberto Román",
      uploadedAt: new Date("2026-02-01"),
      courseId: "f167e59a-3e3b-45c8-b134-b1024f2092d5",
      description: "List of 100 verbs in English with translations",
      isPublic: true,
    },
    {
      id: "file-2",
      name: "The Elephant Man",
      url: "/pdf/the-elephant-man.pdf",
      size: 430000,
      type: "application/pdf",
      uploadedBy: "Roberto Román",
      uploadedAt: new Date("2026-02-01"),
      courseId: "f167e59a-3e3b-45c8-b134-b1024f2092d5",
      description: "The Elephant Man - A short story by H.G. Wells",
      isPublic: true,
    },
  ];

  useEffect(() => {
    if (courses.length > 0 || (user && isTeacher)) {
      setLoading(false);
    }
  }, [courses, user, isTeacher]);

  useEffect(() => {
    const loadGradeSheets = async () => {
      if (!user?.id) return;

      setLoadingSheets(true);
      try {
        const gradeSheetsRef = collection(firebaseDB, "gradeSheets");
        const q = query(gradeSheetsRef);
        const querySnapshot = await getDocs(q);

        const sheets: any[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();

          if (isTeacher) {
            if (!data.isPublished) return;

            sheets.push({
              id: doc.id,
              title: data.title || "Grade Sheet",
              courseId: data.courseId || "",
              courseName: data.courseName || "Course",
              gradingPeriod: data.gradingPeriod || "First Term",
              isPublished: data.isPublished,
              students: data.students || [],
              updatedAt: data.updatedAt,
            });
          } else {
            if (!data.isPublished) return;

            const studentInSheet = data.students?.find(
              (s: any) => s.studentId === user.id,
            );
            if (!studentInSheet) return;

            sheets.push({
              id: doc.id,
              title: data.title || "Grade Sheet",
              courseId: data.courseId || "",
              courseName: data.courseName || "Course",
              gradingPeriod: data.gradingPeriod || "First Term",
              isPublished: data.isPublished,
              students: data.students || [],
              updatedAt: data.updatedAt,
            });
          }
        });

        setGradeSheets(sheets);
      } catch (error) {
        console.error("Error loading grade sheets:", error);
      } finally {
        setLoadingSheets(false);
      }
    };

    if (user?.id) loadGradeSheets();
  }, [user, isTeacher]);

  useEffect(() => {
    if (isTeacher && id && course) {
      loadEnrolledStudents();
    }
  }, [id, isTeacher, course]);

  useEffect(() => {
    if (showEnrollModal && isTeacher && course) {
      loadAvailableStudents();
    }
  }, [showEnrollModal]);

  // useEffect para filtrado y ordenamiento de estudiantes
  useEffect(() => {
    if (!enrolledStudents.length) {
      setFilteredStudents([]);
      return;
    }
    
    let result = [...enrolledStudents];
    
    // Filtrar por búsqueda
    if (searchTerm) {
      result = result.filter(student =>
        student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.idNumber?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filtrar por nota
    if (gradeFilter !== 'all') {
      result = result.filter(student => {
        const studentGradeSheets = gradeSheets.filter(
          (sheet) => sheet.courseId === id && sheet.isPublished,
        );
        
        let studentAverage = 0;
        let hasGrades = false;
        const studentTotals: number[] = [];
        
        studentGradeSheets.forEach((sheet) => {
          const studentInSheet = sheet.students?.find(
            (s: any) => s.studentId === student.id,
          );
          if (studentInSheet?.total !== undefined && studentInSheet.total !== null) {
            studentTotals.push(studentInSheet.total);
            hasGrades = true;
          }
        });
        
        if (hasGrades && studentTotals.length > 0) {
          studentAverage =
            studentTotals.reduce((sum, total) => sum + total, 0) /
            studentTotals.length;
        }
        
        const avgGrade = hasGrades ? studentAverage : 0;
        
        switch (gradeFilter) {
          case 'passing':
            return avgGrade >= 3.5;
          case 'at-risk':
            return avgGrade >= 3.0 && avgGrade < 3.5;
          case 'failing':
            return avgGrade < 3.0 && avgGrade > 0;
          default:
            return true;
        }
      });
    }
    
    // Ordenar
    result.sort((a, b) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      
      if (sortOrder === 'asc') {
        return nameA.localeCompare(nameB);
      } else {
        return nameB.localeCompare(nameA);
      }
    });
    
    setFilteredStudents(result);
  }, [enrolledStudents, searchTerm, sortOrder, gradeFilter, gradeSheets, id]);

  const loadEnrolledStudents = async () => {
    if (!id) return;
    setLoadingStudents(true);
    try {
      const students = await enrollmentService.getEnrolledStudents(id);
      setEnrolledStudents(students);
      setFilteredStudents(students); // Inicializar filteredStudents
    } catch (error) {
      console.error("Error loading students:", error);
    } finally {
      setLoadingStudents(false);
    }
  };

  const loadAvailableStudents = async () => {
    if (!id || !course) return;
    setLoadingAvailable(true);
    try {
      const allStudents = await enrollmentService.getAllStudents();
      const enrolledIds = course.enrolledStudents || [];
      const available = allStudents.filter(
        (student) => !enrolledIds.includes(student.id),
      );
      setAvailableStudents(available);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoadingAvailable(false);
    }
  };

// En el handleDeleteCourse de CoursesPage.tsx
const handleDeleteCourse = async () => {
  if (!course || !id) return;
  
  const confirmationMessage = `
⚠️ ARE YOU SURE YOU WANT TO DELETE THIS COURSE?

Course: ${course.name}
Code: ${course.code}
Teacher: ${course.teacherName}

This action will permanently delete:
• All course information
• ${enrolledStudents.length} enrolled students will be removed from this course
• ${assessments.filter(a => a.courseId === id).length} assessments
• ${gradeSheets.filter(s => s.courseId === id).length} grade sheets
• All related content, units, and materials

THIS ACTION CANNOT BE UNDONE!
  `.trim();
  
  if (!confirm(confirmationMessage)) {
    return;
  }
  
  setIsDeleting(true);
  
  try {
    // Usar la función de eliminación completa
    const result = await deleteCourseCompletely(id);
    
    if (result.success) {
      alert("✅ Course deleted successfully!");
      navigate("/courses");
    } else {
      alert(`❌ ${result.message}`);
    }
    
  } catch (error: any) {
    console.error("Error deleting course:", error);
    alert(`❌ Failed to delete course: ${error.message}`);
  } finally {
    setIsDeleting(false);
  }
};

// Para la eliminación simple (menú "More")
const handleDeleteCourseSimple = async () => {
  if (!course || !id) return;
  
  if (!confirm(`Are you sure you want to delete "${course.name}"? This action will only delete the course document. Related data will remain.`)) {
    return;
  }
  
  setIsDeleting(true);
  
  try {
    const result = await courseService.deleteSimple(id);
    
    if (result.success) {
      alert("Course deleted successfully!");
      navigate("/courses");
    } else {
      alert(`Failed to delete course: ${result.message}`);
    }
    
  } catch (error: any) {
    console.error("Error deleting course:", error);
    alert(`Failed to delete course: ${error.message}`);
  } finally {
    setIsDeleting(false);
  }
};

  const calculateRealCourseGrade = useMemo(() => {
    return (courseId: string, userId: string) => {
      if (!userId) return null;

      const courseGradeSheets = gradeSheets.filter(
        (sheet) => sheet.courseId === courseId && sheet.isPublished,
      );

      const studentSheets = courseGradeSheets.filter((sheet) => {
        const studentInSheet = sheet.students.find(
          (s: any) => s.studentId === userId,
        );
        return studentInSheet && studentInSheet.total !== undefined;
      });

      if (studentSheets.length === 0) return null;

      const average =
        studentSheets.reduce((sum, sheet) => {
          const studentData = sheet.students.find(
            (s: any) => s.studentId === userId,
          );
          return sum + (studentData?.total || 0);
        }, 0) / studentSheets.length;

      return average;
    };
  }, [gradeSheets]);

  const calculateUpcomingActivities = useMemo(() => {
    if (!id) return [];

    const now = new Date();
    const bogotaNow = new Date(
      now.toLocaleString("en-US", { timeZone: "America/Bogota" }),
    );
    const today = new Date(
      bogotaNow.getFullYear(),
      bogotaNow.getMonth(),
      bogotaNow.getDate(),
    );

    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    return assessments
      .filter((assessment) => {
        if (assessment.courseId !== id) return false;
        if (!assessment.dueDate) return false;

        const dueDateString = String(assessment.dueDate);
        let dueDate: Date;

        if (/^\d{4}-\d{2}-\d{2}$/.test(dueDateString)) {
          const [year, month, day] = dueDateString.split("-").map(Number);
          dueDate = new Date(year, month - 1, day);
        } else {
          dueDate = new Date(dueDateString);
        }

        const dueDateAtMidnight = new Date(
          dueDate.getFullYear(),
          dueDate.getMonth(),
          dueDate.getDate(),
        );

        return dueDateAtMidnight >= today && dueDateAtMidnight <= nextWeek;
      })
      .sort((a, b) => {
        const dueDateA = String(a.dueDate);
        const dueDateB = String(b.dueDate);

        let dateA: Date, dateB: Date;

        if (/^\d{4}-\d{2}-\d{2}$/.test(dueDateA)) {
          const [yearA, monthA, dayA] = dueDateA.split("-").map(Number);
          dateA = new Date(yearA, monthA - 1, dayA);
        } else {
          dateA = new Date(dueDateA);
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(dueDateB)) {
          const [yearB, monthB, dayB] = dueDateB.split("-").map(Number);
          dateB = new Date(yearB, monthB - 1, dayB);
        } else {
          dateB = new Date(dueDateB);
        }

        return dateA.getTime() - dateB.getTime();
      })
      .slice(0, 3);
  }, [assessments, id]);

  const calculateAssessmentStats = useMemo(() => {
    if (!id) return null;

    const courseAssessments = assessments.filter((a) => a.courseId === id);
    if (courseAssessments.length === 0) return null;

    if (!isTeacher && user?.id) {
      const gradedAssessments = courseAssessments.filter((assessment) => {
        const grade = grades.find(
          (g) => g.assessmentId === assessment.id && g.studentId === user.id,
        );
        return grade?.value != null;
      });

      const overdueAssessments = courseAssessments.filter((assessment) => {
        const dueDate = new Date(assessment.dueDate);
        const today = new Date();
        const hasGrade = grades.find(
          (g) => g.assessmentId === assessment.id && g.studentId === user.id,
        );
        return dueDate < today && !hasGrade;
      });

      return {
        totalAssessments: courseAssessments.length,
        gradedAssessments: gradedAssessments.length,
        pendingAssessments:
          courseAssessments.length -
          gradedAssessments.length -
          overdueAssessments.length,
        overdueAssessments: overdueAssessments.length,
        totalWeight: courseAssessments.reduce(
          (sum, a) => sum + (a.percentage || 0),
          0,
        ),
      };
    }

    if (isTeacher) {
      const gradedAssessments = courseAssessments.filter((assessment) => {
        const enrolledCount = course?.enrolledStudents?.length || 0;
        const gradedCount = grades.filter(
          (g) => g.assessmentId === assessment.id,
        ).length;
        return gradedCount === enrolledCount && enrolledCount > 0;
      });

      const overdueAssessments = courseAssessments.filter((assessment) => {
        const dueDate = new Date(assessment.dueDate);
        const today = new Date();
        const enrolledCount = course?.enrolledStudents?.length || 0;
        const gradedCount = grades.filter(
          (g) => g.assessmentId === assessment.id,
        ).length;
        return dueDate < today && gradedCount < enrolledCount;
      });

      return {
        totalAssessments: courseAssessments.length,
        gradedAssessments: gradedAssessments.length,
        pendingAssessments:
          courseAssessments.length -
          gradedAssessments.length -
          overdueAssessments.length,
        overdueAssessments: overdueAssessments.length,
        totalWeight: courseAssessments.reduce(
          (sum, a) => sum + (a.percentage || 0),
          0,
        ),
      };
    }

    return null;
  }, [assessments, id, grades, user?.id, isTeacher, course]);

  const calculateGradeSheetStats = useMemo(() => {
    if (!id) return null;

    const courseSheets = gradeSheets.filter((sheet) => sheet.courseId === id);
    const publishedSheets = courseSheets.filter((sheet) => sheet.isPublished);

    return {
      totalSheets: courseSheets.length,
      publishedSheets: publishedSheets.length,
      gradingPeriods: [
        ...new Set(publishedSheets.map((sheet) => sheet.gradingPeriod)),
      ],
    };
  }, [gradeSheets, id]);

  const formatDateForColombia = (dateInput: Date | string) => {
    let date: Date;

    if (
      typeof dateInput === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(dateInput)
    ) {
      const [year, month, day] = dateInput.split("-").map(Number);
      date = new Date(year, month - 1, day);
    } else {
      date = new Date(dateInput);
    }

    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "America/Bogota",
    });
  };

  const calculateStudentProgress = (
    studentId: string,
    courseId: string,
    grades: Grade[],
    assessments: Assessment[],
  ) => {
    const studentGrades = grades.filter(
      (g) => g.studentId === studentId && g.courseId === courseId,
    );

    if (studentGrades.length === 0) {
      return {
        currentGrade: 0,
        evaluatedPercentage: 0,
        remainingPercentage: 100,
        minGradeToPass: 3.0,
        status: "passing",
      };
    }

    const totalGrade = studentGrades.reduce((sum, g) => sum + g.value, 0);
    const currentGrade = totalGrade / studentGrades.length;

    return {
      currentGrade,
      evaluatedPercentage: Math.min(100, studentGrades.length * 20),
      remainingPercentage: Math.max(0, 100 - studentGrades.length * 20),
      minGradeToPass: Math.max(0, (3.0 - currentGrade) / 0.2),
      status:
        currentGrade >= 3.5
          ? "passing"
          : currentGrade >= 3.0
            ? "at-risk"
            : "failing",
    };
  };

  const getRelativeDate = (dateInput: Date | string) => {
    let dueDate: Date;

    if (
      typeof dateInput === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(dateInput)
    ) {
      const [year, month, day] = dateInput.split("-").map(Number);
      dueDate = new Date(year, month - 1, day);
    } else {
      dueDate = new Date(dateInput);
    }

    const now = new Date();
    const bogotaNow = new Date(
      now.toLocaleString("en-US", { timeZone: "America/Bogota" }),
    );
    const today = new Date(
      bogotaNow.getFullYear(),
      bogotaNow.getMonth(),
      bogotaNow.getDate(),
    );

    const dueDateOnly = new Date(
      dueDate.getFullYear(),
      dueDate.getMonth(),
      dueDate.getDate(),
    );

    const diffTime = dueDateOnly.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 3600 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";
    if (diffDays < 0) return `${Math.abs(diffDays)} days ago`;
    return `in ${diffDays} days`;
  };

  const filteredAvailableStudents = availableStudents.filter(
    (student) =>
      student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.idNumber?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleEnrollStudent = async (studentId: string) => {
    if (!id) return;
    try {
      await enrollmentService.enrollStudentInCourse(id, studentId);
      loadEnrolledStudents();
      loadAvailableStudents();
      setShowEnrollModal(false);
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleUnenrollStudent = async (studentId: string) => {
    if (!id) return;
    if (!confirm("¿Remove student from course?")) return;
    try {
      await enrollmentService.unenrollStudentFromCourse(id, studentId);
      loadEnrolledStudents();
      loadAvailableStudents();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const getAssessmentStatus = (assessment: any, studentId?: string) => {
    const dueDate = new Date(assessment.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (studentId && !isTeacher) {
      const studentGrade = grades.find(
        (g) => g.assessmentId === assessment.id && g.studentId === studentId,
      );

      if (studentGrade?.value != null) {
        return { status: "graded", value: studentGrade.value };
      }

      if (dueDate < today) {
        return { status: "overdue" };
      }

      return { status: "pending" };
    }

    if (isTeacher) {
      const enrolledCount = course?.enrolledStudents?.length || 0;
      const gradedCount = grades.filter(
        (g) => g.assessmentId === assessment.id,
      ).length;

      if (gradedCount === enrolledCount && enrolledCount > 0) {
        return { status: "graded", count: gradedCount };
      }

      if (dueDate < today) {
        return { status: "toGrade", graded: gradedCount, total: enrolledCount };
      }

      return { status: "upcoming" };
    }

    return { status: "pending" };
  };

  if (loading) {
    return (
      <DashboardLayout title="Loading..." subtitle="Please wait">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-2">
            <Loader2Icon className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
            <div className="space-y-2">
              <p className="text-lg font-semibold text-gray-900">Loading your courses</p>
              <p className="text-sm text-gray-600">
                Preparing your personalized academic overview
              </p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (courseCode && !course) {
    return (
      <DashboardLayout title="My Courses" subtitle="All your courses in one place">
        <div className="min-h-[60vh] flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <div className="h-20 w-20 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <BookOpen className="h-10 w-10 text-gray-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Course Not Found
            </h2>
            <p className="text-gray-600 mb-6">
              The course you're looking for doesn't exist or is not accessible.
            </p>
            <Link
              to="/courses"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Courses
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (courseCode && course) {
    const courseAssessments = assessments.filter((a) => a.courseId === id);
    const courseUnits = units.filter((u) => u.courseId === id);

    const studentProgress =
      user && !isTeacher
        ? calculateStudentProgress(user.id, id, grades, courseAssessments)
        : null;

    const courseStats = isTeacher
      ? calculateCourseRealStats(
          id,
          course.enrolledStudents || [],
          grades,
          gradeSheets,
        )
      : null;

    return (
      <DashboardLayout title={`${course.name}`} subtitle={`${course.code} • ${course.semester}`}>
        <div className="space-y-2">
          {/* Header with course info */}
          <div className="bg-gradient-to-br from-white to-gray-50 border border-gray-200 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-start gap-4">
                  <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center flex-shrink-0">
                    <BookMarked className="h-7 w-7 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                      <h1 className="text-2xl font-bold text-gray-900">
                        {course.name}
                      </h1>
                      <div className="flex flex-wrap gap-2">
                        <span className="px-3 py-1.5 bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 text-sm font-semibold rounded-full">
                          {course.code}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 mb-3">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-400" />
                        <span className="font-medium">{course.teacherName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span>{course.semester}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-gray-400" />
                        <span>{course.credits} Credits</span>
                      </div>
                    </div>

                    {course.description && (
                      <p className="text-gray-600 max-w-2xl">
                        {course.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {isTeacher && (
                <div className="flex gap-3">
                  <Link
                    to={`/courses/${course.code}/edit`}
                    className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-all duration-300"
                  >
                    <Edit className="h-4 w-4" />
                    Edit
                  </Link>
                  <div className="relative group">
                    <button className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-medium hover:shadow-lg transition-all duration-300">
                      <MoreVertical className="h-4 w-4" />
                      More
                    </button>
                    
                    <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-2 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                      <Link
                        to={`/courses/${course.code}/grade-sheets`}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full"
                      >
                        <FileText className="h-4 w-4" />
                        Manage Grades
                      </Link>
                      <div className="border-t border-gray-100 my-1"></div>
                      <button
                        onClick={handleDeleteCourseSimple}
                        disabled={isDeleting}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isDeleting ? (
                          <Loader2Icon className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        {isDeleting ? "Deleting..." : "Delete Course"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Stats Cards */}
          {courseStats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Course Average */}
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <BarChart3 className="h-4 w-4 text-blue-500" />
                      <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Average</p>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">
                      {courseStats.studentsWithGrades > 0
                        ? courseStats.averageGrade.toFixed(1)
                        : "--"}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      {courseStats.studentsWithGrades}/{courseStats.totalStudents} students
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                    <BarChart3 className="h-6 w-6 text-blue-500" />
                  </div>
                </div>
              </div>

              {/* Passing */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Passing</p>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{courseStats.passingCount}</p>
                    {courseStats.totalStudents > 0 && (
                      <p className="text-xs text-gray-500 mt-2">
                        {Math.round((courseStats.passingCount / courseStats.totalStudents) * 100)}%
                      </p>
                    )}
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  </div>
                </div>
              </div>

              {/* At Risk */}
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">At Risk</p>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{courseStats.atRiskCount}</p>
                    {courseStats.totalStudents > 0 && (
                      <p className="text-xs text-gray-500 mt-2">
                        {Math.round((courseStats.atRiskCount / courseStats.totalStudents) * 100)}%
                      </p>
                    )}
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center">
                    <AlertTriangle className="h-6 w-6 text-amber-500" />
                  </div>
                </div>
              </div>

              {/* Failing */}
              <div className="bg-gradient-to-br from-red-50 to-pink-50 border border-red-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Failing</p>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{courseStats.failingCount}</p>
                    {courseStats.totalStudents > 0 && (
                      <p className="text-xs text-gray-500 mt-2">
                        {Math.round((courseStats.failingCount / courseStats.totalStudents) * 100)}%
                      </p>
                    )}
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-red-100 to-pink-100 flex items-center justify-center">
                    <AlertCircle className="h-6 w-6 text-red-500" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Course Content */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                    <FolderOpen className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      Course Content
                    </h2>
                    <p className="text-sm text-gray-500">
                      Organized by terms and weeks
                    </p>
                  </div>
                </div>
                {isTeacher ? (
                  <Link
                    to={"/slides"}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
                  >
                    <Plus className="h-4 w-4" />
                    New
                  </Link>
                ) : (
                  <div className="text-xs text-gray-500">
                    {courseUnits.length} Term{courseUnits.length !== 1 ? "s" : ""} available
                  </div>
                )}
              </div>

              {courseUnits.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                    <FolderOpen className="h-8 w-8 text-gray-400" />
                  </div>
                  <p className="text-gray-900 font-semibold text-lg mb-2">
                    No content available yet
                  </p>
                  <p className="text-sm text-gray-600 max-w-md mx-auto">
                    {isTeacher
                      ? "Create your first unit to organize your course materials"
                      : "The teacher will upload content soon"}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {courseUnits.map((unit) => {
                    const getTermName = (order: number) => {
                      switch (order) {
                        case 1:
                          return "First Term";
                        case 2:
                          return "Second Term";
                        case 3:
                          return "Third Term";
                        case 4:
                          return "Fourth Term";
                        default:
                          return `Term ${order}`;
                      }
                    };

                    const termName = getTermName(unit.order);
                    const totalSlides = unit.weeks.reduce(
                      (total, week) => total + week.slides.length,
                      0,
                    );

                    return (
                      <div
                        key={unit.id}
                        className="rounded-xl p-2 hover:border-blue-200 transition-all duration-300"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="text-lg font-bold text-gray-900">
                                {termName}
                              </h3>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 mt-2 sm:mt-0">
                            <div className="text-sm text-gray-600">
                              <span className="font-semibold">
                                {unit.weeks.length}
                              </span>{" "}
                              week{unit.weeks.length !== 1 ? "s" : ""}
                            </div>
                            <div className="text-sm text-gray-600">
                              <span className="font-semibold">{totalSlides}</span>{" "}
                              slide{totalSlides !== 1 ? "s" : ""}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {unit.weeks.map((week) => (
                            <div
                              key={week.id}
                              className="border border-gray-200 rounded-lg p-4 hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-cyan-50/50 transition-all duration-300"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-1">
                                <div className="flex items-center gap-3">
                                  <div>
                                    <h4 className="font-semibold text-gray-900">
                                      {week.topic}
                                    </h4>
                                    {week.slides.length > 0 && (
                                      <p className="text-xs text-gray-500 mt-1">
                                        {week.slides.length} slide{week.slides.length !== 1 ? "s" : ""}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                {week.slides.length === 0 && isTeacher && (
                                  <Link
                                    to={`/slides/create?week=${week.id}`}
                                    className="mt-2 sm:mt-0 text-xs text-blue-600 hover:text-blue-800 font-medium"
                                  >
                                    Add
                                  </Link>
                                )}
                              </div>

                              {week.slides.length === 0 && !isTeacher && (
                                <div className="text-center py-3">
                                  <p className="text-sm text-gray-500">
                                    No slides available for this week
                                  </p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  <Link
                    to={`/courses/${course.code}/assessments`}
                    className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 hover:gap-3 transition-all duration-300"
                  >
                    View all activities
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </div>

            {/* Course Documents */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                    <File className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      Course Documents
                    </h2>
                    <p className="text-sm text-gray-500">
                      PDFs, guides, and study materials
                    </p>
                  </div>
                </div>
                {isTeacher && (
                  <Link
                    to={`/courses/${course.code}/files`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
                  >
                    <Plus className="h-4 w-4" />
                    Add 
                  </Link>
                )}
              </div>

              <div className="space-y-2">
                {sampleFiles
                  .map((file) => ({
                    ...file,
                    courseId: id,
                  }))
                  .filter((file) => file.courseId === id)
                  .slice(0, 3)
                  .map((file) => {
                    const formatFileSize = (bytes: number) => {
                      if (bytes === 0) return "0 Bytes";
                      const k = 1024;
                      const sizes = ["Bytes", "KB", "MB", "GB"];
                      const i = Math.floor(Math.log(bytes) / Math.log(k));
                      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
                    };

                    const formatDate = (date: Date) => {
                      return date.toLocaleDateString("en-US", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      });
                    };

                    const getFileIcon = (type: string) => {
                      if (type.includes("pdf")) return "📄";
                      if (type.includes("word")) return "📝";
                      if (type.includes("excel")) return "📊";
                      if (type.includes("image")) return "🖼️";
                      return "📎";
                    };

                    return (
                      <div
                        key={file.id}
                        className="flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all duration-300 group cursor-pointer"
                        onClick={() => window.open(file.url, "_blank")}
                      >
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-100 to-gray-200 flex items-center justify-center">
                            <span className="text-xl">
                              {getFileIcon(file.type)}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors ">
                                {file.name}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                              <span>{formatFileSize(file.size)}</span>
                              <span>•</span>
                              <span>Uploaded {formatDate(file.uploadedAt)}</span>
                              <span>•</span>
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                <span>{file.uploadedBy}</span>
                              </div>
                            </div>
                            {file.description && (
                              <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                                {file.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(file.url, "_blank");
                          }}
                          className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Open document"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
              </div>

              {sampleFiles.filter((file) => id && file.courseId === id).length === 0 && (
                <div className="text-center py-8 border border-gray-200 rounded-xl">
                  <FolderOpen className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-900 font-semibold mb-2">No documents available yet</p>
                  <p className="text-sm text-gray-600 max-w-md mx-auto">
                    {isTeacher
                      ? "Upload your first document to share with students"
                      : "Documents will appear here when available"}
                  </p>
                </div>
              )}

              {sampleFiles.filter((file) => id && file.courseId === id).length > 0 && (
                <Link
                  to={`/courses/${course.code}/files`}
                  className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-purple-600 hover:text-purple-700 hover:gap-3 transition-all duration-300"
                >
                  View all{" "}
                  {sampleFiles.filter((file) => id && file.courseId === id).length}{" "}
                  documents
                  <ChevronRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>

          {/* Upcoming Activities & Stats Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Upcoming Activities */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                    <CalendarDays className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      Upcoming Activities
                    </h2>
                    <p className="text-sm text-gray-500">
                      Due within the next 7 days
                    </p>
                  </div>
                </div>
                <Zap className="h-5 w-5 text-blue-400 hidden md:block" />
              </div>

              {calculateUpcomingActivities.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
                    <CheckCircle className="h-8 w-8 text-blue-400" />
                  </div>
                  <p className="text-gray-900 font-semibold text-lg mb-2">
                    No upcoming activities
                  </p>
                  <p className="text-sm text-gray-600 max-w-md mx-auto">
                    Great! You're all caught up. Check back later for new assignments.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {calculateUpcomingActivities.map((activity) => {
                      let dueDate: Date;
                      const dueDateString = String(activity.dueDate);

                      if (/^\d{4}-\d{2}-\d{2}$/.test(dueDateString)) {
                        const [year, month, day] = dueDateString.split("-").map(Number);
                        dueDate = new Date(year, month - 1, day);
                      } else {
                        dueDate = new Date(dueDateString);
                      }

                      const relativeDate = getRelativeDate(dueDate);
                      const today = new Date();
                      const todayBogota = new Date(
                        today.toLocaleString("en-US", { timeZone: "America/Bogota" }),
                      );
                      const todayDateOnly = new Date(
                        todayBogota.getFullYear(),
                        todayBogota.getMonth(),
                        todayBogota.getDate(),
                      );
                      const dueDateOnly = new Date(
                        dueDate.getFullYear(),
                        dueDate.getMonth(),
                        dueDate.getDate(),
                      );
                      const diffDays = Math.round(
                        (dueDateOnly.getTime() - todayDateOnly.getTime()) / (1000 * 3600 * 24),
                      );

                      return (
                        <div
                          key={activity.id}
                          className="border-l-4 border-gray-400 pl-4 py-3 hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-cyan-50/50 rounded-r-xl transition-all duration-300"
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-semibold text-gray-900 text-sm">
                              {activity.name}
                            </p>
                            <span
                              className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                                diffDays === 0
                                  ? "bg-gradient-to-br from-red-100 to-red-50 text-red-700 border border-red-200"
                                  : diffDays <= 2
                                    ? "bg-gradient-to-br from-amber-100 to-amber-50 text-amber-700 border border-amber-200"
                                    : "bg-gradient-to-br from-blue-100 to-cyan-50 text-blue-700 border border-blue-200"
                              }`}
                            >
                              {diffDays === 0
                                ? "🎯 today"
                                : diffDays <= 2
                                  ? "⏰ soon"
                                  : relativeDate}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 line-clamp-1">
                            {activity.description || "No description provided"}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <Link
                    to={`/courses/${course.code}/assessments`}
                    className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 hover:gap-3 transition-all duration-300"
                  >
                    View all activities
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </>
              )}
            </div>

            {/* Assessment Stats */}
            {calculateAssessmentStats && (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center">
                      <FileBarChart className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">
                        Assessment Stats
                      </h2>
                      <p className="text-sm text-gray-500">
                        Course evaluation overview
                      </p>
                    </div>
                  </div>
                  <TrendingUp className="h-5 w-5 text-green-400 hidden md:block" />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center">
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Graded</p>
                      </div>
                    </div>
                    <p className="text-xl font-bold text-gray-900 text-right">
                      {calculateAssessmentStats.gradedAssessments}
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
                        <Clock className="h-5 w-5 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Pending</p>
                      </div>
                    </div>
                    <p className="text-xl font-bold text-gray-900 text-right">
                      {calculateAssessmentStats.pendingAssessments}
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center">
                        <AlertCircle className="h-5 w-5 text-amber-500" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Overdue</p>
                      </div>
                    </div>
                    <p className="text-xl font-bold text-gray-900 text-right">
                      {calculateAssessmentStats.overdueAssessments}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Total Assessments</span>
                      <p className="text-xl font-bold text-gray-900 text-right">
                        {calculateAssessmentStats.totalAssessments}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Grade Sheets Stats */}
            {calculateGradeSheetStats && calculateGradeSheetStats.totalSheets > 0 && (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-purple-500" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">
                        Grade Sheets
                      </h2>
                      <p className="text-sm text-gray-500">
                        Published evaluations
                      </p>
                    </div>
                  </div>
                  <Trophy className="h-5 w-5 text-purple-400 hidden md:block" />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-50 to-pink-50 flex items-center justify-center">
                        <CheckCircle className="h-5 w-5 text-purple-500" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Published</p>
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 text-right">
                      {calculateGradeSheetStats.publishedSheets}
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
                        <FileText className="h-5 w-5 text-gray-500" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Total Sheets</p>
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 text-right">
                      {calculateGradeSheetStats.totalSheets}
                    </p>
                  </div>

                  {calculateGradeSheetStats.gradingPeriods.length > 0 && (
                    <div className="pt-4 border-t border-gray-200">
                      <p className="text-sm text-gray-600 mb-3 text-center">Grading Periods</p>
                      <span className="text-right">
                        {calculateGradeSheetStats.gradingPeriods.map((period) => (
                          <span
                            key={period}
                            className="px-3 py-1.5 bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 text-sm font-semibold rounded-full"
                          >
                            {period.replace("quarter", "Q")}
                          </span>
                        ))}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* My Grades Section - Solo para estudiantes */}
          {!isTeacher && user && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                    <Trophy className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">My Grades</h2>
                    <p className="text-sm text-gray-500">Performance in this course</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {gradeSheets
                  .filter((sheet) => sheet.courseId === id && sheet.isPublished)
                  .sort((a, b) => {
                    const getDateSafe = (sheet: any) => {
                      if (!sheet.updatedAt) return 0;
                      try {
                        if (sheet.updatedAt.toDate) {
                          return sheet.updatedAt.toDate().getTime();
                        }
                        if (typeof sheet.updatedAt === 'string') {
                          return new Date(sheet.updatedAt).getTime();
                        }
                        if (sheet.updatedAt instanceof Date) {
                          return sheet.updatedAt.getTime();
                        }
                        return 0;
                      } catch {
                        return 0;
                      }
                    };

                    const dateA = getDateSafe(a);
                    const dateB = getDateSafe(b);
                    return dateB - dateA;
                  })
                  .slice(0, 3)
                  .map((sheet) => {
                    const studentData = sheet.students?.find(
                      (s: any) => s.studentId === user.id,
                    );
                    const grade = studentData?.total || 0;
                    const isExcellent = grade >= 4.0;
                    const isGood = grade >= 3.0 && grade < 4.0;
                    const isPassing = grade >= 3.0;

                    const formatDateSafe = (dateInput: any) => {
                      if (!dateInput) return 'No date';
                      
                      try {
                        let date: Date;
                        
                        if (dateInput.toDate) {
                          date = dateInput.toDate();
                        }
                        else if (typeof dateInput === 'string') {
                          date = new Date(dateInput);
                        }
                        else if (dateInput instanceof Date) {
                          date = dateInput;
                        }
                        else if (typeof dateInput === 'number') {
                          date = new Date(dateInput);
                        }
                        else {
                          return 'Invalid date';
                        }

                        if (isNaN(date.getTime())) {
                          return 'Invalid date';
                        }

                        return date.toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        });
                      } catch (error) {
                        console.error('Error formatting date:', error);
                        return 'Invalid date';
                      }
                    };

                    return (
                      <div
                        key={sheet.id}
                        className="border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all duration-300"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div>
                              <h3 className="font-semibold text-gray-900">
                                {sheet.title}
                              </h3>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs font-semibold px-2 py-1 bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 rounded-full">
                                  {sheet.gradingPeriod || 'No period'}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {formatDateSafe(sheet.updatedAt)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`text-2xl font-bold ${
                              isExcellent ? "text-green-600" :
                              isGood ? "text-blue-600" : 
                              isPassing ? "text-gray-600" : "text-gray-700"
                            }`}>
                              {grade > 0 ? grade.toFixed(1) : '--'}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                {gradeSheets.filter((sheet) => sheet.courseId === id && sheet.isPublished).length === 0 && (
                  <div className="text-center py-8 px-4 border-2 border-dashed border-gray-200 rounded-xl">
                    <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                      <FileText className="h-8 w-8 text-gray-400" />
                    </div>
                    <p className="text-gray-900 font-semibold text-lg mb-2">
                      No grades available yet
                    </p>
                    <p className="text-sm text-gray-600 max-w-md mx-auto">
                      Your grades will appear here once the teacher publishes evaluations
                    </p>
                  </div>
                )}
              </div>

              {gradeSheets.filter((sheet) => sheet.courseId === id && sheet.isPublished).length > 3 && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <Link
                    to={`/grades?course=${id}`}
                    className="flex items-center justify-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 hover:gap-3 transition-all duration-300"
                  >
                    View all {gradeSheets.filter((sheet) => sheet.courseId === id && sheet.isPublished).length} grade sheets
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Students Section (Teacher only) */}
          {isTeacher && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                    <Users className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      Students
                    </h2>
                    <p className="text-sm text-gray-500">
                      {enrolledStudents.length} enrolled • {availableStudents.length} available
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowEnrollModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
                >
                  <UserPlus className="h-4 w-4" />
                  Add
                </button>
              </div>

              {loadingStudents ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : enrolledStudents.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
                  <Users className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    There are no enrolled students
                  </h3>
                  <p className="text-gray-600 mb-4 max-w-md mx-auto">
                    Add students to this course to get started with your classes
                  </p>
                  <button
                    onClick={() => setShowEnrollModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
                  >
                    <UserPlus className="h-4 w-4" />
                    Add First Student
                  </button>
                </div>
              ) : (
                <div>
                  <div className="flex flex-col sm:flex-row gap-3 mb-6">
                    <div className="flex-1">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search students by name, email or ID..."
                          className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                        className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-all duration-300"
                      >
                        <SortAsc className={`h-4 w-4 ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
                        {sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
                      </button>
                      <div className="relative group">
                        <button className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-all duration-300">
                          <Filter className="h-4 w-4" />
                          Filter
                        </button>
                        <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-2 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                          <button
                            onClick={() => setGradeFilter('all')}
                            className={`flex items-center gap-2 px-4 py-2 text-sm w-full ${
                              gradeFilter === 'all' 
                                ? 'bg-blue-50 text-blue-600 font-medium' 
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <Users className="h-4 w-4" />
                            All Students
                          </button>
                          <button
                            onClick={() => setGradeFilter('passing')}
                            className={`flex items-center gap-2 px-4 py-2 text-sm w-full ${
                              gradeFilter === 'passing' 
                                ? 'bg-green-50 text-green-600 font-medium' 
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Passing (≥3.5)
                          </button>
                          <button
                            onClick={() => setGradeFilter('at-risk')}
                            className={`flex items-center gap-2 px-4 py-2 text-sm w-full ${
                              gradeFilter === 'at-risk' 
                                ? 'bg-amber-50 text-amber-600 font-medium' 
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <AlertTriangle className="h-4 w-4" />
                            At Risk (3.0-3.4)
                          </button>
                       <button
  onClick={() => setGradeFilter('failing')}
  className={`flex items-center gap-2 px-4 py-2 text-sm w-full ${
    gradeFilter === 'failing' 
      ? 'bg-red-50 text-red-600 font-medium' 
      : 'text-gray-700 hover:bg-gray-50'
  }`}
>
  <AlertCircle className="h-4 w-4" />
  Failing (&lt;3.0)
</button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredStudents.length === 0 ? (
                      <div className="col-span-full text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
                        <Search className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">
                          No students found
                        </h3>
                        <p className="text-gray-600 max-w-md mx-auto">
                          Try adjusting your search or filter criteria
                        </p>
                      </div>
                    ) : (
                      filteredStudents.map((student) => {
                        const studentGradeSheets = gradeSheets.filter(
                          (sheet) => sheet.courseId === id && sheet.isPublished,
                        );

                        let studentAverage = 0;
                        let hasGrades = false;
                        const studentTotals: number[] = [];

                        studentGradeSheets.forEach((sheet) => {
                          const studentInSheet = sheet.students?.find(
                            (s: any) => s.studentId === student.id,
                          );
                          if (studentInSheet?.total !== undefined && studentInSheet.total !== null) {
                            studentTotals.push(studentInSheet.total);
                            hasGrades = true;
                          }
                        });

                        if (hasGrades && studentTotals.length > 0) {
                          studentAverage =
                            studentTotals.reduce((sum, total) => sum + total, 0) /
                            studentTotals.length;
                        }

                        const avgGrade = hasGrades ? studentAverage : 0;
                        const gradeStatus = avgGrade >= 3.5 ? 'passing' : 
                                          avgGrade >= 3.0 ? 'at-risk' : 
                                          avgGrade > 0 ? 'failing' : 'no-grades';

                        return (
                          <div
                            key={student.id}
                            className="border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-md transition-all duration-300"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                                  <span className="font-bold text-blue-700 text-lg">
                                    {student.name.charAt(0)}
                                  </span>
                                </div>
                                <div>
                                  <h3 className="font-semibold text-gray-900 truncate max-w-[120px]">
                                    {student.name}
                                  </h3>
                                  <p className="text-xs text-gray-500 truncate max-w-[120px]">
                                    {student.email}
                                  </p>
                                  {student.idNumber && (
                                    <p className="text-xs text-gray-400 mt-1">
                                      ID: {student.idNumber}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => handleUnenrollStudent(student.id)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Remove student"
                              >
                                <UserMinus className="h-4 w-4" />
                              </button>
                            </div>

                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-600">
                                  Average grade:
                                </span>
                                {hasGrades ? (
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`text-sm font-semibold ${
                                        gradeStatus === 'passing'
                                          ? "text-green-600"
                                          : gradeStatus === 'at-risk'
                                            ? "text-amber-600"
                                            : "text-red-600"
                                      }`}
                                    >
                                      {avgGrade.toFixed(1)}
                                    </span>
                                    {gradeStatus === 'passing' && (
                                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    )}
                                    {gradeStatus === 'at-risk' && (
                                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                                    )}
                                    {gradeStatus === 'failing' && (
                                      <AlertCircle className="h-4 w-4 text-red-500" />
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-sm text-gray-500">
                                    No grades
                                  </span>
                                )}
                              </div>
                              
                              {hasGrades && (
                                <div className="flex items-center justify-between text-xs text-gray-500">
                                  <span>Status:</span>
                                  <span className={`font-medium px-2 py-1 rounded-full ${
                                    gradeStatus === 'passing'
                                      ? "bg-green-100 text-green-700"
                                      : gradeStatus === 'at-risk'
                                        ? "bg-amber-100 text-amber-700"
                                        : "bg-red-100 text-red-700"
                                  }`}>
                                    {gradeStatus === 'passing' ? 'Passing' : 
                                     gradeStatus === 'at-risk' ? 'At Risk' : 'Failing'}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {filteredStudents.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="flex items-center justify-between text-sm text-gray-600">
                        <span>
                          Showing {filteredStudents.length} of {enrolledStudents.length} students
                        </span>
                        {searchTerm && (
                          <button
                            onClick={() => {
                              setSearchTerm('');
                              setGradeFilter('all');
                            }}
                            className="text-blue-600 hover:text-blue-700 font-medium"
                          >
                            Clear filters
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Enroll Modal */}
          {showEnrollModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[70vh] overflow-hidden flex flex-col border border-gray-200">
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                      <UserPlus className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-gray-900">
                        Add Students
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {course?.name}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowEnrollModal(false);
                      setAvailableStudents([]);
                      setSearchTerm("");
                    }}
                    className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="p-6 border-b border-gray-200">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search students..."
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  {loadingAvailable ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2Icon className="h-6 w-6 animate-spin text-blue-500" />
                    </div>
                  ) : filteredAvailableStudents.length === 0 ? (
                    <div className="text-center py-8">
                      <Users className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                      <p className="text-gray-600 font-medium">
                        {availableStudents.length === 0
                          ? "All students are already enrolled"
                          : "No results found"}
                      </p>
                      {availableStudents.length > 0 && (
                        <p className="text-sm text-gray-500 mt-2">
                          Try different search terms
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {filteredAvailableStudents.map((student) => (
                        <div
                          key={student.id}
                          className="flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-cyan-50/50 hover:border-blue-200 transition-all duration-300"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                              <span className="font-medium text-blue-700 text-sm">
                                {student.name.charAt(0)}
                              </span>
                            </div>
                            <div>
                              <p className="font-semibold text-sm text-gray-900">
                                {student.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {student.email}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleEnrollStudent(student.id)}
                            className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-medium rounded-lg hover:shadow-lg transition-all duration-300"
                          >
                            Add
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // Courses List View
  const userCourses = isTeacher
    ? courses.filter((c) => c.teacherId === user?.id)
    : courses.filter((c) => user && c.enrolledStudents?.includes(user.id));

  return (
    <DashboardLayout title="My Courses" subtitle="All your courses in one place">
      <div className="space-y-2">
      <div  className=" text-right">
          {isTeacher && (
          <Link
            to="/courses/create"
            className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium "
          >
            <Plus className="h-4 w-4" />
            New Course
          </Link>
        )}
      </div>

        {userCourses.length === 0 ? (
          <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-2xl p-8 sm:p-12 text-center shadow-sm">
            <div className="h-20 w-20 sm:h-24 sm:w-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
              <BookOpen className="h-10 w-10 sm:h-12 sm:w-12 text-blue-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {isTeacher ? "Start your first course" : "No enrolled courses"}
            </h3>
            <p className="text-gray-600 max-w-md mx-auto mb-8">
              {isTeacher
                ? "Create your first course to manage students, content and assessments."
                : "You have no courses assigned for this semester."}
            </p>
            {isTeacher && (
              <Link
                to="/courses/create"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
              >
                <Plus className="h-5 w-5" />
                Create First Course
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {userCourses.map((course) => {
              const courseAssessments = assessments.filter(
                (a) => a.courseId === course.id,
              );
              const progress =
                !isTeacher && user
                  ? calculateStudentProgress(
                      user.id,
                      course.id,
                      grades,
                      courseAssessments,
                    )
                  : null;
              const enrolledCount = course.enrolledStudents?.length || 0;

              const realGrade = user
                ? calculateRealCourseGrade(course.id, user.id)
                : null;
              const displayGrade =
                realGrade !== null ? realGrade : progress?.currentGrade || 0;

              return (
                <Link
                  key={course.id}
                  to={`/courses/view/${course.code}`}
                  className="group block"
                >
                  <div className="bg-white border border-gray-200 rounded-2xl p-6 hover:border-blue-300 hover:shadow-lg transition-all duration-300 h-full">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center flex-shrink-0">
                        <BookMarked className="h-6 w-6 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="text-xs font-bold px-3 py-1.5 bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 rounded-full">
                            {course.code}
                          </span>
                          {!isTeacher && displayGrade > 0 && (
                            <span
                              className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                                displayGrade >= 3.5
                                  ? "bg-gradient-to-r from-green-100 to-emerald-100 text-green-700"
                                  : displayGrade >= 2.5
                                    ? "bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700"
                                    : "bg-gradient-to-r from-red-100 to-pink-100 text-red-700"
                              }`}
                            >
                              {displayGrade.toFixed(1)}
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                          {course.name}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                          {course.description || "No description"}
                        </p>
                        <p className="text-xs font-semibold text-gray-700 mt-2">
                          {course.teacherName}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-6 pt-4 border-t border-gray-200">
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-2 sm:mb-0">
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4 text-gray-500" />
                          <span>{enrolledCount} Students</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4 text-gray-500" />
                          <span>{course.semester}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <CreditCard className="h-4 w-4 text-gray-500" />
                          <span>{course.credits} Credits</span>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}