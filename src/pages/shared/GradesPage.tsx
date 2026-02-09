// src/pages/GradesPage.tsx - VERSIÓN MODERNA CON PALETA JUVENIL
import { useState, useEffect, useMemo , useCallback} from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademic } from "@/contexts/AcademicContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  GraduationCap,
  ChevronDown,
  FileSpreadsheet,
  Users,
  AlertCircle,
  Filter,
  Search,
  Download,
  User,
  Eye,
  EyeOff,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  SortAsc,
  SortDesc,
  Percent,
  Loader2,
  TrendingUp,
  AlertTriangle,
  ChevronRight,
  BookOpen,
  Target,
  Award,
  Sparkles,
  Zap,
  Trophy,
  Star,
  TrendingDown,
  FileText,
  Bell,
  ExternalLink,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore";
import { firebaseDB } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import * as XLSX from "xlsx";

// Interfaces
interface GradeSheetActivity {
  id: string;
  name: string;
  maxScore: number;
  type: string;
}

interface StudentGrade {
  studentId: string;
  name: string;
  grades: Record<
    string,
    {
      value?: number;
      comment?: string;
      submittedAt?: any;
    }
  >;
  total?: number;
  status: string;
}

interface GradeSheet {
  id: string;
  title: string;
  courseId?: string;
  courseCode?: string;
  courseName: string;
  teacherId: string;
  teacherName: string;
  gradingPeriod: string;
  activities: GradeSheetActivity[];
  students: StudentGrade[];
  createdAt: any;
  updatedAt: any;
  isPublished: boolean;
  weightPercentage: number;
}

interface StudentWithGrades {
  id: string;
  name: string;
  systemProgress: {
    currentGrade: number;
    status: "passing" | "at-risk" | "failing";
  };
  completedAssessments: number;
  totalAssessments: number;
}

const firestoreTimestampToDate = (timestamp: any): Date => {
  if (!timestamp) return new Date();
  if (timestamp instanceof Date) return timestamp;
  if (timestamp.toDate && typeof timestamp.toDate === "function") {
    return timestamp.toDate();
  }
  if (typeof timestamp === "number") return new Date(timestamp);
  if (typeof timestamp === "string") return new Date(timestamp);
  return new Date();
};

export default function GradesPage() {
  const { user } = useAuth();
  const { courses } = useAcademic();
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [gradeSheets, setGradeSheets] = useState<GradeSheet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [courseStudents, setCourseStudents] = useState<Record<string, string>>(
    {},
  );
  const [showFilter, setShowFilter] = useState(false);
  const [filterByStatus, setFilterByStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "grade" | "status">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [initialLoad, setInitialLoad] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const isTeacher = user?.role === "docente";

  const userCourses = useMemo(() => {
    if (!user) return [];
    return isTeacher
      ? courses.filter((c) => c.teacherId === user.id)
      : courses.filter((c) => c.enrolledStudents.includes(user.id));
  }, [courses, user, isTeacher]);

  const selectedCourse = useMemo(
    () => userCourses.find((c) => c.id === selectedCourseId),
    [userCourses, selectedCourseId],
  );

  // Obtener último curso seleccionado
  const getLastSelectedCourse = (): string | null => {
    if (typeof window !== "undefined" && user?.id) {
      return localStorage.getItem(`lastSelectedCourse_${user.id}`);
    }
    return null;
  };

  // Guardar último curso seleccionado
  const saveLastSelectedCourse = (courseId: string) => {
    if (typeof window !== "undefined" && user?.id) {
      localStorage.setItem(`lastSelectedCourse_${user.id}`, courseId);
    }
  };

  // Seleccionar curso automáticamente
  useEffect(() => {
    if (initialLoad && userCourses.length > 0 && !selectedCourseId) {
      const lastCourseId = getLastSelectedCourse();
      const lastCourse = userCourses.find(
        (course) => course.id === lastCourseId,
      );

      if (lastCourse) {
        setSelectedCourseId(lastCourse.id);
      } else {
        const sortedCourses = [...userCourses].sort((a, b) =>
          a.name.localeCompare(b.name),
        );

        if (sortedCourses.length > 0) {
          setSelectedCourseId(sortedCourses[0].id);
          saveLastSelectedCourse(sortedCourses[0].id);
        }
      }

      setInitialLoad(false);
    }
  }, [userCourses, selectedCourseId, initialLoad, user?.id]);

  const fetchStudentNames = async (studentIds: string[]) => {
    try {
      const uniqueIds = [...new Set(studentIds)];
      const studentsRef = collection(firebaseDB, "estudiantes");

      const studentDocs = await Promise.all(
        uniqueIds.map((id) => getDoc(doc(studentsRef, id))),
      );

      const studentNames: Record<string, string> = {};
      studentDocs.forEach((docSnapshot, index) => {
        const studentId = uniqueIds[index];
        if (docSnapshot?.exists()) {
          const data = docSnapshot.data();
          studentNames[studentId] =
            data.name || `Student ${studentId.slice(-1)}`;
        } else {
          studentNames[studentId] = `Student ${studentId.slice(-1)}`;
        }
      });

      return studentNames;
    } catch {
      return {};
    }
  };

  // Cargar hojas de calificación
  useEffect(() => {
    const fetchGradeSheets = async () => {
      if (!selectedCourseId || !user) {
        setGradeSheets([]);
        return;
      }

      setIsLoading(true);

      try {
        const gradeSheetsRef = collection(firebaseDB, "gradeSheets");
        const querySnapshot = await getDocs(gradeSheetsRef);

        const sheets: GradeSheet[] = [];
        const studentIdsToFetch = new Set<string>();

        querySnapshot.forEach((doc) => {
          const data = doc.data();

          if (data.courseId === selectedCourseId) {
            if (!isTeacher && !data.isPublished) return;

            const activities: GradeSheetActivity[] = (
              data.activities || []
            ).map((act: any, index: number) => ({
              id: act.id || `activity_${doc.id}_${index}`,
              name: act.name || "Activity",
              maxScore: Math.max(1, Math.min(5.0, act.maxScore || 5.0)),
              type: act.type || "quiz",
            }));

            const students: StudentGrade[] = [];
            const rawStudents = data.students || [];

            rawStudents.forEach((student: any) => {
              if (!isTeacher && student.studentId !== user.id) return;

              if (isTeacher) studentIdsToFetch.add(student.studentId);

              const grades: Record<string, any> = {};
              if (student.grades) {
                Object.entries(student.grades).forEach(
                  ([key, gradeData]: [string, any]) => {
                    grades[key] = {
                      value: gradeData.value,
                      comment: gradeData.comment,
                      submittedAt: gradeData.submittedAt || null,
                    };
                  },
                );
              }

              students.push({
                studentId: student.studentId || "",
                name:
                  student.name ||
                  `Student ${student.studentId?.slice(-1) || "Unknown"}`,
                grades,
                total: Math.max(0, Math.min(5.0, student.total || 0)),
                status: student.status || "pending",
              });
            });

            if (students.length > 0) {
              sheets.push({
                id: doc.id,
                title: data.title || "Grade sheet",
                courseId: data.courseId,
                courseCode: data.courseCode || selectedCourse?.code || "",
                courseName: data.courseName || "Course",
                teacherId: data.teacherId || "",
                teacherName: data.teacherName || "",
                gradingPeriod: data.gradingPeriod || "First Term",
                activities,
                students,
                createdAt: data.createdAt,
                updatedAt: data.updatedAt,
                isPublished: data.isPublished || false,
                weightPercentage: data.weightPercentage || 0,
              });
            }
          }
        });

        sheets.sort((a, b) => {
          const dateA = firestoreTimestampToDate(a.updatedAt).getTime();
          const dateB = firestoreTimestampToDate(b.updatedAt).getTime();
          return dateB - dateA;
        });

        if (isTeacher && studentIdsToFetch.size > 0) {
          const studentNames = await fetchStudentNames(
            Array.from(studentIdsToFetch),
          );

          setCourseStudents(studentNames);

          sheets.forEach((sheet) => {
            sheet.students.forEach((student) => {
              if (studentNames[student.studentId]) {
                student.name = studentNames[student.studentId];
              }
            });
          });
        }

        setGradeSheets(sheets);
      } catch {
        // Error silencioso
      } finally {
        setIsLoading(false);
      }
    };

    fetchGradeSheets();
  }, [selectedCourseId, user, isTeacher]);

  const filterStudents = useCallback(
    (studentsList: StudentWithGrades[]) => {
      return studentsList.filter((student) => {
        const matchesSearch = student.name
          .toLowerCase()
          .includes(searchTerm.toLowerCase());
        const matchesType =
          filterByStatus === "all" ||
          student.systemProgress.status === filterByStatus;
        return matchesSearch && matchesType;
      });
    },
    [searchTerm, filterByStatus],
  );

  const formatGradingPeriod = (period: string): string => {
    const periodMap: Record<string, string> = {
      "first term": "First Term",
      "1st term": "First Term",
      quarter1: "First Term",
      q1: "First Term",
      "second term": "Second Term",
      "2nd term": "Second Term",
      quarter2: "Second Term",
      q2: "Second Term",
      final: "Final",
      quarter3: "Final",
      q3: "Final",
    };

    return (
      periodMap[period.toLowerCase()] ||
      period
        .split(" ")
        .map(
          (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
        )
        .join(" ")
    );
  };

  const formatGrade = (grade: number): string => {
    return grade.toFixed(1);
  };

  const validateWeightPercentages = (): { isValid: boolean; total: number } => {
    const total = gradeSheets.reduce((sum, sheet) => {
      const weight = Number(sheet.weightPercentage) || 0;
      return sum + weight;
    }, 0);

    const numericTotal = Number(total);

    return {
      isValid: Math.abs(numericTotal - 100) < 0.01,
      total: isNaN(numericTotal) ? 0 : parseFloat(numericTotal.toFixed(1)),
    };
  };

  const weightValidation =
    gradeSheets.length > 0
      ? validateWeightPercentages()
      : { isValid: false, total: 0 };

  // Datos del estudiante
  const studentData = useMemo(() => {
    if (!user || isTeacher || !selectedCourseId || gradeSheets.length === 0)
      return null;

    const publishedSheets = gradeSheets.filter((sheet) => sheet.isPublished);
    if (publishedSheets.length === 0) return null;

    const studentSheets = publishedSheets.filter((sheet) =>
      sheet.students.some((s) => s.studentId === user.id),
    );

    if (studentSheets.length === 0) return null;

    const totalWeightPercentage = publishedSheets.reduce(
      (total, sheet) => total + (Number(sheet.weightPercentage) || 0),
      0,
    );

    let finalGrade = 0;
    let totalWeight = 0;

    if (totalWeightPercentage > 0) {
      let weightedSum = 0;

      studentSheets.forEach((sheet) => {
        const studentData = sheet.students.find((s) => s.studentId === user.id);
        if (!studentData) return;

        const sheetWeight = Number(sheet.weightPercentage) || 0;

        let sheetTotal = 0;
        let activityCount = 0;

        sheet.activities.forEach((activity) => {
          const grade = studentData.grades[activity.id];
          if (grade?.value !== undefined) {
            sheetTotal += grade.value;
            activityCount++;
          }
        });

        const sheetAverage = activityCount > 0 ? sheetTotal / activityCount : 0;

        if (sheetWeight > 0 && sheetAverage > 0) {
          weightedSum += sheetAverage * (sheetWeight / 100);
          totalWeight += sheetWeight / 100;
        }
      });

      finalGrade = totalWeight > 0 ? weightedSum / totalWeight : 0;
    } else {
      let totalGrade = 0;
      let totalGradesCount = 0;

      studentSheets.forEach((sheet) => {
        const studentData = sheet.students.find((s) => s.studentId === user.id);
        if (!studentData) return;

        sheet.activities.forEach((activity) => {
          const grade = studentData.grades[activity.id];
          if (grade?.value !== undefined) {
            totalGrade += grade.value;
            totalGradesCount++;
          }
        });
      });

      finalGrade = totalGradesCount > 0 ? totalGrade / totalGradesCount : 0;
    }

    const roundedCurrentGrade = parseFloat(finalGrade.toFixed(1));
    const evaluatedPercentage = totalWeight * 100;
    const remainingPercentage = Math.max(0, 100 - evaluatedPercentage);

    let status: "passing" | "at-risk" | "failing";
    if (roundedCurrentGrade >= 3.0) {
      status = "passing";
    } else if (roundedCurrentGrade >= 2.0) {
      status = "at-risk";
    } else {
      status = "failing";
    }

    return {
      studentId: user.id,
      courseId: selectedCourseId,
      currentGrade: roundedCurrentGrade,
      evaluatedPercentage: parseFloat(evaluatedPercentage.toFixed(1)),
      remainingPercentage: parseFloat(remainingPercentage.toFixed(1)),
      minGradeToPass: roundedCurrentGrade >= 3.0 ? 0 : 3.0,
      status,
      totalWeightPercentage: parseFloat(totalWeightPercentage.toFixed(1)),
    };
  }, [user, isTeacher, selectedCourseId, gradeSheets]);

  // Estudiantes con calificaciones (para profesores)
  const studentsWithGrades = useMemo((): StudentWithGrades[] => {
    if (!isTeacher || !selectedCourse) return [];

    return selectedCourse.enrolledStudents
      .map((studentId) => {
        let studentName =
          courseStudents[studentId] ||
          gradeSheets.reduce(
            (foundName: string, sheet) => {
              if (foundName.includes("Student")) {
                const studentInSheet = sheet.students.find(
                  (s) => s.studentId === studentId,
                );
                return studentInSheet?.name || foundName;
              }
              return foundName;
            },
            `Estudiante ${studentId.slice(-6)}`,
          );

        const studentSheets = gradeSheets.filter((sheet) =>
          sheet.students.some((s) => s.studentId === studentId),
        );

        if (studentSheets.length === 0) {
          return {
            id: studentId,
            name: studentName,
            systemProgress: {
              currentGrade: 0,
              status: "failing" as const,
            },
            completedAssessments: 0,
            totalAssessments: 0,
          };
        }

        let weightedSum = 0;
        let totalWeight = 0;
        let completedActivities = 0;
        let totalActivities = 0;

        studentSheets.forEach((sheet) => {
          const studentData = sheet.students.find(
            (s) => s.studentId === studentId,
          );
          if (!studentData) return;

          const sheetWeight = Number(sheet.weightPercentage) || 0;

          totalActivities += sheet.activities.length;

          let sheetTotal = 0;
          let activityCount = 0;

          sheet.activities.forEach((activity) => {
            const grade = studentData.grades[activity.id];
            if (grade?.value !== undefined) {
              sheetTotal += grade.value;
              activityCount++;
            }
          });

          completedActivities += activityCount;

          const sheetAverage =
            activityCount > 0 ? sheetTotal / activityCount : 0;

          if (sheetAverage > 0) {
            if (sheetWeight > 0) {
              weightedSum += sheetAverage * (sheetWeight / 100);
              totalWeight += sheetWeight / 100;
            } else {
              weightedSum += sheetAverage;
              totalWeight += 1;
            }
          }
        });

        let currentGrade = totalWeight > 0 ? weightedSum / totalWeight : 0;
        const scaledGrade = Math.min(5.0, Math.max(0, currentGrade));
        const roundedCurrentGrade = parseFloat(scaledGrade.toFixed(1));

        let status: "passing" | "at-risk" | "failing";
        if (roundedCurrentGrade >= 3.0) {
          status = "passing";
        } else if (roundedCurrentGrade >= 2.0) {
          status = "at-risk";
        } else {
          status = "failing";
        }

        return {
          id: studentId,
          name: studentName,
          systemProgress: {
            currentGrade: roundedCurrentGrade,
            status,
          },
          completedAssessments: completedActivities,
          totalAssessments: totalActivities,
        };
      })
      .filter(Boolean) as StudentWithGrades[];
  }, [isTeacher, selectedCourse, courseStudents, gradeSheets]);

  const getCourseCode = (): string => {
    if (!selectedCourse) return "";
    return (
      selectedCourse.code ||
      selectedCourse.name?.replace(/\s+/g, "-").toUpperCase() ||
      selectedCourseId
    );
  };

  const filteredStudents = useMemo(() => {
    let filtered = studentsWithGrades;

    if (filterByStatus !== "all") {
      filtered = filtered.filter(
        (student) => student.systemProgress.status === filterByStatus,
      );
    }

    if (searchTerm) {
      filtered = filtered.filter((student) =>
        student.name.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    }

    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "grade":
          comparison =
            a.systemProgress.currentGrade - b.systemProgress.currentGrade;
          break;
        case "status":
          const statusOrder = { passing: 0, "at-risk": 1, failing: 2 };
          comparison =
            statusOrder[a.systemProgress.status] -
            statusOrder[b.systemProgress.status];
          break;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [studentsWithGrades, filterByStatus, searchTerm, sortBy, sortOrder]);

  // Estadísticas del profesor
  const teacherStats = useMemo(() => {
    const passing = filteredStudents.filter(
      (s) => s.systemProgress.status === "passing",
    ).length;
    const atRisk = filteredStudents.filter(
      (s) => s.systemProgress.status === "at-risk",
    ).length;
    const failing = filteredStudents.filter(
      (s) => s.systemProgress.status === "failing",
    ).length;
    const totalStudents = filteredStudents.length;

    return {
      passing,
      atRisk,
      failing,
      totalStudents,
      averageGrade:
        totalStudents > 0
          ? filteredStudents.reduce(
              (sum, s) => sum + s.systemProgress.currentGrade,
              0,
            ) / totalStudents
          : 0,
      publishedSheets: gradeSheets.filter((s) => s.isPublished).length,
      totalActivities: gradeSheets.reduce(
        (total, sheet) => total + sheet.activities.length,
        0,
      ),
      totalWeightPercentage: weightValidation.total,
    };
  }, [filteredStudents, gradeSheets, weightValidation]);

  // Exportar a Excel
  const exportToExcel = () => {
    if (!selectedCourse || filteredStudents.length === 0) return;

    const exportData = filteredStudents.map((student) => ({
      Student: student.name,
      Average: student.systemProgress.currentGrade,
      Status:
        student.systemProgress.status === "passing"
          ? "Passing"
          : student.systemProgress.status === "at-risk"
            ? "At Risk"
            : "Failing",
      "Completed Activities": student.completedAssessments,
      "Total Activities": student.totalAssessments,
      "Completion Percentage": `${((student.completedAssessments / student.totalAssessments) * 100).toFixed(1)}%`,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);

    XLSX.utils.book_append_sheet(wb, ws, "Grades");

    const wscols = [
      { wch: 30 },
      { wch: 10 },
      { wch: 15 },
      { wch: 20 },
      { wch: 15 },
      { wch: 20 },
    ];
    ws["!cols"] = wscols;

    XLSX.writeFile(
      wb,
      `Grades_${selectedCourse.code}_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  };

  const handleSortClick = (field: "name" | "grade" | "status") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  const handleCourseChange = (courseId: string) => {
    setSelectedCourseId(courseId);

    if (courseId) {
      saveLastSelectedCourse(courseId);
    }

    setShowFilter(false);
    setFilterByStatus("all");
    setSortBy("name");
    setSortOrder("asc");
  };

  // Estado de los badges
  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "passing":
        return "bg-gradient-to-r from-green-100 to-emerald-100 text-green-700 border border-green-200";
      case "at-risk":
        return "bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700 border border-amber-200";
      case "failing":
        return "bg-gradient-to-r from-red-100 to-pink-100 text-red-700 border border-red-200";
      default:
        return "bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 border border-gray-300";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "passing":
        return "Passing";
      case "at-risk":
        return "At Risk";
      case "failing":
        return "Failing";
      default:
        return "Unknown";
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <DashboardLayout
        title="Grades"
        subtitle={
          isTeacher ? "Manage your students' grades" : "View your grades"
        }
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-2">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
            <div className="space-y-2">
              <p className="text-lg font-semibold text-gray-900">
                Loading grades
              </p>
              <p className="text-sm text-gray-600">
                Preparing your academic overview
              </p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Grades"
      subtitle={isTeacher ? "Manage your students' grades" : "View your grades"}
    >
      <div className="space-y-2">
        {/* Course Selector */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex-1 flex flex-col sm:flex-row gap-4">
                 {/* Barra de búsqueda */}
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder={
                      isTeacher ? "Search students..." : "Search grades..."
                    }
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              {/* Selector de curso al lado como en AssessmentsPage */}
              <div className="relative min-w-[180px]">
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                  <GraduationCap className="h-5 w-5 text-gray-400" />
                </div>
                <select
                  value={selectedCourseId}
                  onChange={(e) => handleCourseChange(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium appearance-none cursor-pointer"
                >
                  {userCourses.length === 0 ? (
                    <option value="">No courses available</option>
                  ) : (
                    <>
                      <option value="">Select a course...</option>
                      {userCourses
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.code}
                          </option>
                        ))}
                    </>
                  )}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>

           
            </div>

            {/* Botones de acción para profesores */}
            {isTeacher && selectedCourseId && (
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={() => setShowFilter(!showFilter)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-gray-300 text-gray-700 hover:bg-gray-50 rounded-xl font-medium transition-all duration-300"
                  variant="outline"
                >
                  <Filter className="h-4 w-4" />
                  Filters
                </Button>

             
              </div>
            )}
          </div>

          {/* Filtros adicionales (se muestra cuando showFilter es true) */}
          {showFilter && isTeacher && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Filter by Status
                  </label>
                  <select
                    value={filterByStatus}
                    onChange={(e) => setFilterByStatus(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                  >
                    <option value="all">All Statuses</option>
                    <option value="passing">Passing</option>
                    <option value="at-risk">At Risk</option>
                    <option value="failing">Failing</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Sort by
                  </label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="w-full px-4 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                  >
                    <option value="name">Name</option>
                    <option value="grade">Grade</option>
                    <option value="status">Status</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Sort Order
                  </label>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as any)}
                    className="w-full px-4 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </div>
              </div>

              {/* Botón para exportar a Excel */}
              {filteredStudents.length > 0 && (
                <div className="mt-4 flex justify-end">
                  <Button
                    onClick={exportToExcel}
                    disabled={filteredStudents.length === 0}
                    className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-gray-300 text-gray-700 hover:bg-gray-50 rounded-xl font-medium transition-all duration-300"
                    variant="outline"
                  >
                    <Download className="h-4 w-4" />
                    Export to Excel
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mensaje cuando no hay cursos */}
        {!selectedCourseId && userCourses.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
            <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
              <GraduationCap className="h-8 w-8 text-blue-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              No courses available
            </h3>
            <p className="text-gray-600 max-w-md mx-auto">
              {isTeacher
                ? "You have no courses assigned as a teacher. Contact the administrator."
                : "You are not enrolled in any course. Contact your teacher."}
            </p>
          </div>
        )}

        {/* Mensaje cuando no hay estudiantes que coincidan con la búsqueda */}
        {isTeacher &&
          selectedCourseId &&
          filteredStudents.length === 0 &&
          studentsWithGrades.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
              <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center">
                <Search className="h-8 w-8 text-amber-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                No students found
              </h3>
              <p className="text-gray-600 max-w-md mx-auto">
                {searchTerm
                  ? `No students match "${searchTerm}". Try a different search term.`
                  : "No students match the selected filters."}
              </p>
              {(searchTerm || filterByStatus !== "all") && (
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setFilterByStatus("all");
                  }}
                  className="inline-flex items-center gap-2 mt-4 px-4 py-2.5 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

        {/* Student View */}
        {!isLoading && !isTeacher && studentData && selectedCourse && (
          <div className="space-y-2">
            {/* Overview Card */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-2">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    Your Progress
                  </h3>
                  <p className="text-sm text-gray-500">{selectedCourse.name}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    className={`${getStatusBadgeClass(studentData.status)} hidden sm:block`}
                  >
                    {studentData.status === "passing"}
                    {getStatusText(studentData.status)}
                  </Badge>
                  {studentData.status === "passing" &&
                    studentData.currentGrade >= 4.0 && (
                      <Badge className="bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-700 border border-amber-200">
                        <Trophy className="h-3 w-3 mr-1" />
                        Excellent
                      </Badge>
                    )}
                </div>
              </div>

              <div className="grid grid-cols-4 sm:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 rounded-xl p-2 md:p-5">
                  <p className="text-xs font-semibold text-blue-600  tracking-wide mb-2">
                    Current Average
                  </p>
                  <div className="flex items-end gap-2">
                    <p className="text-xl font-bold text-gray-900 text-center md:text-left">
                      {formatGrade(studentData.currentGrade)}
                    </p>
                    <span className="text-sm text-gray-500 mb-1 hidden md:block">
                      /5.0
                    </span>
                  </div>
                  {studentData.currentGrade >= 4.0 && (
                    <div className="flex items-center gap-1 mt-2">
                      <Star className="h-3 w-3 text-amber-500" />
                      <span className="text-xs text-amber-600 font-medium">
                        Top Performance
                      </span>
                    </div>
                  )}
                </div>

                <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 rounded-xl p-2 md:p-5">
                  <p className="text-xs font-semibold text-green-600  tracking-wide mb-2">
                    Evaluated
                  </p>
                  <p className="text-xl font-bold text-gray-900 text-center md:text-left">
                    {studentData.evaluatedPercentage.toFixed(0)}%
                  </p>
                </div>

                <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-xl p-2 md:p-5">
                  <p className="text-xs font-semibold text-amber-600  tracking-wide mb-2">
                    Remaining
                  </p>
                  <p className="text-xl font-bold text-gray-900 text-center md:text-left">
                    {studentData.remainingPercentage.toFixed(0)}%
                  </p>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100 rounded-xl p-2 md:p-5">
                  <p className="text-xs font-semibold text-purple-600  tracking-wide mb-2">
                    To Pass
                  </p>
                  <p className="text-xl font-bold text-gray-900 text-center md:text-left">
                    {studentData.minGradeToPass > 0
                      ? studentData.minGradeToPass.toFixed(1)
                      : "3.0"}
                  </p>
                </div>
              </div>
            </div>

            {/* Weight Summary Card */}
            {gradeSheets.some((sheet) => (sheet.weightPercentage || 0) > 0) && (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                      <Percent className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900">
                        Weight Distribution
                      </h4>
                      <p className="text-sm text-gray-500">
                        How each period contributes to your final grade
                      </p>
                    </div>
                  </div>
                  {studentData.totalWeightPercentage !== 100 && (
                    <Badge className="bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700 border border-amber-200">
                      {studentData.totalWeightPercentage < 100
                        ? "Incomplete"
                        : "Over 100%"}
                    </Badge>
                  )}
                </div>

                <div className="space-y-2">
                  {gradeSheets
                    .filter((sheet) => (sheet.weightPercentage || 0) > 0)
                    .sort(
                      (a, b) =>
                        (b.weightPercentage || 0) - (a.weightPercentage || 0),
                    )
                    .map((sheet) => (
                      <div
                        key={sheet.id}
                        className="flex items-center justify-between p-3 border border-gray-200 rounded-xl hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-cyan-50/50 transition-all duration-300"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
                            <FileSpreadsheet className="h-5 w-5 text-blue-500" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">
                              {sheet.title}
                            </p>
                            <div className="flex items-center gap-2 mt-1 hidden sm:block">
                              <Badge className="bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 border border-blue-200">
                                {formatGradingPeriod(sheet.gradingPeriod)}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-blue-600">
                            {sheet.weightPercentage || 0}%
                          </span>
                        </div>
                      </div>
                    ))}

                  <div className="pt-4 mt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-gray-900">
                          Total weight:
                        </span>
                        <p className="text-sm text-gray-500">
                          Sum of all periods
                        </p>
                      </div>
                      <span
                        className={`text-xl font-bold ${
                          studentData.totalWeightPercentage === 100
                            ? "text-green-600"
                            : studentData.totalWeightPercentage > 100
                              ? "text-amber-600"
                              : "text-blue-600"
                        }`}
                      >
                        {studentData.totalWeightPercentage}%
                      </span>
                    </div>
                    {studentData.totalWeightPercentage !== 100 && (
                      <div
                        className={`mt-2 p-3 rounded-xl ${
                          studentData.totalWeightPercentage > 100
                            ? "bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200"
                            : "bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {studentData.totalWeightPercentage > 100 ? (
                            <>
                              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                              <p className="text-sm text-amber-700">
                                Exceeds 100% by{" "}
                                {(
                                  studentData.totalWeightPercentage - 100
                                ).toFixed(1)}
                                %
                              </p>
                            </>
                          ) : (
                            <>
                              <Target className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                              <p className="text-sm text-blue-700">
                                {(
                                  100 - studentData.totalWeightPercentage
                                ).toFixed(1)}
                                % remaining to complete
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Grades by Period */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                      <FileSpreadsheet className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">
                        Grades by Period
                      </h3>
                      <p className="text-sm text-gray-500">
                        Detailed breakdown of all your grades
                      </p>
                    </div>
                  </div>
                  <Badge className="bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 border border-blue-200 flex items-center gap-1 max-w-[25%]">
                    <CalendarDays className="h-3 w-3" />
                    {selectedCourse.semester
                      ? `${selectedCourse.semester} Term`
                      : "Current"}
                  </Badge>
                </div>
              </div>

              <div className="p-6">
                {gradeSheets.length === 0 ? (
                  <div className="text-center py-10 px-4">
                    <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                      <AlertCircle className="h-8 w-8 text-gray-400" />
                    </div>
                    <p className="text-gray-900 font-semibold text-lg mb-2">
                      No grades have been published
                    </p>
                    <p className="text-sm text-gray-600 max-w-md mx-auto">
                      Your grades will appear here once the teacher publishes
                      evaluations for this course.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {gradeSheets.map((sheet) => {
                      const updatedAt = firestoreTimestampToDate(
                        sheet.updatedAt,
                      );
                      const studentSheetData = sheet.students[0];

                      return (
                        <div
                          key={sheet.id}
                          className="border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-lg transition-all duration-300 p-5 group cursor-pointer"
                        >
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-4 gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                                  {sheet.title}
                                </h4>
                                <Badge className="bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 border border-blue-200 hidden sm:block">
                                  {formatGradingPeriod(sheet.gradingPeriod)}
                                </Badge>
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                                <div className="flex items-center gap-1">
                                  <User className="h-4 w-4" />
                                  <span>Teacher: {sheet.teacherName}</span>
                                </div>
                                <span>•</span>
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-4 w-4" />
                                  <span>
                                    {updatedAt.toLocaleDateString("en-US", {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    })}
                                  </span>
                                </div>
                                {(sheet.weightPercentage || 0) > 0 && (
                                  <>
                                    <span className="hidden sm:block">•</span>
                                    <div className="flex items-center gap-1 hidden sm:block">
                                      <span className="font-semibold text-blue-600">
                                        {sheet.weightPercentage || 0}%
                                      </span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Activities */}
                          <div className="space-y-2">
                            {sheet.activities.map((activity) => {
                              const grade =
                                studentSheetData?.grades[activity.id];
                              const gradeValue = grade?.value || 0;
                              const isExcellent = gradeValue >= 4.0;
                              const isGood =
                                gradeValue >= 3.0 && gradeValue < 4.0;

                              return (
                                <div
                                  key={activity.id}
                                  className="flex items-center justify-between pl-4 pt-2 pb-2 pr-4 border border-gray-200 rounded-xl hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-cyan-50/50 transition-all duration-300"
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
                                      <p className="font-semibold text-gray-900 text-xs sm:text-sm">
                                        {activity.name}
                                      </p>
                                      <Badge
                                        className={`text-xs max-w-[50%] ${
                                          activity.type === "exam"
                                            ? "bg-gradient-to-r from-red-100 to-pink-100 text-red-700 border border-red-200"
                                            : activity.type === "quiz"
                                              ? "bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 border border-blue-200"
                                              : activity.type === "homework"
                                                ? "bg-gradient-to-r from-green-100 to-emerald-100 text-green-700 border border-green-200"
                                                : activity.type === "project"
                                                  ? "bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 border border-purple-200"
                                                  : "bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700 border border-amber-200"
                                        }`}
                                      >
                                        {activity.type === "exam"
                                          ? "Exam"
                                          : activity.type === "quiz"
                                            ? "Quiz"
                                            : activity.type === "homework"
                                              ? "Homework"
                                              : activity.type === "project"
                                                ? "Project"
                                                : activity.type ===
                                                    "participation"
                                                  ? "Participation"
                                                  : activity.type}
                                      </Badge>
                                    </div>
                                  </div>
                                  <div className="text-right ml-4">
                                    {grade?.value !== undefined ? (
                                      <div className="flex flex-col items-end">
                                        <div className="flex items-center gap-2">
                                          <span
                                            className={cn(
                                              "text-xl font-bold",
                                              isExcellent
                                                ? "text-green-600"
                                                : isGood
                                                  ? "text-blue-600"
                                                  : gradeValue >= 2.0
                                                    ? "text-gray-600"
                                                    : "text-gray-700",
                                            )}
                                          >
                                            {formatGrade(grade.value || 0)}
                                          </span>
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-gray-400 italic">
                                        Pending
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Total */}
                          {(() => {
                            let periodSum = 0;
                            let periodCount = 0;

                            if (studentSheetData) {
                              sheet.activities.forEach((activity) => {
                                const grade =
                                  studentSheetData.grades[activity.id];
                                if (grade?.value !== undefined) {
                                  periodSum += grade.value;
                                  periodCount++;
                                }
                              });
                            }

                            const periodAverage =
                              periodCount > 0 ? periodSum / periodCount : 0;

                            return periodCount > 0 ? (
                              <div className="mt-6 pt-4 border-t border-gray-200">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-gray-900">
                                    Period average:
                                  </span>
                                  <div className="flex items-center gap-3">
                                    <span
                                      className={cn(
                                        "text-2xl font-bold pr-6",
                                        periodAverage >= 3.0
                                          ? "text-green-600"
                                          : periodAverage >= 2.0
                                            ? "text-amber-600"
                                            : "text-red-600",
                                      )}
                                    >
                                      {formatGrade(periodAverage)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ) : null;
                          })()}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Teacher View */}
        {!isLoading && isTeacher && selectedCourse && (
          <div className="space-y-2">
            {/* Stats Overview */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-4 w-4 text-blue-500" />
                      <p className="text-xs font-semibold text-blue-600  tracking-wide">
                        Students
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">
                      {teacherStats.totalStudents}
                    </p>
                  </div>
                  <div className="h-6 w-6 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                    <Users className="h-4 w-4 text-blue-500" />
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <BarChart3 className="h-4 w-4 text-purple-500" />
                      <p className="text-xs font-semibold text-purple-600  tracking-wide">
                        Average Grade
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">
                      {teacherStats.averageGrade.toFixed(1)}
                    </p>
                  </div>
                  <div className="h-6 w-6 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                    <BarChart3 className="h-4 w-4 text-purple-500" />
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <FileSpreadsheet className="h-4 w-4 text-green-500" />
                      <p className="text-xs font-semibold text-green-600  tracking-wide">
                        Total Activities
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">
                      {teacherStats.totalActivities}
                    </p>
                  </div>
                  <div className="h-6 w-6 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center">
                    <FileSpreadsheet className="h-4 w-4 text-green-500" />
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-4 w-4 text-amber-500" />
                      <p className="text-xs font-semibold text-amber-600  tracking-wide">
                        Published Sheets
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">
                      {teacherStats.publishedSheets}
                    </p>
                  </div>
                  <div className="h-6 w-6 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4 text-amber-500" />
                  </div>
                </div>
              </div>
            </div>

            {/* Status Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Passing</p>
                      <p className="text-sm text-gray-500">≥ 3.0</p>
                    </div>
                  </div>
                  <span className="text-2xl font-bold text-gray-900">
                    {teacherStats.passing}
                  </span>
                </div>
                <div className="w-full h-3 bg-gradient-to-r from-gray-100 to-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-500"
                    style={{
                      width: `${teacherStats.totalStudents > 0 ? (teacherStats.passing / teacherStats.totalStudents) * 100 : 0}%`,
                    }}
                  />
                </div>
                <p className="text-sm text-gray-500 mt-3">
                  {teacherStats.totalStudents > 0
                    ? `${((teacherStats.passing / teacherStats.totalStudents) * 100).toFixed(1)}% of students`
                    : "No students"}
                </p>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-amber-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">At Risk</p>
                      <p className="text-sm text-gray-500">2.0 - 2.9</p>
                    </div>
                  </div>
                  <span className="text-2xl font-bold text-gray-900">
                    {teacherStats.atRisk}
                  </span>
                </div>
                <div className="w-full h-3 bg-gradient-to-r from-gray-100 to-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500"
                    style={{
                      width: `${teacherStats.totalStudents > 0 ? (teacherStats.atRisk / teacherStats.totalStudents) * 100 : 0}%`,
                    }}
                  />
                </div>
                <p className="text-sm text-gray-500 mt-3">
                  {teacherStats.totalStudents > 0
                    ? `${((teacherStats.atRisk / teacherStats.totalStudents) * 100).toFixed(1)}% of students`
                    : "No students"}
                </p>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-100 to-pink-100 flex items-center justify-center">
                      <AlertCircle className="h-5 w-5 text-red-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Failing</p>
                      <p className="text-sm text-gray-500">≤ 1.9</p>
                    </div>
                  </div>
                  <span className="text-2xl font-bold text-gray-900">
                    {teacherStats.failing}
                  </span>
                </div>
                <div className="w-full h-3 bg-gradient-to-r from-gray-100 to-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-red-500 to-pink-500 transition-all duration-500"
                    style={{
                      width: `${teacherStats.totalStudents > 0 ? (teacherStats.failing / teacherStats.totalStudents) * 100 : 0}%`,
                    }}
                  />
                </div>
                <p className="text-sm text-gray-500 mt-3">
                  {teacherStats.totalStudents > 0
                    ? `${((teacherStats.failing / teacherStats.totalStudents) * 100).toFixed(1)}% of students`
                    : "No students"}
                </p>
              </div>
            </div>

            {/* Weight Summary Card */}
            {gradeSheets.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                      <Percent className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900">
                        Weight Distribution
                      </h4>
                      <p className="text-sm text-gray-500">
                        How each period contributes to final grades
                      </p>
                    </div>
                  </div>
                  <Badge
                    className={
                      weightValidation.isValid
                        ? "bg-gradient-to-r from-green-100 to-emerald-100 text-green-700 border border-green-200"
                        : "bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700 border border-amber-200"
                    }
                  >
                    {weightValidation.total}%
                  </Badge>
                </div>
 
                <div className="space-y-2">
                  {gradeSheets
                    .sort(
                      (a, b) =>
                        (b.weightPercentage || 0) - (a.weightPercentage || 0),
                    )
                    .map((sheet) => (
                      <div
                        key={sheet.id}
                        className="flex items-center justify-between p-3 border border-gray-200 rounded-xl hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-cyan-50/50 transition-all duration-300"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                              sheet.isPublished
                                ? "bg-gradient-to-br from-green-100 to-emerald-100"
                                : "bg-gradient-to-br from-amber-100 to-orange-100"
                            }`}
                          >
                            <FileSpreadsheet
                              className={`h-5 w-5 ${sheet.isPublished ? "text-green-500" : "text-amber-500"}`}
                            />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">
                              {sheet.title}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge className="bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 border border-blue-200">
                                {formatGradingPeriod(sheet.gradingPeriod)}
                              </Badge>
                              {!sheet.isPublished && (
                                <Badge className="bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700 border border-amber-200">
                                  Draft
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className={`text-lg font-bold ${(sheet.weightPercentage || 0) > 0 ? "text-blue-600" : "text-gray-500"}`}
                          >
                            {sheet.weightPercentage || 0}%
                          </span>
                          <Link
                            to={`/courses/${getCourseCode()}/grade-sheets/${sheet.id}/edit`}
                            onClick={() => {
                              console.log("Navigating to edit:", {
                                courseCode: getCourseCode(),
                                sheetId: sheet.id,
                                sheetCourseCode: sheet.courseCode,
                                sheetCourseId: sheet.courseId,
                              });
                            }}
                            className="text-sm text-blue-600 hover:text-blue-800 font-medium hover:underline"
                          >
                            Edit
                          </Link>
                        </div>
                      </div>
                    ))}

                  <div className="pt-4 mt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-gray-900">
                          Total weight:
                        </span>
                        <p className="text-sm text-gray-500">
                          Sum of all periods
                        </p>
                      </div>
                      <span
                        className={`text-xl font-bold ${
                          weightValidation.isValid
                            ? "text-green-600"
                            : weightValidation.total > 100
                              ? "text-amber-600"
                              : "text-blue-600"
                        }`}
                      >
                        {weightValidation.total}%
                      </span>
                    </div>
                    {!weightValidation.isValid && (
                      <div
                        className={`mt-3 p-3 rounded-xl ${
                          weightValidation.total > 100
                            ? "bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200"
                            : "bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {weightValidation.total > 100 ? (
                            <>
                              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                              <p className="text-sm text-amber-700">
                                Exceeds 100% by{" "}
                                {(weightValidation.total - 100).toFixed(1)}%
                              </p>
                            </>
                          ) : (
                            <>
                              <Target className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                              <p className="text-sm text-blue-700">
                                {(100 - weightValidation.total).toFixed(1)}%
                                below target (should be 100%)
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}


            {/* Info de búsqueda */}
            {(searchTerm || filterByStatus !== 'all') && filteredStudents.length > 0 && (
              <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Search className="h-5 w-5 text-blue-500" />
                    <div>
                      <p className="font-medium text-blue-700">
                        Showing {filteredStudents.length} of {studentsWithGrades.length} students
                      </p>
                      <p className="text-sm text-blue-600">
                        {searchTerm && `Search: "${searchTerm}" • `}
                        {filterByStatus !== 'all' && `Filter: ${filterByStatus} • `}
                        Sort: {sortBy} ({sortOrder})
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setFilterByStatus('all');
                    }}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Clear all
                  </button>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  to={`/courses/${selectedCourseId}/grade-sheets`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Manage
                </Link>

                <Button
                  onClick={exportToExcel}
                  disabled={filteredStudents.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-gray-300 text-gray-700 hover:bg-gray-50 rounded-xl font-medium transition-all duration-300"
                  variant="outline"
                >
                  <Download className="h-4 w-4" />
                </Button>

                <Button
                  onClick={() => setShowFilter(!showFilter)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-gray-300 text-gray-700 hover:bg-gray-50 rounded-xl font-medium transition-all duration-300"
                  variant="outline"
                >
                  <Filter className="h-4 w-4" />
                </Button>
              </div>

              {/* Filtros */}
              {showFilter && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">
                        Filter by Status
                      </label>
                      <select
                        value={filterByStatus}
                        onChange={(e) => setFilterByStatus(e.target.value)}
                        className="w-full px-4 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                      >
                        <option value="all">All Statuses</option>
                        <option value="passing">Passing</option>
                        <option value="at-risk">At Risk</option>
                        <option value="failing">Failing</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">
                        Sort by
                      </label>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="w-full px-4 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                      >
                        <option value="name">Name</option>
                        <option value="grade">Grade</option>
                        <option value="status">Status</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">
                        Sort Order
                      </label>
                      <select
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value as any)}
                        className="w-full px-4 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                      >
                        <option value="asc">Ascending</option>
                        <option value="desc">Descending</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Grades Table */}
            {gradeSheets.length > 0 && filteredStudents.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <FileSpreadsheet className="h-5 w-5 text-blue-500" />
                        <h3 className="text-xl font-bold text-gray-900">
                          Student Weighted Averages
                        </h3>
                      </div>
                      <p className="text-sm text-gray-500">
                        {selectedCourse.code} - {selectedCourse.name}
                        {filterByStatus !== "all" &&
                          ` • Filtered by: ${filterByStatus === "passing" ? "Passing" : filterByStatus === "at-risk" ? "At Risk" : "Failing"}`}
                      </p>
                    </div>
                    <div className="text-sm font-medium text-gray-600">
                      {filteredStudents.length} of{" "}
                      {selectedCourse.enrolledStudents.length} students
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gradient-to-r from-blue-50/50 to-cyan-50/50 border-b border-gray-200">
                        <th className="text-left px-6 py-4 font-bold text-gray-900 min-w-[200px]">
                          <button
                            onClick={() => handleSortClick("name")}
                            className="flex items-center gap-2 hover:text-blue-600 transition-colors"
                          >
                            <Users className="h-4 w-4 text-gray-500" />
                            Student
                            {sortBy === "name" &&
                              (sortOrder === "asc" ? (
                                <SortAsc className="h-3 w-3" />
                              ) : (
                                <SortDesc className="h-3 w-3" />
                              ))}
                          </button>
                        </th>
                        <th className="text-center px-4 py-4 font-bold text-gray-900 min-w-[100px]">
                          <button
                            onClick={() => handleSortClick("grade")}
                            className="hover:text-blue-600 transition-colors"
                          >
                            Final Grade
                            {sortBy === "grade" &&
                              (sortOrder === "asc" ? (
                                <SortAsc className="h-3 w-3 ml-1" />
                              ) : (
                                <SortDesc className="h-3 w-3 ml-1" />
                              ))}
                          </button>
                        </th>
                        <th className="text-center px-4 py-4 font-bold text-gray-900 min-w-[100px]">
                          <button
                            onClick={() => handleSortClick("status")}
                            className="hover:text-blue-600 transition-colors"
                          >
                            Status
                            {sortBy === "status" &&
                              (sortOrder === "asc" ? (
                                <SortAsc className="h-3 w-3 ml-1" />
                              ) : (
                                <SortDesc className="h-3 w-3 ml-1" />
                              ))}
                          </button>
                        </th>
                        <th className="text-center px-4 py-4 font-bold text-gray-900 min-w-[100px]">
                          Activities
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((student, index) => (
                        <tr
                          key={student.id}
                          className={cn(
                            "border-b border-gray-200 hover:bg-gradient-to-r hover:from-blue-50/30 hover:to-cyan-50/30 transition-all duration-300",
                            index % 2 === 0 ? "bg-white" : "bg-gray-50/30",
                          )}
                        >
                          <td className="font-medium px-6 py-4 min-w-[200px]">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                                <span className="font-bold text-blue-700">
                                  {student.name.charAt(0)}
                                </span>
                              </div>
                              <div className="flex flex-col">
                                <span className="font-semibold text-gray-900">
                                  {student.name}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="text-center px-4 py-4">
                            <div className="flex flex-col items-center">
                              <span
                                className={cn(
                                  "text-xl font-bold",
                                  student.systemProgress.currentGrade >= 3.0
                                    ? "text-green-600"
                                    : student.systemProgress.currentGrade >= 2.0
                                      ? "text-amber-600"
                                      : "text-red-600",
                                )}
                              >
                                {formatGrade(
                                  student.systemProgress.currentGrade,
                                )}
                              </span>
                              <span className="text-xs text-gray-500">
                                /5.0
                              </span>
                            </div>
                          </td>
                          <td className="text-center px-4 py-4">
                            <Badge
                              className={getStatusBadgeClass(
                                student.systemProgress.status,
                              )}
                            >
                              {student.systemProgress.status === "passing" &&
                                student.systemProgress.currentGrade >= 4.0 && (
                                  <Sparkles className="h-3 w-3 mr-1" />
                                )}
                              {getStatusText(student.systemProgress.status)}
                            </Badge>
                          </td>
                          <td className="text-center px-4 py-4">
                            <div className="flex flex-col items-center">
                              <span className="font-semibold text-gray-900">
                                {student.completedAssessments}/
                                {student.totalAssessments}
                              </span>
                              <span className="text-xs text-gray-500">
                                Activities
                              </span>
                              {student.totalAssessments > 0 && (
                                <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden mt-1">
                                  <div
                                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-500"
                                    style={{
                                      width: `${(student.completedAssessments / student.totalAssessments) * 100}%`,
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Empty States */}
            {gradeSheets.length === 0 && (
              <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
                <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
                  <FileSpreadsheet className="h-8 w-8 text-blue-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  No grade sheets
                </h3>
                <p className="text-gray-600 max-w-md mx-auto mb-6">
                  No grade sheets have been created for this course yet. Start
                  by creating your first grade sheet to manage grades.
                </p>
                <Link to={`/courses/${selectedCourseId}/grade-sheets/new`}>
                  <Button className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium">
                    <FileSpreadsheet className="h-5 w-5" />
                    Create Grade Sheet
                  </Button>
                </Link>
              </div>
            )}

            {selectedCourse.enrolledStudents.length > 0 &&
              filteredStudents.length === 0 &&
              gradeSheets.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
                  <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center">
                    <AlertCircle className="h-8 w-8 text-amber-400" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    No students match the filters
                  </h3>
                  <p className="text-gray-600 max-w-md mx-auto">
                    Try changing your filter criteria to see more results.
                  </p>
                </div>
              )}

            {selectedCourse.enrolledStudents.length === 0 && (
              <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
                <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
                  <Users className="h-8 w-8 text-blue-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  No enrolled students
                </h3>
                <p className="text-gray-600 max-w-md mx-auto">
                  No students are enrolled in this course. Add students to start
                  managing grades.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
