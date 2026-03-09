// src/pages/CoursesPage.tsx - PARTE 1/3
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademic } from "@/contexts/AcademicContext";
import {
  collection,
  query,
  getDocs,
  getDoc,
  deleteDoc,
  doc,
  updateDoc,
  arrayRemove,
  where,
  onSnapshot,
  limit,
} from "firebase/firestore";
import { firebaseDB } from "@/lib/firebase";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { calculateCourseRealStats } from "@/utils/gradeCalculations";
import type { Assessment, Grade, Course, CourseClassSchedule } from "@/types/academic";
import { enrollmentService, deleteCourseCompletely , courseService} from "@/lib/firestore";
import { fileService } from '@/lib/services/fileService';
import type { CourseFile } from '@/lib/services/fileService';
import { courseBackupService } from "@/lib/services/courseBackupService";
import { isTeacherPlanExpired } from "@/lib/services/teacherPlanAccessService";
import { isAdminEmail } from "@/lib/services/adminAccessService";
import {
  TEACHER_ONBOARDING_COURSE_CODE,
  TEACHER_ONBOARDING_DURATION_MONTHS,
} from "@/lib/services/teacherOnboardingService";

import {
  ArrowLeft, GraduationCap, ArrowRight, School,
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
  TrendingUp,
  FileBarChart,
  Percent,
  CheckCircle,
  AlertCircle,
  Eye,
  Filter,
  SortAsc,
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
  Loader2, 
  Trash2
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";

function getPlainTextFromHtml(content: string): string {
  if (!content?.trim()) return "";

  return content
    .replace(/<!DOCTYPE[^>]*>/gi, " ")
    .replace(/<\/?(html|head|body|meta|title|style|script|link)[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const COURSE_COVER_GRADIENTS = [
  "bg-gradient-to-br from-amber-200 to-rose-200",
  "bg-gradient-to-br from-teal-200 to-emerald-200",
  "bg-gradient-to-br from-indigo-200 to-pink-200",
  "bg-gradient-to-br from-lime-200 to-teal-200",
  "bg-gradient-to-br from-violet-200 to-teal-200",
  "bg-gradient-to-br from-rose-200 to-amber-200",
];

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const hashString = (value: string): number =>
  value.split("").reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 100000, 7);

const getCourseGradientSeed = (
  course: { id?: string; code?: string; name?: string },
  fallbackIndex = 0,
): string => course.id || course.code || course.name || `course-${fallbackIndex}`;

const buildCourseGradientMap = (
  courses: Array<{ id?: string; code?: string; name?: string }>,
): Map<string, string> => {
  const paletteSize = COURSE_COVER_GRADIENTS.length;
  const seedList = courses.map((course, index) => getCourseGradientSeed(course, index));
  const baseGradientIndexList = seedList.map((seed) => hashString(seed) % paletteSize);
  const assignedGradientIndexList = [...baseGradientIndexList];
  const firstVisibleLimit = Math.min(6, paletteSize, courses.length);
  const usedGradientIndexes = new Set<number>();

  const prioritized = seedList
    .slice(0, firstVisibleLimit)
    .map((seed, index) => ({ index, seed }))
    .sort((a, b) => a.seed.localeCompare(b.seed));

  for (const { index, seed } of prioritized) {
    const preferredIndex = baseGradientIndexList[index];

    if (!usedGradientIndexes.has(preferredIndex)) {
      assignedGradientIndexList[index] = preferredIndex;
      usedGradientIndexes.add(preferredIndex);
      continue;
    }

    const seedOffset = hashString(seed) % paletteSize;
    let selectedIndex = preferredIndex;
    for (let step = 1; step <= paletteSize; step += 1) {
      const candidateIndex = (preferredIndex + seedOffset + step) % paletteSize;
      if (!usedGradientIndexes.has(candidateIndex)) {
        selectedIndex = candidateIndex;
        break;
      }
    }

    assignedGradientIndexList[index] = selectedIndex;
    usedGradientIndexes.add(selectedIndex);
  }

  const gradientMap = new Map<string, string>();
  seedList.forEach((seed, index) => {
    gradientMap.set(seed, COURSE_COVER_GRADIENTS[assignedGradientIndexList[index]]);
  });

  return gradientMap;
};

const normalizeCourseSchedule = (value: CourseClassSchedule[] | undefined): CourseClassSchedule[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (slot) =>
        Number.isInteger(slot.dayOfWeek) &&
        slot.dayOfWeek >= 0 &&
        slot.dayOfWeek <= 6 &&
        typeof slot.startTime === "string" &&
        slot.startTime.trim().length > 0 &&
        typeof slot.endTime === "string" &&
        slot.endTime.trim().length > 0,
    )
    .map((slot) => ({
      dayOfWeek: Number(slot.dayOfWeek),
      startTime: slot.startTime.trim(),
      endTime: slot.endTime.trim(),
      ...(slot.location?.trim() ? { location: slot.location.trim() } : {}),
    }))
    .sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
      return a.endTime.localeCompare(b.endTime);
    });
};

const formatScheduleSlot = (slot: CourseClassSchedule, withLocation = false) => {
  const dayLabel = WEEKDAY_SHORT[slot.dayOfWeek] || "Day";
  const base = `${dayLabel} ${slot.startTime}-${slot.endTime}`;
  if (!withLocation || !slot.location) return base;
  return `${base} • ${slot.location}`;
};

const formatScheduleSummary = (schedule: CourseClassSchedule[]) => {
  if (schedule.length === 0) return "No class schedule";
  const first = formatScheduleSlot(schedule[0], false);
  if (schedule.length === 1) return first;
  return `${first} +${schedule.length - 1}`;
};

const toDateOrNull = (value: unknown): Date | null => {
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

const addMonths = (baseDate: Date, months: number): Date => {
  const next = new Date(baseDate.getTime());
  next.setMonth(next.getMonth() + months);
  return next;
};

const getOnboardingProgressMeta = (
  rawStatus: unknown,
): {
  label: "Approved" | "Failed" | "In progress";
  filterKey: "approved" | "failed" | "in_progress";
  badgeClassName: string;
} => {
  const normalized = String(rawStatus || "")
    .trim()
    .toLowerCase();

  if (normalized === "completed" || normalized === "approved" || normalized === "passed") {
    return {
      label: "Approved",
      filterKey: "approved",
      badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (normalized === "closed" || normalized === "failed" || normalized === "rejected") {
    return {
      label: "Failed",
      filterKey: "failed",
      badgeClassName: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }

  return {
    label: "In progress",
    filterKey: "in_progress",
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
  };
};

export default function CoursesPage() {
  const { courseCode } = useParams<{ courseCode?: string }>();
  const { user } = useAuth();
  const { courses, assessments, grades, units, loading, refreshCourses } = useAcademic();
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
  const [joinCourseCode, setJoinCourseCode] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [joinSuccess, setJoinSuccess] = useState("");
  const [showJoinCodeModal, setShowJoinCodeModal] = useState(false);
  const [teacherOnboardingDueAt, setTeacherOnboardingDueAt] = useState<Date | null>(null);
  const [pendingJoinCourse, setPendingJoinCourse] = useState<{
    id: string;
    name: string;
    code: string;
    description: string;
    teacherName: string;
    semester: string;
    group: string;
    credits: number;
    enrolledCount: number;
    scheduleSummary: string;
    scheduleDetail: string;
    status: string;
  } | null>(null);

  const isTeacher = user?.role === "docente";
  const isCurrentUserAdmin = user?.role === "admin" || isAdminEmail(user?.email);
  const isAdmin = isCurrentUserAdmin;
  const isTeacherView = isTeacher || isAdmin;
  const isStudentView = !isTeacherView;
  const [teacherOnboardingCourse, setTeacherOnboardingCourse] = useState<Course | null>(null);
  const teacherOwnedCourses = useMemo(() => {
    if (!user?.id) return [];
    return isAdmin
      ? [...courses]
      : isTeacher
      ? courses.filter((course) => course.teacherId === user.id)
      : courses.filter((course) => (course.enrolledStudents || []).includes(user.id));
  }, [courses, isAdmin, isTeacher, user?.id]);

  const userAccessibleCourses = useMemo(() => {
    if (!user?.id) return [] as Course[];
    if (isAdmin) {
      return [...courses];
    }
    if (!isTeacher) {
      return courses.filter((course) => (course.enrolledStudents || []).includes(user.id));
    }

    const ownedCourses = courses.filter((course) => course.teacherId === user.id);
    if (!teacherOnboardingCourse) return ownedCourses;
    if (ownedCourses.some((course) => course.id === teacherOnboardingCourse.id)) return ownedCourses;

    return [teacherOnboardingCourse, ...ownedCourses];
  }, [courses, isAdmin, isTeacher, teacherOnboardingCourse, user?.id]);

  const course = courseCode ? userAccessibleCourses.find((c) => c.code === courseCode) : null;
  const isOnboardingCourseContext =
    String(course?.code || "")
      .trim()
      .toUpperCase() === TEACHER_ONBOARDING_COURSE_CODE;
  const id = course ? course.id : null;
  const [courseFiles, setCourseFiles] = useState<CourseFile[]>([]);
const [loadingFiles, setLoadingFiles] = useState(false);

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
    if (id && course) {
      loadEnrolledStudents();
    }
  }, [id, course]);

  useEffect(() => {
    if (showEnrollModal && isTeacher && course) {
      loadAvailableStudents();
    }
  }, [showEnrollModal]);

  useEffect(() => {
    if (!isTeacher || !user?.id) {
      setTeacherOnboardingCourse(null);
      return;
    }

    const onboardingQuery = query(
      collection(firebaseDB, "cursos"),
      where("code", "==", TEACHER_ONBOARDING_COURSE_CODE),
      limit(1),
    );

    const unsubscribe = onSnapshot(
      onboardingQuery,
      (snapshot) => {
        const docSnap = snapshot.docs[0];
        if (!docSnap) {
          setTeacherOnboardingCourse(null);
          return;
        }

        const data = (docSnap.data() || {}) as Record<string, any>;
        const enrolledStudents = Array.isArray(data.enrolledStudents)
          ? data.enrolledStudents.filter(
              (value: unknown): value is string => typeof value === "string" && value.trim().length > 0,
            )
          : [];
        if (!enrolledStudents.includes(user.id)) {
          setTeacherOnboardingCourse(null);
          return;
        }

        setTeacherOnboardingCourse({
          id: docSnap.id,
          name: data.name || "",
          code: data.code || "",
          semester: data.semester || "",
          group: data.group || "",
          credits: Number(data.credits || 0),
          teacherId: data.teacherId || "",
          teacherName: data.teacherName || "",
          description: data.description || "",
          coverUrl: data.coverUrl || "",
          classSchedule: normalizeCourseSchedule(data.classSchedule),
          enrolledStudents,
          createdAt: data.createdAt?.toDate?.() || new Date(),
        });
      },
      () => {
        setTeacherOnboardingCourse(null);
      },
    );

    return () => unsubscribe();
  }, [isTeacher, user?.id]);

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
        if (isOnboardingCourseContext) {
          const onboardingStatus = getOnboardingProgressMeta(student.teacherOnboardingStatus).filterKey;
          switch (gradeFilter) {
            case 'passing':
              return onboardingStatus === "approved";
            case 'at-risk':
              return onboardingStatus === "in_progress";
            case 'failing':
              return onboardingStatus === "failed";
            default:
              return true;
          }
        }

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
  }, [enrolledStudents, searchTerm, sortOrder, gradeFilter, gradeSheets, id, isOnboardingCourseContext]);

  useEffect(() => {
    if (!user?.id || !isOnboardingCourseContext) {
      setTeacherOnboardingDueAt(null);
      return;
    }

    let isActive = true;

    const loadOnboardingDueDate = async () => {
      try {
        const studentSnap = await getDoc(doc(firebaseDB, "estudiantes", user.id));
        const data = (studentSnap.exists() ? studentSnap.data() : {}) as Record<string, unknown>;
        const storedDueAt = toDateOrNull(data.teacherOnboardingDueAt);
        const enrolledAt = toDateOrNull(data.teacherOnboardingEnrolledAt);
        const fallbackDueAt = enrolledAt
          ? addMonths(enrolledAt, TEACHER_ONBOARDING_DURATION_MONTHS)
          : null;

        if (isActive) {
          setTeacherOnboardingDueAt(storedDueAt || fallbackDueAt);
        }
      } catch {
        if (isActive) setTeacherOnboardingDueAt(null);
      }
    };

    void loadOnboardingDueDate();

    return () => {
      isActive = false;
    };
  }, [isOnboardingCourseContext, user?.id]);

  useEffect(() => {
    if (!isTeacher || !user?.id || teacherOwnedCourses.length === 0) {
      return;
    }

    void courseBackupService.runAutoBackupIfDue(
      { id: user.id, name: user.name || "Teacher" },
      teacherOwnedCourses.map((course) => course.id),
      24,
    );
  }, [isTeacher, user?.id, user?.name, teacherOwnedCourses]);

  useEffect(() => {
  const loadCourseFiles = async () => {
    if (!id) return;
    
    setLoadingFiles(true);
    try {
      const files = await fileService.getCourseFiles(id);
      setCourseFiles(files);
    } catch (error) {
      console.error("Error loading course files:", error);
    } finally {
      setLoadingFiles(false);
    }
  };

  if (id) {
    loadCourseFiles();
  }
}, [id]);

  const loadEnrolledStudents = async () => {
    if (!id) return;
    setLoadingStudents(true);
    try {
      const students = await enrollmentService.getEnrolledStudents(id);

      const enrichedStudents = await Promise.all(
        students.map(async (student: any) => {
          if (!student?.id) return student;
          if (student.avatarUrl || student.avatarEmoji) return student;

          try {
            const [userSnap, studentSnap] = await Promise.all([
              getDoc(doc(firebaseDB, "usuarios", student.id)),
              getDoc(doc(firebaseDB, "estudiantes", student.id)),
            ]);

            const userData = userSnap.exists() ? (userSnap.data() as Record<string, any>) : {};
            const studentData = studentSnap.exists() ? (studentSnap.data() as Record<string, any>) : {};

            return {
              ...student,
              name: student.name || userData.name || studentData.name || "Student",
              email: student.email || userData.email || studentData.email || "",
              avatarUrl: student.avatarUrl || userData.avatarUrl || studentData.avatarUrl || "",
              avatarEmoji: student.avatarEmoji || userData.avatarEmoji || studentData.avatarEmoji || "",
            };
          } catch {
            return student;
          }
        }),
      );

      setEnrolledStudents(enrichedStudents);
      setFilteredStudents(enrichedStudents); // Inicializar filteredStudents
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

    if (isStudentView && user?.id) {
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
  const teacherPlanStudentLimitForEnrollment =
    typeof user?.teacherPlanStudentLimit === "number" && user.teacherPlanStudentLimit > 0
      ? user.teacherPlanStudentLimit
      : null;
  const isTeacherPlanExpiredForEnrollment =
    isTeacher &&
    isTeacherPlanExpired({
      role: user?.role,
      teacherPlanStatus: user?.teacherPlanStatus,
      teacherPlanExpiresAt: user?.teacherPlanExpiresAt,
    });
  const teacherManagedStudentIdsForEnrollment = useMemo(() => {
    if (!isTeacher || !user?.id) return new Set<string>();
    const managedIds = new Set<string>();
    courses
      .filter((courseItem) => courseItem.teacherId === user.id)
      .forEach((courseItem) => {
        (courseItem.enrolledStudents || []).forEach((studentId) => {
          if (typeof studentId === "string" && studentId.trim().length > 0) {
            managedIds.add(studentId);
          }
        });
      });
    return managedIds;
  }, [courses, isTeacher, user?.id]);
  const hasReachedTeacherStudentQuotaForEnrollment =
    isTeacher &&
    Boolean(teacherPlanStudentLimitForEnrollment) &&
    teacherManagedStudentIdsForEnrollment.size >= teacherPlanStudentLimitForEnrollment;

  const handleEnrollStudent = async (studentId: string) => {
    if (!id) return;

    if (isTeacherPlanExpiredForEnrollment) {
      alert("Your teacher plan is expired. Renew payment to enroll students.");
      return;
    }

    if (isTeacher && teacherPlanStudentLimitForEnrollment) {
      const alreadyManaged = teacherManagedStudentIdsForEnrollment.has(studentId);
      if (!alreadyManaged && hasReachedTeacherStudentQuotaForEnrollment) {
        alert(
          `Plan limit reached: your plan allows up to ${teacherPlanStudentLimitForEnrollment} unique students.`,
        );
        return;
      }
    }

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

  const handleJoinCourseByCode = async () => {
    if (!user?.id) return;

    const code = joinCourseCode.trim();
    if (!code) {
      setJoinError("Please enter a valid course code.");
      setJoinSuccess("");
      return;
    }

    setJoinLoading(true);
    setJoinError("");
    setJoinSuccess("");
    setPendingJoinCourse(null);

    try {
      const coursesRef = collection(firebaseDB, "cursos");
      const normalizedCode = code.toUpperCase();

      let targetCourseId = "";
      let matchedCourseDoc: any = null;

      const exactQuery = query(coursesRef, where("code", "==", normalizedCode));
      const exactSnapshot = await getDocs(exactQuery);

      if (!exactSnapshot.empty) {
        targetCourseId = exactSnapshot.docs[0].id;
        matchedCourseDoc = exactSnapshot.docs[0];
      } else {
        const allCoursesSnapshot = await getDocs(coursesRef);
        const caseInsensitiveMatch = allCoursesSnapshot.docs.find((courseDoc) => {
          const courseCodeValue = String(courseDoc.data().code || "");
          return courseCodeValue.toLowerCase() === code.toLowerCase();
        });
        if (caseInsensitiveMatch) {
          targetCourseId = caseInsensitiveMatch.id;
          matchedCourseDoc = caseInsensitiveMatch;
        }
      }

      if (!targetCourseId) {
        setJoinError("Course not found. Please check the course code and try again.");
        return;
      }

      if (userCourses.some((course) => course.id === targetCourseId)) {
        setJoinError("You are already enrolled in this course.");
        return;
      }

      const selectedCourseData = matchedCourseDoc?.data() || {};
      const normalizedSchedule = normalizeCourseSchedule(selectedCourseData.classSchedule);
      const rawCredits = Number(selectedCourseData.credits);
      const credits = Number.isFinite(rawCredits) ? rawCredits : 0;
      const enrolledCount = Array.isArray(selectedCourseData.enrolledStudents)
        ? selectedCourseData.enrolledStudents.length
        : 0;
      const rawStatus = String(selectedCourseData.status || "published").trim().toLowerCase();
      const status = rawStatus
        ? `${rawStatus.charAt(0).toUpperCase()}${rawStatus.slice(1)}`
        : "Published";
      const scheduleSummary = formatScheduleSummary(normalizedSchedule);
      const scheduleDetail = normalizedSchedule
        .slice(0, 3)
        .map((slot) => formatScheduleSlot(slot, true))
        .join(" • ");

      setPendingJoinCourse({
        id: targetCourseId,
        name: String(selectedCourseData.name || "Course"),
        code: String(selectedCourseData.code || normalizedCode),
        description: String(selectedCourseData.description || "No description available"),
        teacherName: String(selectedCourseData.teacherName || "Not available"),
        semester: String(selectedCourseData.semester || "").trim(),
        group: String(selectedCourseData.group || "").trim(),
        credits,
        enrolledCount,
        scheduleSummary,
        scheduleDetail,
        status,
      });
      setShowJoinCodeModal(false);
    } catch (error: any) {
      const message = String(error?.message || "").toLowerCase();
      if (message.includes("ya está inscrito")) {
        setJoinError("You are already enrolled in this course.");
      } else {
        setJoinError("Could not join the course. Please try again.");
      }
    } finally {
      setJoinLoading(false);
    }
  };

  const handleConfirmJoinCourse = async () => {
    if (!user?.id || !pendingJoinCourse) return;

    setJoinLoading(true);
    setJoinError("");
    setJoinSuccess("");

    try {
      await enrollmentService.enrollStudentInCourse(pendingJoinCourse.id, user.id);
      await refreshCourses();
      setJoinSuccess(`You joined ${pendingJoinCourse.name} successfully.`);
      setJoinCourseCode("");
      setPendingJoinCourse(null);
    } catch (error: any) {
      const message = String(error?.message || "").toLowerCase();
      if (message.includes("ya está inscrito")) {
        setJoinError("You are already enrolled in this course.");
      } else {
        setJoinError("Could not join the course. Please try again.");
      }
    } finally {
      setJoinLoading(false);
    }
  };

  const getAssessmentStatus = (assessment: any, studentId?: string) => {
    const dueDate = new Date(assessment.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (studentId && isStudentView) {
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
  };// src/pages/CoursesPage.tsx - PARTE 2/3

  if (loading.courses) {
    return (
      <DashboardLayout contentClassName="pt-0 lg:pt-1">
        <div className="relative overflow-x-hidden  ">
          <div className="pointer-events-none absolute rounded-full blur-[40px] -left-16 top-8 h-40 w-40 bg-white/70" />
          <div className="pointer-events-none absolute rounded-full blur-[40px] -right-10 bottom-8 h-44 w-44 bg-slate-300/50" />
          <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
            <div className="min-h-[400px] flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <div className="mt-2">
                  <p className="text-lg font-semibold text-slate-900">Loading your courses</p>
                  <p className="mt-1 text-sm text-slate-600">Preparing your personalized academic overview</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (courseCode && !course) {
    return (
      <DashboardLayout contentClassName="pt-0 lg:pt-1">
        <div className="relative overflow-x-hidden ">
          <div className="pointer-events-none absolute rounded-full blur-[40px] -left-16 top-8 h-40 w-40 bg-white/70" />
          <div className="pointer-events-none absolute rounded-full blur-[40px] -right-10 bottom-8 h-44 w-44 bg-slate-300/50" />
          <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
            <div className="min-h-[60vh] flex items-center justify-center p-4">
              <div className="text-center max-w-md">
                <div className="h-20 w-20 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <BookOpen className="h-10 w-10 text-cyan-700" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">
                  Course Not Found
                </h2>
                <p className="text-slate-600 mb-6">
                  The course you're looking for doesn't exist or is not accessible.
                </p>
                <Link
                  to="/courses"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-6 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Courses
                </Link>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (courseCode && course) {
    const courseAssessments = assessments.filter((a) => a.courseId === id);
    const courseUnits = units.filter((u) => u.courseId === id);
    const courseSchedule = normalizeCourseSchedule(course.classSchedule);
    const effectiveCourseSchedule = isOnboardingCourseContext ? [] : courseSchedule;
    const onboardingCompletionText = teacherOnboardingDueAt
      ? formatDateForColombia(teacherOnboardingDueAt)
      : `Within ${TEACHER_ONBOARDING_DURATION_MONTHS} months`;
    const courseContentItems = courseUnits
      .flatMap((unit) =>
        unit.weeks.map((week) => ({
          week,
        })),
      )
      .slice(0, 5);

    const studentProgress =
      user && isStudentView
        ? calculateStudentProgress(user.id, id, grades, courseAssessments)
        : null;
    const gradeSheetsForCourse = gradeSheets.filter((sheet) => sheet.courseId === id);
    const publishedGradeSheetsForCourse = gradeSheetsForCourse.filter((sheet) => sheet.isPublished);
    const canViewTeacherClassroomSection =
      isTeacherView && (!isOnboardingCourseContext || isCurrentUserAdmin);
    const showClassroomHeader =
      !isTeacherView || canViewTeacherClassroomSection;

    const courseStats = isTeacherView
      ? calculateCourseRealStats(
          id,
          course.enrolledStudents || [], 
          grades,
          gradeSheets,
        )
      : null;

    return (
      <DashboardLayout contentClassName="pt-0 lg:pt-1">
        <div className="relative overflow-x-hidden ">
          <div className="pointer-events-none absolute rounded-full blur-[40px] -left-16 top-8 h-40 w-40 bg-white/70" />
          <div className="pointer-events-none absolute rounded-full blur-[40px] -right-10 bottom-8 h-44 w-44 bg-slate-300/50" />

          <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">

            <div className="flex flex-col gap-4">
              {/* Header with course info */}
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
                <div className="pointer-events-none absolute -left-16 -top-20 h-44 w-44 rounded-full bg-sky-200/35" />
                <div className="pointer-events-none absolute -bottom-24 -right-20 h-56 w-56 rounded-full bg-indigo-200/35" />

                <div className="relative z-10">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                    <div className="flex-1 min-w-0">
                      <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                        <Sparkles className="h-3.5 w-3.5" />
                        Course Workspace
                      </div>

                      <div className="mt-3 flex items-start gap-4">
                       
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                            <h1 className="text-lg font-bold text-slate-900 break-words">
                              {course.name}
                            </h1>
                            <div className="flex flex-wrap gap-2">
                              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">{course.code}</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 mb-3">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              <span className="font-medium">{course.teacherName}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              <span>{course.semester || "No semester"}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <CreditCard className="h-4 w-4" />
                              <span>{course.credits} Credits</span>
                            </div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-700">
                              <Clock className="h-4 w-4" />
                              <span>{formatScheduleSummary(effectiveCourseSchedule)}</span>
                            </div>
                            {isOnboardingCourseContext && (
                              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                                <CalendarDays className="h-4 w-4" />
                                <span>Finish by {onboardingCompletionText}</span>
                              </div>
                            )}
                          </div>

                          {course.description && (
                            <p className="text-sm text-slate-600 max-w-2xl break-words">
                              {course.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {isTeacher && (
                      <div className="lg:w-80 flex flex-col justify-center">
                        <div className="flex flex-wrap gap-2 justify-start sm:justify-end ml-auto">
                          <Link
                            to={`/courses/${course.code}/edit`}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:border-sky-200 hover:text-sky-700"
                          >
                            <Edit className="h-4 w-4" />
                            Edit
                          </Link>
                          <div className="relative group">
                            <button className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                              <MoreVertical className="h-4 w-4" />
                              More
                            </button>

                            <div className="absolute right-0 mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-2 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                              <Link
                                to={`/courses/${course.code}/grade-sheets`}
                                className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 w-full"
                              >
                                <FileText className="h-4 w-4" />
                                Manage Grades
                              </Link>
                              <div className="border-t border-slate-100 my-1"></div>
                              <button
                                onClick={handleDeleteCourseSimple}
                                disabled={isDeleting}
                                className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 w-full disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-50"
                              >
                                {isDeleting ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4 text-red-600" />
                                )}
                                {isDeleting ? "Deleting..." : "Delete Course"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                    <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex items-center gap-2">
                          <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-teal-100 text-teal-700">
                            <Users className="h-4 w-4" />
                          </div>
                          <p className="text-[10px] leading-4 font-semibold text-slate-500 whitespace-nowrap">Students</p>
                        </div>
                        <p className="shrink-0 text-lg leading-5 font-extrabold text-slate-900">{course.enrolledStudents?.length || 0}</p>
                      </div>
                    </div>
                    <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex items-center gap-2">
                          <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                            <FileBarChart className="h-4 w-4" />
                          </div>
                          <p className="text-[10px] leading-4 font-semibold text-slate-500 whitespace-nowrap">Assessments</p>
                        </div>
                        <p className="shrink-0 text-lg leading-5 font-extrabold text-slate-900">{courseAssessments.length}</p>
                      </div>
                    </div>
                    <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex items-center gap-2">
                          <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                            <FolderOpen className="h-4 w-4" />
                          </div>
                          <p className="text-[10px] leading-4 font-semibold text-slate-500 whitespace-nowrap">Materials</p>
                        </div>
                        <p className="shrink-0 text-lg leading-5 font-extrabold text-slate-900">{courseFiles.length}</p>
                      </div>
                    </div>
                    <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex items-center gap-2">
                          <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                            <CalendarDays className="h-4 w-4" />
                          </div>
                          <p className="text-[10px] leading-4 font-semibold text-slate-500 whitespace-nowrap">Upcoming</p>
                        </div>
                        <p className="shrink-0 text-lg leading-5 font-extrabold text-slate-900">{calculateUpcomingActivities.length}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Course Metadata */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-100">
                      <Book className="h-4 w-4 text-teal-700" />
                    </div>
                    <h2 className="text-base font-bold text-slate-900">Course Metadata</h2>
                  </div>
                  <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                    {effectiveCourseSchedule.length} blocks
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Group</p>
                    <p className="mt-1 text-xl font-extrabold leading-none text-slate-900 text-base">{course.group || "N/A"}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</p>
                    <p className="mt-1 text-xl font-extrabold leading-none text-slate-900 text-base capitalize">
                      {course.enrolledStudents?.length ? "active" : "new"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Students</p>
                    <p className="mt-1 text-xl font-extrabold leading-none text-slate-900 text-base">{course.enrolledStudents?.length || 0}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Assessments</p>
                    <p className="mt-1 text-xl font-extrabold leading-none text-slate-900 text-base">{courseAssessments.length}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Documents</p>
                    <p className="mt-1 text-xl font-extrabold leading-none text-slate-900 text-base">{courseFiles.length}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Grade Sheets</p>
                    <p className="mt-1 text-xl font-extrabold leading-none text-slate-900 text-base">
                      {gradeSheetsForCourse.length}
                    </p>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-sky-700" />
                      <p className="text-sm font-semibold text-slate-800">Class Schedule</p>
                    </div>
                      <p className="text-xs text-slate-500">
                      {effectiveCourseSchedule.length > 0
                        ? `${effectiveCourseSchedule.length} block${effectiveCourseSchedule.length === 1 ? "" : "s"} per week`
                        : "No class blocks"}
                    </p>
                  </div>
                  {effectiveCourseSchedule.length === 0 ? (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-slate-500">
                        {isOnboardingCourseContext
                          ? "No class schedule. This onboarding course is self-paced."
                          : "No class schedule configured yet."}
                      </p>
                      {isOnboardingCourseContext && (
                        <p className="text-xs font-semibold text-sky-700">
                          Completion target: {onboardingCompletionText}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 space-y-1.5">
                      {effectiveCourseSchedule.map((slot, slotIndex) => (
                        <span
                          key={`${slot.dayOfWeek}-${slot.startTime}-${slot.endTime}-${slotIndex}`}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700"
                        >
                          {formatScheduleSlot(slot, true)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="px-1 pt-1">
                <p className="text-base font-bold text-slate-900">Academic Tracking</p>
                <p className="text-sm text-slate-600">Performance, upcoming work, and evaluations</p>
              </div>

              {/* Stats Cards */}
              {courseStats && !isOnboardingCourseContext && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Average</p>
                    <p className="mt-1 text-xl font-extrabold leading-none text-slate-900">
                      {courseStats.studentsWithGrades > 0
                        ? courseStats.averageGrade.toFixed(1)
                        : "--"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">/5.0</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Passing</p>
                    <p className="mt-1 text-xl font-extrabold leading-none text-slate-900">{courseStats.passingCount}</p>
                    <p className="text-sm text-slate-600">Students</p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">At Risk</p>
                    <p className="mt-1 text-xl font-extrabold leading-none text-slate-900">{courseStats.atRiskCount}</p>
                    <p className="text-sm text-slate-600">Students</p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Failing</p>
                    <p className="mt-1 text-xl font-extrabold leading-none text-slate-900">{courseStats.failingCount}</p>
                    <p className="text-sm text-slate-600">Students</p>
                  </div>
                </div>
              )}

              <div className="px-1 pt-1">
                <p className="text-base font-bold text-slate-900">Course Resources</p>
                <p className="text-sm text-slate-600">Structure and materials for this course</p>
              </div>

              {/* Main Content Grid */}
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {/* Course Content */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100">
                        <FolderOpen className="h-4 w-4 text-violet-700" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-base font-bold text-slate-900">Course Content</h2>
                        <p className="text-sm text-slate-600">Organized by terms and weeks</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                        {courseUnits.length} term{courseUnits.length === 1 ? "" : "s"}
                      </span>
                      {isTeacher ? (
                        <Link
                          to={"/slides"}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                        >
                          <Plus className="h-4 w-4" />
                          New
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  {courseUnits.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                      <FolderOpen className="h-12 w-12 mx-auto text-slate-400 mb-3" />
                      <p className="text-sm font-semibold text-slate-700">
                        No content available yet
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {isTeacher
                          ? "Create your first unit to organize your course materials"
                          : "The teacher will upload content soon"}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {courseContentItems.map(({ week }, contentIndex) => (
                        <div key={week.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                          <div className="min-w-0 flex items-center gap-3">
                            <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 overflow-hidden">
                              <Presentation className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{week.topic}</p>
                              <p className="truncate text-xs text-slate-500">
                                Week {contentIndex + 1} •{" "}
                                {week.slides.length > 0
                                  ? `${week.slides.length} slide${week.slides.length !== 1 ? "s" : ""}`
                                  : "No slides yet"}
                              </p>
                            </div>
                          </div>
                          {week.slides.length === 0 && isTeacher ? (
                            <Link
                              to={`/slides/create?week=${week.id}`}
                              className="text-sm text-slate-600 hover:text-slate-800 font-medium"
                            >
                              Add
                            </Link>
                          ) : (
                            <ChevronRight className="h-4 w-4 text-slate-400" />
                          )}
                        </div>
                      ))}

                      <Link
                        to={`/courses/${course.code}/assessments`}
                        className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:gap-3"
                      >
                        View all activities
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  )}
                </div>

                {/* Course Documents */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100">
                        <File className="h-4 w-4 text-emerald-700" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-base font-bold text-slate-900">Course Documents</h2>
                        <p className="text-sm text-slate-600">PDFs, guides, and study materials</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        {courseFiles.length} files
                      </span>
                      {isTeacher && (
                        <Link
                          to={`/courses/${course.code}/files`}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                        >
                          <Plus className="h-4 w-4" />
                          Add
                        </Link>
                      )}
                    </div>
                  </div>

                  {loadingFiles ? (
                    <div className="min-h-[400px] flex items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                    </div>
                  ) : courseFiles.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                      <FolderOpen className="h-12 w-12 mx-auto text-slate-400 mb-3" />
                      <p className="text-sm font-semibold text-slate-700">No documents available yet</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {isTeacher
                          ? "Upload your first document to share with students"
                          : "Documents will appear here when available"}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        {courseFiles.slice(0, 5).map((file) => {
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

                          const getUploadedDate = (uploadedAt: any): Date | null => {
                            if (!uploadedAt) return null;
                            if (uploadedAt instanceof Date) return uploadedAt;
                            if (uploadedAt?.toDate) return uploadedAt.toDate();
                            const parsed = new Date(uploadedAt);
                            return Number.isNaN(parsed.getTime()) ? null : parsed;
                          };

                          const typeText = String(file.type || "").toLowerCase();
                          const isPdf = typeText.includes("pdf");
                          const isDoc = typeText.includes("word") || typeText.includes("document");
                          const isSheet = typeText.includes("excel") || typeText.includes("spreadsheet");
                          const isPresentation =
                            typeText.includes("presentation") || typeText.includes("powerpoint");
                          const isImage = typeText.includes("image");
                          const FileIcon = isPdf
                            ? FileText
                            : isDoc
                              ? FileCheck
                              : isSheet
                                ? BarChart3
                                : isPresentation
                                  ? Presentation
                                  : isImage
                                    ? Eye
                                    : File;
                          const iconToneClass = isPdf
                            ? "bg-rose-100 text-rose-700"
                            : isDoc
                              ? "bg-teal-100 text-teal-700"
                              : isSheet
                                ? "bg-emerald-100 text-emerald-700"
                                : isPresentation
                                  ? "bg-violet-100 text-violet-700"
                                  : isImage
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-slate-100 text-slate-700";

                          return (
                            <div
                              key={file.id}
                              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
                              onClick={() => window.open(file.url, "_blank")}
                            >
                              <div className="min-w-0 flex items-center gap-3">
                                <div className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 overflow-hidden ${iconToneClass}`}>
                                  <FileIcon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900">
                                    {file.name}
                                  </p>
                                  <p className="truncate text-xs text-slate-500">
                                    {formatFileSize(file.size || 0)} • {(file.type || "file").split("/").pop()?.toUpperCase() || "FILE"} • {file.uploadedBy || "Unknown"}
                                    {getUploadedDate(file.uploadedAt) ? ` • ${formatDate(getUploadedDate(file.uploadedAt) as Date)}` : ""}
                                  </p>
                                </div>
                              </div>
                              <ExternalLink className="h-4 w-4" />
                            </div>
                          );
                        })}
                      </div>

                      {courseFiles.length > 5 && (
                        <Link
                          to={`/courses/${course.code}/files`}
                          className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:gap-3"
                        >
                          View all {courseFiles.length} documents
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      )}
                    </>
                  )}

                  <Link
                    to="/slides"
                    className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:gap-3"
                  >
                    View all slides
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              {/* Upcoming Activities & Stats Section */}
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                {/* Upcoming Activities */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100">
                        <CalendarDays className="h-5 w-5 text-teal-700" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-base font-bold text-slate-900">Upcoming Activities</h2>
                        <p className="text-sm text-slate-600">Due within the next 7 days</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                        {calculateUpcomingActivities.length}
                      </span>
                      <Zap className="h-5 w-5 text-teal-600" />
                    </div>
                  </div>

                  {calculateUpcomingActivities.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                      <CheckCircle className="h-12 w-12 mx-auto text-slate-400 mb-3" />
                      <p className="text-sm font-semibold text-slate-700">No upcoming activities</p>
                      <p className="mt-1 text-xs text-slate-500">
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

                          const activityDescription = getPlainTextFromHtml(
                            String(activity.description || ""),
                          );

                          return (
                            <div key={activity.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                              <div>
                                <p className="truncate text-sm font-semibold text-slate-900">
                                  {activity.name}
                                </p>
                                <p className="truncate text-xs text-slate-500 text-slate-500">
                                  {activityDescription || "No description provided"}
                                </p>
                              </div>
                              <span className={`inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 ${diffDays === 0 ? "border-slate-200 bg-slate-100 text-slate-600" : ""}`}>
                                {diffDays === 0 ? "Today" : relativeDate}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <Link
                        to={`/courses/${course.code}/assessments`}
                        className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:gap-3"
                      >
                        View all activities
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </>
                  )}
                </div>

                {/* Assessment Stats */}
                {calculateAssessmentStats && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
                          <FileBarChart className="h-5 w-5 text-indigo-700" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-base font-bold text-slate-900">Assessment Stats</h2>
                          <p className="text-sm text-slate-600">Course evaluation overview</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                          {calculateAssessmentStats.totalAssessments}
                        </span>
                        <TrendingUp className="h-5 w-5 text-indigo-600" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <span className="truncate text-sm font-semibold text-slate-900">Graded</span>
                        <strong>{calculateAssessmentStats.gradedAssessments}</strong>
                      </div>
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <span className="truncate text-sm font-semibold text-slate-900">Pending</span>
                        <strong>{calculateAssessmentStats.pendingAssessments}</strong>
                      </div>
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <span className="truncate text-sm font-semibold text-slate-900">Overdue</span>
                        <strong>{calculateAssessmentStats.overdueAssessments}</strong>
                      </div>
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 pt-2 border-t border-slate-200">
                        <span className="truncate text-sm font-semibold text-slate-900">Total</span>
                        <strong>{calculateAssessmentStats.totalAssessments}</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* Grade Sheets Stats */}
                {calculateGradeSheetStats && calculateGradeSheetStats.totalSheets > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
                          <FileText className="h-5 w-5 text-violet-700" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-base font-bold text-slate-900">Grade Sheets</h2>
                          <p className="text-sm text-slate-600">Published evaluations</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                          {calculateGradeSheetStats.publishedSheets}/{calculateGradeSheetStats.totalSheets}
                        </span>
                        <Trophy className="h-5 w-5 text-violet-600" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <span className="truncate text-sm font-semibold text-slate-900">Published</span>
                        <strong>{calculateGradeSheetStats.publishedSheets}</strong>
                      </div>
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <span className="truncate text-sm font-semibold text-slate-900">Total Sheets</span>
                        <strong>{calculateGradeSheetStats.totalSheets}</strong>
                      </div>

                      {calculateGradeSheetStats.gradingPeriods.length > 0 && (
                        <div className="pt-3 border-t border-slate-200">
                          <p className="text-sm text-slate-600 mb-2">Grading Periods</p>
                          <div className="flex flex-wrap gap-2">
                            {calculateGradeSheetStats.gradingPeriods.map((period) => (
                              <span key={period} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">
                                {period.replace("quarter", "Q")}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {showClassroomHeader && (
                <div className="px-1 pt-1">
                  <p className="text-base font-bold text-slate-900">Classroom</p>
                  <p className="text-sm text-slate-600">
                    {isOnboardingCourseContext
                      ? "Teachers and onboarding status"
                      : "Students and grading detail"}
                  </p>
                </div>
              )}

              {/* My Grades Section - Solo para estudiantes */}
              {isStudentView && user && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
                        <Trophy className="h-5 w-5 text-amber-700" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-base font-bold text-slate-900">My Grades</h2>
                        <p className="text-sm text-slate-600">Performance in this course</p>
                      </div>
                    </div>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                      {publishedGradeSheetsForCourse.length} published
                    </span>
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
                            return 'Invalid date';
                          }
                        };

                        return (
                          <div key={sheet.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                            <div>
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {sheet.title}
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                {sheet.gradingPeriod || 'No period'} • {formatDateSafe(sheet.updatedAt)}
                              </p>
                            </div>
                            <span className={`inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 ${isPassing ? 'inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                              {grade > 0 ? grade.toFixed(1) : '--'}
                            </span>
                          </div>
                        );
                      })}

                    {publishedGradeSheetsForCourse.length === 0 && (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                        <FileText className="h-12 w-12 mx-auto text-slate-400 mb-3" />
                        <p className="text-sm font-semibold text-slate-700">No grades available yet</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Your grades will appear here once the teacher publishes evaluations
                        </p>
                      </div>
                    )}
                  </div>

                  {publishedGradeSheetsForCourse.length > 3 && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <Link
                        to={`/grades?course=${id}`}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:gap-3"
                      >
                        View all {publishedGradeSheetsForCourse.length} grade sheets
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {/* Students Section (Teacher only) */}
              {canViewTeacherClassroomSection && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100">
                        <Users className="h-5 w-5 text-teal-700" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-base font-bold text-slate-900">Students</h2>
                        <p className="text-sm text-slate-600">
                          {isOnboardingCourseContext
                            ? `${enrolledStudents.length} teachers enrolled`
                            : `${enrolledStudents.length} enrolled • ${availableStudents.length} available`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                        {filteredStudents.length}/{enrolledStudents.length}
                      </span>
                      <button
                        onClick={() => setShowEnrollModal(true)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                      >
                        <UserPlus className="h-4 w-4" />
                        Add
                      </button>
                    </div>
                  </div>

                  {loadingStudents ? (
                    <div className="min-h-[400px] flex items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                    </div>
                  ) : enrolledStudents.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                      <Users className="h-12 w-12 mx-auto text-slate-400 mb-4" />
                      <p className="text-sm font-semibold text-slate-700">There are no enrolled students</p>
                      <p className="mt-1 text-xs text-slate-500 mb-4">
                        Add students to this course to get started with your classes
                      </p>
                      <button
                        onClick={() => setShowEnrollModal(true)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                      >
                        <UserPlus className="h-4 w-4" />
                        Add First Student
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="flex flex-col sm:flex-row gap-3 mb-4">
                        <div className="flex-1">
                          <div className="relative">
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                              <input
                                type="text"
                                placeholder="Search students..."
                                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 pl-10"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button 
                            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                          >
                            <SortAsc className={`h-4 w-4 ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
                            {sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
                          </button>
                          <div className="relative group">
                            <button className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                              <Filter className="h-4 w-4" />
                              Filter
                            </button>
                            <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-2 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                              <button
                                onClick={() => setGradeFilter('all')}
                                className={`flex items-center gap-2 px-4 py-2 text-sm w-full ${
                                  gradeFilter === 'all' 
                                    ? 'bg-slate-100 text-slate-700 font-medium' 
                                    : 'text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <Users className="h-4 w-4" />
                                All Students
                              </button>
                              <button
                                onClick={() => setGradeFilter('passing')}
                                className={`flex items-center gap-2 px-4 py-2 text-sm w-full ${
                                  gradeFilter === 'passing' 
                                    ? 'bg-slate-100 text-slate-700 font-medium' 
                                    : 'text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                                {isOnboardingCourseContext ? "Approved" : "Passing (≥3.5)"}
                              </button>
                              <button
                                onClick={() => setGradeFilter('at-risk')}
                                className={`flex items-center gap-2 px-4 py-2 text-sm w-full ${
                                  gradeFilter === 'at-risk' 
                                    ? 'bg-slate-100 text-slate-700 font-medium' 
                                    : 'text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <AlertTriangle className="h-4 w-4" />
                                {isOnboardingCourseContext ? "In Progress" : "At Risk (3.0-3.4)"}
                              </button>
                              <button
                                onClick={() => setGradeFilter('failing')}
                                className={`flex items-center gap-2 px-4 py-2 text-sm w-full ${
                                  gradeFilter === 'failing' 
                                    ? 'bg-slate-100 text-slate-700 font-medium' 
                                    : 'text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <AlertCircle className="h-4 w-4" />
                                {isOnboardingCourseContext ? "Failed" : "Failing (&lt;3.0)"}
                              </button>
                            </div>
                          </div>
                        </div> 
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {filteredStudents.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center md:col-span-2 xl:col-span-3">
                            <Search className="h-12 w-12 mx-auto text-slate-400 mb-4" />
                            <p className="text-sm font-semibold text-slate-700">No students found</p>
                            <p className="mt-1 text-xs text-slate-500">
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
                            const onboardingProgress = getOnboardingProgressMeta(
                              student.teacherOnboardingStatus,
                            );

                            return (
                              <div key={student.id} className="rounded-xl border border-slate-200 bg-white p-3 h-full">
                                <div className="flex items-start gap-3">
                                  <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 overflow-hidden">
                                    {student.avatarUrl ? (
                                      <img
                                        src={student.avatarUrl}
                                        alt={student.name || "Student avatar"}
                                        className="h-full w-full object-cover"
                                      />
                                    ) : (
                                      <span>{student.avatarEmoji || student.name.charAt(0)}</span>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <h3 className="text-sm font-semibold text-slate-900 truncate">
                                      {student.name}
                                    </h3>
                                    <p className="text-xs text-slate-500 truncate">
                                      {student.email}
                                    </p>
                                    
                                  </div>
                                  <button
                                    onClick={() => handleUnenrollStudent(student.id)}
                                    className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                                    title="Remove student"
                                  >
                                    <UserMinus className="h-4 w-4" />
                                  </button>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                  {isOnboardingCourseContext ? (
                                    <span
                                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${onboardingProgress.badgeClassName}`}
                                    >
                                      {onboardingProgress.label}
                                    </span>
                                  ) : hasGrades ? (
                                    <>
                                      <span className="text-xs font-semibold text-slate-700">
                                        {avgGrade.toFixed(1)}/5.0
                                      </span>
                                      <span className={`inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 ${
                                        gradeStatus === 'passing' ? '' : 
                                        gradeStatus === 'at-risk' ? 'border-slate-200 bg-slate-100 text-slate-600' : 'border-slate-200 bg-slate-100 text-slate-600'
                                      }`}>
                                        {gradeStatus === 'passing' ? 'Passing' : 
                                         gradeStatus === 'at-risk' ? 'At Risk' : 'Failing'}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 border-slate-200 bg-slate-100 text-slate-600">No grades</span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {filteredStudents.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-slate-200">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
                            <span>
                              Showing {filteredStudents.length} of {enrolledStudents.length} students
                            </span>
                            {searchTerm && (
                              <button
                                onClick={() => {
                                  setSearchTerm('');
                                  setGradeFilter('all');
                                }}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 font-medium"
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
                  <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
                    <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-sky-50 via-indigo-50/70 to-violet-50 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-200 bg-white/85 shadow-sm">
                          <UserPlus className="h-5 w-5 text-sky-600" />
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-slate-900">Add Students</h3>
                          <p className="mt-1 text-xs text-slate-500">{course?.name}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setShowEnrollModal(false);
                          setAvailableStudents([]);
                          setSearchTerm("");
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition hover:bg-white hover:text-slate-800"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="p-4">
                      <div className="mb-4">
                        <div className="relative">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <input
                              type="text"
                              placeholder="Search students..."
                              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 pl-10"
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                            /> 
                          </div>
                        </div>
                      </div>

                      {loadingAvailable ? (
                        <div className="min-h-[400px] flex items-center justify-center py-8">
                          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                        </div>
                      ) : filteredAvailableStudents.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                          <Users className="h-12 w-12 mx-auto text-slate-400 mb-3" />
                          <p className="text-sm font-semibold text-slate-700">
                            {availableStudents.length === 0
                              ? "All students are already enrolled"
                              : "No results found"}
                          </p>
                          {availableStudents.length > 0 && (
                            <p className="mt-1 text-xs text-slate-500">
                              Try different search terms
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {filteredAvailableStudents.map((student) => (
                            <div key={student.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                              <div className="min-w-0 flex items-center gap-3">
                                <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 overflow-hidden">
                                  <span>{student.name.charAt(0)}</span>
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900">{student.name}</p>
                                  <p className="truncate text-xs text-slate-500">{student.email}</p>
                                </div>
                              </div>
                              {(() => {
                                const canEnrollByPlan =
                                  !isTeacherPlanExpiredForEnrollment &&
                                  (!hasReachedTeacherStudentQuotaForEnrollment ||
                                    teacherManagedStudentIdsForEnrollment.has(student.id));
                                return (
                              <button
                                onClick={() => handleEnrollStudent(student.id)}
                                disabled={!canEnrollByPlan}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
                                title={
                                  canEnrollByPlan
                                    ? "Enroll student"
                                    : isTeacherPlanExpiredForEnrollment
                                      ? "Plan expired. Renew payment to enroll students."
                                      : `Plan limit reached (${teacherPlanStudentLimitForEnrollment} students).`
                                }
                              >
                                {canEnrollByPlan ? "Add" : "Limit reached"}
                              </button>
                                );
                              })()}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Courses List View
  const userCourses = userAccessibleCourses;
  const teacherManagedCourses = isTeacher
    ? userCourses.filter((course) => course.teacherId === user?.id)
    : userCourses;
  const teacherPlanCourseLimit =
    typeof user?.teacherPlanCourseLimit === "number" && user.teacherPlanCourseLimit > 0
      ? user.teacherPlanCourseLimit
      : null;
  const teacherPlanStudentLimit =
    typeof user?.teacherPlanStudentLimit === "number" && user.teacherPlanStudentLimit > 0
      ? user.teacherPlanStudentLimit
      : null;
  const isTeacherPlanBlocked =
    isTeacher &&
    isTeacherPlanExpired({
      role: user?.role,
      teacherPlanStatus: user?.teacherPlanStatus,
      teacherPlanExpiresAt: user?.teacherPlanExpiresAt,
    });
  const managedStudentIds = new Set<string>();
  for (const ownedCourse of teacherManagedCourses) {
    for (const studentId of ownedCourse.enrolledStudents || []) {
      if (typeof studentId === "string" && studentId.trim().length > 0) {
        managedStudentIds.add(studentId);
      }
    }
  }
  const usedStudentQuota = managedStudentIds.size;
  const remainingCourseQuota = teacherPlanCourseLimit
    ? Math.max(0, teacherPlanCourseLimit - teacherManagedCourses.length)
    : null;
  const remainingStudentQuota = teacherPlanStudentLimit
    ? Math.max(0, teacherPlanStudentLimit - usedStudentQuota)
    : null;
  const canCreateCourse =
    !isTeacherPlanBlocked &&
    (!teacherPlanCourseLimit || teacherManagedCourses.length < teacherPlanCourseLimit);
  const courseGradientMap = buildCourseGradientMap(userCourses);

  const userCourseIdSet = new Set(userCourses.map((course) => course.id));
  const totalAssessmentsInScope = assessments.filter((assessment) =>
    userCourseIdSet.has(assessment.courseId),
  ).length;
  const totalLessonsInScope = units.filter((unit) => userCourseIdSet.has(unit.courseId)).length;
  const totalCreditsInScope = userCourses.reduce(
    (sum, item) => sum + (Number(item.credits) || 0),
    0,
  );
  const totalParticipantsInScope = userCourses.reduce(
    (sum, item) => sum + (item.enrolledStudents?.length || 0),
    0,
  );
  const upcomingInScope = assessments.filter((assessment) => {
    if (!userCourseIdSet.has(assessment.courseId) || !assessment.dueDate) return false;
    const dueRaw = String(assessment.dueDate);
    let dueDate: Date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dueRaw)) {
      const [year, month, day] = dueRaw.split("-").map(Number);
      dueDate = new Date(year, month - 1, day);
    } else {
      dueDate = new Date(dueRaw);
    }
    if (Number.isNaN(dueDate.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    const dueOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
    return dueOnly >= today && dueOnly <= nextWeek;
  }).length;

  return (
    <DashboardLayout contentClassName="pt-0 lg:pt-1">
      <div className="relative overflow-x-hidden ">
        <div className="pointer-events-none absolute rounded-full blur-[40px] -left-16 top-8 h-40 w-40 bg-white/70" />
        <div className="pointer-events-none absolute rounded-full blur-[40px] -right-10 bottom-8 h-44 w-44 bg-slate-300/50" />

        <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
            <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-sky-200/35" />
            <div className="pointer-events-none absolute -right-24 -bottom-24 h-64 w-64 rounded-full bg-indigo-200/35" />

            <div className="relative z-10">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                    <Sparkles className="h-3.5 w-3.5" />
                    Course Hub
                  </div>
                  <h2 className="mt-3 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                    {isTeacherView ? "Teaching courses overview" : "My enrolled courses"}
                  </h2>
                  <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                    {isTeacherView
                      ? "Track active classes, upcoming deadlines, and classroom progress from one place."
                      : "Access your learning spaces, activities and materials from one place."}
                  </p>
                  {isTeacher && (teacherPlanCourseLimit || teacherPlanStudentLimit) && (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {teacherPlanCourseLimit && (
                        <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 font-semibold text-sky-700">
                          Courses: {teacherManagedCourses.length}/{teacherPlanCourseLimit} (remaining {remainingCourseQuota})
                        </span>
                      )}
                      {teacherPlanStudentLimit && (
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                          Students: {usedStudentQuota}/{teacherPlanStudentLimit} (remaining {remainingStudentQuota})
                        </span>
                      )}
                      {isTeacherPlanBlocked && (
                        <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 font-semibold text-rose-700">
                          Plan expired. Renew payment to continue.
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="inline-flex items-center gap-2">
                  {isStudentView && (
                    <button
                      type="button"
                      onClick={() => {
                        setJoinError("");
                        setJoinSuccess("");
                        setPendingJoinCourse(null);
                        setShowJoinCodeModal(true);
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
                    >
                      <UserPlus className="h-4 w-4" />
                      Join another course
                    </button>
                  )}
                  {isTeacher && (
                    canCreateCourse ? (
                      <Link to="/courses/create" className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap">
                        <Plus className="h-4 w-4" />
                        New course
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500 whitespace-nowrap"
                        title={
                          isTeacherPlanBlocked
                            ? "Plan expired. Renew payment to create new courses."
                            : "You reached your current course quota."
                        }
                      >
                        <Plus className="h-4 w-4" />
                        {isTeacherPlanBlocked ? "Payment required" : "Course limit reached"}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-teal-100 text-teal-700">
                      <BookOpen className="h-4 w-4" />
                    </div>
                    <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{userCourses.length}</p>
                  </div>
                  <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Courses</p>
                </div>
                <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                      <FileBarChart className="h-4 w-4" />
                    </div>
                    <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{totalAssessmentsInScope}</p>
                  </div>
                  <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Assessments</p>
                </div>
                <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                      <CalendarDays className="h-4 w-4" />
                    </div>
                    <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{upcomingInScope}</p>
                  </div>
                  <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Next 7 days</p>
                </div>
                <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                      <Users className="h-4 w-4" />
                    </div>
                    <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{totalParticipantsInScope}</p>
                  </div>
                  <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">
                    {isTeacherView ? "Students" : "Classmates"}
                  </p>
                </div>
                <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                      <Presentation className="h-4 w-4" />
                    </div>
                    <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{totalLessonsInScope}</p>
                  </div>
                  <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Lessons</p>
                </div>
                <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
                      <CreditCard className="h-4 w-4" />
                    </div>
                    <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{totalCreditsInScope}</p>
                  </div>
                  <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Credits</p>
                </div>
              </div>
            </div>
          </section>

          {userCourses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <div className="relative mx-auto mb-4 w-fit">
                <div className="relative flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-sm">
                  {isTeacherView ? (
                    <BookOpen className="h-7 w-7 text-white" />
                  ) : (
                    <GraduationCap className="h-7 w-7 text-white" />
                  )}
                </div>
              </div>

              <h3 className="mb-2 text-xl font-bold text-slate-900">
                {isTeacherView ? "Start your first course" : "Start your learning journey"}
              </h3>
              <p className="mx-auto mb-5 mt-1 max-w-md text-sm text-slate-500">
                {isTeacherView
                  ? "Create your first course to manage students, content and assessments."
                  : "Join your first course to access grades, activities, and study materials."}
              </p>

              {isTeacher ? (
                <Link
                  to="/courses/create"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-5 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                >
                  <Plus className="h-4 w-4" />
                  Create First Course
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : isAdmin ? (
                <p className="text-sm font-medium text-slate-600">
                  No courses are available yet. You can monitor all courses from this page once they are created.
                </p>
              ) : (
                <div className="mx-auto w-full max-w-md">
                  <div className="mb-4">
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      <Sparkles className="h-3.5 w-3.5" />
                      Course access
                    </div>
                    <p className="mb-2 mt-3 text-center text-sm text-slate-600">
                      Enter your course access code
                    </p>
                  </div>

                  <div className="mx-auto mb-3 grid w-full max-w-md grid-cols-3 gap-1.5 text-xs">
                    <div className="flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white/80 px-2.5 py-1.5 text-slate-600">
                      <Percent className="h-3.5 w-3.5" />
                      Grades
                    </div>
                    <div className="flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white/80 px-2.5 py-1.5 text-slate-600">
                      <FileCheck className="h-3.5 w-3.5" />
                      Activities
                    </div>
                    <div className="flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white/80 px-2.5 py-1.5 text-slate-600">
                      <BookOpen className="h-3.5 w-3.5" />
                      Materials
                    </div>
                  </div>

                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm">
                    <div className="relative">
                      <div className="relative">
                        <School className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                          id="join-course-code"
                          type="text"
                          value={joinCourseCode}
                          onChange={(event) => {
                            setJoinCourseCode(event.target.value.toUpperCase());
                            if (pendingJoinCourse) setPendingJoinCourse(null);
                          }}
                          placeholder="ENG-123"
                          className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 pl-10"
                          autoComplete="off"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleJoinCourseByCode}
                      disabled={joinLoading || !joinCourseCode.trim()}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {joinLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Joining course...
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          <Rocket className="h-4 w-4" />
                          Join course
                          <UserPlus className="h-4 w-4" />
                          <ArrowRight className="h-4 w-4" />
                        </span>
                      )}
                    </button>
                  </div>

                  {joinError && (
                    <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      <p className="text-sm text-red-600">{joinError}</p>
                    </div>
                  )}
                  
                  {joinSuccess && (
                    <div className="mt-4 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 p-3">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <p className="text-sm text-green-600">{joinSuccess}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {userCourses.map((course, courseIndex) => {
                const courseAssessments = assessments.filter(
                  (a) => a.courseId === course.id,
                );
                const enrolledCount = course.enrolledStudents?.length || 0;
                const lessonsCount = units.filter((unit) => unit.courseId === course.id).length;
                const courseSchedule = normalizeCourseSchedule(course.classSchedule);
                const coverUrl = course.coverUrl?.trim() || "";
                const courseAverage = isTeacher
                  ? (() => {
                      const stats = calculateCourseRealStats(
                        course.id,
                        course.enrolledStudents || [],
                        grades,
                        gradeSheets,
                      );
                      return stats.studentsWithGrades > 0 ? stats.averageGrade : null;
                    })()
                  : user?.id
                    ? calculateRealCourseGrade(course.id, user.id)
                    : null;
                const badgeText = courseAverage !== null ? courseAverage.toFixed(1) : "N/A";
                const descriptionText = course.description
                  ? getPlainTextFromHtml(course.description)
                  : "No description";
                const upcomingCourseCount = assessments.filter((assessment) => {
                  if (assessment.courseId !== course.id || !assessment.dueDate) return false;
                  const dueRaw = String(assessment.dueDate);
                  let dueDate: Date;
                  if (/^\d{4}-\d{2}-\d{2}$/.test(dueRaw)) {
                    const [year, month, day] = dueRaw.split("-").map(Number);
                    dueDate = new Date(year, month - 1, day);
                  } else {
                    dueDate = new Date(dueRaw);
                  }
                  if (Number.isNaN(dueDate.getTime())) return false;
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const nextWeek = new Date(today);
                  nextWeek.setDate(today.getDate() + 7);
                  const dueOnly = new Date(
                    dueDate.getFullYear(),
                    dueDate.getMonth(),
                    dueDate.getDate(),
                  );
                  return dueOnly >= today && dueOnly <= nextWeek;
                }).length;
                const creditsLabel =
                  course.credits && course.credits > 0
                    ? `${course.credits} Credits`
                    : "No credits";
                const courseGradient =
                  courseGradientMap.get(getCourseGradientSeed(course, courseIndex)) ||
                  COURSE_COVER_GRADIENTS[0];

                return (
                  <Link
                    key={course.id}
                    to={`/courses/view/${course.code}`}
                    className="flex min-h-full flex-col gap-3 rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-3 text-inherit no-underline shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_16px_30px_rgba(30,64,175,0.14)]"
                  >
                    <div className="relative h-36 overflow-hidden rounded-xl bg-slate-200">
                      {coverUrl ? (
                        <img
                          src={coverUrl}
                          alt={course.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div
                          className={`h-full w-full ${courseGradient}`}
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-slate-900/25" />

                      <div className="absolute left-2 top-2 right-2 flex items-center gap-1.5 min-w-0">
                        <span className="inline-flex max-w-[72%] items-center truncate rounded-full bg-slate-900/80 px-2 py-0.5 text-xs font-bold text-slate-50">
                          {course.code || "Course"}
                        </span>
                        {course.semester && (
                          <span className="ml-auto inline-flex max-w-[45%] items-center truncate rounded-full bg-slate-50/90 px-2 py-0.5 text-xs font-semibold text-slate-900">
                            {course.semester}
                          </span>
                        )}
                      </div>

                      <div className="absolute bottom-2 right-2">
                        <div
                          className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-900/85 text-white shadow-[0_12px_18px_rgba(15,23,42,0.26)]"
                          title={courseAverage !== null ? "Average grade" : "No grades yet"}
                        >
                          <span className="text-[15px] font-bold leading-none">{badgeText}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex min-w-0 flex-col gap-2">
                      <p className="m-0 truncate text-[11px] font-semibold leading-[0.95rem] text-slate-700">
                        {course.teacherName || "Instructor"}
                        {course.group ? ` • Group ${course.group}` : ""}
                      </p>

                      <div className="flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
                          <CalendarDays className="h-3 w-3" />
                          {upcomingCourseCount} upcoming
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 max-w-full">
                          <Clock className="h-3 w-3" />
                          <span className="truncate">{formatScheduleSummary(courseSchedule)}</span>
                        </span>
                      </div>

                      <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-slate-900">
                        {course.name}
                      </h3>

                      <p className="line-clamp-2 text-xs leading-4 text-slate-500">
                        {descriptionText}
                      </p>

                      <div className="mt-0.5 flex flex-wrap gap-1.5">
                        <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold leading-3 text-slate-700">
                          <FileBarChart className="h-3 w-3 shrink-0 text-slate-700" />
                          <span className="whitespace-nowrap">
                            {courseAssessments.length} Assessments
                          </span>
                        </div>
                        <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold leading-3 text-slate-700">
                          <BookOpen className="h-3 w-3 shrink-0 text-slate-700" />
                          <span className="whitespace-nowrap">{lessonsCount} Lessons</span>
                        </div>
                        <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold leading-3 text-slate-700">
                          <Users className="h-3 w-3 shrink-0 text-slate-700" />
                          <span className="whitespace-nowrap">{enrolledCount} Students</span>
                        </div>
                      </div>

                      <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-200 pt-2">
                        <span className="text-[11px] font-semibold text-slate-600">{creditsLabel}</span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700">
                          Open course
                          <ChevronRight className="h-3 w-3" />
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {showJoinCodeModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
              <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
                <div className="flex items-start justify-between border-b border-slate-200 bg-gradient-to-r from-sky-50 via-indigo-50/70 to-violet-50 px-5 py-4">
                  <div>
                    <p className="text-base font-semibold text-slate-900">Join another course</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Enter a new course code to enroll in an additional class.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowJoinCodeModal(false)}
                    disabled={joinLoading}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition hover:bg-white hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Close join code modal"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-4 px-5 py-5">
                  <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
                    <School className="h-3.5 w-3.5" />
                    Use the access code shared by your teacher.
                  </div>

                  <div className="space-y-3">
                    <div className="relative">
                      <School className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="join-course-code-modal"
                        type="text"
                        value={joinCourseCode}
                        onChange={(event) => {
                          setJoinCourseCode(event.target.value.toUpperCase());
                          if (pendingJoinCourse) setPendingJoinCourse(null);
                        }}
                        placeholder="e.g. ENG-2024-A1"
                        className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                        autoComplete="off"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleJoinCourseByCode}
                      disabled={joinLoading || !joinCourseCode.trim()}
                      className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {joinLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Checking course...
                        </>
                      ) : (
                        <>
                          <UserPlus className="mr-2 h-4 w-4" />
                          Continue
                        </>
                      )}
                    </button>
                  </div>

                  {joinError && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>{joinError}</p>
                    </div>
                  )}
                  {joinSuccess && (
                    <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>{joinSuccess}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {pendingJoinCourse && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
              <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
                <div className="flex items-start justify-between border-b border-slate-200 bg-gradient-to-r from-sky-50 via-indigo-50/70 to-violet-50 px-5 py-4">
                  <div>
                    <p className="text-base font-semibold text-slate-900">Confirm course enrollment</p>
                    <p className="mt-1 text-sm text-slate-600">Review the course details before joining.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingJoinCourse(null)}
                    disabled={joinLoading}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition hover:bg-white hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Close confirmation modal"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-4 px-5 py-5">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <p className="text-lg font-semibold text-slate-900">{pendingJoinCourse.name}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        {pendingJoinCourse.code}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                        Group {pendingJoinCourse.group || "N/A"}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                        {pendingJoinCourse.status}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Teacher</p>
                        <p className="truncate text-sm font-semibold text-slate-800">{pendingJoinCourse.teacherName}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Semester</p>
                        <p className="truncate text-sm font-semibold text-slate-800">{pendingJoinCourse.semester || "N/A"}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Credits</p>
                        <p className="text-sm font-semibold text-slate-800">{pendingJoinCourse.credits > 0 ? pendingJoinCourse.credits : "N/A"}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Students enrolled</p>
                        <p className="text-sm font-semibold text-slate-800">{pendingJoinCourse.enrolledCount}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 sm:col-span-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Class schedule</p>
                        <p className="text-sm font-semibold text-slate-800">{pendingJoinCourse.scheduleSummary}</p>
                        {pendingJoinCourse.scheduleDetail && (
                          <p className="mt-1 text-xs text-slate-500">{pendingJoinCourse.scheduleDetail}</p>
                        )}
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 sm:col-span-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Description</p>
                        <p className="text-sm font-semibold text-slate-800">{pendingJoinCourse.description || "No description"}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setPendingJoinCourse(null)}
                      disabled={joinLoading}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmJoinCourse}
                      disabled={joinLoading}
                      className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {joinLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Joining...
                        </>
                      ) : (
                        "Confirm join"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
