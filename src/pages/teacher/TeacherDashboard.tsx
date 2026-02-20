import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademic } from "@/contexts/AcademicContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { format } from "date-fns";
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
  Zap,
  CalendarClock,
  UserCheck,
  ChevronDown,
  Building,
  AlertCircle,
  Clock,
  FolderOpen,
  ListChecks,
  Download,
  Upload,
  Trash2,
  X,
} from "lucide-react";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { firebaseDB } from "@/lib/firebase";
import { enUS } from "date-fns/locale";
import {
  courseBackupService,
  type CourseBackupSnapshot,
} from "@/lib/services/courseBackupService";

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

interface Submission {
  id: string;
  assessmentId: string;
  studentId: string;
  status: string;
  grade?: number;
  submittedAt: Timestamp;
  gradedAt?: Timestamp;
  wordCount?: number;
  characterCount?: number;
  content?: string;
}

const stripHtmlPreview = (value?: string): string => {
  if (!value) return "";
  try {
    const doc = new DOMParser().parseFromString(value, "text/html");
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  } catch {
    return value
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
};

interface Slide {
  id: string;
  title: string;
  description: string;
  canvaUrl: string;
  createdAt: Timestamp;
  weekId: string;
  order: number;
}

interface CourseSlide extends Slide {
  weekNumber: number;
  weekTopic: string;
  unitName: string;
  unitId: string;
  hasValidWeek: boolean;
  hasValidUnit: boolean;
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

interface Period {
  id: string;
  courseId: string;
  name: string;
  number: number;
  order: number;
}

interface CourseWeek {
  id: string;
  courseId: string;
  periodId: string;
  number: number;
  topic: string;
  order: number;
}

interface CourseFile {
  id: string;
  courseId: string;
  periodId?: string;
  weekId?: string;
  name: string;
  type: string;
  size: number;
  uploadedBy: string;
  uploadedAt?: Timestamp;
  url?: string;
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
  const { selectedCourseId, setSelectedCourseId } = useAcademic();
  const navigate = useNavigate();

  const [gradeSheets, setGradeSheets] = useState<GradeSheet[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [courseWeeks, setCourseWeeks] = useState<CourseWeek[]>([]);
  const [courseFiles, setCourseFiles] = useState<CourseFile[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCourseDropdown, setShowCourseDropdown] = useState(false);
  const [showBackupCenter, setShowBackupCenter] = useState(false);
  const [loadingBackupSnapshots, setLoadingBackupSnapshots] = useState(false);
  const [backupSnapshots, setBackupSnapshots] = useState<
    CourseBackupSnapshot[]
  >([]);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const restoreFileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) || null,
    [courses, selectedCourseId],
  );

  useEffect(() => {
    if (isAuthenticated && user?.role === "estudiante") {
      navigate("/students", { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  useEffect(() => {
    const loadAllData = async () => {
      if (!user?.id) return;

      setLoading(true);

      try {
        await Promise.all([
          fetchCourses(),
          fetchGradeSheets(),
          fetchAssessments(),
          fetchSubmissions(),
          fetchAllSlides(),
          fetchAllUnits(),
          fetchAllWeeks(),
          fetchPeriods(),
          fetchCourseWeeks(),
          fetchCourseFiles(),
          fetchStudents(),
        ]);
      } catch {
        return;
      } finally {
        setLoading(false);
      }
    };

    if (isAuthenticated && user?.role === "docente") {
      loadAllData();
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (courses.length === 0) {
      if (selectedCourseId) setSelectedCourseId("");
      return;
    }

    const hasSelected = selectedCourseId
      ? courses.some((course) => course.id === selectedCourseId)
      : false;

    if (!hasSelected) {
      setSelectedCourseId(courses[0].id);
    }
  }, [courses, selectedCourseId, setSelectedCourseId]);

  useEffect(() => {
    if (
      !isAuthenticated ||
      user?.role !== "docente" ||
      !user?.id ||
      courses.length === 0
    ) {
      return;
    }

    void courseBackupService.runAutoBackupIfDue(
      { id: user.id, name: user.name || "Teacher" },
      courses.map((course) => course.id),
      24,
    );
  }, [courses, isAuthenticated, user?.id, user?.name, user?.role]);

  const handleCourseChange = (course: Course) => {
    setSelectedCourseId(course.id);
    setShowCourseDropdown(false);
  };

  const loadBackupSnapshots = async () => {
    if (!user?.id) return;
    setLoadingBackupSnapshots(true);
    try {
      await courseBackupService.cleanupOldTeacherBackups(user.id, 7);
      const snapshots = await courseBackupService.listTeacherBackups(user.id);
      setBackupSnapshots(snapshots);
    } catch {
      setBackupSnapshots([]);
    } finally {
      setLoadingBackupSnapshots(false);
    }
  };

  const openBackupCenter = async () => {
    await loadBackupSnapshots();
    setShowBackupCenter(true);
  };

  const handleSaveSnapshot = async () => {
    if (!user?.id || !selectedCourse) return;
    setIsExportingBackup(true);
    try {
      await courseBackupService.saveBackupSnapshot(selectedCourse.id, {
        id: user.id,
        name: user.name || "Teacher",
      });
      await loadBackupSnapshots();
      alert("Snapshot saved successfully.");
    } catch (error: any) {
      alert(`Could not save snapshot: ${error?.message || "Unknown error"}`);
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handleExportBackup = async () => {
    if (!selectedCourse) return;
    setIsExportingBackup(true);
    try {
      const backup = await courseBackupService.exportCourseBackup(
        selectedCourse.id,
      );
      courseBackupService.downloadBackupFile(backup);
      alert("Backup exported successfully.");
    } catch (error: any) {
      alert(`Could not export backup: ${error?.message || "Unknown error"}`);
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handleRestoreBackupClick = () => {
    restoreFileInputRef.current?.click();
  };

  const handleRestoreBackupFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user?.id) return;

    setIsRestoringBackup(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const restored = await courseBackupService.restoreCourseBackup(parsed, {
        id: user.id,
        name: user.name || "Teacher",
      });
      alert(
        `Backup restored as "${restored.newCourseName}" (${restored.newCourseCode}).`,
      );
      setShowBackupCenter(false);
      navigate(`/courses/view/${restored.newCourseCode}`);
    } catch (error: any) {
      alert(
        `Could not restore backup: ${error?.message || "Invalid backup file"}`,
      );
    } finally {
      setIsRestoringBackup(false);
    }
  };

  const handleRestoreSnapshot = async (snapshotId: string) => {
    if (!user?.id) return;
    setIsRestoringBackup(true);
    try {
      const restored = await courseBackupService.restoreFromSnapshot(
        snapshotId,
        {
          id: user.id,
          name: user.name || "Teacher",
        },
      );
      alert(
        `Snapshot restored as "${restored.newCourseName}" (${restored.newCourseCode}).`,
      );
      setShowBackupCenter(false);
      navigate(`/courses/view/${restored.newCourseCode}`);
    } catch (error: any) {
      alert(`Could not restore snapshot: ${error?.message || "Unknown error"}`);
    } finally {
      setIsRestoringBackup(false);
    }
  };

  const handleDeleteSnapshot = async (snapshotId: string) => {
    if (!confirm("Delete this backup snapshot?")) return;
    try {
      await courseBackupService.deleteSnapshot(snapshotId);
      await loadBackupSnapshots();
    } catch (error: any) {
      alert(`Could not delete snapshot: ${error?.message || "Unknown error"}`);
    }
  };

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
    } catch {
      return;
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
    } catch {
      return;
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

      assessmentList.sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });

      setAssessments(assessmentList);
    } catch {
      return;
    }
  };

  const fetchSubmissions = async () => {
    try {
      const submissionsRef = collection(firebaseDB, "submissions");
      const querySnapshot = await getDocs(submissionsRef);

      const submissionsList: Submission[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        submissionsList.push({
          id: doc.id,
          assessmentId: data.assessmentId || "",
          studentId: data.studentId || "",
          status: data.status || "pending",
          grade: data.grade,
          submittedAt: data.submittedAt || Timestamp.now(),
          gradedAt: data.gradedAt,
          wordCount: data.wordCount,
          characterCount: data.characterCount,
          content: data.content,
        });
      });

      setSubmissions(submissionsList);
    } catch {
      return;
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
    } catch {
      return;
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
    } catch {
      return;
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
    } catch {
      return;
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
    } catch {
      return;
    }
  };

  const fetchPeriods = async () => {
    try {
      const periodsRef = collection(firebaseDB, "periods");
      const querySnapshot = await getDocs(periodsRef);

      const periodList: Period[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        periodList.push({
          id: doc.id,
          courseId: data.courseId || "",
          name: data.name || "",
          number: data.number || 0,
          order: data.order || 0,
        });
      });

      setPeriods(periodList);
    } catch {
      return;
    }
  };

  const fetchCourseWeeks = async () => {
    try {
      const weeksRef = collection(firebaseDB, "weeks");
      const querySnapshot = await getDocs(weeksRef);

      const weekList: CourseWeek[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        weekList.push({
          id: doc.id,
          courseId: data.courseId || "",
          periodId: data.periodId || "",
          number: data.number || 0,
          topic: data.topic || "",
          order: data.order || 0,
        });
      });

      setCourseWeeks(weekList);
    } catch {
      return;
    }
  };

  const fetchCourseFiles = async () => {
    try {
      const filesRef = collection(firebaseDB, "course_files");
      const querySnapshot = await getDocs(filesRef);

      const filesList: CourseFile[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        filesList.push({
          id: doc.id,
          courseId: data.courseId || "",
          periodId: data.periodId || "",
          weekId: data.weekId || "",
          name: data.name || "",
          type: data.type || "",
          size: data.size || 0,
          uploadedBy: data.uploadedBy || "",
          uploadedAt: data.uploadedAt,
          url: data.url || "",
        });
      });

      setCourseFiles(filesList);
    } catch {
      return;
    }
  };

  const getCourseStudents = () => {
    if (!selectedCourse) return [];
    const enrolledIds = new Set(selectedCourse.enrolledStudents || []);

    // Prefer explicit enrollment in the course document; fallback to legacy student.courses links.
    const matched = students.filter(
      (student) =>
        enrolledIds.has(student.id) ||
        student.courses?.includes(selectedCourse.id),
    );

    // Ensure unique students when both sources contain the same student.
    const uniqueById = new Map<string, Student>();
    matched.forEach((student) => uniqueById.set(student.id, student));
    return Array.from(uniqueById.values());
  };

  const getCourseAssessments = () => {
    if (!selectedCourse) return [];

    return assessments.filter((a) => a.courseId === selectedCourse.id);
  };

  const isAnnouncementAssessment = (assessment: Assessment) => {
    return (
      assessment.assessmentType === "announcement" ||
      (assessment.type as string) === "announcement"
    );
  };

  const isForumAssessment = (assessment: Assessment) => {
    return (
      assessment.assessmentType === "forum" ||
      (assessment.type as string) === "forum"
    );
  };

  const isSubmissionTrackedAssessment = (assessment: Assessment) => {
    return !isAnnouncementAssessment(assessment) && !isForumAssessment(assessment);
  };

  const getCourseGradeSheets = () => {
    if (!selectedCourse) return [];

    return gradeSheets.filter((sheet) => sheet.courseId === selectedCourse.id);
  };

  const getCourseSlides = (): CourseSlide[] => {
    if (!selectedCourse) return [];

    const courseUnits = units.filter(
      (unit) => unit.courseId === selectedCourse.id,
    );

    if (courseUnits.length === 0) {
      return [];
    }

    const unitIds = courseUnits.map((unit) => unit.id);
    const courseWeeks = weeks.filter((week) => unitIds.includes(week.unitId));

    if (courseWeeks.length === 0) {
      return [];
    }

    const weekIds = courseWeeks.map((week) => week.id);
    const courseSlides = slides.filter((slide) =>
      weekIds.includes(slide.weekId),
    );

    const slidesWithInfo: CourseSlide[] = courseSlides.map((slide) => {
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

    const result = slidesWithInfo
      .sort((a, b) => {
        const dateA = convertTimestamp(a.createdAt).getTime();
        const dateB = convertTimestamp(b.createdAt).getTime();
        return dateB - dateA;
      })
      .slice(0, 4);

    return result;
  };

  const getCourseSubmissions = () => {
    if (!selectedCourse) return [];

    const courseAssessments = getCourseAssessments().filter(
      (assessment) => isSubmissionTrackedAssessment(assessment),
    );
    const assessmentIds = courseAssessments.map((a) => a.id);

    return submissions.filter((s) => assessmentIds.includes(s.assessmentId));
  };

  const getPendingGrading = () => {
    if (!selectedCourse) return [];

    const courseSubmissions = getCourseSubmissions();
    return courseSubmissions.filter(
      (s) => s.status === "pending" || (s.status === "submitted" && !s.grade),
    );
  };

  const getMissingSubmissions = () => {
    if (!selectedCourse) return [];

    const courseAssessments = getCourseAssessments();
    const courseStudents = getCourseStudents();

    const missing: {
      studentName: string;
      assessmentName: string;
      gradeSheetName: string;
      daysLate: number;
    }[] = [];

    const pendingAssessments = courseAssessments.filter((a) => {
      if (!isSubmissionTrackedAssessment(a)) return false;
      const dueDate = new Date(a.dueDate);
      const today = new Date();
      dueDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      return dueDate < today && a.status !== "draft";
    });

    pendingAssessments.forEach((assessment) => {
      const gradeSheet = gradeSheets.find(
        (sheet) => sheet.id === assessment.gradeSheetId,
      );
      const gradeSheetName =
        gradeSheet?.title || gradeSheet?.gradingPeriod || "Grade Sheet";

      const assessmentSubmissions = submissions.filter(
        (s) => s.assessmentId === assessment.id,
      );
      const submittedStudentIds = assessmentSubmissions.map((s) => s.studentId);

      const studentsWithGrade: string[] = [];

      if (gradeSheet && gradeSheet.activities) {
        const activity = gradeSheet.activities.find(
          (act) =>
            act.name === assessment.name ||
            act.id === assessment.gradeSheetId ||
            act.description?.includes(assessment.name),
        );

        if (activity && gradeSheet.students) {
          gradeSheet.students.forEach((student) => {
            if (student.grades && student.grades[activity.id]) {
              const grade = student.grades[activity.id];
              if (grade && grade.value !== undefined && grade.value !== null) {
                studentsWithGrade.push(student.studentId);
              }
            }
          });
        }
      }

      const validStudentIds = new Set([
        ...submittedStudentIds,
        ...studentsWithGrade,
      ]);

      courseStudents.forEach((student) => {
        if (!validStudentIds.has(student.id)) {
          const dueDate = new Date(assessment.dueDate);
          const today = new Date();
          const daysLate = Math.floor(
            (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
          );

          missing.push({
            studentName: student.name,
            assessmentName: assessment.name,
            gradeSheetName: gradeSheetName,
            daysLate: Math.max(1, daysLate),
          });
        }
      });
    });

    missing.sort((a, b) => b.daysLate - a.daysLate);

    return missing;
  };
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

    let totalStudents = Math.max(
      courseStudents.length,
      selectedCourse.enrolledStudents?.length || 0,
    );
    let totalPassing = 0;
    let totalAtRisk = 0;
    let totalFailing = 0;
    let totalGradeSum = 0;
    let gradedCount = 0;

    if (courseGradeSheets.length > 0) {
      const studentGrades: { [key: string]: number[] } = {};

      courseStudents.forEach((student) => {
        studentGrades[student.id] = [];
      });

      // Include students present in published grade sheets (important when student.courses is stale).
      courseGradeSheets.forEach((sheet) => {
        if (!sheet.isPublished) return;
        sheet.students?.forEach((student) => {
          if (!studentGrades[student.studentId]) {
            studentGrades[student.studentId] = [];
          }
        });
      });

      totalStudents = Math.max(
        totalStudents,
        Object.keys(studentGrades).length,
      );

      courseGradeSheets.forEach((sheet) => {
        if (sheet.isPublished) {
          sheet.students.forEach((student) => {
            if (student.total !== undefined && student.total > 0) {
              studentGrades[student.studentId]?.push(student.total);
            }
          });
        }
      });

      Object.entries(studentGrades).forEach(([, grades]) => {
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
          totalFailing++;
        }
      });
    } else {
      // No synthetic fallback: without real published grades, stats must stay at zero.
      totalPassing = 0;
      totalAtRisk = 0;
      totalFailing = 0;
      totalGradeSum = 0;
      gradedCount = 0;
    }

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
  const formatDueDate = (dateString: string): string => {
    try {
      if (!dateString) return "No due date";

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [year, month, day] = dateString.split("-").map(Number);
      const dueDate = new Date(year, month - 1, day);
      dueDate.setHours(0, 0, 0, 0);

      const diffTime = dueDate.getTime() - today.getTime();
      const diffDays = Math.floor(diffTime / 86400000);

      if (diffDays === 0) {
        return "today";
      } else if (diffDays === 1) {
        return "tomorrow";
      } else if (diffDays > 1 && diffDays <= 7) {
        return `in ${diffDays} days`;
      } else if (diffDays < 0) {
        return "overdue";
      }

      return format(dueDate, "MMM dd", { locale: enUS });
    } catch {
      return "Invalid date";
    }
  };

  const formatFullDate = (dateString: string): string => {
    try {
      if (!dateString) return "No due date";

      const [year, month, day] = dateString.split("-").map(Number);
      const date = new Date(year, month - 1, day, 12, 0, 0);

      return format(date, "EEEE, MMMM d, yyyy", { locale: enUS });
    } catch {
      return "Invalid date";
    }
  };

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
      .slice(0, 3);
  };

  const getAssessmentHealth = () => {
    const courseAssessments = getCourseAssessments();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const draftCount = courseAssessments.filter(
      (a) => a.status === "draft",
    ).length;

    const overdueCount = courseAssessments.filter((a) => {
      if (!a.dueDate || a.status === "draft") return false;
      const dueDate = new Date(a.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate < today;
    }).length;

    const dueSoonCount = courseAssessments.filter((a) => {
      if (!a.dueDate || a.status === "draft") return false;
      const dueDate = new Date(a.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      const diffDays = Math.floor(
        (dueDate.getTime() - today.getTime()) / 86400000,
      );
      return diffDays >= 0 && diffDays <= 7;
    }).length;

    return {
      draftCount,
      overdueCount,
      dueSoonCount,
    };
  };

  const getContentCoverage = () => {
    if (!selectedCourse) {
      return {
        periodsCount: 0,
        weeksCount: 0,
        filesCount: 0,
        weeksWithFiles: 0,
        weeksWithoutFiles: 0,
      };
    }

    const selectedPeriods = periods.filter(
      (p) => p.courseId === selectedCourse.id,
    );
    const selectedWeeks = courseWeeks.filter(
      (w) => w.courseId === selectedCourse.id,
    );
    const selectedFiles = courseFiles.filter(
      (f) => f.courseId === selectedCourse.id,
    );

    const fileWeekIds = new Set(
      selectedFiles.map((f) => f.weekId).filter(Boolean),
    );
    const weeksWithFiles = selectedWeeks.filter((w) =>
      fileWeekIds.has(w.id),
    ).length;

    return {
      periodsCount: selectedPeriods.length,
      weeksCount: selectedWeeks.length,
      filesCount: selectedFiles.length,
      weeksWithFiles,
      weeksWithoutFiles: Math.max(0, selectedWeeks.length - weeksWithFiles),
    };
  };

  const courseStats = calculateCourseStats();
  const upcomingAssessments = getUpcomingAssessments();
  const courseStudents = getCourseStudents();
  const courseGradeSheets = getCourseGradeSheets();
  const courseAssessments = getCourseAssessments();
  const courseQuizCount = courseAssessments.filter(
    (assessment) =>
      (assessment.type || "").toLowerCase() === "quiz" ||
      (assessment.assessmentType || "").toLowerCase() === "quiz",
  ).length;
  const courseSlides = getCourseSlides();
  const pendingGrading = getPendingGrading();
  const missingSubmissions = getMissingSubmissions();
  const assessmentHealth = getAssessmentHealth();
  const contentCoverage = getContentCoverage();

  if (loading) {
    return (
      <DashboardLayout
        title={`Welcome, ${user?.name?.split(" ")[0]}`}
        subtitle="Teacher Dashboard"
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-2">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
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
      contentClassName="pt-0 lg:pt-1"
    >
      <input
        ref={restoreFileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleRestoreBackupFile}
      />
      <div className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center hidden sm:flex">
                  <BookOpen className="h-5 w-5 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                    Course Workspace
                  </p>
                  <div className="relative mt-1">
                    <button
                      onClick={() => setShowCourseDropdown(!showCourseDropdown)}
                      className="flex items-center gap-2 text-left hover:bg-gray-50 rounded-lg px-2 py-1.5 transition-colors"
                    >
                      <div className="min-w-0">
                        <h1 className="text-xl font-bold text-gray-900 truncate">
                          {selectedCourse?.name || "Select a course"}
                        </h1>
                        <p className="text-gray-600 text-sm mt-0.5 truncate">
                          {selectedCourse
                            ? `${selectedCourse.code} • Group ${selectedCourse.group} • ${courseStats.totalStudents} students • ${selectedCourse.credits} credits`
                            : "No courses available"}
                        </p>
                      </div>
                      <ChevronDown
                        className={`h-5 w-5 flex-shrink-0 transition-transform ${showCourseDropdown ? "rotate-180" : ""}`}
                      />
                    </button>

                    {showCourseDropdown && courses.length > 1 && (
                      <div className="absolute z-10 mt-2 w-full max-w-xl bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                        <div className="p-2">
                          <p className="text-xs font-semibold text-gray-500 tracking-wider mb-2 px-2">
                            Your Courses ({courses.length})
                          </p>
                          {courses.map((course) => (
                            <button
                              key={course.id}
                              onClick={() => handleCourseChange(course)}
                              className={`w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors ${
                                selectedCourse?.id === course.id
                                  ? "bg-blue-50 border border-blue-100"
                                  : ""
                              }`}
                            >
                              <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                                <Building className="h-4 w-4 text-blue-600" />
                              </div>
                              <div className="flex-1 text-left min-w-0">
                                <p className="font-semibold text-gray-900 truncate">
                                  {course.name}
                                </p>
                                <p className="text-sm text-gray-500 truncate">
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
                </div>
              </div>

              {selectedCourse?.description && (
                <p className="text-gray-600 text-sm mt-3 pl-0 sm:pl-[52px] max-w-3xl">
                  {selectedCourse.description}
                </p>
              )}
            </div>

            <div className="w-full lg:w-auto lg:min-w-[300px]">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">
                    Course Average
                  </p>
                  <p className="text-xl font-bold text-gray-900 leading-tight">
                    {courseStats.averageGrade}
                    <span className="text-sm font-medium text-gray-500"> / 5.0</span>
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">
                    Approval
                  </p>
                  <p className="text-xl font-bold text-gray-900 leading-tight">
                    {courseStats.approvalRate}%
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">
                    Assessments
                  </p>
                  <p className="text-xl font-bold text-gray-900 leading-tight">
                    {courseStats.totalAssessments}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openBackupCenter}
                  className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-left hover:bg-blue-100 transition-colors"
                >
                  <p className="text-[11px] uppercase tracking-wide text-blue-600">
                    Recovery
                  </p>
                  <p className="text-sm font-semibold text-blue-700 leading-tight">
                    Open backups
                  </p>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-600">Pending Grading</p>
              <Clock className="h-4 w-4 text-blue-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900">{pendingGrading.length}</p>
            <p className="text-xs text-gray-500 mt-1">Submissions waiting for review</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-600">Missing Work</p>
              <AlertCircle className="h-4 w-4 text-blue-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900">{missingSubmissions.length}</p>
            <p className="text-xs text-gray-500 mt-1">Late and missing submissions</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-600">Assessment Health</p>
              <FileText className="h-4 w-4 text-blue-600" />
            </div>
            <p className="mt-2 text-lg font-bold text-gray-900">
              {assessmentHealth.dueSoonCount} due soon
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {assessmentHealth.overdueCount} overdue • {assessmentHealth.draftCount} drafts
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-600">Content Coverage</p>
              <FolderOpen className="h-4 w-4 text-blue-600" />
            </div>
            <p className="mt-2 text-lg font-bold text-gray-900">
              {contentCoverage.weeksWithFiles}/{contentCoverage.weeksCount} weeks
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {contentCoverage.filesCount} files across {contentCoverage.periodsCount} periods
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                    <CalendarClock className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      Upcoming Assessments
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                      Deadlines and upcoming evaluations
                    </p>
                  </div>
                </div>
                {selectedCourse && (
                  <Link
                    to={`/courses/${selectedCourse.code}/assessments/`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium text-sm"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:flex">New</span>
                  </Link>
                )}
              </div>

              {!selectedCourse ? (
                <div className="text-center py-8">
                  <BookOpen className="h-16 w-16 mx-auto text-blue-300 mb-2" />
                  <p className="text-gray-500 mb-2 font-medium">
                    Select a course to view assessments
                  </p>
                  <p className="text-sm text-gray-500">
                    Choose a course from the dropdown above
                  </p>
                </div>
              ) : courseAssessments.length === 0 ? (
                <div className="text-center py-8">
                  <CalendarClock className="h-16 w-16 mx-auto text-blue-300 mb-2" />
                  <p className="text-gray-500 mb-2 font-medium">
                    No assessments in this course
                  </p>
                  <p className="text-sm text-gray-500 max-w-md mx-auto">
                    Create your first assessment to track student progress
                  </p>
                </div>
              ) : upcomingAssessments.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-16 w-16 mx-auto text-blue-300 mb-2" />
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
                    const fullDateText = formatFullDate(assessment.dueDate);
                    const isToday = dueDateText === "today";
                    const isTomorrow = dueDateText === "tomorrow";
                    const isUpcoming = dueDateText.startsWith("in");
                    const descriptionPreview = stripHtmlPreview(
                      assessment.description,
                    );

                    return (
                      <Link
                        key={assessment.id}
                        to={`/courses/${selectedCourse?.code}/assessments/${assessment.id}`}
                        className="block group"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-blue-50/50 hover:border-blue-200 rounded-xl transition-all duration-300 border border-gray-200 group-hover:shadow-sm">
                          <div className="flex items-center gap-4 mb-2 sm:mb-0">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                                  {assessment.name}
                                </p>
                                <span
                                  className={`px-2 py-1 rounded-full text-xs font-bold ${
                                    isToday
                                      ? "bg-gray-100 text-gray-700"
                                      : isTomorrow
                                        ? "bg-gray-100 text-gray-700"
                                        : isUpcoming
                                          ? "bg-blue-100 text-blue-700"
                                          : dueDateText === "overdue"
                                            ? "bg-gray-100 text-gray-700"
                                            : "bg-blue-100 text-blue-700"
                                  }`}
                                >
                                  {dueDateText}
                                </span>
                              </div>

                              <p></p>
                              {descriptionPreview && (
                                <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                                  {descriptionPreview} | Due: {fullDateText}
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
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Clock className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      Pending Work
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                      Submissions to grade and missing work
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {pendingGrading.length} to grade •{" "}
                      {missingSubmissions.length} missing
                    </p>
                  </div>
                </div>
                {selectedCourse && pendingGrading.length > 0 && (
                  <Link
                    to={`/courses/${selectedCourse.code}/assessments/pending`}
                    className="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    Grade
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                )}
              </div>

              {!selectedCourse ? (
                <div className="text-center py-8">
                  <Clock className="h-16 w-16 mx-auto text-blue-300 mb-2" />
                  <p className="text-gray-500 font-medium">
                    Select a course to view pending work
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {missingSubmissions.length > 0 && (
                    <div>
                      <div className="space-y-2">
                        {missingSubmissions
                          .slice(0, 10)
                          .map((missing, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-200"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {missing.studentName
                                    .split(" ")
                                    .slice(0, 2)
                                    .join(" ")}
                                </p>

                                <p className="text-xs text-gray-500 truncate mt-0.5">
                                  {missing.assessmentName} |{" "}
                                  {missing.gradeSheetName}
                                </p>
                              </div>
                              <div className="ml-2 text-right flex-shrink-0">
                                <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full">
                                  {missing.daysLate}{" "}
                                  {missing.daysLate === 1 ? "day" : "days"} late
                                </span>
                              </div>
                            </div>
                          ))}
                        {missingSubmissions.length > 10 && (
                          <p className="text-xs text-gray-500 text-center pt-1">
                            +{missingSubmissions.length - 10} more missing
                            submissions
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {pendingGrading.length === 0 &&
                    missingSubmissions.length === 0 && (
                      <div className="text-center py-6">
                        <CheckCircle2 className="h-12 w-12 mx-auto text-blue-300 mb-2" />
                        <p className="text-sm text-gray-500">
                          All caught up! No pending work.
                        </p>
                      </div>
                    )}
                </div>
              )}
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Presentation className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      Course Materials
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                      Slides and learning resources
                    </p>
                  </div>
                </div>
                {selectedCourse && (
                  <Link
                    to={`/slides`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium text-sm"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:flex">New</span>
                  </Link>
                )}
              </div>

              {!selectedCourse ? (
                <div className="text-center py-8">
                  <Presentation className="h-16 w-16 mx-auto text-blue-300 mb-2" />
                  <p className="text-gray-500 mb-2 font-medium">
                    Select a course to view materials
                  </p>
                  <p className="text-sm text-gray-500">
                    Choose a course from the dropdown above
                  </p>
                </div>
              ) : courseSlides.length === 0 ? (
                <div className="text-center py-8">
                  <Presentation className="h-16 w-16 mx-auto text-blue-300 mb-2" />
                  <p className="text-gray-500 mb-2 font-medium">
                    No materials for this course
                  </p>
                  <p className="text-sm text-gray-500 max-w-md mx-auto">
                    Share your slides and resources with students for{" "}
                    {selectedCourse.name}
                  </p>
                  <Link
                    to={`/slides`}
                    className="inline-flex items-center gap-2 px-4 py-2 mt-4 bg-blue-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium text-sm"
                  >
                    <Plus className="h-4 w-4" />
                    Create First Material
                  </Link>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {courseSlides.map((slide) => (
                      <a
                        key={slide.id}
                        href={slide.canvaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group block"
                      >
                        <div className="border border-gray-200 rounded-xl p-4 hover:bg-blue-50/50 hover:border-blue-200 transition-all duration-300 group-hover:shadow-sm">
                          <div className="flex items-center gap-3">
                            <div className="flex-1">
                              <p className="font-semibold text-gray-900 line-clamp-1 group-hover:text-blue-600 transition-colors">
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
                      to={`/slides`}
                      className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 hover:gap-3 transition-all duration-300"
                    >
                      View all materials
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <UserCheck className="h-5 w-5 text-blue-600" />
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      Student Status
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                      Passing, at risk, and failing distribution
                    </p>
                  </div>
                </div>
              </div>

              {!selectedCourse ? (
                <div className="text-center py-8">
                  <Users className="h-16 w-16 mx-auto text-blue-300 mb-2" />
                  <p className="text-gray-500 font-medium">
                    Select a course to view student status
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="h-5 w-5 text-blue-600" />
                          <div>
                            <p className="font-medium text-gray-900">Passing</p>
                            <p className="text-xs text-blue-600">≥ 3.5</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-blue-600">
                            {courseStats.totalPassing}
                          </p>
                          <p className="text-sm text-blue-600">
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

                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-5 w-5 text-blue-600" />
                          <div>
                            <p className="font-medium text-gray-900">At Risk</p>
                            <p className="text-xs text-gray-600">2.5 - 3.4</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-gray-700">
                            {courseStats.totalAtRisk}
                          </p>
                          <p className="text-sm text-gray-600">
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

                    <div className="bg-gray-100 border border-gray-300 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-5 w-5 text-blue-600" />
                          <div>
                            <p className="font-medium text-gray-900">Failing</p>
                            <p className="text-xs text-gray-700">≤ 2.4</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-gray-800">
                            {courseStats.totalFailing}
                          </p>
                          <p className="text-sm text-gray-700">
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
                </>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <Zap className="h-5 w-5 text-blue-600" />
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      Quick Actions
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                      Shortcuts for daily teaching tasks
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Link
                  to="/grades"
                  className="group flex flex-col items-center justify-center p-4 border border-gray-200 rounded-xl hover:border-blue-200 hover:bg-blue-50/50 transition-all duration-300"
                >
                  <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-300">
                    <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                  </div>
                  <p className="font-semibold text-sm text-gray-900">Grades</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {courseGradeSheets.length} sheets
                  </p>
                </Link>

                <Link
                  to="/students/list"
                  className="group flex flex-col items-center justify-center p-4 border border-gray-200 rounded-xl hover:border-blue-200 hover:bg-blue-50/50 transition-all duration-300"
                >
                  <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-300">
                    <Users className="h-4 w-4 text-blue-600" />
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
                  className="group flex flex-col items-center justify-center p-4 border border-gray-200 rounded-xl hover:border-blue-200 hover:bg-blue-50/50 transition-all duration-300"
                >
                  <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-300">
                    <FileText className="h-4 w-4 text-blue-600" />
                  </div>
                  <p className="font-semibold text-sm text-gray-900">
                    Assessments
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {courseAssessments.length} active
                  </p>
                </Link>

                <Link
                  to={
                    selectedCourse
                      ? `/courses/${selectedCourse.code}/exercise-bank`
                      : "/courses"
                  }
                  className="group flex flex-col items-center justify-center p-4 border border-gray-200 rounded-xl hover:border-blue-200 hover:bg-blue-50/50 transition-all duration-300"
                >
                  <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-300">
                    <ListChecks className="h-4 w-4 text-blue-600" />
                  </div>
                  <p className="font-semibold text-sm text-gray-900">
                    Quiz Bank
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {courseQuizCount} quizzes
                  </p>
                </Link>

                <Link
                  to="/statistics"
                  className="group flex flex-col items-center justify-center p-4 border border-gray-200 rounded-xl hover:border-blue-200 hover:bg-blue-50 transition-all duration-300"
                >
                  <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-300">
                    <BarChart3 className="h-4 w-4 text-blue-600" />
                  </div>
                  <p className="font-semibold text-sm text-gray-900">Reports</p>
                  <p className="text-xs text-gray-500 mt-1">View statistics</p>
                </Link>

                <button
                  type="button"
                  onClick={openBackupCenter}
                  className="group flex flex-col items-center justify-center p-4 border border-gray-200 rounded-xl hover:border-blue-200 hover:bg-blue-50/50 transition-all duration-300"
                >
                  <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-300">
                    <FolderOpen className="h-4 w-4 text-blue-600" />
                  </div>
                  <p className="font-semibold text-sm text-gray-900">Backups</p>
                  <p className="text-xs text-gray-500 mt-1">Recovery center</p>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showBackupCenter && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-4xl max-h-[85vh] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Backup & Recovery Center
                </h3>
                <p className="text-sm text-gray-600">
                  Restore deleted courses or manage snapshots from all your
                  courses
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBackupCenter(false)}
                className="p-2 rounded-lg hover:bg-blue-50 text-blue-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={handleSaveSnapshot}
                  disabled={
                    !selectedCourse || isExportingBackup || isRestoringBackup
                  }
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isExportingBackup ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Clock className="h-4 w-4" />
                  )}
                  Save Snapshot
                </button>
                <button
                  type="button"
                  onClick={handleExportBackup}
                  disabled={
                    !selectedCourse || isExportingBackup || isRestoringBackup
                  }
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isExportingBackup ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Export Backup
                </button>
                <button
                  type="button"
                  onClick={handleRestoreBackupClick}
                  disabled={isRestoringBackup || isExportingBackup}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRestoringBackup ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Restore Backup File
                </button>
              </div>

              <div className="text-xs text-gray-500">
                Selected course for save/export:{" "}
                <span className="font-semibold text-gray-700">
                  {selectedCourse
                    ? `${selectedCourse.name} (${selectedCourse.code})`
                    : "None"}
                </span>
              </div>

              {loadingBackupSnapshots ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                </div>
              ) : backupSnapshots.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-10">
                  No snapshots found yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {backupSnapshots.map((snapshot) => (
                    <div
                      key={snapshot.id}
                      className="border border-gray-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {snapshot.courseName} ({snapshot.courseCode})
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Saved on {snapshot.createdAt.toLocaleString("en-US")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleRestoreSnapshot(snapshot.id)}
                          disabled={isRestoringBackup}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:shadow-md disabled:opacity-50"
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSnapshot(snapshot.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-100"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-600" />
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
