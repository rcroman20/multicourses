import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { firebaseDB } from "../../lib/firebase";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  query,
  orderBy,
  where,
  Timestamp,
  deleteDoc,
  getDoc,
} from "firebase/firestore";
import {
  FileSpreadsheet,
  Save,
  Download,
  Upload,
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
  Sparkles,
  Trophy,
  Award,
  Target,
  Zap,
  ExternalLink,
  ChevronRight,
  Filter,
  Clock,
  Star,
  Bookmark,
  Share2,
  Edit,
  MoreVertical,
  ChevronDown,
  School,
} from "lucide-react";
import { z } from "zod";
import { cn } from "@/lib/utils";

// Schemas de validación
const gradeSchema = z.object({
  value: z.number().min(0).max(5.0).optional(),
  comment: z.string().max(100).optional(),
});

const studentGradeSchema = z.object({
  studentId: z.string(),
  name: z.string(),
  grades: z.record(z.string(), z.any()),
  total: z.number().min(0).max(5.0).optional(),
  status: z.enum(["pending", "completed", "incomplete"]).default("pending"),
});

const gradeSheetSchema = z.object({
  title: z.string().min(1, "El título es requerido"),
  courseId: z.string().optional(),
  courseName: z.string().min(1, "El nombre del curso es requerido"),
  teacherId: z.string(),
  teacherName: z.string(),
  gradingPeriod: z.enum(["1st Term", "2nd Term", "Final"]),
  activities: z.array(
    z.object({
      id: z.string(),
      name: z.string().min(1, "El nombre de la actividad es requerido"),
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
});

interface FirestoreActivity {
  id?: string;
  name?: string;
  maxScore?: number;
  type?: "exam" | "quiz" | "homework" | "project" | "participation";
  description?: string;
}

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
  gradingPeriod: "1st Term" | "2nd Term" | "Final";
  activities: Activity[];
  students: StudentGrade[];
  createdAt: Date;
  updatedAt: Date;
  isPublished: boolean;
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
    [sheetTitle: string]: number;
  };
  overallAverage: number;
  approved: boolean;
  completedSheets: number; 
  totalSheets: number;
} 

export default function GradeSheetsPage() {
  const { user } = useAuth(); 
  const [gradeSheets, setGradeSheets] = useState<GradeSheet[]>([]);
  const [currentSheet, setCurrentSheet] = useState<GradeSheet | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showNewSheetModal, setShowNewSheetModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddActivityModal, setShowAddActivityModal] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [studentAverages, setStudentAverages] = useState<StudentAverage[]>([]);
  const [showAveragesSection, setShowAveragesSection] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>("all");
  const hasLoadedInitialData = useRef(false);

  const [newSheet, setNewSheet] = useState({
    title: "",
    courseId: "",
    courseName: "",
    gradingPeriod: "1st Term" as "1st Term" | "2nd Term" | "Final",
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

  // Filtrar hojas de calificaciones
  const filteredGradeSheets = searchTerm
    ? gradeSheets.filter(
        (sheet) =>
          sheet.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          sheet.courseName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          sheet.teacherName.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : selectedCourseFilter === "all"
    ? gradeSheets
    : gradeSheets.filter((sheet) => sheet.courseId === selectedCourseFilter);

  // Cargar datos iniciales UNA sola vez
  useEffect(() => {
    if (user && !hasLoadedInitialData.current) {
      const loadData = async () => {
        setIsLoading(true);
        try {
          await fetchCourses();
          await fetchStudents();
          await fetchGradeSheets();
          hasLoadedInitialData.current = true;
        } catch (err) {
          setError("Error al cargar los datos iniciales");
        } finally {
          setIsLoading(false);
        }
      };

      loadData();
    }
  }, [user]);

  // Calcular promedios cuando cambian las hojas de cálculo
  useEffect(() => {
    if (gradeSheets.length > 0 && students.length > 0) {
      calculateStudentAverages();
    }
  }, [gradeSheets, students]);

  // Sincronizar estudiantes solo cuando se necesita
  useEffect(() => {
    const syncStudentsIfNeeded = async () => {
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
          await fetchGradeSheets();
        } catch (err) {
        } finally {
          setIsSyncing(false);
        }
      }
    };

    syncStudentsIfNeeded();
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

        const existingStudentIds = new Set(
          existingStudents.map((s) => s.studentId)
        );
        const missingStudentIds = course.enrolledStudents.filter(
          (studentId) => !existingStudentIds.has(studentId)
        );

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

          const cleanedExistingStudents = existingStudents.map((student) => ({
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

          const updatedStudents = [...cleanedExistingStudents, ...newStudents];

          const sortedStudents = updatedStudents.sort((a, b) =>
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
        await fetchGradeSheets();
      }

      return true;
    } catch (err) {
      return false;
    }
  };

  const cleanDataForFirebase = (data: any): any => {
    if (data === undefined) return null;
    if (data === null) return null;

    if (Array.isArray(data)) {
      return data.map((item) => cleanDataForFirebase(item));
    }

    if (typeof data === "object") {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(data)) {
        cleaned[key] = cleanDataForFirebase(value);
      }
      return cleaned;
    }

    return data;
  };

  const fetchGradeSheets = async () => {
    setIsLoading(true);
    try {
      const gradeSheetsRef = collection(firebaseDB, "gradeSheets");
      const q = query(gradeSheetsRef, orderBy("updatedAt", "desc"));
      const querySnapshot = await getDocs(q);

      const sheets: GradeSheet[] = [];

      for (const doc of querySnapshot.docs) {
        const data = doc.data();

        const activities: Activity[] = (data.activities || []).map(
          (act: any, index: number) => ({
            id: act.id || `activity_${doc.id}_${index}_${Date.now()}`,
            name: act.name || "Actividad sin nombre",
            type: act.type || "quiz",
            maxScore:
              typeof act.maxScore === "number"
                ? Math.max(1, Math.min(5.0, act.maxScore))
                : 5.0,
            description: act.description || "",
          })
        );

        const students = (data.students || []).sort((a: any, b: any) =>
          a.name.localeCompare(b.name, "es", { sensitivity: "base" })
        );

        sheets.push({
          id: doc.id,
          title: data.title || "Hoja sin título",
          courseId: data.courseId,
          courseName: data.courseName || "Curso sin nombre",
          teacherId: data.teacherId || "",
          teacherName: data.teacherName || "Docente",
          gradingPeriod: data.gradingPeriod || "1st Term",
          activities,
          students,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          isPublished: data.isPublished || false,
        });
      }

      setGradeSheets(sheets);
    } catch (err) {
      setError("Error al cargar las hojas de calificaciones");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCourses = async () => {
    try {
      const coursesRef = collection(firebaseDB, "cursos");
      const q = query(coursesRef);
      const querySnapshot = await getDocs(q);

      const courseList: Course[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        courseList.push({
          id: doc.id,
          name: data.nombre || data.name || "Curso sin nombre",
          code: data.codigo || data.code || "Sin código",
          enrolledStudents: data.enrolledStudents || [],
        });
      });

      setCourses(courseList);
    } catch (err) {
      setError("Error al cargar los cursos");
    }
  };

  const fetchStudents = async () => {
    try {
      const studentsRef = collection(firebaseDB, "estudiantes");
      const querySnapshot = await getDocs(studentsRef);

      const studentList: Student[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        studentList.push({
          id: doc.id,
          name: data.name || "Estudiante",
          email: data.email || "",
          idNumber: data.idNumber || "",
        });
      });

      setStudents(studentList);
      setFilteredStudents(studentList);
    } catch (err) {
      setError("Error al cargar los estudiantes");
    }
  };

  const calculateStudentAverages = () => {
    const averages: StudentAverage[] = [];

    students.forEach((student) => {
      const studentAvg: StudentAverage = {
        studentId: student.id,
        studentName: student.name,
        email: student.email,
        idNumber: student.idNumber,
        averages: {},
        overallAverage: 0,
        approved: false,
        completedSheets: 0,
        totalSheets: gradeSheets.length,
      };

      let totalSum = 0;
      let sheetsWithGrades = 0;

      gradeSheets.forEach((sheet) => {
        const studentInSheet = sheet.students.find(
          (s) => s.studentId === student.id
        );

        if (studentInSheet && studentInSheet.total !== undefined) {
          studentAvg.averages[sheet.title] = studentInSheet.total;
          totalSum += studentInSheet.total;
          sheetsWithGrades++;
          studentAvg.completedSheets++;
        } else {
          studentAvg.averages[sheet.title] = 0;
        }
      });

      studentAvg.overallAverage =
        sheetsWithGrades > 0 ? totalSum / sheetsWithGrades : 0;
      studentAvg.approved = studentAvg.overallAverage >= 3.0;

      averages.push(studentAvg);
    });

    averages.sort((a, b) => b.overallAverage - a.overallAverage);
    setStudentAverages(averages);
  };

  const getSingleGradeSheet = async (
    sheetId: string
  ): Promise<GradeSheet | null> => {
    try {
      const docRef = doc(firebaseDB, "gradeSheets", sheetId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        return null;
      }

      const data = docSnap.data();

      const activities: Activity[] = (data.activities || []).map(
        (act: any, index: number) => ({
          id: act.id || `activity_${sheetId}_${index}_${Date.now()}`,
          name: act.name || "Actividad sin nombre",
          type: act.type || "quiz",
          maxScore:
            typeof act.maxScore === "number"
              ? Math.max(1, Math.min(5.0, act.maxScore))
              : 5.0,
          description: act.description || "",
        })
      );

      return {
        id: docSnap.id,
        title: data.title || "Hoja sin título",
        courseId: data.courseId,
        courseName: data.courseName || "Curso sin nombre",
        teacherId: data.teacherId || "",
        teacherName: data.teacherName || "Docente",
        gradingPeriod: data.gradingPeriod || "1st Term",
        activities,
        students: data.students || [],
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        isPublished: data.isPublished || false,
      };
    } catch (err) {
      return null;
    }
  };

  const createNewGradeSheet = async () => {
    setError("");

    const selectedCourse = courses.find((c) => c.id === newSheet.courseId);
    if (!selectedCourse) {
      setError("Debes seleccionar un curso válido");
      return;
    }

    const courseNameToUse = selectedCourse.name || newSheet.courseName;

    if (newSheet.activities.length === 0) {
      setError("Debes agregar al menos una actividad");
      return;
    }

    const validation = gradeSheetSchema.safeParse({
      title: newSheet.title,
      courseId: newSheet.courseId,
      courseName: courseNameToUse,
      teacherId: user?.id || "",
      teacherName: user?.name || user?.email || "Docente",
      gradingPeriod: newSheet.gradingPeriod,
      activities: newSheet.activities,
      students: [],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      isPublished: false,
    });

    if (!validation.success) {
      const errorMessage =
        validation.error.errors[0]?.message || "Error de validación";
      setError(errorMessage);
      return;
    }

    const courseStudents = students.filter((s) =>
      selectedCourse.enrolledStudents.includes(s.id)
    );

    if (courseStudents.length === 0) {
      setError("El curso no tiene estudiantes inscritos");
      return;
    }

    const studentGrades: StudentGrade[] = courseStudents
      .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
      .map((student) => ({
        studentId: student.id,
        name: student.name,
        grades: {},
        status: "pending",
      }));

    setIsSaving(true);
    try {
      const docRef = await addDoc(collection(firebaseDB, "gradeSheets"), {
        ...validation.data,
        students: studentGrades,
      });

      const newGradeSheet: GradeSheet = {
        id: docRef.id,
        title: validation.data.title,
        courseId: validation.data.courseId,
        courseName: validation.data.courseName,
        teacherId: validation.data.teacherId,
        teacherName: validation.data.teacherName,
        gradingPeriod: validation.data.gradingPeriod,
        activities: validation.data.activities,
        students: studentGrades,
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublished: validation.data.isPublished,
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
      setSuccess("Hoja de calificaciones creada exitosamente");

      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError("Error al crear la hoja de calificaciones");
    } finally {
      setIsSaving(false);
    }
  };

  const addActivityToNewSheet = () => {
    if (!newActivityForModal.name.trim()) {
      setError("El nombre de la actividad es requerido");
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
      setError("No hay una hoja seleccionada");
      return;
    }

    if (!newActivityForCurrentSheet.name.trim()) {
      setError("El nombre de la actividad es requerido");
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
          id:
            act.id ||
            `activity_${Date.now()}_${Math.random()
              .toString(36)
              .substr(2, 9)}`,
          name: act.name || "Actividad sin nombre",
          maxScore: act.maxScore || 5.0,
          type: act.type || "quiz",
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
      setSuccess("Actividad agregada exitosamente");

      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      setError("Error al agregar la actividad");
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
        "¿Estás seguro de que quieres eliminar esta hoja de calificaciones? Esta acción no se puede deshacer."
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

      setSuccess("Hoja de calificaciones eliminada exitosamente");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError("Error al eliminar la hoja de calificaciones");
    }
  };

  const removeActivityFromCurrentSheet = async (activityId: string) => {
    if (
      !currentSheet ||
      !confirm(
        "¿Estás seguro de que quieres eliminar esta actividad? Se perderán todas las calificaciones asociadas."
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

      setSuccess("Actividad eliminada exitosamente");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError("Error al eliminar la actividad");
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
        const updatedGrades = {
          ...student.grades,
          [activityId]: {
            ...student.grades[activityId],
            [field]: field === "value" ? Number(value) : value,
            submittedAt: new Date(),
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
      if (grade?.value !== undefined) {
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
      (act) => grades[act.id]?.value !== undefined
    ).length;

    if (gradedActivities === 0) return "pending";
    if (gradedActivities === activities.length) return "completed";
    return "incomplete";
  };

  const exportToCSV = () => {
    if (!currentSheet) return;

    let csvContent = "data:text/csv;charset=utf-8,";

    const headers = [
      "Estudiante",
      "ID",
      ...currentSheet.activities.map((a) => a.name),
      "Total (0-5)",
      "Estado",
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

  const exportAveragesToCSV = () => {
    if (studentAverages.length === 0) return;

    let csvContent = "data:text/csv;charset=utf-8,";

    const headers = [
      "Estudiante",
      "ID",
      "Email",
      ...gradeSheets.map((sheet) => sheet.title),
      "Promedio General",
      "Aprobado",
    ];
    csvContent += headers.join(",") + "\n";

    studentAverages.forEach((student) => {
      const row = [
        student.studentName,
        student.idNumber || "",
        student.email || "",
        ...gradeSheets.map(
          (sheet) => student.averages[sheet.title]?.toFixed(1) || "0.0"
        ),
        student.overallAverage.toFixed(1),
        student.approved ? "Sí" : "No",
      ];
      csvContent += row.join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "promedios_estudiantes.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const publishGradeSheet = async () => {
    if (
      !currentSheet ||
      !confirm(
        "¿Publicar las calificaciones? Los estudiantes podrán ver sus notas."
      )
    ) {
      return;
    }

    try {
      await updateDoc(doc(firebaseDB, "gradeSheets", currentSheet.id), {
        isPublished: true,
        updatedAt: Timestamp.now(),
      });

      setCurrentSheet((prev) => (prev ? { ...prev, isPublished: true } : null));
      setSuccess("Calificaciones publicadas exitosamente");

      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError("Error al publicar las calificaciones");
    }
  };

  return (
    <DashboardLayout
      title="Hojas de Calificaciones"
      subtitle="Gestiona y califica a tus estudiantes"
    >
      <div className="space-y-2 fade-in-up">
        {isSyncing && (
          <div className="modern-card bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-100 p-3 rounded-xl">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="text-sm font-medium text-blue-700">
                Sincronizando estudiantes...
              </span>
            </div>
          </div>
        )}

        {/* Header Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold mb-1 text-center md:text-left text-blue-600 tracking-wide">
                  Hojas {selectedCourseFilter !== "all" ? "del Curso" : "Totales"}
                </p>
                <p className="text-xl md:text-2xl font-bold text-gray-900 text-center md:text-left">
                  {filteredGradeSheets.length}
                </p>
              
              </div>
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                <FileSpreadsheet className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
 <div>
  <p className="text-xs font-semibold mb-1 text-center md:text-left text-green-600 tracking-wide">
    Cursos Activos
  </p>
  <p className="text-xl md:text-xl font-bold text-gray-900 text-center md:text-left">
    {courses.length}
  </p>
</div>
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center">
                <BookOpen className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold mb-1 text-center md:text-left text-purple-600 tracking-wide">
                  Estudiantes
                </p>
                <p className="text-xl md:text-xl font-bold text-gray-900 text-center md:text-left">
                  {students.length}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                <Users className="h-6 w-6 text-purple-500" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold mb-1 text-center md:text-left text-amber-600 tracking-wide">
                  Período Actual
                </p>
                <p className="text-xl md:text-xl font-bold text-gray-900 text-center md:text-left">
                  2025-2
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-amber-500" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold mb-1 text-center md:text-left text-indigo-600 tracking-wide">
                  Prom. General
                </p>
                <p className="text-xl md:text-xl font-bold text-gray-900 text-center md:text-left">
                  {studentAverages.length > 0
                    ? (
                        studentAverages.reduce(
                          (sum, s) => sum + s.overallAverage,
                          0
                        ) / studentAverages.length
                      ).toFixed(1)
                    : "0.0"}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-indigo-500" />
              </div>
            </div>
          </div>
        </div>


        {/* Search and Action Bar */}
        <div className="modern-card bg-white border border-gray-200 p-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex-1 flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar hojas por título, curso o docente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input-modern pl-10 w-full"
                  />
                </div>
              </div>
              
              <div className="relative min-w-[180px]">
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                  <School className="h-5 w-5 text-gray-400" />
                </div>
                <select
                  value={selectedCourseFilter}
                  onChange={(e) => setSelectedCourseFilter(e.target.value)}
                  className="input-modern pl-10 w-full appearance-none"
                >
                  <option value="all">Todos los cursos</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.code}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowNewSheetModal(true)}
                className="btn-modern-outline flex items-center gap-2 text-sm"
              >
                <Plus className="h-4 w-4" />
               
              </button>
              <button
                onClick={() => setShowAveragesSection(!showAveragesSection)}
                className={cn(
                  "btn-modern-outline flex items-center gap-2 text-sm",
                  showAveragesSection && "bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-300"
                )}
              >
                <TrendingUp className="h-4 w-4" />
                
              </button>
            </div>
          </div>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="modern-card bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium text-green-800">{success}</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="modern-card bg-gradient-to-r from-red-50 to-pink-50 border border-red-200 p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <div>
                <p className="font-medium text-red-800">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Averages Section */}
        {showAveragesSection && studentAverages.length > 0 && (
          <div className="modern-card">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-bold text-xl text-gray-900">
                    Promedios por Estudiante
                  </h3>
                  <p className="text-sm text-gray-600">
                    Resumen de promedios en todas las hojas de cálculo
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={exportAveragesToCSV}
                  className="btn-modern-outline flex items-center gap-2 text-sm"
                >
                  <Download className="h-4 w-4" />
                  Exportar CSV
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full table-modern">
                <thead>
                  <tr className="bg-gradient-to-r from-blue-50/10 to-cyan-50/10">
                    <th className="py-3 px-4 text-left font-bold text-gray-900 tracking-wide">
                      Estudiante
                    </th>
                  
                    {gradeSheets.map((sheet) => (
                      <th
                        key={sheet.id}
                        className="py-3 px-4 text-left font-bold text-gray-900 tracking-wide"
                      >
                        <div className="truncate" title={sheet.title}>
                          {sheet.title.length > 15
                            ? `${sheet.title.substring(0, 15)}...`
                            : sheet.title}
                        </div>
                      </th>
                    ))}
                    <th className="py-3 px-4 text-left font-bold text-gray-900 tracking-wide">
                      Prom. General
                    </th>
                    <th className="py-3 px-4 text-left font-bold text-gray-900 tracking-wide">
                      Aprobado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {studentAverages.map((student) => (
                    <tr key={student.studentId} className="hover:bg-gradient-to-r from-blue-50/5 to-cyan-50/5">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div>
                            <span className="font-medium text-gray-900">
                              {student.studentName}
                            </span>
                          </div>
                        </div>
                      </td>
                    

                      {gradeSheets.map((sheet) => {
                        const average = student.averages[sheet.title] || 0;
                        return (
                          <td key={sheet.id} className="py-3 px-4">
                            <div className="text-center">
                              <span
                                className={cn(
                                  "text-sm font-bold",
                                  average >= 4.0
                                    ? "text-green-600"
                                    : average >= 3.0
                                    ? "text-blue-600"
                                    : average > 0
                                    ? "text-amber-600"
                                    : "text-gray-400"
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
                                ? "text-green-600"
                                : student.overallAverage >= 3.0
                                ? "text-blue-600"
                                : student.overallAverage > 0
                                ? "text-amber-600"
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
                              ? "bg-gradient-to-r from-green-100 to-emerald-100 text-green-700"
                              : "bg-gradient-to-r from-red-100 to-pink-100 text-red-700"
                          )}
                        >
                          {student.approved ? "Sí" : "No"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 rounded-xl p-4">
                <div className="text-xs font-semibold text-green-600 mb-1">
                  Estudiantes Aprobados
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

              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 rounded-xl p-4">
                <div className="text-xs font-semibold text-blue-600 mb-1">
                  Promedio Máximo
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {studentAverages.length > 0
                    ? Math.max(
                        ...studentAverages.map((s) => s.overallAverage)
                      ).toFixed(1)
                    : "0.0"}
                </div>
              </div>

              <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-xl p-4">
                <div className="text-xs font-semibold text-amber-600 mb-1">
                  Promedio Mínimo
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

              <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100 rounded-xl p-4">
                <div className="text-xs font-semibold text-purple-600 mb-1">
                  Hojas Completadas
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
                    por estudiante
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
    {/* Current Sheet View */}
        {currentSheet && (
          <div className="modern-card">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                  <FileSpreadsheet className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold text-xl text-gray-900">
                    {currentSheet.title}
                  </h3>
                  <div className="flex items-center gap-3 mt-1">
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
                          ? "bg-gradient-to-r from-green-100 to-emerald-100 text-green-700"
                          : "bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700"
                      )}
                    >
                      {currentSheet.isPublished ? "Publicado" : "Borrador"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddActivityModal(true)}
                  className="btn-modern-outline flex items-center gap-2 text-sm"
                  title={
                    currentSheet.isPublished
                      ? "Hoja publicada. Las actividades nuevas aparecerán como 'No publicadas' hasta que vuelvas a publicar la hoja."
                      : "Agregar actividad"
                  }
                >
                  <Plus className="h-4 w-4" />
                </button>

                {!currentSheet.isPublished && (
                  <button
                    onClick={publishGradeSheet}
                    className="btn-modern-outline flex items-center gap-2 text-sm"
                  >
                    <Eye className="h-4 w-4" />
                    
                  </button>
                )}

             

                <button
                  onClick={exportToCSV}
                  className="btn-modern-outline flex items-center gap-2 text-sm"
                >
                  <Download className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCurrentSheet(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="bg-gradient-to-r from-blue-50/10 to-cyan-50/10">
                    <th className="sticky left-0 z-20 bg-gradient-to-r from-blue-50 to-cyan-50 border-r border-gray-200 px-3 py-3 text-left font-bold text-gray-900 tracking-wide min-w-[200px]">
                      <div className="flex items-center justify-between">
                        <span>Estudiante</span>
                        <span className="text-xs font-medium text-gray-500">
                          {currentSheet.students.length}
                        </span>
                      </div>
                    </th>

                    {currentSheet.activities.map((activity) => (
                      <th
                        key={activity.id}
                        className="px-3 py-3 text-left font-bold text-gray-900 tracking-wide border-b border-gray-200 min-w-[140px]"
                      >
                        <div className="flex flex-col gap-1">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div
                                className="text-sm font-bold truncate cursor-help"
                                title={`${activity.name}\nTipo: ${activity.type}\nMáx: ${activity.maxScore}${
                                  activity.description
                                    ? `\n\n${activity.description}`
                                    : ""
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (activity.description) {
                                    alert(
                                      `Descripción:\n\n${activity.description}`
                                    );
                                  }
                                }}
                              >
                                {activity.name}
                              </div>
                            </div>

                            {!currentSheet.isPublished && (
                              <div className="flex items-center">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeActivityFromCurrentSheet(activity.id);
                                  }}
                                  className="ml-1 p-1 text-red-500 hover:bg-red-50 rounded transition-colors"
                                  title="Eliminar actividad"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>

                          {activity.description && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                className="text-gray-400 hover:text-gray-600"
                                title={`Ver descripción completa: ${activity.description}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  alert(
                                    `Descripción:\n\n${activity.description}`
                                  );
                                }}
                              >
                                <Info className="h-3 w-3" />
                              </button>
                              <div className="text-[10px] text-gray-500 truncate flex-1">
                                {activity.description.length > 25
                                  ? `${activity.description.substring(0, 25)}...`
                                  : activity.description}
                              </div>
                            </div>
                          )}
                        </div>
                      </th>
                    ))}

                    <th className="px-3 py-3 text-left font-bold text-gray-900 tracking-wide border-b border-gray-200 bg-gradient-to-r from-green-50 to-emerald-50 min-w-[100px]">
                      <div className="text-center">
                        <div className="text-sm font-bold">Total</div>
                        <div className="text-xs text-gray-500">0-5.0</div>
                      </div>
                    </th>
                    <th className="px-3 py-3 text-left font-bold text-gray-900 tracking-wide border-b border-gray-200 bg-gradient-to-r from-blue-50 to-cyan-50 min-w-[100px]">
                      <div className="text-center">
                        <div className="text-sm font-bold">Estado</div>
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
                      const hasGrade =
                        grade?.value !== undefined && grade?.value !== null;
                      const hasComment =
                        grade?.comment && grade.comment.trim() !== "";
                      const isSavedToFirebase =
                        grade?.submittedAt !== undefined &&
                        grade?.submittedAt !== null;
                      const [isEditing, setIsEditing] = useState(false);
                      const [editTimeout, setEditTimeout] =
                        useState<NodeJS.Timeout | null>(null);
                      const [localValue, setLocalValue] = useState<string>(
                        grade?.value?.toString() || ""
                      );

                      useEffect(() => {
                        return () => {
                          if (editTimeout) {
                            clearTimeout(editTimeout);
                          }
                        };
                      }, [editTimeout]);

                      useEffect(() => {
                        setLocalValue(grade?.value?.toString() || "");
                      }, [grade?.value]);

                      useEffect(() => {
                        return () => {
                          if (localValue.trim() !== "" && !isSavedToFirebase) {
                            const currentGradeValue =
                              grade?.value?.toString() || "";
                            if (localValue !== currentGradeValue) {
                              updateStudentGrade(
                                student.studentId,
                                activity.id,
                                "value",
                                localValue
                              );
                            }
                          }

                          if (editTimeout) {
                            clearTimeout(editTimeout);
                          }
                        };
                      }, [
                        localValue,
                        isSavedToFirebase,
                        editTimeout,
                        grade?.value,
                        student.studentId,
                        activity.id,
                      ]);

                      const handleFocus = (
                        e: React.FocusEvent<HTMLInputElement>
                      ) => {
                        if (!isSavedToFirebase) {
                          setIsEditing(true);
                          e.target.select();

                          if (editTimeout) {
                            clearTimeout(editTimeout);
                          }

                          const timeout = setTimeout(() => {
                            if (!isSavedToFirebase) {
                              setIsEditing(false);
                              if (localValue.trim() !== "") {
                                updateStudentGrade(
                                  student.studentId,
                                  activity.id,
                                  "value",
                                  localValue
                                );
                              }
                            }
                          }, 30000);

                          setEditTimeout(timeout);
                        }
                      };

                      const handleBlur = (
                        e: React.FocusEvent<HTMLInputElement>
                      ) => {
                        if (!isSavedToFirebase) {
                          const newValue = e.target.value.trim();
                          const currentGradeValue =
                            grade?.value?.toString() || "";

                          if (newValue === "" && hasGrade) {
                            if (confirm("¿Desea eliminar esta calificación?")) {
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
                        }
                      };

                      const handleClick = (
                        e: React.MouseEvent<HTMLInputElement>
                      ) => {
                        if (!isSavedToFirebase) {
                          const inputElement =
                            e.currentTarget as HTMLInputElement;
                          setIsEditing(true);
                          inputElement.focus();
                          inputElement.select();

                          const timeout = setTimeout(() => {
                            if (!isSavedToFirebase) {
                              setIsEditing(false);
                              if (localValue.trim() !== "") {
                                updateStudentGrade(
                                  student.studentId,
                                  activity.id,
                                  "value",
                                  localValue
                                );
                              }
                            }
                          }, 30000);

                          setEditTimeout(timeout);
                        }
                      };

                      const handleChange = (
                        e: React.ChangeEvent<HTMLInputElement>
                      ) => {
                        if (!isSavedToFirebase) {
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
                          !isSavedToFirebase
                        ) {
                          e.preventDefault();
                          setIsEditing(true);
                          inputElement.focus();
                          inputElement.select();

                          const timeout = setTimeout(() => {
                            if (!isSavedToFirebase) {
                              setIsEditing(false);
                              if (localValue.trim() !== "") {
                                updateStudentGrade(
                                  student.studentId,
                                  activity.id,
                                  "value",
                                  localValue
                                );
                              }
                            }
                          }, 30000);

                          setEditTimeout(timeout);
                        }

                        if (
                          e.key === "Escape" &&
                          isEditing &&
                          !isSavedToFirebase
                        ) {
                          if (editTimeout) {
                            clearTimeout(editTimeout);
                            setEditTimeout(null);
                          }
                          setIsEditing(false);
                          inputElement.blur();
                        }

                        if (
                          e.key === "Enter" &&
                          isEditing &&
                          !isSavedToFirebase
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
                          className="px-3 py-2 border-b border-gray-200"
                        >
                          <div className="flex flex-col gap-1">
                            <div className="relative">
                              <input
                                type="number"
                                min="0"
                                max={activity.maxScore}
                                step="0.1"
                                value={
                                  isSavedToFirebase
                                    ? grade?.value || ""
                                    : localValue
                                }
                                onChange={handleChange}
                                onFocus={handleFocus}
                                onBlur={handleBlur}
                                className={cn(
                                  "w-full px-3 py-2 border rounded-lg text-sm text-center transition-all",
                                  isSavedToFirebase
                                    ? "bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 text-green-700 font-semibold cursor-not-allowed"
                                    : hasGrade
                                    ? "bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200 text-blue-700"
                                    : "border-gray-200 hover:border-blue-500",
                                  isEditing && !isSavedToFirebase
                                    ? "ring-2 ring-blue-500 ring-opacity-50"
                                    : "",
                                  currentSheet.isPublished
                                    ? "border-amber-200"
                                    : ""
                                )}
                                placeholder={`0-${activity.maxScore}`}
                                readOnly={isSavedToFirebase}
                                disabled={isSavedToFirebase}
                                title={
                                  isSavedToFirebase
                                    ? `✅ Calificación guardada: ${
                                        grade.value
                                      }${
                                        hasComment
                                          ? `\nComentario: ${grade.comment}`
                                          : ""
                                      }\nGuardada el: ${
                                        grade.submittedAt
                                          ? new Date(
                                              grade.submittedAt
                                            ).toLocaleString()
                                          : "Recientemente"
                                      }${
                                        currentSheet.isPublished
                                          ? "\n\n⚠️ Hoja publicada"
                                          : ""
                                      }`
                                    : isEditing
                                    ? `Editando... (tienes 30 segundos)${
                                        hasGrade
                                          ? `\nActual: ${grade.value}`
                                          : ""
                                      }`
                                    : hasGrade
                                    ? `Calificación temporal: ${
                                        grade.value
                                      }${
                                        hasComment
                                          ? `\nComentario: ${grade.comment}`
                                          : ""
                                      }\n⚠️ NO GUARDADA EN BASE DE DATOS${
                                        currentSheet.isPublished
                                          ? "\n\n⚠️ Hoja publicada"
                                          : ""
                                      }`
                                    : `Haga clic para agregar calificación${
                                        currentSheet.isPublished
                                          ? "\n\n⚠️ Hoja publicada"
                                          : ""
                                      }`
                                }
                                onClick={handleClick}
                                onKeyDown={handleKeyDown}
                              />

                              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                                {hasComment && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      alert(
                                        `Comentario para ${student.name}:\n\n"${grade.comment}"`
                                      );
                                    }}
                                    className="text-blue-500 hover:text-blue-700 p-0.5"
                                    title="Ver comentario"
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

                                {isSavedToFirebase && (
                                  <div
                                    className="h-2 w-2 rounded-full bg-green-500 flex items-center justify-center"
                                    title="✅ Guardado en base de datos"
                                  >
                                    <span className="text-[6px] text-white">
                                      ✓
                                    </span>
                                  </div>
                                )}

                                {hasGrade && !isSavedToFirebase && (
                                  <div
                                    className="h-2 w-2 rounded-full bg-red-500"
                                    title="⚠️ NO guardado en base de datos"
                                  ></div>
                                )}

                                {isEditing && !isSavedToFirebase && (
                                  <div
                                    className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"
                                    title="Editando..."
                                  ></div>
                                )}

                                {currentSheet.isPublished && !isEditing && (
                                  <div
                                    className="h-2 w-2 rounded-full bg-amber-400"
                                    title="Hoja publicada"
                                  ></div>
                                )}
                              </div>
                            </div>

                            <div className="relative flex items-center gap-1">
                              <input
                                type="text"
                                value={grade?.comment || ""}
                                onChange={(e) =>
                                  updateStudentGrade(
                                    student.studentId,
                                    activity.id,
                                    "comment",
                                    e.target.value
                                  )
                                }
                                className={cn(
                                  "w-full px-2 py-1.5 text-xs border rounded-lg",
                                  currentSheet.isPublished
                                    ? "border-amber-200 bg-amber-50"
                                    : "border-gray-200 focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                                )}
                                placeholder="Comentario..."
                                maxLength={100}
                                title={
                                  currentSheet.isPublished
                                    ? "⚠️ Hoja publicada - Los cambios serán visibles para los estudiantes"
                                    : ""
                                }
                              />
                              {hasComment && (
                                <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                                  <div className="h-2 w-2 rounded-full bg-blue-400"></div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      );
                    };

                    return (
                      <tr key={student.studentId} className="hover:bg-gradient-to-r from-blue-50/5 to-cyan-50/5">
                        <td className="sticky left-0 z-10 bg-white border-r border-gray-200 px-3 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center flex-shrink-0">
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

                        <td className="px-3 py-2 border-b border-gray-200 bg-gradient-to-r from-green-50 to-emerald-50">
                          <div className="text-center">
                            <span
                              className={cn(
                                "text-lg font-bold",
                                (student.total || 0) >= 3.5
                                  ? "text-green-700"
                                  : (student.total || 0) >= 3.0
                                  ? "text-blue-700"
                                  : (student.total || 0) > 0
                                  ? "text-amber-700"
                                  : "text-gray-500"
                              )}
                            >
                              {student.total?.toFixed(1) || "0.0"}
                            </span>
                            <div className="text-xs text-gray-500">/5.0</div>
                          </div>
                        </td>

                        <td className="px-3 py-2 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-cyan-50">
                          <div className="flex justify-center">
                            <span
                              className={cn(
                                "inline-flex items-center px-3 py-1 rounded-full text-xs font-bold",
                                student.status === "completed"
                                  ? "bg-gradient-to-r from-green-100 to-emerald-100 text-green-700"
                                  : student.status === "incomplete"
                                  ? "bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700"
                                  : "bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700"
                              )}
                              title={
                                student.status === "completed"
                                  ? "Completado - Todas las actividades calificadas"
                                  : student.status === "incomplete"
                                  ? "Incompleto - Algunas actividades sin calificar"
                                  : "Pendiente - Ninguna actividad calificada"
                              }
                            >
                              {student.status === "completed"
                                ? "Complete"
                                : student.status === "incomplete"
                                ? "Pending"
                                : "Incomplete"}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 rounded-xl p-4">
                <div className="text-xs font-semibold text-indigo-600 mb-1">
                  Promedio General
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

              <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 rounded-xl p-4">
                <div className="text-xs font-semibold text-green-600 mb-1">
                  Estudiantes Completados
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {
                    currentSheet.students.filter(
                      (s) => s.status === "completed"
                    ).length
                  }
                </div>
              </div>

              <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-xl p-4">
                <div className="text-xs font-semibold text-amber-600 mb-1">
                  Actividades por Calificar
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

            <div className="mt-6 p-4 bg-gradient-to-r from-blue-50/50 to-cyan-50/50 border border-blue-100 rounded-xl">
              <div className="flex items-center gap-2 text-sm text-blue-700 mb-2">
                <Save className="h-4 w-4" />
                <span className="font-medium">
                  Los cambios se guardan automáticamente
                </span>
              </div>
              <div className="text-xs text-gray-600">
                <strong>Nota:</strong> El total se calcula como el promedio
                simple de todas las actividades calificadas.
              </div>
            </div>
          </div>
        )}
        {/* Grade Sheets List */}
        <div className="modern-card">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-4"></div>
              <p className="text-gray-600 font-medium">
                Cargando hojas de calificaciones...
              </p>
            </div>
          ) : filteredGradeSheets.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="h-20 w-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                <FileSpreadsheet className="h-10 w-10 text-gray-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {selectedCourseFilter !== "all" ? "No hay hojas en este curso" : "No hay hojas de calificaciones"}
              </h3>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                {selectedCourseFilter !== "all" 
                  ? `No se encontraron hojas de calificaciones para el curso seleccionado.`
                  : "Crea tu primera hoja de calificaciones para comenzar a gestionar las notas de tus estudiantes"}
              </p>
              <button
                onClick={() => setShowNewSheetModal(true)}
                className="btn-modern inline-flex items-center gap-2 text-black"
              >
                <Plus className="h-5 w-5" />
                Crear Hoja
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-modern">
                <thead>
                  <tr className="bg-gradient-to-r from-blue-50/10 to-cyan-50/10">
                    <th className="py-3 px-4 text-left font-bold text-gray-900 tracking-wide">
                      Título
                    </th>
                    <th className="py-3 px-4 text-left font-bold text-gray-900 tracking-wide">
                      Período
                    </th>
                    <th className="py-3 px-4 text-left font-bold text-gray-900 tracking-wide">
                      Estudiantes
                    </th>
                    <th className="py-3 px-4 text-left font-bold text-gray-900 tracking-wide">
                      Estado
                    </th>
                    <th className="py-3 px-4 text-left font-bold text-gray-900 tracking-wide">
                      Última Actualización
                    </th>
                    <th className="py-3 px-4 text-left font-bold text-gray-900 tracking-wide">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGradeSheets.map((sheet) => (
                    <tr
                      key={sheet.id}
                      className="hover:bg-gradient-to-r from-blue-50/5 to-cyan-50/5 cursor-pointer transition-colors"
                      onClick={() => setCurrentSheet(sheet)}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <span className="font-medium text-gray-900 block">
                              {sheet.title}
                            </span>
                            <span className="text-sm text-gray-500">
                              {sheet.courseName}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={cn(
                            "inline-flex items-center px-3 py-1 rounded-full text-xs font-bold",
                            sheet.gradingPeriod === "1st Term"
                              ? "bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700"
                              : sheet.gradingPeriod === "2nd Term"
                              ? "bg-gradient-to-r from-green-100 to-emerald-100 text-green-700"
                              : "bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700"
                          )}
                        >
                          {sheet.gradingPeriod === "1st Term"
                            ? "1st Term"
                            : sheet.gradingPeriod === "2nd Term"
                            ? "2nd Term"
                            : "Final"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-900">
                            {sheet.students.length}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={cn(
                            "inline-flex items-center px-3 py-1 rounded-full text-xs font-bold",
                            sheet.isPublished
                              ? "bg-gradient-to-r from-green-100 to-emerald-100 text-green-700"
                              : "bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700"
                          )}
                        >
                          {sheet.isPublished ? "Publicado" : "Borrador"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-gray-600">
                          {sheet.updatedAt.toLocaleDateString("es-ES", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCurrentSheet(sheet);
                            }}
                            className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors hover:scale-110"
                            title="Abrir hoja"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (currentSheet?.id === sheet.id) {
                                exportToCSV();
                              } else {
                                setCurrentSheet(sheet);
                                setTimeout(() => exportToCSV(), 100);
                              }
                            }}
                            className="p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors hover:scale-110"
                            title="Exportar CSV"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => deleteGradeSheet(sheet.id, e)}
                            className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors hover:scale-110"
                            title="Eliminar hoja"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* New Sheet Modal */}
        {showNewSheetModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="modern-card w-full max-w-2xl max-h-[90vh] overflow-y-auto border-0 shadow-2xl">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                    <Plus className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">
                      Crear Nueva Hoja de Calificaciones
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Completa los detalles para crear una nueva hoja
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowNewSheetModal(false)}
                  className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Título de la Hoja *
                  </label>
                  <input
                    type="text"
                    value={newSheet.title}
                    onChange={(e) =>
                      setNewSheet({ ...newSheet, title: e.target.value })
                    }
                    placeholder="Ej: Calificaciones Matemáticas Q1"
                    className="input-modern w-full"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Curso *
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
                      className="input-modern w-full"
                      required
                    >
                      <option value="">Seleccionar curso</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.name} ({course.code}) -{" "}
                          {course.enrolledStudents?.length || 0} estudiantes
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Período *
                    </label>
                    <select
                      value={newSheet.gradingPeriod}
                      onChange={(e) =>
                        setNewSheet({
                          ...newSheet,
                          gradingPeriod: e.target.value as any,
                        })
                      }
                      className="input-modern w-full"
                      required
                    >
                      <option value="1st Term">First Term</option>
                      <option value="2nd Term">Second Term</option>
                      <option value="Final">Final</option>
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="font-medium text-gray-900">
                        Actividades de Evaluación
                      </h4>
                      <p className="text-sm text-gray-500">
                        Agrega las actividades que se evaluarán
                      </p>
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      {newSheet.activities.length} actividades
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4 p-4 bg-gradient-to-r from-gray-50 to-gray-100/50 rounded-xl">
                    <div className="md:col-span-3">
                      <label className="block text-xs font-medium text-gray-700 mb-2">
                        Nombre *
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
                        placeholder="Examen parcial"
                        className="input-modern text-sm w-full"
                        required
                      />
                    </div>

                    <div className="md:col-span-1">
                      <label className="block text-xs font-medium text-700 mb-2 ">
                        Tipo
                      </label>
                      <select
                        value={newActivityForModal.type}
                        onChange={(e) =>
                          setNewActivityForModal({
                            ...newActivityForModal,
                            type: e.target.value as any,
                          })
                        }
                        className="input-modern text-sm w-full"
                        required
                      >
                        <option value="exam">Examen</option>
                        <option value="quiz">Quiz</option>
                        <option value="homework">Tarea</option>
                        <option value="project">Proyecto</option>
                        <option value="participation">Participación</option>
                        <option value="self_evaluation">Self Evaluation</option>
                      </select>
                    </div>

                    <div className="flex items-end justify-center">
                      <button
                        onClick={addActivityToNewSheet}
                        disabled={!newActivityForModal.name.trim()}
                        className="btn-modern inline-flex items-center justify-center w-full h-10 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02]"
                        title={
                          !newActivityForModal.name.trim()
                            ? "El nombre de la actividad es requerido"
                            : "Agregar actividad"
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
                          className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50/50 to-cyan-50/50 border border-blue-100 rounded-xl"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <span className="font-medium text-gray-900">
                                {activity.name}
                              </span>
                              <span className="text-xs px-2 py-1 rounded-full bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 font-medium">
                                {activity.type}
                              </span>
                            </div>
                            <div className="text-sm text-gray-600 mt-1">
                              Puntuación máxima: {activity.maxScore}
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              removeActivityFromNewSheet(activity.id)
                            }
                            className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-4 pt-6 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setShowNewSheetModal(false)}
                    className="px-5 py-2.5 text-gray-700 hover:text-gray-900 hover:bg-gray-50 font-medium transition-all duration-300 rounded-xl border border-gray-300"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={createNewGradeSheet}
                    disabled={
                      isSaving ||
                      newSheet.activities.length === 0 ||
                      !newSheet.courseId
                    }
                    className="btn-modern px-6 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Creando...
                      </>
                    ) : (
                      "Crear Hoja"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Activity Modal */}
        {showAddActivityModal && currentSheet && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="modern-card w-full max-w-lg max-h-[90vh] overflow-y-auto border-0 shadow-2xl">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                    <Plus className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">
                      Agregar Actividad a {currentSheet.title}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Define una nueva actividad de evaluación
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
                  className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre de la Actividad *
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
                    placeholder="Ej: Presentación final"
                    className="input-modern w-full"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tipo de Actividad
                    </label>
                    <select
                      value={newActivityForCurrentSheet.type}
                      onChange={(e) =>
                        setNewActivityForCurrentSheet({
                          ...newActivityForCurrentSheet,
                          type: e.target.value as any,
                        })
                      }
                      className="input-modern w-full"
                    >
                      <option value="exam">Examen</option>
                      <option value="quiz">Quiz</option>
                      <option value="homework">Tarea</option>
                      <option value="project">Proyecto</option>
                      <option value="participation">Participación</option>
                      <option value="self_evaluation">Self Evaluation</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Puntuación Máxima
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
                        className="input-modern w-full pl-3 pr-12"
                      />
                      <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-gray-500">
                        /5.0
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Descripción (Opcional)
                  </label>
                  <textarea
                    value={newActivityForCurrentSheet.description || ""}
                    onChange={(e) =>
                      setNewActivityForCurrentSheet({
                        ...newActivityForCurrentSheet,
                        description: e.target.value,
                      })
                    }
                    placeholder="Ej: Esta actividad evalúa la capacidad de presentar argumentos de manera clara y estructurada..."
                    className="input-modern w-full min-h-[100px] resize-none"
                    rows={4}
                    maxLength={100}
                  />
                  <div className="flex justify-between items-center mt-1">
                    <p className="text-xs text-gray-500">
                      Máximo 100 caracteres
                    </p>
                    <span
                      className={`text-xs ${
                        (newActivityForCurrentSheet.description?.length || 0) >
                        95
                          ? "text-amber-600"
                          : "text-gray-500"
                      }`}
                    >
                      {newActivityForCurrentSheet.description?.length || 0}/100
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-4 pt-6 border-t border-gray-200">
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
                    className="px-5 py-2.5 text-gray-700 hover:text-gray-900 hover:bg-gray-50 font-medium transition-all duration-300 rounded-xl border border-gray-300"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={addActivityToCurrentSheet}
                    disabled={!newActivityForCurrentSheet.name.trim()}
                    className="btn-modern px-6 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar Actividad
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

    
      </div>
    </DashboardLayout>
  );
}