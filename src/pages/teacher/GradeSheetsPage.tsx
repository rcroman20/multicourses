import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademic } from "@/contexts/AcademicContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { firebaseDB } from "../../lib/firebase";
import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  doc,
  query,
  orderBy,
  where,
  Timestamp, 
  deleteDoc,
} from "firebase/firestore";
import {
  FileSpreadsheet,
  Save,
  Download,
  Plus,
  Trash2,
  Search,
  Users,
  BookOpen,
  X,
  Eye,
  Calendar,
  CheckCircle,
  AlertCircle,
  BarChart3,
  TrendingUp,
  Info,
  ChevronDown,
  School,
} from "lucide-react";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { notificationService } from "@/lib/services/notificationService";
import { isNotificationAutomationEnabled } from "@/lib/services/notificationAutomation";
import { useNavigate, useParams } from "react-router-dom";
import * as XLSX from "xlsx";

const studentGradeSchema = z.object({
  studentId: z.string(),
  name: z.string(),
  grades: z.record(z.string(), z.any()),
  total: z.number().min(0).max(5.0).optional(),
  status: z.enum(["pending", "completed", "incomplete"]).default("pending"),
});

const gradeSheetSchema = z.object({
  title: z.string().min(1, "Title is required"),
  courseId: z.string().optional(),
  courseName: z.string().min(1, "Course name is required"),
  teacherId: z.string(),
  teacherName: z.string(),
  gradingPeriod: z.enum([
    "1st Term",
    "2nd Term",
    "3rd Term",
    "4th Term",
    "Final",
  ]),
  activities: z.array(
    z.object({
      id: z.string(),
      name: z.string().min(1, "Activity name is required"),
      maxScore: z.number().min(1).max(100).default(5.0),
      type: z.enum([
        "exam",
        "quiz",
        "homework",
        "project",
        "participation",
        "self_evaluation",
        "presentation",
        "lab",
        "essay",
      ]),
      description: z.string().max(100).optional(),
    })
  ),
  students: z.array(studentGradeSchema),
  createdAt: z.any(),
  updatedAt: z.any(),
  isPublished: z.boolean().default(false),
  weightPercentage: z.number().min(0).max(100).optional(),
});

interface Activity {
  id: string;
  name: string;
  maxScore: number;
  type:
    | "exam"
    | "quiz"
    | "homework"
    | "project"
    | "participation"
    | "self_evaluation"
    | "presentation"
    | "lab"
    | "essay";
  description?: string;
}

interface StudentGrade {
  studentId: string;
  name: string;
  grades: Record<
    string,
    {
      value?: number | null;
      comment?: string;
      submittedAt?: Date | null;
    }
  >;
  total?: number;
  status: "pending" | "completed" | "incomplete";
}

interface GradeSheet {
  id: string;
  title: string;
  courseId?: string;
  courseName: string;
  teacherId: string;
  teacherName: string;
  gradingPeriod: string;
  activities: Activity[];
  students: StudentGrade[];
  createdAt: Date;
  updatedAt: Date;
  isPublished: boolean;
  weightPercentage?: number;
}

interface Student {
  id: string;
  name: string;
  email: string;
  idNumber: string;
}

interface Course {
  id: string;
  name: string;
  code: string;
  enrolledStudents: string[];
}

interface StudentAverage {
  studentId: string;
  studentName: string;
  email?: string;
  idNumber?: string;
  averages: {
    [sheetId: string]: number;
  };
  overallAverage: number;
  approved: boolean;
  completedSheets: number; 
  totalSheets: number;
  firstTermAverage: number;
  secondTermAverage: number;
  firstTermEquivalent: number;
  secondTermEquivalent: number;
}

const DISPLAY_MAX_SCORE = 5.0;
type SupportedTerm = "1st Term" | "2nd Term";

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeText = (value: unknown): string =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const getActivityGradeValue = (
  grades: Record<string, { value?: number | null }> = {},
  activity: Activity,
): number | null => {
  const directCandidates = [activity.id, activity.name]
    .map((key) => String(key || "").trim())
    .filter(Boolean);

  for (const key of directCandidates) {
    const parsed = toFiniteNumber(grades?.[key]?.value);
    if (parsed !== null) return parsed;
  }

  const normalizedEntries = new Map<string, { value?: number | null }>();
  Object.entries(grades).forEach(([key, value]) => {
    const normalizedKey = normalizeText(key).replace(/\s+/g, " ");
    if (normalizedKey) normalizedEntries.set(normalizedKey, value);
  });

  for (const candidate of directCandidates) {
    const normalizedCandidate = normalizeText(candidate).replace(/\s+/g, " ");
    if (!normalizedCandidate) continue;
    const matched = normalizedEntries.get(normalizedCandidate);
    const parsed = toFiniteNumber(matched?.value);
    if (parsed !== null) return parsed;
  }

  return null;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const normalizeGradingPeriod = (period: string): string => {
  const normalized = (period || "").trim().toLowerCase();
  const periodMap: Record<string, string> = {
    "first term": "1st Term",
    "1st term": "1st Term",
    q1: "1st Term",
    quarter1: "1st Term",
    quarter_1: "1st Term",
    "second term": "2nd Term",
    "2nd term": "2nd Term",
    q2: "2nd Term",
    quarter2: "2nd Term",
    quarter_2: "2nd Term",
    "third term": "3rd Term",
    "3rd term": "3rd Term",
    q3: "3rd Term",
    quarter3: "3rd Term",
    quarter_3: "3rd Term",
    "fourth term": "4th Term",
    "4th term": "4th Term",
    q4: "4th Term",
    quarter4: "4th Term",
    quarter_4: "4th Term",
    final: "Final",
  };

  return periodMap[normalized] || period || "Final";
};

const getGradingPeriodOrder = (period: string): number => {
  const normalized = normalizeGradingPeriod(period);
  if (normalized === "Final") return -1;

  const match = normalized.match(/^(\d+)(st|nd|rd|th)\s+term$/i);
  if (!match) return 998;

  const termNumber = Number(match[1]);
  return Number.isFinite(termNumber) ? termNumber : -2;
};

const getSupportedTerm = (period: string): SupportedTerm | null => {
  const normalized = normalizeGradingPeriod(period);
  if (normalized === "1st Term") return "1st Term";
  if (normalized === "2nd Term") return "2nd Term";
  return null;
};

const getTermEquivalences = (
  sheets: Array<
    Pick<GradeSheet, "gradingPeriod" | "weightPercentage"> & {
      activities?: unknown[];
    }
  >
): Record<SupportedTerm, number> => {
  const weightedTotal = sheets.reduce(
    (sum, sheet) => sum + Math.max(0, Number(sheet.weightPercentage) || 0),
    0
  );

  if (weightedTotal > 0) {
    return sheets.reduce(
      (acc, sheet) => {
        const term = getSupportedTerm(sheet.gradingPeriod);
        if (!term) return acc;
        acc[term] += Math.max(0, Number(sheet.weightPercentage) || 0);
        return acc;
      },
      { "1st Term": 0, "2nd Term": 0 } as Record<SupportedTerm, number>
    );
  }

  const termActivityCounts: Record<SupportedTerm, number> = {
    "1st Term": 0,
    "2nd Term": 0,
  };
  const termSheetCounts: Record<SupportedTerm, number> = {
    "1st Term": 0,
    "2nd Term": 0,
  };

  sheets.forEach((sheet) => {
    const term = getSupportedTerm(sheet.gradingPeriod);
    if (!term) return;

    termSheetCounts[term] += 1;
    const activityCount = Array.isArray(sheet.activities)
      ? sheet.activities.length
      : 0;
    termActivityCounts[term] += Math.max(0, activityCount);
  });

  const totalActivities =
    termActivityCounts["1st Term"] + termActivityCounts["2nd Term"];

  if (totalActivities > 0) {
    return {
      "1st Term": (termActivityCounts["1st Term"] / totalActivities) * 100,
      "2nd Term": (termActivityCounts["2nd Term"] / totalActivities) * 100,
    };
  }

  const totalSheets = termSheetCounts["1st Term"] + termSheetCounts["2nd Term"];
  if (totalSheets > 0) {
    return {
      "1st Term": (termSheetCounts["1st Term"] / totalSheets) * 100,
      "2nd Term": (termSheetCounts["2nd Term"] / totalSheets) * 100,
    };
  }

  if (sheets.length === 0) {
    return { "1st Term": 0, "2nd Term": 0 };
  }
  return { "1st Term": 0, "2nd Term": 0 };
};

const calculateNormalizedTotal = (
  grades: Record<string, { value?: number | null }>,
  activities: Activity[]
): number => {
  let normalizedSum = 0;
  let gradedActivities = 0;

  for (const activity of activities) {
    const rawValue = getActivityGradeValue(grades, activity);
    if (rawValue === null) continue;

    const activityMax = toFiniteNumber(activity.maxScore);
    const safeMax = activityMax && activityMax > 0 ? activityMax : DISPLAY_MAX_SCORE;
    const clampedRaw = clamp(rawValue, 0, safeMax);
    const normalized = clamp((clampedRaw / safeMax) * DISPLAY_MAX_SCORE, 0, DISPLAY_MAX_SCORE);
    normalizedSum += normalized;
    gradedActivities += 1;
  }

  return gradedActivities > 0
    ? clamp(normalizedSum / gradedActivities, 0, DISPLAY_MAX_SCORE)
    : 0;
};

const determineStudentStatus = (
  grades: Record<string, { value?: number | null }>,
  activities: Activity[]
): StudentGrade["status"] => {
  const gradedActivities = activities.filter((activity) => {
    const gradeValue = getActivityGradeValue(grades, activity);
    return gradeValue !== null;
  }).length;

  if (gradedActivities === 0) return "pending";
  if (activities.length > 0 && gradedActivities === activities.length) return "completed";
  return "incomplete";
};

const toPlainText = (value: unknown, fallback = ""): string => {
  if (typeof value !== "string") return fallback;

  const withoutTags = value.replace(/<[^>]*>/g, " ");
  const decoded = withoutTags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  const normalized = decoded.replace(/\s+/g, " ").trim();
  return normalized || fallback;
};

export default function GradeSheetsPage() {
  const { user } = useAuth(); 
  const { selectedCourseId, setSelectedCourseId } = useAcademic();
  const navigate = useNavigate();
  const { courseCode } = useParams<{ courseCode?: string }>();
  const [gradeSheets, setGradeSheets] = useState<GradeSheet[]>([]);
  const [currentSheet, setCurrentSheet] = useState<GradeSheet | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showNewSheetModal, setShowNewSheetModal] = useState(false);
  const [showAddActivityModal, setShowAddActivityModal] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentAverages, setStudentAverages] = useState<StudentAverage[]>([]);
  const [showAveragesSection, setShowAveragesSection] = useState(false);
  const [averagesDisplayMode, setAveragesDisplayMode] = useState<
    "term" | "sheet" | "both"
  >("term");
  const [selectedAveragesTerm, setSelectedAveragesTerm] = useState<string>("all");
  const [isSyncing, setIsSyncing] = useState(false);
  const commentTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const currentSheetSectionRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollToCurrentSheetRef = useRef(false);

  
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>(
    selectedCourseId || "all",
  );
  const [collapsedTermGroups, setCollapsedTermGroups] = useState<
    Record<string, boolean>
  >({});
  
  const hasLoadedInitialData = useRef(false);

  const [newSheet, setNewSheet] = useState({
    title: "",
    courseId: "",
    courseName: "",
    gradingPeriod: "1st Term" as
      | "1st Term"
      | "2nd Term"
      | "3rd Term"
      | "4th Term"
      | "Final",
    activities: [] as Activity[],
  });

  const [newActivityForModal, setNewActivityForModal] = useState<
    Omit<Activity, "id">
  >({
    name: "",
    maxScore: 5.0,
    type: "quiz",
    description: "",
  });

  const [newActivityForCurrentSheet, setNewActivityForCurrentSheet] = useState({
    name: "",
    maxScore: 5.0,
    type: "quiz" as "exam" | "quiz" | "homework" | "project" | "participation",
    description: "",
  });

  const ownedCourseIds = useMemo(
    () =>
      new Set(
        courses
          .map((course) => String(course.id || "").trim())
          .filter((courseId) => courseId.length > 0),
      ),
    [courses],
  );

  useEffect(() => {
    if (selectedCourseFilter === "all") return;

    if (selectedCourseFilter !== selectedCourseId) {
      setSelectedCourseId(selectedCourseFilter);
    }
  }, [selectedCourseFilter, selectedCourseId, setSelectedCourseId]);

  useEffect(() => {
    if (!courseCode || courses.length === 0) return;

    const courseFromRoute = courses.find((course) => course.code === courseCode);
    if (!courseFromRoute) return;

    setSelectedCourseFilter((current) =>
      current === courseFromRoute.id ? current : courseFromRoute.id
    );
    setSelectedCourseId(courseFromRoute.id);
  }, [courseCode, courses, setSelectedCourseId]);

  useEffect(() => {
    if (selectedCourseFilter === "all") return;

    const selectedCourse = courses.find((course) => course.id === selectedCourseFilter);
    if (!selectedCourse) return;

    if (courseCode !== selectedCourse.code) {
      navigate(`/courses/${selectedCourse.code}/grade-sheets`, { replace: true });
    }
  }, [selectedCourseFilter, courses, courseCode, navigate]);

  useEffect(() => {
    if (courses.length === 0) {
      if (selectedCourseFilter !== "all") {
        setSelectedCourseFilter("all");
      }
      return;
    }

    if (selectedCourseFilter !== "all") {
      const filterExists = courses.some((course) => course.id === selectedCourseFilter);
      if (!filterExists) {
        if (selectedCourseId && courses.some((course) => course.id === selectedCourseId)) {
          setSelectedCourseFilter(selectedCourseId);
        } else {
          setSelectedCourseFilter("all");
        }
      }
      return;
    }

    if (selectedCourseId && courses.some((course) => course.id === selectedCourseId)) {
      setSelectedCourseFilter(selectedCourseId);
    }
  }, [courses, selectedCourseFilter, selectedCourseId]);

  const filteredGradeSheets = useMemo(() => {
    if (searchTerm) {
      return gradeSheets.filter(
        (sheet) =>
          sheet.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          sheet.courseName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          sheet.teacherName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedCourseFilter === "all") {
      return gradeSheets;
    }

    return gradeSheets.filter((sheet) => sheet.courseId === selectedCourseFilter);
  }, [gradeSheets, searchTerm, selectedCourseFilter]);

  const groupedFilteredGradeSheets = useMemo(() => {
    const grouped = filteredGradeSheets.reduce<Record<string, GradeSheet[]>>(
      (acc, sheet) => {
        const term = normalizeGradingPeriod(sheet.gradingPeriod || "Final");
        if (!acc[term]) acc[term] = [];
        acc[term].push(sheet);
        return acc;
      },
      {},
    );

    return Object.entries(grouped)
      .map(([term, sheets]) => ({
        term,
        sheets: [...sheets].sort(
          (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
        ),
      }))
      .sort((a, b) => {
        const orderA = getGradingPeriodOrder(a.term);
        const orderB = getGradingPeriodOrder(b.term);
        if (orderA !== orderB) return orderB - orderA;
        return a.term.localeCompare(b.term);
      });
  }, [filteredGradeSheets]);

  const toggleTermDropdown = (term: string) => {
    setCollapsedTermGroups((prev) => ({
      ...prev,
      [term]: !(prev[term] ?? false),
    }));
  };

  const openSheetDetails = (sheet: GradeSheet, shouldScroll = true) => {
    shouldScrollToCurrentSheetRef.current = shouldScroll;
    setCurrentSheet(sheet);
  };

  const averageGradeSheets = useMemo(() => {
    if (selectedCourseFilter === "all") {
      return gradeSheets;
    }

    return gradeSheets.filter((sheet) => sheet.courseId === selectedCourseFilter);
  }, [gradeSheets, selectedCourseFilter]);

  const courseTermEquivalences = useMemo(
    () => getTermEquivalences(averageGradeSheets),
    [averageGradeSheets]
  );

  const averagesTermOptions = useMemo(() => {
    return Array.from(
      new Set(
        averageGradeSheets.map((sheet) =>
          normalizeGradingPeriod(sheet.gradingPeriod || "Final"),
        ),
      ),
    ).sort((a, b) => {
      const orderA = getGradingPeriodOrder(a);
      const orderB = getGradingPeriodOrder(b);
      if (orderA !== orderB) return orderB - orderA;
      return a.localeCompare(b);
    });
  }, [averageGradeSheets]);

  const visibleAverageSheets = useMemo(() => {
    if (selectedAveragesTerm === "all") return averageGradeSheets;
    return averageGradeSheets.filter(
      (sheet) =>
        normalizeGradingPeriod(sheet.gradingPeriod || "Final") ===
        selectedAveragesTerm,
    );
  }, [averageGradeSheets, selectedAveragesTerm]);

  const visibleAverageTerms = useMemo(() => {
    if (selectedAveragesTerm === "all") return averagesTermOptions;
    return averagesTermOptions.filter((term) => term === selectedAveragesTerm);
  }, [averagesTermOptions, selectedAveragesTerm]);

  const gradedStudentAverages = useMemo(
    () => studentAverages.filter((student) => student.completedSheets > 0),
    [studentAverages]
  );

  useEffect(() => {
    if (selectedAveragesTerm === "all") return;
    if (!averagesTermOptions.includes(selectedAveragesTerm)) {
      setSelectedAveragesTerm("all");
    }
  }, [averagesTermOptions, selectedAveragesTerm]);

  useEffect(() => {
    if (user && !hasLoadedInitialData.current) {
      const loadData = async () => {
        setIsLoading(true);
        try {
          const loadedCourses = await fetchCourses();
          await Promise.all([
            fetchStudents(loadedCourses),
            fetchGradeSheets(loadedCourses),
          ]);
          hasLoadedInitialData.current = true;
        } catch (err) {
          setError("Error loading initial data");
        } finally {
          setIsLoading(false);
        }
      };

      loadData();
    }
  }, [user]);

  useEffect(() => {
    if (!currentSheet || !shouldScrollToCurrentSheetRef.current) return;

    shouldScrollToCurrentSheetRef.current = false;
    requestAnimationFrame(() => {
      currentSheetSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [currentSheet]);

  useEffect(() => {
    calculateStudentAverages();
  }, [averageGradeSheets, students]);

  useEffect(() => {
    const syncAllStudents = async () => {
      if (
        courses.length > 0 &&
        students.length > 0 &&
        gradeSheets.length > 0 &&
        !isSyncing
      ) {
        setIsSyncing(true);
        try {
          const syncPromises = courses.map((course) =>
            syncStudentsInGradeSheets(course.id, false)
          );
          await Promise.all(syncPromises);
          await fetchGradeSheets(courses);
        } catch (err) {
        } finally {
          setIsSyncing(false);
        }
      }
    };

    syncAllStudents();
  }, [courses, students]);

  const syncStudentsInGradeSheets = async (
    courseId: string,
    reloadAfter = true
  ) => {
    try {
      const course = courses.find((c) => c.id === courseId);
      if (!course) return false;

      const gradeSheetsRef = collection(firebaseDB, "gradeSheets");
      const q = query(gradeSheetsRef, where("courseId", "==", courseId));
      const querySnapshot = await getDocs(q);

      const updatePromises = querySnapshot.docs.map(async (docSnapshot) => {
        const sheetData = docSnapshot.data();
        const existingStudents: StudentGrade[] = sheetData.students || [];
        const currentEnrolledStudents = new Set(course.enrolledStudents || []);
        
        const existingStudentIds = new Set(
          existingStudents.map((s) => s.studentId)
        );
        
        const missingStudentIds = course.enrolledStudents.filter(
          (studentId) => !existingStudentIds.has(studentId)
        );

        const studentsToRemove = existingStudents.filter(
          (student) => !currentEnrolledStudents.has(student.studentId)
        );

        let updatedStudents = [...existingStudents];

        if (missingStudentIds.length > 0) {
          const missingStudents = students.filter((s) =>
            missingStudentIds.includes(s.id)
          );

          const newStudents: StudentGrade[] = missingStudents.map((student) => {
            const grades: Record<string, any> = {};
            if (sheetData.activities) {
              sheetData.activities.forEach((activity: any) => {
                grades[activity.id] = {
                  value: null,
                  comment: "",
                  submittedAt: null,
                };
              });
            }

            return {
              studentId: student.id,
              name: student.name,
              grades,
              total: 0,
              status: "pending",
            };
          });

          updatedStudents = [...updatedStudents, ...newStudents];
        }

        if (studentsToRemove.length > 0) {
          updatedStudents = updatedStudents.filter(
            (student) => currentEnrolledStudents.has(student.studentId)
          );
        }

        if (missingStudentIds.length > 0 || studentsToRemove.length > 0) {
          const cleanedStudents = updatedStudents.map((student) => ({
            ...student,
            grades: Object.entries(student.grades || {}).reduce(
              (acc, [key, value]) => {
                acc[key] = {
                  value: value.value ?? null,
                  comment: value.comment || "",
                  submittedAt: value.submittedAt ?? null,
                };
                return acc;
              },
              {} as Record<string, any>
            ),
          }));

          const sortedStudents = cleanedStudents.sort((a, b) =>
            a.name.localeCompare(b.name, "es", { sensitivity: "base" })
          );

          await updateDoc(doc(firebaseDB, "gradeSheets", docSnapshot.id), {
            students: sortedStudents,
            updatedAt: Timestamp.now(),
          });
        }
      });

      await Promise.all(updatePromises);

      if (reloadAfter) {
        await fetchGradeSheets(courses);
      }

      return true;
    } catch {
      return false;
    }
  };

  const cleanDataForFirebase = (data: any): any => {
    if (data === undefined || data === null) return null;
    if (Array.isArray(data)) return data.map((item) => cleanDataForFirebase(item));
    if (typeof data === "object") {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(data)) {
        cleaned[key] = cleanDataForFirebase(value);
      }
      return cleaned;
    }
    return data;
  };

  const fetchGradeSheets = async (targetCourses: Course[] = []) => {
    setIsLoading(true);
    try {
      const sourceCourses = targetCourses.length > 0 ? targetCourses : courses;
      const courseIds = sourceCourses
        .map((course) => String(course.id || "").trim())
        .filter((courseId) => courseId.length > 0);

      if (courseIds.length === 0) {
        setGradeSheets([]);
        return;
      }

      const gradeSheetsRef = collection(firebaseDB, "gradeSheets");
      const querySnapshots = await Promise.all(
        courseIds.map((courseId) =>
          getDocs(query(gradeSheetsRef, where("courseId", "==", courseId))),
        ),
      );

      const sheets: GradeSheet[] = [];
      const seenIds = new Set<string>();

      for (const querySnapshot of querySnapshots) {
        for (const doc of querySnapshot.docs) {
          if (seenIds.has(doc.id)) continue;
          seenIds.add(doc.id);

          const data = doc.data();

          const activities: Activity[] = (data.activities || []).map(
            (act: any, index: number) => ({
              id: act.id || `activity_${doc.id}_${index}_${Date.now()}`,
              name: act.name || "Untitled activity",
              type: act.type || "quiz",
              maxScore:
                typeof act.maxScore === "number"
                  ? Math.max(1, act.maxScore)
                  : 5.0,
              description: act.description || "",
            })
          );

          const students: StudentGrade[] = (data.students || [])
            .map((student: any) => {
              const normalizedGrades = Object.entries(student.grades || {}).reduce(
                (acc, [activityId, value]: [string, any]) => {
                  const numericValue = toFiniteNumber(value?.value);
                  acc[activityId] = {
                    value: numericValue,
                    comment: value?.comment || "",
                    submittedAt: value?.submittedAt ?? null,
                  };
                  return acc;
                },
                {} as Record<string, { value?: number | null; comment?: string; submittedAt?: Date | null }>
              );

              return {
                studentId: student.studentId,
                name: student.name || "Student",
                grades: normalizedGrades,
                total: calculateNormalizedTotal(normalizedGrades, activities),
                status: determineStudentStatus(normalizedGrades, activities),
              };
            })
            .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));

          sheets.push({
            id: doc.id,
            title: data.title || "Untitled grade sheet",
            courseId: data.courseId,
            courseName: data.courseName || "Unnamed course",
            teacherId: data.teacherId || "",
            teacherName: data.teacherName || "Teacher",
            gradingPeriod: normalizeGradingPeriod(data.gradingPeriod || "1st Term"),
            activities,
            students,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
            isPublished: data.isPublished || false,
            weightPercentage: Math.max(0, Number(data.weightPercentage) || 0),
          });
        }
      }

      sheets.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      setGradeSheets(sheets);
    } catch {
      setError("Error loading grade sheets");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCourses = async (): Promise<Course[]> => {
    try {
      const coursesRef = collection(firebaseDB, "cursos");
      const q = query(
        coursesRef, 
        where("teacherId", "==", user?.id || "")
      );
      const querySnapshot = await getDocs(q);

      const courseList: Course[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.teacherId === user?.id) {
          courseList.push({
            id: doc.id,
            name: data.nombre || data.name || "Unnamed course",
            code: data.codigo || data.code || "No code",
            enrolledStudents: data.enrolledStudents || [],
          });
        }
      });

      setCourses(courseList);
      return courseList;
    } catch {
      setError("Error loading courses");
      return [];
    }
  };

  const fetchStudents = async (targetCourses: Course[] = []) => {
    try {
      const sourceCourses = targetCourses.length > 0 ? targetCourses : courses;
      const enrolledIds = Array.from(
        new Set(
          sourceCourses.flatMap((course) =>
            (course.enrolledStudents || []).filter(
              (studentId): studentId is string =>
                typeof studentId === "string" && studentId.trim().length > 0,
            ),
          ),
        ),
      );

      if (enrolledIds.length === 0) {
        setStudents([]);
        return;
      }

      const studentDocs = await Promise.all(
        enrolledIds.map((studentId) =>
          getDoc(doc(firebaseDB, "estudiantes", studentId)),
        ),
      );

      const studentList: Student[] = [];
      studentDocs.forEach((studentDoc, index) => {
        if (!studentDoc.exists()) return;
        const data = studentDoc.data();
        const studentId = enrolledIds[index];
        studentList.push({
          id: studentId,
          name: data.name || "Student",
          email: data.email || "",
          idNumber: data.idNumber || "",
        });
      });

      setStudents(studentList);
    } catch {
      setError("Error loading students");
    }
  };

  const calculateStudentAverages = () => {
    const teacherSheets = averageGradeSheets.filter(
      (sheet) => ownedCourseIds.has(String(sheet.courseId || "").trim())
    );

    if (students.length === 0 || teacherSheets.length === 0) {
      setStudentAverages([]);
      return;
    }

    const averages: StudentAverage[] = [];
    const hasWeightedSheets = teacherSheets.some(
      (sheet) => Math.max(0, Number(sheet.weightPercentage) || 0) > 0
    );

    const studentIdsInSheets = new Set(
      teacherSheets.flatMap((sheet) =>
        sheet.students.map((student) => student.studentId)
      )
    );

    const filteredStudents = students.filter((student) =>
      studentIdsInSheets.has(student.id)
    );

    filteredStudents.forEach((student) => {
      const studentAvg: StudentAverage = {
        studentId: student.id,
        studentName: student.name,
        email: student.email,
        idNumber: student.idNumber,
        averages: {},
        overallAverage: 0,
        approved: false,
        completedSheets: 0,
        totalSheets: teacherSheets.length,
        firstTermAverage: 0,
        secondTermAverage: 0,
        firstTermEquivalent: 0,
        secondTermEquivalent: 0,
      };

      let firstTermSimpleSum = 0;
      let firstTermSimpleCount = 0;
      let secondTermSimpleSum = 0;
      let secondTermSimpleCount = 0;
      let firstTermAggregateSum = 0;
      let firstTermAggregateUnits = 0;
      let secondTermAggregateSum = 0;
      let secondTermAggregateUnits = 0;
      let firstTermWeightedSum = 0;
      let firstTermWeight = 0;
      let secondTermWeightedSum = 0;
      let secondTermWeight = 0;

      teacherSheets.forEach((sheet) => {
        const studentInSheet = sheet.students.find(
          (s) => s.studentId === student.id
        );

        if (studentInSheet) {
          const hasAtLeastOneGrade = (sheet.activities || []).some(
            (activity) =>
              getActivityGradeValue(studentInSheet.grades || {}, activity) !== null
          );

          const normalizedTotal = calculateNormalizedTotal(
            studentInSheet.grades || {},
            sheet.activities || []
          );
          const gradedActivityCount = (sheet.activities || []).filter(
            (activity) =>
              getActivityGradeValue(studentInSheet.grades || {}, activity) !== null
          ).length;
          const aggregationUnits =
            gradedActivityCount > 0
              ? gradedActivityCount
              : Array.isArray(sheet.activities) && sheet.activities.length > 0
                ? sheet.activities.length
                : 1;

          studentAvg.averages[sheet.id] = normalizedTotal;

          if (hasAtLeastOneGrade) {
            const sheetWeightFactor =
              Math.max(0, Number(sheet.weightPercentage) || 0) / 100;
            const supportedTerm = getSupportedTerm(sheet.gradingPeriod);

            studentAvg.completedSheets++;

            if (supportedTerm === "1st Term") {
              firstTermSimpleSum += normalizedTotal;
              firstTermSimpleCount += 1;
              firstTermAggregateSum += normalizedTotal * aggregationUnits;
              firstTermAggregateUnits += aggregationUnits;
              if (sheetWeightFactor > 0) {
                firstTermWeightedSum += normalizedTotal * sheetWeightFactor;
                firstTermWeight += sheetWeightFactor;
              }
            }

            if (supportedTerm === "2nd Term") {
              secondTermSimpleSum += normalizedTotal;
              secondTermSimpleCount += 1;
              secondTermAggregateSum += normalizedTotal * aggregationUnits;
              secondTermAggregateUnits += aggregationUnits;
              if (sheetWeightFactor > 0) {
                secondTermWeightedSum += normalizedTotal * sheetWeightFactor;
                secondTermWeight += sheetWeightFactor;
              }
            }

          }
        } else {
          studentAvg.averages[sheet.id] = 0;
        }
      });

      studentAvg.firstTermAverage = hasWeightedSheets
        ? firstTermWeight > 0
          ? firstTermWeightedSum / firstTermWeight
          : firstTermAggregateUnits > 0
          ? firstTermAggregateSum / firstTermAggregateUnits
          : firstTermSimpleCount > 0
          ? firstTermSimpleSum / firstTermSimpleCount
          : 0
        : firstTermAggregateUnits > 0
        ? firstTermAggregateSum / firstTermAggregateUnits
        : firstTermSimpleCount > 0
        ? firstTermSimpleSum / firstTermSimpleCount
        : 0;

      studentAvg.secondTermAverage = hasWeightedSheets
        ? secondTermWeight > 0
          ? secondTermWeightedSum / secondTermWeight
          : secondTermAggregateUnits > 0
          ? secondTermAggregateSum / secondTermAggregateUnits
          : secondTermSimpleCount > 0
          ? secondTermSimpleSum / secondTermSimpleCount
          : 0
        : secondTermAggregateUnits > 0
        ? secondTermAggregateSum / secondTermAggregateUnits
        : secondTermSimpleCount > 0
        ? secondTermSimpleSum / secondTermSimpleCount
        : 0;

      const termAveragesForFinal: number[] = [];
      if (firstTermSimpleCount > 0) {
        termAveragesForFinal.push(studentAvg.firstTermAverage);
      }
      if (secondTermSimpleCount > 0) {
        termAveragesForFinal.push(studentAvg.secondTermAverage);
      }

      studentAvg.overallAverage =
        termAveragesForFinal.length > 0
          ? termAveragesForFinal.reduce((sum, grade) => sum + grade, 0) /
            termAveragesForFinal.length
          : 0;
      const termShare =
        termAveragesForFinal.length > 0 ? 100 / termAveragesForFinal.length : 0;
      studentAvg.firstTermEquivalent =
        firstTermSimpleCount > 0 ? termShare : 0;
      studentAvg.secondTermEquivalent =
        secondTermSimpleCount > 0 ? termShare : 0;

      studentAvg.approved = studentAvg.overallAverage >= 3.0;

      averages.push(studentAvg);
    });

    averages.sort((a, b) => b.overallAverage - a.overallAverage);
    setStudentAverages(averages);
  };


  const saveCommentWithDebounce = useCallback((
  studentId: string,
  activityId: string,
  comment: string
) => {
  const key = `${studentId}-${activityId}`;
  
  if (commentTimeoutsRef.current.has(key)) {
    clearTimeout(commentTimeoutsRef.current.get(key));
    commentTimeoutsRef.current.delete(key);
  }

  const timeout = setTimeout(() => {
    updateStudentGrade(
      studentId,
      activityId,
      "comment",
      comment
    );
    commentTimeoutsRef.current.delete(key);
  }, 1000);

  commentTimeoutsRef.current.set(key, timeout);
}, []);

  const createNewGradeSheet = async () => {
    setError("");

    if (!newSheet.title.trim()) {
      setError("Sheet title is required");
      return;
    }

    if (!newSheet.courseId) {
      setError("You must select a course");
      return;
    }

    const selectedCourse = courses.find((c) => c.id === newSheet.courseId);
    
    if (!selectedCourse) {
      setError("Invalid selected course");
      return;
    }

    const teacherName = user?.name || user?.email?.split('@')[0] || "Teacher";

    try {
      const courseStudents = students.filter((s) =>
        selectedCourse.enrolledStudents?.includes(s.id)
      );

      if (!courseStudents || courseStudents.length === 0) {
        setError("The course has no enrolled students");
        return;
      }

      const studentGrades: StudentGrade[] = courseStudents
        .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
        .map((student) => {
          const initialGrades: Record<string, any> = {};
          newSheet.activities.forEach(activity => {
            initialGrades[activity.id] = {
              value: null,
              comment: "",
              submittedAt: null,
            };
          });

          return {
            studentId: student.id,
            name: student.name,
            grades: initialGrades,
            total: 0,
            status: "pending",
          };
        });

      setIsSaving(true);

      const firebaseData = {
        title: newSheet.title.trim(),
        courseId: newSheet.courseId,
        courseName: selectedCourse.name,
        teacherId: user?.id || "",
        teacherName: teacherName,
        gradingPeriod: newSheet.gradingPeriod,
        weightPercentage: 0,
        activities: newSheet.activities.map(act => ({
          id: act.id,
          name: act.name,
          maxScore: act.maxScore,
          type: act.type,
          description: act.description || "",
        })),
        students: studentGrades,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        isPublished: false,
      };

      const validation = gradeSheetSchema.safeParse(firebaseData);
      
      if (!validation.success) {
        setError("Data validation error");
        setIsSaving(false);
        return;
      }

      const docRef = await addDoc(collection(firebaseDB, "gradeSheets"), firebaseData);

      const newGradeSheet: GradeSheet = {
        id: docRef.id,
        title: newSheet.title.trim(),
        courseId: newSheet.courseId,
        courseName: selectedCourse.name,
        teacherId: user?.id || "",
        teacherName: teacherName,
        gradingPeriod: newSheet.gradingPeriod,
        weightPercentage: 0,
        activities: newSheet.activities,
        students: studentGrades,
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublished: false,
      };

      setGradeSheets((prev) => [newGradeSheet, ...prev]);
      setCurrentSheet(newGradeSheet);
      setShowNewSheetModal(false);
      
      setNewSheet({
        title: "",
        courseId: "",
        courseName: "",
        gradingPeriod: "1st Term",
        activities: [],
      });
      
      setSuccess("Grade sheet created successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(`Error al crear la hoja: ${errorMessage}`);
    } finally {
      setIsSaving(false);
    }
  };

  const addActivityToNewSheet = () => {
    if (!newActivityForModal.name.trim()) {
      setError("Activity name is required");
      return;
    }

    const activity: Activity = {
      id: `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: newActivityForModal.name,
      maxScore: newActivityForModal.maxScore,
      type: newActivityForModal.type,
      description: newActivityForModal.description,
    };

    setNewSheet((prev) => ({
      ...prev,
      activities: [...prev.activities, activity],
    }));

    setNewActivityForModal({
      name: "",
      maxScore: 5.0,
      type: "quiz",
      description: "",
    });
  };

  const addActivityToCurrentSheet = async () => {
    if (!currentSheet) {
      setError("No selected grade sheet");
      return;
    }

    if (!newActivityForCurrentSheet.name.trim()) {
      setError("Activity name is required");
      return;
    }

    const newActivity: Activity = {
      id: `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: newActivityForCurrentSheet.name,
      maxScore: newActivityForCurrentSheet.maxScore,
      type: newActivityForCurrentSheet.type,
      description: newActivityForCurrentSheet.description || "",
    };

    try {
      const updatedStudents = currentSheet.students.map((student) => {
        const cleanedExistingGrades = Object.entries(
          student.grades || {}
        ).reduce(
          (acc, [key, value]) => {
            acc[key] = {
              value: value.value ?? null,
              comment: value.comment || "",
              submittedAt: value.submittedAt ?? null,
            };
            return acc;
          },
          {} as Record<string, any>
        );

        cleanedExistingGrades[newActivity.id] = {
          value: null,
          comment: "",
          submittedAt: null,
        };

        return {
          ...student,
          grades: cleanedExistingGrades,
        };
      });

      const firebaseData = {
        activities: [...currentSheet.activities, newActivity].map((act) => ({
          id: act.id,
          name: act.name,
          maxScore: act.maxScore,
          type: act.type,
          description: act.description || "",
        })),
        students: updatedStudents.map((student) => ({
          studentId: student.studentId,
          name: student.name,
          grades: Object.entries(student.grades).reduce(
            (acc, [key, value]) => {
              acc[key] = {
                value: value.value ?? null,
                comment: value.comment || "",
                submittedAt: value.submittedAt ?? null,
              };
              return acc;
            },
            {} as Record<string, any>
          ),
          total: student.total ?? 0,
          status: student.status || "pending",
        })),
        updatedAt: Timestamp.now(),
      };

      const cleanedFirebaseData = cleanDataForFirebase(firebaseData);
      await updateDoc(
        doc(firebaseDB, "gradeSheets", currentSheet.id),
        cleanedFirebaseData
      );

      const updatedSheet = {
        ...currentSheet,
        activities: [...currentSheet.activities, newActivity],
        students: updatedStudents,
        updatedAt: new Date(),
      };

      setCurrentSheet(updatedSheet);
      setShowAddActivityModal(false);
      setNewActivityForCurrentSheet({
        name: "",
        maxScore: 5.0,
        type: "quiz",
        description: "",
      });
      setSuccess("Activity added successfully");

      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      setError("Error adding activity");
    }
  };

  const removeActivityFromNewSheet = (activityId: string) => {
    setNewSheet((prev) => ({
      ...prev,
      activities: prev.activities.filter((act) => act.id !== activityId),
    }));
  };

  const deleteGradeSheet = async (sheetId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (
      !confirm(
        "Are you sure you want to delete this grade sheet? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      await deleteDoc(doc(firebaseDB, "gradeSheets", sheetId));

      setGradeSheets((prev) => prev.filter((sheet) => sheet.id !== sheetId));

      if (currentSheet?.id === sheetId) {
        setCurrentSheet(null);
      }

      setSuccess("Grade sheet deleted successfully");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError("Error deleting grade sheet");
    }
  };

  const removeActivityFromCurrentSheet = async (activityId: string) => {
    if (
      !currentSheet ||
      !confirm(
        "Are you sure you want to delete this activity? All associated grades will be removed."
      )
    ) {
      return;
    }

    try {
      const updatedActivities = currentSheet.activities.filter(
        (act) => act.id !== activityId
      );

      const updatedStudents = currentSheet.students.map((student) => {
        const { [activityId]: removed, ...remainingGrades } = student.grades;
        return {
          ...student,
          grades: remainingGrades,
          total: calculateStudentTotal(remainingGrades, updatedActivities),
        };
      });

      await updateDoc(doc(firebaseDB, "gradeSheets", currentSheet.id), {
        activities: updatedActivities,
        students: updatedStudents,
        updatedAt: Timestamp.now(),
      });

      setCurrentSheet({
        ...currentSheet,
        activities: updatedActivities,
        students: updatedStudents,
        updatedAt: new Date(),
      });

      setSuccess("Activity deleted successfully");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError("Error deleting activity");
    }
  };

  const saveGradeChanges = useCallback(
    async (sheetId: string, updatedStudents: StudentGrade[]) => {
      try {
        await updateDoc(doc(firebaseDB, "gradeSheets", sheetId), {
          students: updatedStudents,
          updatedAt: Timestamp.now(),
        });
      } catch (err) {}
    },
    []
  );

  const updateStudentGrade = (
    studentId: string,
    activityId: string,
    field: "value" | "comment",
    value: string | number
  ) => {
    if (!currentSheet) return;

    const updatedStudents = currentSheet.students.map((student) => {
      if (student.studentId === studentId) {
        const existingGrade = student.grades[activityId] || {};
        const isClearingValue =
          field === "value" && String(value).trim() === "";
        const numericValue = field === "value" ? Number(value) : null;

        const updatedGrades = {
          ...student.grades,
          [activityId]: {
            ...existingGrade,
            [field]:
              field === "value"
                ? isClearingValue || Number.isNaN(numericValue)
                  ? null
                  : numericValue
                : value,
            submittedAt:
              field === "value"
                ? isClearingValue
                  ? null
                  : new Date()
                : existingGrade.submittedAt ?? null,
          },
        };

        const total = calculateStudentTotal(
          updatedGrades,
          currentSheet.activities
        );

        return {
          ...student,
          grades: updatedGrades,
          total,
          status: determineStatus(updatedGrades, currentSheet.activities),
        };
      }
      return student;
    });

    const sortedStudents = updatedStudents.sort((a, b) =>
      a.name.localeCompare(b.name, "es", { sensitivity: "base" })
    );

    const updatedSheet = {
      ...currentSheet,
      students: sortedStudents,
    };

    setCurrentSheet(updatedSheet);
    if (currentSheet.id) {
      saveGradeChanges(currentSheet.id, sortedStudents);
    }
  };

  const calculateStudentTotal = (
    grades: Record<string, any>,
    activities: Activity[]
  ): number => {
    let total = 0;
    let gradedActivities = 0;

    activities.forEach((activity) => {
      const grade = grades[activity.id];
      if (grade?.value !== undefined && grade.value !== null) {
        const normalizedScore = (grade.value / activity.maxScore) * 5.0;
        total += normalizedScore;
        gradedActivities++;
      }
    });

    return gradedActivities > 0 ? total / gradedActivities : 0;
  };

  const determineStatus = (
    grades: Record<string, any>,
    activities: Activity[]
  ): "pending" | "completed" | "incomplete" => {
    const gradedActivities = activities.filter(
      (act) => grades[act.id]?.value !== undefined && grades[act.id]?.value !== null
    ).length;

    if (gradedActivities === 0) return "pending";
    if (gradedActivities === activities.length) return "completed";
    return "incomplete";
  };

  const getStudentTermAverage = (student: StudentAverage, term: string): number => {
    if (term === "1st Term") return student.firstTermAverage;
    if (term === "2nd Term") return student.secondTermAverage;

    const termSheets = averageGradeSheets.filter(
      (sheet) =>
        normalizeGradingPeriod(sheet.gradingPeriod || "Final") === term,
    );
    const values = termSheets
      .map((sheet) => student.averages[sheet.id] || 0)
      .filter((value) => value > 0);

    return values.length > 0
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
  };

  const exportToCSV = () => {
    if (!currentSheet) return;

    let csvContent = "data:text/csv;charset=utf-8,";

    const headers = [
      "Student",
      "ID",
      ...currentSheet.activities.map((a) => a.name),
      "Total (0-5)",
      "Status",
    ];
    csvContent += headers.join(",") + "\n";

    currentSheet.students.forEach((student) => {
      const row = [
        student.name,
        student.studentId,
        ...currentSheet.activities.map(
          (activity) => student.grades[activity.id]?.value?.toFixed(1) || ""
        ),
        student.total?.toFixed(1) || "0.0",
        student.status,
      ];
      csvContent += row.join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `${currentSheet.title.replace(/\s+/g, "_")}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportAveragesToExcel = () => {
    if (studentAverages.length === 0) return;

    const includeTermColumns =
      averagesDisplayMode === "term" || averagesDisplayMode === "both";
    const includeSheetColumns =
      averagesDisplayMode === "sheet" || averagesDisplayMode === "both";

    const termHeaders = includeTermColumns
      ? visibleAverageTerms.map((term) =>
          term === "1st Term"
            ? `${term} (${courseTermEquivalences["1st Term"].toFixed(0)}%)`
            : term === "2nd Term"
              ? `${term} (${courseTermEquivalences["2nd Term"].toFixed(0)}%)`
              : term,
        )
      : [];

    const usedLabels = new Map<string, number>();
    const sheetColumns = includeSheetColumns
      ? visibleAverageSheets.map((sheet) => {
          const baseLabel = `${sheet.title} (${normalizeGradingPeriod(
            sheet.gradingPeriod || "Final",
          )})`;
          const count = (usedLabels.get(baseLabel) || 0) + 1;
          usedLabels.set(baseLabel, count);
          return {
            id: sheet.id,
            label: count > 1 ? `${baseLabel} #${count}` : baseLabel,
          };
        })
      : [];

    const rows: Array<Record<string, string | number>> = studentAverages.map(
      (student) => {
        const row: Record<string, string | number> = {
          Student: student.studentName,
        };

        if (includeTermColumns) {
          visibleAverageTerms.forEach((term, index) => {
            const average = getStudentTermAverage(student, term);
            row[termHeaders[index]] = average > 0 ? Number(average.toFixed(1)) : "--";
          });
        }

        if (includeSheetColumns) {
          sheetColumns.forEach((sheetColumn) => {
            const average = student.averages[sheetColumn.id] || 0;
            row[sheetColumn.label] = Number(average.toFixed(1));
          });
        }

        row["Avg. score"] = Number(student.overallAverage.toFixed(1));
        row.Passed = student.approved ? "Yes" : "No";
        return row;
      },
    );

    const headerOrder = [
      "Student",
      ...termHeaders,
      ...sheetColumns.map((column) => column.label),
      "Avg. score",
      "Passed",
    ];

    const worksheet = XLSX.utils.json_to_sheet(rows, { header: headerOrder });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Averages");

    const modeLabel =
      averagesDisplayMode === "term"
        ? "by-term"
        : averagesDisplayMode === "sheet"
          ? "by-sheet"
          : "term-and-sheet";
    const termLabel =
      selectedAveragesTerm === "all"
        ? "all-terms"
        : selectedAveragesTerm.toLowerCase().replace(/\s+/g, "-");
    XLSX.writeFile(workbook, `student_averages_${modeLabel}_${termLabel}.xlsx`);
  };

  const publishGradeSheet = async () => {
    if (
      !currentSheet ||
      !confirm(
        "Publish grades? Students will be able to see them."
      )
    ) {
      return;
    }

    try {
      await updateDoc(doc(firebaseDB, "gradeSheets", currentSheet.id), {
        isPublished: true,
        updatedAt: Timestamp.now(),
      });

      if (isNotificationAutomationEnabled(user?.id, "gradePublished")) {
        const recipientIds = currentSheet.students
          .map((student) => student.studentId)
          .filter((id): id is string => typeof id === "string" && id.length > 0);
        const uniqueRecipientIds = Array.from(new Set(recipientIds));
        const courseCode = courses.find((course) => course.id === currentSheet.courseId)?.code;

        if (uniqueRecipientIds.length > 0) {
          await Promise.all(
            uniqueRecipientIds.map((studentId) =>
              notificationService.createNotification(studentId, {
                title: "Grades published",
                message: `Grades for "${currentSheet.title}" are now available.`,
                type: "success",
                link: courseCode ? `/courses/${courseCode}/grades` : "/grades",
              }),
            ),
          );
        }
      }

      setCurrentSheet((prev) => (prev ? { ...prev, isPublished: true } : null));
      setSuccess("Grades published successfully");

      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError("Error publishing grades");
    }
  };

  const selectedCourseDetails =
    selectedCourseFilter === "all"
      ? null
      : courses.find((course) => course.id === selectedCourseFilter) || null;

  const globalAverage =
    gradedStudentAverages.length > 0
      ? (
          gradedStudentAverages.reduce(
            (sum, student) => sum + student.overallAverage,
            0,
          ) / gradedStudentAverages.length
        ).toFixed(1)
      : "0.0";

  return (
    <DashboardLayout contentClassName="pt-0 lg:pt-1">
      <div className="relative overflow-x-hidden">
        <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
        <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />

        <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <div className="flex flex-col gap-3">
            <section className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
              <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-sky-200/35" />
              <div className="pointer-events-none absolute -right-24 -bottom-24 h-64 w-64 rounded-full bg-indigo-200/35" />
              <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Grade Sheets Workspace
                  </div>
                  <h2 className="mt-3 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                    Grade sheets command center
                  </h2>
                  <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                    Create sheets, grade faster, and monitor student averages in one place.
                  </p>
                  {selectedCourseDetails && (
                    <p className="mt-2 text-xs font-medium text-slate-500">
                      Course: {selectedCourseDetails.code} · {selectedCourseDetails.name}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setShowNewSheetModal(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                >
                  <Plus className="h-4 w-4" />
                  New sheet
                </button>
              </div>
            </section>

            {isSyncing && (
              <div className="rounded-2xl border border-sky-100 bg-sky-50 p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-sky-600"></div>
                  <span className="text-sm font-medium text-sky-700">
                    Syncing students...
                  </span>
                </div>
              </div>
            )}

            <section className="rounded-2xl border border-slate-200/60 bg-white p-3 shadow-sm">
              <div className="grid grid-cols-2 gap-2 md:gap-2.5 lg:grid-cols-5">
                <div className="rounded-xl border border-slate-200/60 bg-white p-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="mb-1 text-center text-xs font-semibold tracking-wide text-slate-500 md:text-left">
                        {selectedCourseFilter === "all" ? "Total sheets" : `${selectedCourseDetails?.code || ""}`}
                      </p>
                      <p className="text-center text-lg font-extrabold text-slate-900 md:text-left">
                        {filteredGradeSheets.length}
                      </p>
                    </div>
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100">
                      <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200/60 bg-white p-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="mb-1 text-center text-xs font-semibold tracking-wide text-slate-500 md:text-left">
                        Active courses
                      </p>
                      <p className="text-center text-lg font-extrabold text-slate-900 md:text-left">
                        {courses.length}
                      </p>
                    </div>
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100">
                      <BookOpen className="h-3.5 w-3.5 text-indigo-700" />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200/60 bg-white p-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="mb-1 text-center text-xs font-semibold tracking-wide text-slate-500 md:text-left">
                        Students
                      </p>
                      <p className="text-center text-lg font-extrabold text-slate-900 md:text-left">
                        {students.length}
                      </p>
                    </div>
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100">
                      <Users className="h-3.5 w-3.5 text-emerald-700" />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200/60 bg-white p-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="mb-1 text-center text-xs font-semibold tracking-wide text-slate-500 md:text-left">
                        Current term
                      </p>
                      <p className="text-center text-lg font-extrabold text-slate-900 md:text-left">
                        2025-2
                      </p>
                    </div>
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100">
                      <Calendar className="h-3.5 w-3.5 text-amber-700" />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200/60 bg-white p-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="mb-1 text-center text-xs font-semibold tracking-wide text-slate-500 md:text-left">
                        Avg. score
                      </p>
                      <p className="text-center text-lg font-extrabold text-slate-900 md:text-left">
                        {globalAverage}
                      </p>
                    </div>
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100">
                      <BarChart3 className="h-3.5 w-3.5 text-sky-700" />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200/60 bg-white p-3 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search sheets by title, course, or teacher..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full rounded-xl border border-slate-200/60 bg-slate-50 py-3 pl-10 pr-4 text-sm font-medium text-slate-700 transition-all focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                      />
                    </div>
                  </div>

                  <div className="relative min-w-[180px]">
                    <School className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <select
                      value={selectedCourseFilter}
                      onChange={(e) => setSelectedCourseFilter(e.target.value)}
                      className="h-12 w-full appearance-none rounded-xl border border-slate-300/60 bg-white pl-10 pr-9 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    >
                      <option value="all">All courses</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.code}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAveragesSection(!showAveragesSection)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50",
                      showAveragesSection &&
                        "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100",
                    )}
                  >
                    <TrendingUp className="h-4 w-4" />
                    Averages
                  </button>
                </div>
              </div>
            </section>
        {success && (
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-4 w-4 text-sky-700" />
              <div>
                <p className="font-medium text-sky-800">{success}</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-4 w-4 text-rose-700" />
              <div>
                <p className="font-medium text-rose-800">{error}</p>
              </div>
            </div>
          </div>
        )}
        {showAveragesSection && studentAverages.length > 0 && (
          <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold text-xl text-gray-900">
                    Averages por Student
                  </h3>
                  <p className="text-sm text-gray-600">
                    Average summary across all grade sheets
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Si no hay pesos por hoja, la equivalencia de 1st/2nd Term se calcula por actividades (o por hojas si no hay actividades).
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <select
                    value={averagesDisplayMode}
                    onChange={(e) =>
                      setAveragesDisplayMode(
                        e.target.value as "term" | "sheet" | "both",
                      )
                    }
                    className="h-9 rounded-xl border border-slate-200/60 bg-white px-3 pr-8 text-sm font-medium text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="term">Average by term</option>
                    <option value="sheet">Grades by sheet</option>
                    <option value="both">Term + sheet</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
                <div className="relative">
                  <select
                    value={selectedAveragesTerm}
                    onChange={(e) => setSelectedAveragesTerm(e.target.value)}
                    className="h-9 rounded-xl border border-slate-200/60 bg-white px-3 pr-8 text-sm font-medium text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="all">All terms</option>
                    {averagesTermOptions.map((term) => (
                      <option key={term} value={term}>
                        {term}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
                <button
                  onClick={exportAveragesToExcel}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <Download className="h-4 w-4" />
                  Export Excel
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200/60 [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar]:h-2">
              <table className="w-full table-modern">
                <thead>
                  <tr className="bg-slate-50/80">
                    <th className="py-3 px-4 text-left font-bold text-gray-900 tracking-wide">
                      Student
                    </th>
                    {(averagesDisplayMode === "term" ||
                      averagesDisplayMode === "both") && (
                      visibleAverageTerms.map((term) => (
                        <th
                          key={`term-header-${term}`}
                          className="py-3 px-4 text-left font-bold text-gray-900 tracking-wide"
                        >
                          {term === "1st Term"
                            ? `${term} (${courseTermEquivalences["1st Term"].toFixed(0)}%)`
                            : term === "2nd Term"
                              ? `${term} (${courseTermEquivalences["2nd Term"].toFixed(0)}%)`
                              : term}
                        </th>
                      ))
                    )}

                    {(averagesDisplayMode === "sheet" ||
                      averagesDisplayMode === "both") &&
                      visibleAverageSheets.map((sheet) => (
                        <th
                          key={sheet.id}
                          className="py-3 px-4 text-left font-bold text-gray-900 tracking-wide align-top"
                        >
                          <div className="max-w-[220px] min-w-[150px] whitespace-normal break-words leading-snug">
                            {sheet.title}
                          </div>
                        </th>
                      ))}
                    <th className="py-3 px-4 text-left font-bold text-gray-900 tracking-wide">
                      Avg. score
                    </th>
                    <th className="py-3 px-4 text-left font-bold text-gray-900 tracking-wide">
                      Passed
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {studentAverages.map((student) => (
                    <tr key={student.studentId} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div>
                            <span className="font-medium text-gray-900 whitespace-nowrap">
                      {student.studentName}
                            </span>
                          </div>
                        </div>
                      </td>
                      {(averagesDisplayMode === "term" ||
                        averagesDisplayMode === "both") && (
                        visibleAverageTerms.map((term) => {
                          const termAverage = getStudentTermAverage(student, term);

                          return (
                            <td key={`${student.studentId}-term-${term}`} className="py-3 px-4">
                              <div className="text-center">
                                <span
                                  className={cn(
                                    "text-sm font-bold",
                                    termAverage >= 4.0
                                      ? "text-blue-600"
                                      : termAverage >= 3.0
                                        ? "text-blue-600"
                                        : termAverage > 0
                                          ? "text-gray-700"
                                          : "text-gray-400",
                                  )}
                                >
                                  {termAverage > 0 ? termAverage.toFixed(1) : "--"}
                                </span>
                              </div>
                            </td>
                          );
                        })
                      )}

                      {(averagesDisplayMode === "sheet" ||
                        averagesDisplayMode === "both") &&
                        visibleAverageSheets.map((sheet) => {
                          const average = student.averages[sheet.id] || 0;
                          return (
                            <td key={sheet.id} className="py-3 px-4">
                              <div className="text-center">
                                <span
                                  className={cn(
                                    "text-sm font-bold",
                                    average >= 4.0
                                      ? "text-blue-600"
                                      : average >= 3.0
                                        ? "text-blue-600"
                                        : average > 0
                                          ? "text-gray-700"
                                          : "text-gray-400",
                                  )}
                                >
                                  {average.toFixed(1)}
                                </span>
                              </div>
                            </td>
                          );
                        })}

                      <td className="py-3 px-4">
                        <div className="text-center">
                          <span
                            className={cn(
                              "text-lg font-bold",
                              student.overallAverage >= 4.0
                                ? "text-blue-600"
                                : student.overallAverage >= 3.0
                                ? "text-blue-600"
                                : student.overallAverage > 0
                                ? "text-gray-700"
                                : "text-gray-400"
                            )}
                          >
                            {student.overallAverage.toFixed(1)}
                          </span>
                          <div className="text-xs text-gray-500">/5.0</div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={cn(
                            "inline-flex items-center px-3 py-1 rounded-full text-xs font-bold",
                            student.approved
                              ? "bg-blue-100 text-blue-700"
                              : "bg-gray-100 text-gray-700"
                          )}
                        >
                          {student.approved ? "Yes" : "No"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <div className="text-xs font-semibold text-blue-600 mb-1">
                  Students Passeds
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {studentAverages.filter((s) => s.approved).length}
                  <span className="text-sm text-gray-600 ml-2">
                    (
                    {Math.round(
                      (studentAverages.filter((s) => s.approved).length /
                        studentAverages.length) *
                        100
                    )}
                    %)
                  </span>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <div className="text-xs font-semibold text-blue-600 mb-1">
                  Highest average
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {studentAverages.length > 0
                    ? Math.max(
                        ...studentAverages.map((s) => s.overallAverage)
                      ).toFixed(1)
                    : "0.0"}
                </div>
              </div>

              <div className="bg-gray-100 border border-gray-200/60 rounded-xl p-3">
                <div className="text-xs font-semibold text-gray-700 mb-1">
                  Lowest average
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {studentAverages.length > 0
                    ? Math.min(
                        ...studentAverages
                          .filter((s) => s.overallAverage > 0)
                          .map((s) => s.overallAverage)
                      ).toFixed(1)
                    : "0.0"}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <div className="text-xs font-semibold text-blue-600 mb-1">
                  Completed sheets
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {studentAverages.length > 0
                    ? (
                        studentAverages.reduce(
                          (sum, s) => sum + s.completedSheets,
                          0
                        ) / studentAverages.length
                      ).toFixed(1)
                    : "0.0"}
                  <span className="text-sm text-gray-600 ml-2">
                    per student
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        {currentSheet && (
          <div
            ref={currentSheetSectionRef}
            className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm"
          >
            <div className="mb-4 flex items-start justify-between gap-2 border-b border-gray-200/60 pb-3">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <div className="h-8 w-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold text-xl text-gray-900">
                    {currentSheet.title}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    <span className="text-sm text-gray-600">
                      {currentSheet.courseName}
                    </span>
                    <span className="text-sm text-gray-600">•</span>
                    <span className="text-sm text-gray-600">
                      {currentSheet.teacherName}
                    </span>
                    <span
                      className={cn(
                        "ml-2 px-2 py-1 rounded-full text-xs font-bold",
                        currentSheet.isPublished
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-100 text-gray-700"
                      )}
                    >
                      {currentSheet.isPublished ? "Published" : "Draft"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <button
                  onClick={() => setShowAddActivityModal(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  title={
                    currentSheet.isPublished
                      ? "This sheet is published. New activities will remain unpublished until you publish again."
                      : "Add activity"
                  }
                >
                  <Plus className="h-4 w-4" />
                  Activity
                </button>

                {!currentSheet.isPublished && (
                  <button
                    onClick={publishGradeSheet}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Eye className="h-4 w-4" />
                    Publish
                  </button>
                )}

                <button
                  onClick={exportToCSV}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <Download className="h-4 w-4" />
                  CSV
                </button>
                <button
                  onClick={() => setCurrentSheet(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200/60 [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar]:h-2">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="bg-slate-50/80">
                    <th className="sticky left-0 z-20 bg-blue-50 border-r border-gray-200/60 px-3 py-3 text-left font-bold text-gray-900 tracking-wide min-w-[200px]">
                      <div className="flex items-center justify-between">
                        <span>Student</span>
                        <span className="text-xs font-medium text-gray-500">
                          {currentSheet.students.length}
                        </span>
                      </div>
                    </th>

                    {currentSheet.activities.map((activity) => {
                      const activityName = toPlainText(activity.name, "Untitled activity");
                      const activityDescription = toPlainText(activity.description || "");

                      return (
                        <th
                          key={activity.id}
                          className="px-3 py-3 text-left font-bold text-gray-900 tracking-wide border-b border-gray-200/60 min-w-[140px]"
                        >
                          <div className="flex flex-col gap-1">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div
                                  className="text-sm font-bold truncate cursor-help"
                                  title={`${activityName}\nType: ${activity.type}\nMax: ${activity.maxScore}${
                                    activityDescription ? `\n\n${activityDescription}` : ""
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (activityDescription) {
                                      alert(`Description:\n\n${activityDescription}`);
                                    }
                                  }}
                                >
                                  {activityName}
                                </div>
                              </div>

                              <div className="flex items-center">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeActivityFromCurrentSheet(activity.id);
                                  }}
                                  className="ml-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-300 transition-colors"
                                  title="Delete activity"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {activityDescription && (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  className="text-gray-400 hover:text-gray-600"
                                  title={`View full description: ${activityDescription}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    alert(`Description:\n\n${activityDescription}`);
                                  }}
                                >
                                  <Info className="h-3 w-3" />
                                </button>
                                <div className="text-[10px] text-gray-500 truncate flex-1">
                                  {activityDescription.length > 25
                                    ? `${activityDescription.substring(0, 25)}...`
                                    : activityDescription}
                                </div>
                              </div>
                            )}
                          </div>
                        </th>
                      );
                    })}

                    <th className="px-3 py-3 text-left font-bold text-gray-900 tracking-wide border-b border-gray-200/60 bg-blue-50 min-w-[100px]">
                      <div className="text-center">
                        <div className="text-sm font-bold">Total</div>
                        <div className="text-xs text-gray-500">0-5.0</div>
                      </div>
                    </th>
                    <th className="px-3 py-3 text-left font-bold text-gray-900 tracking-wide border-b border-gray-200/60 bg-blue-50 min-w-[100px]">
                      <div className="text-center">
                        <div className="text-sm font-bold">Status</div>
                      </div>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {currentSheet.students.map((student) => {
               
               










const StudentGradeCell = ({
  activity,
}: {
  activity: Activity;
}) => {
  const grade = student.grades[activity.id];
  const hasGrade = grade?.value !== undefined && grade?.value !== null;
  const hasComment = grade?.comment && grade.comment.trim() !== "";
  const isSavedToFirebase = grade?.submittedAt !== undefined && grade?.submittedAt !== null;
  const isLockedSavedGrade = isSavedToFirebase && hasGrade;
  const [isEditing, setIsEditing] = useState(false);
  const [allowSavedEdit, setAllowSavedEdit] = useState(false);
  const [editTimeout, setEditTimeout] = useState<NodeJS.Timeout | null>(null);
  const gradeInputRef = useRef<HTMLInputElement | null>(null);
  const [localValue, setLocalValue] = useState<string>(
    grade?.value?.toString() || ""
  );
  const [localComment, setLocalComment] = useState<string>(
    grade?.comment || ""
  );
  const canEditValue = !isLockedSavedGrade || allowSavedEdit;

  useEffect(() => {
    setLocalComment(grade?.comment || "");
  }, [grade?.comment]);

  useEffect(() => {
    return () => {
      if (editTimeout) {
        clearTimeout(editTimeout);
      }
      const key = `${student.studentId}-${activity.id}`;
      if (commentTimeoutsRef.current.has(key)) {
        clearTimeout(commentTimeoutsRef.current.get(key));
        commentTimeoutsRef.current.delete(key);
      }
    };
  }, [editTimeout, student.studentId, activity.id]);

  useEffect(() => {
    setLocalValue(grade?.value?.toString() || "");
    
    return () => {
      if (localValue.trim() !== "" && !isSavedToFirebase) {
        const currentGradeValue = grade?.value?.toString() || "";
        if (localValue !== currentGradeValue) {
          updateStudentGrade(
            student.studentId,
            activity.id,
            "value",
            localValue
          );
        }
      }
    };
  }, [grade?.value]);

  const handleCommentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newComment = e.target.value;
    setLocalComment(newComment);
    
    saveCommentWithDebounce(
      student.studentId,
      activity.id,
      newComment
    );
  };

                      const startEditingSession = (inputElement: HTMLInputElement, forceEdit = false) => {
                        const canStartEditing = canEditValue || forceEdit;
                        if (!canStartEditing) {
                          return;
                        }

                        setIsEditing(true);
                        inputElement.focus();
                        inputElement.select();

                        if (editTimeout) {
                          clearTimeout(editTimeout);
                        }

                        const timeout = setTimeout(() => {
                          if (canStartEditing) {
                            setIsEditing(false);
                            if (localValue.trim() !== "") {
                              updateStudentGrade(
                                student.studentId,
                                activity.id,
                                "value",
                                localValue
                              );
                            }
                            setAllowSavedEdit(false);
                          }
                        }, 30000);

                        setEditTimeout(timeout);
                      };

                      const triggerDoubleClickEdit = () => {
                        const inputElement = gradeInputRef.current;
                        if (!inputElement) return;

                        if (isLockedSavedGrade && !allowSavedEdit) {
                          setAllowSavedEdit(true);
                          setTimeout(() => {
                            startEditingSession(inputElement, true);
                          }, 0);
                          return;
                        }

                        startEditingSession(inputElement);
                      };

















                      const handleFocus = (
                        e: React.FocusEvent<HTMLInputElement>
                      ) => {
                        if (!canEditValue) return;
                        startEditingSession(e.target);
                      };

                      const handleBlur = (
                        e: React.FocusEvent<HTMLInputElement>
                      ) => {
                        if (canEditValue) {
                          const newValue = e.target.value.trim();
                          const currentGradeValue =
                            grade?.value?.toString() || "";

                          if (newValue === "" && hasGrade) {
                            if (confirm("Do you want to remove this grade?")) {
                              updateStudentGrade(
                                student.studentId,
                                activity.id,
                                "value",
                                ""
                              );
                            } else {
                              e.target.value = currentGradeValue;
                              setLocalValue(currentGradeValue);
                            }
                          } else if (
                            newValue !== "" &&
                            newValue !== currentGradeValue
                          ) {
                            updateStudentGrade(
                              student.studentId,
                              activity.id,
                              "value",
                              newValue
                            );
                          }

                          if (editTimeout) {
                            clearTimeout(editTimeout);
                            setEditTimeout(null);
                          }
                          setIsEditing(false);
                          setAllowSavedEdit(false);
                        }
                      };

                      const handleDoubleClick = (
                        e: React.MouseEvent<HTMLElement>
                      ) => {
                        e.preventDefault();
                        e.stopPropagation();
                        triggerDoubleClickEdit();
                      };

                      const handleChange = (
                        e: React.ChangeEvent<HTMLInputElement>
                      ) => {
                        if (canEditValue) {
                          const value = e.target.value;
                          setLocalValue(value);
                        }
                      };

                      const handleKeyDown = (
                        e: React.KeyboardEvent<HTMLInputElement>
                      ) => {
                        const inputElement =
                          e.currentTarget as HTMLInputElement;

                        if (
                          e.key === "Enter" &&
                          !isEditing &&
                          canEditValue
                        ) {
                          e.preventDefault();
                          startEditingSession(inputElement);
                        }

                        if (
                          e.key === "Escape" &&
                          isEditing &&
                          canEditValue
                        ) {
                          if (editTimeout) {
                            clearTimeout(editTimeout);
                            setEditTimeout(null);
                          }
                          setIsEditing(false);
                          setAllowSavedEdit(false);
                          inputElement.blur();
                        }

                        if (
                          e.key === "Enter" &&
                          isEditing &&
                          canEditValue
                        ) {
                          e.preventDefault();

                          if (localValue.trim() !== "") {
                            updateStudentGrade(
                              student.studentId,
                              activity.id,
                              "value",
                              localValue
                            );
                          }

                          if (editTimeout) {
                            clearTimeout(editTimeout);
                            setEditTimeout(null);
                          }
                          setIsEditing(false);
                          setAllowSavedEdit(false);

                          const currentCell = e.currentTarget.closest("td");
                          if (currentCell) {
                            const nextCell = currentCell.nextElementSibling;
                            if (nextCell) {
                              const nextInput = nextCell.querySelector(
                                'input[type="number"]'
                              ) as HTMLInputElement;
                              if (nextInput) {
                                nextInput.focus();
                                nextInput.select();
                              }
                            }
                          }
                        }
                      };

                      return (
                      <td
      key={activity.id}
      className="px-3 py-2 border-b border-gray-200/60"
    >
      <div className="flex flex-col gap-1">
        <div className="relative" onDoubleClick={handleDoubleClick}>
          <input
            ref={gradeInputRef}
            type="number"
            min="0"
            max={activity.maxScore}
            step="0.1"
            value={canEditValue ? localValue : grade?.value || ""}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className={cn(
              "w-full px-3 py-2 border rounded-lg text-sm text-center transition-all",
              isLockedSavedGrade && !allowSavedEdit
                ? "bg-blue-50 border-blue-200 text-blue-700 font-semibold cursor-pointer"
                : hasGrade
                ? "bg-blue-50 border-blue-200 text-blue-700"
                : "border-gray-200/60 hover:border-blue-500",
              isEditing && canEditValue
                ? "ring-2 ring-blue-500 ring-opacity-50"
                : "",
              currentSheet.isPublished ? "border-gray-200/60" : ""
            )}
            placeholder={`0-${activity.maxScore}`}
            readOnly={!canEditValue}
            disabled={false}
            title={
              isLockedSavedGrade && !allowSavedEdit
                ? `Saved grade: ${grade.value}${
                    hasComment ? `\nComment: ${grade.comment}` : ""
                  }\nSaved at: ${
                    grade.submittedAt
                      ? new Date(grade.submittedAt).toLocaleString()
                      : "Recently"
                  }\nDouble click to edit${currentSheet.isPublished ? "\n\n⚠️ Published sheet" : ""}`
                : isEditing
                ? `Editing... (30 seconds)${
                    hasGrade ? `\nCurrent: ${grade.value}` : ""
                  }`
                : hasGrade
                ? `Temporary grade: ${grade.value}${
                    hasComment ? `\nComment: ${grade.comment}` : ""
                  }\nNot saved to database yet${
                    currentSheet.isPublished ? "\n\n⚠️ Published sheet" : ""
                  }`
                : `Click to add a grade${
                    currentSheet.isPublished ? "\n\n⚠️ Published sheet" : ""
                  }`
            }
            onKeyDown={handleKeyDown}
          />

          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
            {hasComment && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  alert(
                    `Comment for ${student.name}:\n\n"${grade.comment}"`
                  );
                }}
                className="text-blue-500 hover:text-blue-700 p-0.5"
                title="View comment"
                type="button"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                  />
                </svg>
              </button>
            )}

            {isSavedToFirebase && hasGrade && (
              <div
                className="h-2 w-2 rounded-full bg-blue-500 flex items-center justify-center"
                title="Saved in database"
              >
                <span className="text-[6px] text-white">✓</span>
              </div>
            )}

            {hasGrade && !isSavedToFirebase && (
              <div
                className="h-2 w-2 rounded-full bg-gray-500"
                title="Not saved in database"
              ></div>
            )}

            {isEditing && !isSavedToFirebase && (
              <div
                className="h-2 w-2 rounded-full bg-gray-400 animate-pulse"
                title="Editing..."
              ></div>
            )}

            {currentSheet.isPublished && !isEditing && (
              <div
                className="h-2 w-2 rounded-full bg-gray-500"
                title="Published sheet"
              ></div>
            )}
          </div>
        </div>
        <div className="relative flex items-center gap-1">
          <input
            type="text"
            value={localComment}
            onChange={handleCommentChange}
            className={cn(
              "w-full px-2 py-1.5 text-xs border rounded-lg transition-all",
              currentSheet.isPublished
                ? "border-gray-200/60 bg-gray-100"
                : "border-gray-200/60 focus:ring-1 focus:ring-blue-500 focus:border-transparent"
            )}
            placeholder="Comment..."
            maxLength={100}
            title={
              currentSheet.isPublished
                ? "Published sheet - Changes are visible to students"
                : "Comment saves automatically after 1 second"
            }
          />
          {localComment !== (grade?.comment || "") && (
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center">
              <div className="h-2 w-2 rounded-full bg-gray-400 animate-pulse"></div>
            </div>
          )}
          
          {localComment === (grade?.comment || "") && localComment && (
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center">
              <div className="h-2 w-2 rounded-full bg-blue-500"></div>
            </div>
          )}
        </div>
      </div>
    </td>
                      );
                    };

                    return (
                      <tr key={student.studentId} className="hover:bg-slate-50/80">
                        <td className="sticky left-0 z-10 bg-white border-r border-gray-200/60 px-3 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-bold text-blue-600">
                                {student.name.charAt(0)}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <span
                                className="text-sm font-medium text-gray-900 block truncate"
                                title={student.name}
                              >
                                {student.name}
                              </span>
                            </div>
                          </div>
                        </td>

                        {currentSheet.activities.map((activity) => (
                          <StudentGradeCell
                            key={`${student.studentId}-${activity.id}`}
                            activity={activity}
                          />
                        ))}

                        <td className="px-3 py-2 border-b border-gray-200/60 bg-blue-50">
                          <div className="text-center">
                            <span
                              className={cn(
                                "text-lg font-bold",
                                (student.total || 0) >= 3.5
                                  ? "text-blue-700"
                                  : (student.total || 0) >= 3.0
                                  ? "text-blue-700"
                                  : (student.total || 0) > 0
                                  ? "text-gray-700"
                                  : "text-gray-500"
                              )}
                            >
                              {student.total?.toFixed(1) || "0.0"}
                            </span>
                            <div className="text-xs text-gray-500">/5.0</div>
                          </div>
                        </td>

                        <td className="px-3 py-2 border-b border-gray-200/60 bg-blue-50">
                          <div className="flex justify-center">
                            <span
                              className={cn(
                                "inline-flex items-center px-3 py-1 rounded-full text-xs font-bold",
                                student.status === "completed"
                                  ? "bg-blue-100 text-blue-700"
                                  : student.status === "incomplete"
                                  ? "bg-gray-100 text-gray-700"
                                  : "bg-gray-100 text-gray-700"
                              )}
                              title={
                                student.status === "completed"
                                  ? "Completed - Todas las activities calificadas"
                                  : student.status === "incomplete"
                                  ? "Incomplete - Algunas activities sin calificar"
                                  : "Pending - Ninguna actividad calificada"
                              }
                            >
                              {student.status === "completed"
                                ? "Completed"
                                : student.status === "incomplete"
                                ? "Incomplete"
                                : "Pending"}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 [&>*]:min-w-0">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <div className="text-xs font-semibold text-blue-600 mb-1">
                  Overall average
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {currentSheet.students.length > 0
                    ? (
                        currentSheet.students.reduce(
                          (sum, s) => sum + (s.total || 0),
                          0
                        ) / currentSheet.students.length
                      ).toFixed(1)
                    : "0.0"}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <div className="text-xs font-semibold text-blue-600 mb-1">
                  Students Completeds
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {
                    currentSheet.students.filter(
                      (s) => s.status === "completed"
                    ).length
                  }
                </div>
              </div>

              <div className="bg-gray-100 border border-gray-200/60 rounded-xl p-3">
                <div className="text-xs font-semibold text-gray-700 mb-1">
                  Activities to grade
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {currentSheet.students.reduce((total, student) => {
                    return (
                      total +
                      currentSheet.activities.filter(
                        (act) => !student.grades[act.id]?.value
                      ).length
                    );
                  }, 0)}
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-blue-50/50 border border-blue-100 rounded-xl">
              <div className="flex items-center gap-2 text-sm text-blue-700 mb-2">
                <Save className="h-4 w-4" />
                <span className="font-medium">
                  Changes are saved automatically
                </span>
              </div>
              <div className="text-xs text-gray-600">
                <strong>Note:</strong> El total se calcula como el promedio
                simple de todas las activities calificadas.
              </div>
            </div>
          </div>
        )}
        <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-2"></div>
              <p className="text-gray-600 font-medium">
                Loading grade sheets...
              </p>
            </div>
          ) : filteredGradeSheets.length === 0 ? (
            <div className="text-center py-8 px-2">
              <div className="h-20 w-20 mx-auto mb-4 rounded-xl bg-gray-100 flex items-center justify-center">
                <FileSpreadsheet className="h-10 w-10 text-gray-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {selectedCourseFilter !== "all" ? "No sheets in this course" : "No grade sheets yet"}
              </h3>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                {selectedCourseFilter !== "all" 
                  ? "No grade sheets found for the selected course."
                  : "Create your first grade sheet to start managing student grades"}
              </p>
              <button
                onClick={() => setShowNewSheetModal(true)}
                className="btn-modern inline-flex items-center gap-2 text-black"
              >
                <Plus className="h-5 w-5" />
                Create sheet
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar]:h-2">
              <table className="w-full table-modern">
                <thead>
                  <tr className="bg-slate-50/80">
                    <th className="py-3 px-4 text-left font-bold text-gray-900 tracking-wide">
                      Title
                    </th>
                    <th className="py-3 px-4 text-left font-bold text-gray-900 tracking-wide">
                      Period
                    </th>
                    <th className="py-3 px-4 text-left font-bold text-gray-900 tracking-wide">
                      Students
                    </th>
                    <th className="py-3 px-4 text-left font-bold text-gray-900 tracking-wide">
                      Status
                    </th>
                    <th className="py-3 px-4 text-left font-bold text-gray-900 tracking-wide">
                      Last updated
                    </th>
                    <th className="py-3 px-4 text-left font-bold text-gray-900 tracking-wide">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groupedFilteredGradeSheets.map((group) => {
                    const isCollapsed = collapsedTermGroups[group.term] ?? false;
                    return (
                      <Fragment key={group.term}>
                        <tr className="bg-slate-50/70">
                          <td colSpan={6} className="px-2 py-2">
                            <button
                              type="button"
                              onClick={() => toggleTermDropdown(group.term)}
                              className="flex w-full items-center justify-between rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-left transition hover:bg-slate-50"
                            >
                              <div className="flex items-center gap-2">
                                <ChevronDown
                                  className={cn(
                                    "h-4 w-4 text-slate-500 transition-transform",
                                    isCollapsed && "-rotate-90",
                                  )}
                                />
                                <span className="text-sm font-semibold text-slate-800">
                                  {group.term}
                                </span>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                                  {group.sheets.length} sheets
                                </span>
                              </div>
                              <span className="text-xs text-slate-500">
                                {
                                  group.sheets.filter((sheet) => sheet.isPublished)
                                    .length
                                }{" "}
                                published
                              </span>
                            </button>
                          </td>
                        </tr>

                        {!isCollapsed &&
                          group.sheets.map((sheet) => (
                            <tr
                              key={sheet.id}
                              className="cursor-pointer transition-colors hover:bg-slate-50/80"
                              onClick={() => openSheetDetails(sheet)}
                            >
                              <td className="px-2 py-2">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
                                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                                  </div>
                                  <div>
                                    <span className="block font-medium text-gray-900">
                                      {sheet.title}
                                    </span>
                                    <span className="text-sm text-gray-500">
                                      {sheet.courseName}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              <td className="px-2 py-2">
                                <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-1 text-xs font-bold text-indigo-700">
                                  {sheet.gradingPeriod}
                                </span>
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex items-center gap-2">
                                  <Users className="h-3 w-3 text-gray-400" />
                                  <span className="text-sm font-medium text-gray-900">
                                    {sheet.students.length}
                                  </span>
                                </div>
                              </td>
                              <td className="px-2 py-2">
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold",
                                    sheet.isPublished
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-gray-100 text-gray-700",
                                  )}
                                >
                                  {sheet.isPublished ? "Published" : "Draft"}
                                </span>
                              </td>
                              <td className="px-2 py-2">
                                <span className="text-sm text-gray-600">
                                  {sheet.updatedAt.toLocaleDateString("en-US", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })}
                                </span>
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openSheetDetails(sheet);
                                    }}
                                    className="rounded-lg p-2 text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                                    title="Open sheet"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (currentSheet?.id === sheet.id) {
                                        exportToCSV();
                                      } else {
                                        openSheetDetails(sheet, false);
                                        setTimeout(() => exportToCSV(), 100);
                                      }
                                    }}
                                    className="rounded-lg p-2 text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                                    title="Export CSV"
                                  >
                                    <Download className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={(e) => deleteGradeSheet(sheet.id, e)}
                                    className="rounded-lg p-2 text-gray-700 transition-colors hover:bg-red-50 hover:text-gray-800"
                                    title="Delete sheet"
                                  >
                                    <Trash2 className="h-4 w-4 text-red-600" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {showNewSheetModal && (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
            onClick={() => setShowNewSheetModal(false)}
          >
            <div
              className="max-h-[90vh] w-full max-w-[54rem] overflow-y-auto rounded-2xl border border-slate-200/60 bg-white p-4 shadow-[0_32px_72px_-40px_rgba(15,23,42,0.6)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between border-b border-slate-200/60 pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100">
                    <Plus className="h-4 w-4 text-sky-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Create new grade sheet
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Fill in the details to create a new sheet
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowNewSheetModal(false)}
                  className="rounded-lg border border-slate-200/60 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Sheet title *
                  </label>
                  <input
                    type="text"
                    value={newSheet.title}
                    onChange={(e) =>
                      setNewSheet({ ...newSheet, title: e.target.value })
                    }
                    placeholder="Ex: Math grades Q1"
                    className="h-10 w-full rounded-xl border border-slate-300/60 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                      Course *
                    </label>
                    <select
                      value={newSheet.courseId}
                      onChange={(e) => {
                        const course = courses.find(
                          (c) => c.id === e.target.value
                        );
                        setNewSheet({
                          ...newSheet,
                          courseId: e.target.value,
                          courseName: course?.name || "",
                        });
                      }}
                      className="h-10 w-full rounded-xl border border-slate-300/60 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                      required
                    >
                      <option value="">Select a course</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.name} ({course.code}) 
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                      Period *
                    </label>
                    <select
                      value={newSheet.gradingPeriod}
                      onChange={(e) =>
                        setNewSheet({
                          ...newSheet,
                          gradingPeriod: e.target.value as any,
                        })
                      }
                      className="h-10 w-full rounded-xl border border-slate-300/60 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                      required
                    >
                      <option value="1st Term">First Term</option>
                      <option value="2nd Term">Second Term</option>
                      <option value="3rd Term">Third Term</option>
                      <option value="4th Term">Fourth Term</option>
                      <option value="Final">Final</option>
                    </select>
                  </div>
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">
                        Assessment activities (optional)
                      </h4>
                      <p className="text-xs text-slate-500">
                        Add the activities that will be graded
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-slate-700">
                      {newSheet.activities.length} activities
                    </span>
                  </div>

                  <div className="mb-3 grid grid-cols-1 gap-3 rounded-xl border border-slate-200/60 bg-slate-50 p-3 md:grid-cols-5">
                    <div className="md:col-span-3">
                      <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                        Name *
                      </label>
                      <input
                        type="text"
                        value={newActivityForModal.name}
                        onChange={(e) =>
                        setNewActivityForModal({
                          ...newActivityForModal,
                          name: e.target.value,
                        })
                      }
                      placeholder="Midterm exam"
                      className="h-10 w-full rounded-xl border border-slate-300/60 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                      required
                    />
                    </div>

                    <div className="md:col-span-1">
                      <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                        Type
                      </label>
                      <select
                        value={newActivityForModal.type}
                        onChange={(e) =>
                        setNewActivityForModal({
                          ...newActivityForModal,
                          type: e.target.value as any,
                        })
                      }
                      className="h-10 w-full rounded-xl border border-slate-300/60 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                      required
                    >
                        <option value="exam">Exam</option>
                        <option value="quiz">Quiz</option>
                        <option value="homework">Homework</option>
                        <option value="project">Project</option>
                        <option value="participation">Participation</option>
                        <option value="self_evaluation">Self Evaluation</option>
                        <option value="presentation">Presentation</option>
                        <option value="lab">Lab</option>
                        <option value="essay">Essay</option>
                      </select>
                    </div>

                    <div className="flex items-end justify-center">
                      <button
                        onClick={addActivityToNewSheet}
                        disabled={!newActivityForModal.name.trim()}
                        className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-sky-200 bg-white text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                        title={
                          !newActivityForModal.name.trim()
                            ? "Activity name is required"
                            : "Add activity"
                        }
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {newSheet.activities.length > 0 && (
                    <div className="space-y-2">
                      {newSheet.activities.map((activity) => (
                        <div
                          key={activity.id}
                          className="flex items-center justify-between rounded-xl border border-sky-100 bg-sky-50/40 p-3"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-semibold text-slate-900">
                                {toPlainText(activity.name, "Untitled activity")}
                              </span>
                              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                                {activity.type}
                              </span>
                            </div>
                            <div className="mt-0.5 text-xs text-slate-600">
                              Max score: {activity.maxScore}
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              removeActivityFromNewSheet(activity.id)
                            }
                            className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-200/60 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowNewSheetModal(false)}
                    className="inline-flex items-center rounded-lg border border-slate-200/60 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createNewGradeSheet}
                    disabled={
                      isSaving ||
                      !newSheet.courseId
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <div className="mr-1.5 h-3.5 w-3.5 animate-spin rounded-full border-b-2 border-white" />
                        Creating...
                      </>
                    ) : (
                      "Create sheet"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {showAddActivityModal && currentSheet && (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
            onClick={() => {
              setShowAddActivityModal(false);
              setNewActivityForCurrentSheet({
                name: "",
                maxScore: 5.0,
                type: "quiz",
                description: "",
              });
            }}
          >
            <div
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200/60 bg-white p-4 shadow-[0_32px_72px_-40px_rgba(15,23,42,0.6)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between border-b border-slate-200/60 pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100">
                    <Plus className="h-4 w-4 text-sky-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Add activity to {currentSheet.title}
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Define a new assessment activity
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowAddActivityModal(false);
                    setNewActivityForCurrentSheet({
                      name: "",
                      maxScore: 5.0,
                      type: "quiz",
                      description: "",
                    });
                  }}
                  className="rounded-lg border border-slate-200/60 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Activity name *
                  </label>
                  <input
                    type="text"
                    value={newActivityForCurrentSheet.name}
                    onChange={(e) =>
                      setNewActivityForCurrentSheet({
                        ...newActivityForCurrentSheet,
                        name: e.target.value,
                      })
                    }
                    placeholder="Ex: Final presentation"
                    className="h-10 w-full rounded-xl border border-slate-300/60 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                      Activity type
                    </label>
                    <select
                      value={newActivityForCurrentSheet.type}
                      onChange={(e) =>
                      setNewActivityForCurrentSheet({
                        ...newActivityForCurrentSheet,
                        type: e.target.value as any,
                      })
                    }
                      className="h-10 w-full rounded-xl border border-slate-300/60 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    >
                      <option value="exam">Exam</option>
                      <option value="quiz">Quiz</option>
                      <option value="homework">Homework</option>
                      <option value="project">Project</option>
                      <option value="participation">Participation</option>
                      <option value="self_evaluation">Self Evaluation</option>
                      <option value="presentation">Presentation</option>
                      <option value="lab">Lab</option>
                      <option value="essay">Essay</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                      Max score
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="5.0"
                        step="0.5"
                        value={newActivityForCurrentSheet.maxScore.toFixed(1)}
                        onChange={(e) =>
                          setNewActivityForCurrentSheet({
                            ...newActivityForCurrentSheet,
                            maxScore: parseFloat(e.target.value) || 5.0,
                          })
                        }
                        className="h-10 w-full rounded-xl border border-slate-300/60 bg-white pl-3 pr-12 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                        /5.0
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Description (optional)
                  </label>
                  <textarea
                    value={newActivityForCurrentSheet.description || ""}
                    onChange={(e) =>
                      setNewActivityForCurrentSheet({
                        ...newActivityForCurrentSheet,
                        description: e.target.value,
                      })
                    }
                    placeholder="Ex: This activity evaluates the ability to present arguments clearly and structurally..."
                    className="input-modern min-h-[96px] w-full resize-none text-sm"
                    rows={4}
                    maxLength={100}
                  />
                  <div className="mt-1 flex items-center justify-between">
                    <p className="text-xs text-slate-500">
                      Maximum 100 characters
                    </p>
                    <span
                      className={`text-xs ${
                        (newActivityForCurrentSheet.description?.length || 0) >
                        95
                          ? "text-rose-700"
                          : "text-slate-500"
                      }`}
                    >
                      {newActivityForCurrentSheet.description?.length || 0}/100
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-200/60 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddActivityModal(false);
                      setNewActivityForCurrentSheet({
                        name: "",
                        maxScore: 5.0,
                        type: "quiz",
                        description: "",
                      }); 
                    }}
                    className="inline-flex items-center rounded-lg border border-slate-200/60 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Cancel
                  </button> 
                  <button
                    onClick={addActivityToCurrentSheet}
                    disabled={!newActivityForCurrentSheet.name.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add activity
                  </button>
                </div>
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
