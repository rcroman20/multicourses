import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademic } from "@/contexts/AcademicContext";
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
  gradingPeriod: z.enum(["1st Term", "2nd Term", "Final"]),
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
  const { selectedCourseId, setSelectedCourseId } = useAcademic();
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
  const [isSyncing, setIsSyncing] = useState(false);
  const commentTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>(
    selectedCourseId || "all",
  );
  
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

  useEffect(() => {
    if (selectedCourseFilter === "all") return;

    if (selectedCourseFilter !== selectedCourseId) {
      setSelectedCourseId(selectedCourseFilter);
    }
  }, [selectedCourseFilter, selectedCourseId, setSelectedCourseId]);

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

  useEffect(() => {
    if (user && !hasLoadedInitialData.current) {
      const loadData = async () => {
        setIsLoading(true);
        try {
          await Promise.all([
            fetchCourses(),
            fetchStudents(),
            fetchGradeSheets()
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
    if (gradeSheets.length > 0 && students.length > 0) {
      calculateStudentAverages();
    }
  }, [gradeSheets, students]);

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
          await fetchGradeSheets();
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
      const q = query(
        gradeSheetsRef, 
        where("courseId", "==", courseId),
        where("teacherId", "==", user?.id || "")
      );
      const querySnapshot = await getDocs(q);

      const updatePromises = querySnapshot.docs.map(async (docSnapshot) => {
        const sheetData = docSnapshot.data();
        
        if (sheetData.teacherId !== user?.id) {
          return;
        }
        
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
        await fetchGradeSheets();
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

  const fetchGradeSheets = async () => {
    setIsLoading(true);
    try {
      const gradeSheetsRef = collection(firebaseDB, "gradeSheets");
      const q = query(
        gradeSheetsRef, 
        where("teacherId", "==", user?.id || ""),
        orderBy("updatedAt", "desc")
      );
      const querySnapshot = await getDocs(q);

      const sheets: GradeSheet[] = [];

      for (const doc of querySnapshot.docs) {
        const data = doc.data();

        if (data.teacherId !== user?.id) continue;

        const activities: Activity[] = (data.activities || []).map(
          (act: any, index: number) => ({
            id: act.id || `activity_${doc.id}_${index}_${Date.now()}`,
            name: act.name || "Untitled activity",
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
          title: data.title || "Untitled grade sheet",
          courseId: data.courseId,
          courseName: data.courseName || "Unnamed course",
          teacherId: data.teacherId || "",
          teacherName: data.teacherName || "Teacher",
          gradingPeriod: data.gradingPeriod || "1st Term",
          activities,
          students,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          isPublished: data.isPublished || false,
        });
      }

      setGradeSheets(sheets);
    } catch {
      setError("Error loading grade sheets");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCourses = async () => {
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
    } catch {
      setError("Error loading courses");
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
          name: data.name || "Student",
          email: data.email || "",
          idNumber: data.idNumber || "",
        });
      });

      setStudents(studentList);
    } catch (err) {
      setError("Error loading students");
    }
  };

  const calculateStudentAverages = () => {
    const averages: StudentAverage[] = [];

    const filteredStudents = students.filter(student => {
      return courses.some(course => 
        course.enrolledStudents.includes(student.id)
      );
    });

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
        totalSheets: gradeSheets.filter(sheet => 
          sheet.teacherId === user?.id
        ).length,
      };

      let totalSum = 0;
      let sheetsWithGrades = 0;

      const teacherSheets = gradeSheets.filter(sheet => 
        sheet.teacherId === user?.id
      );

      teacherSheets.forEach((sheet) => {
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

    if (newSheet.activities.length === 0) {
      setError("You must add at least one activity");
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

  const exportAveragesToCSV = () => {
    if (studentAverages.length === 0) return;

    let csvContent = "data:text/csv;charset=utf-8,";

    const headers = [
      "Student",
      "ID",
      "Email",
      ...gradeSheets.map((sheet) => sheet.title),
      "Overall average",
      "Passed",
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
        student.approved ? "Yes" : "No",
      ];
      csvContent += row.join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "student_averages.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  return (
    <DashboardLayout 
      title="Grade Sheets"
      subtitle="Manage and grade your students"
       contentClassName="pt-0 lg:pt-1"
    >
      <div className="space-y-2 fade-in-up">
        {isSyncing && ( 
          <div className="modern-card bg-blue-50 border border-blue-100 p-3 rounded-xl">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="text-sm font-medium text-blue-700">
                Syncing students...
              </span>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold mb-1 text-center md:text-left text-blue-600 tracking-wide">
                  {selectedCourseFilter === "all"
                    ? "Total sheets"
                    : `${
                        courses.find(c => c.id === selectedCourseFilter)?.code || ""
                      }`}
                </p>
                <p className="text-xl md:text-2xl font-bold text-gray-900 text-center md:text-left">
                  {filteredGradeSheets.length}
                </p>
              </div>
              <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                <FileSpreadsheet className="h-4 w-4 text-blue-500" />
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold mb-1 text-center md:text-left text-blue-600 tracking-wide">
                  Active courses
                </p>
                <p className="text-xl md:text-xl font-bold text-gray-900 text-center md:text-left">
                  {courses.length}
                </p>
              </div>
              <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                <BookOpen className="h-4 w-4 text-blue-500" />
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold mb-1 text-center md:text-left text-blue-600 tracking-wide">
                  Students
                </p>
                <p className="text-xl md:text-xl font-bold text-gray-900 text-center md:text-left">
                  {students.length}
                </p>
              </div>
              <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                <Users className="h-4 w-4 text-blue-500" />
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold mb-1 text-center md:text-left text-blue-600 tracking-wide">
                  Current term
                </p>
                <p className="text-xl md:text-xl font-bold text-gray-900 text-center md:text-left">
                  2025-2
                </p>
              </div>
              <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                <Calendar className="h-4 w-4 text-blue-500" />
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold mb-1 text-center md:text-left text-blue-600 tracking-wide">
                  Avg. score
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
              <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-blue-500" />
              </div>
            </div>
          </div>
        </div>
        <div className="modern-card bg-white border border-gray-200 p-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex-1 flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search sheets by title, course, or teacher..."
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
                  <option value="all">All courses</option>
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
                New sheet
              </button>
              
              <button
                onClick={() => setShowAveragesSection(!showAveragesSection)}
                className={cn(
                  "btn-modern-outline flex items-center gap-2 text-sm",
                  showAveragesSection && "bg-blue-50 border-blue-300"
                )}
              >
                <TrendingUp className="h-4 w-4" />
                Averages
              </button>
            </div>
          </div>
        </div>
        {success && (
          <div className="modern-card bg-blue-50 border border-blue-200 p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-4 w-4 text-blue-600" />
              <div>
                <p className="font-medium text-blue-800">{success}</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="modern-card bg-gray-100 border border-gray-200 p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-4 w-4 text-gray-700" />
              <div>
                <p className="font-medium text-gray-800">{error}</p>
              </div>
            </div>
          </div>
        )}
        {showAveragesSection && studentAverages.length > 0 && (
          <div className="modern-card">
            <div className="flex items-center justify-between mb-6">
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
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={exportAveragesToCSV}
                  className="btn-modern-outline flex items-center gap-2 text-sm"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full table-modern">
                <thead>
                  <tr className="bg-blue-50/10">
                    <th className="py-3 px-4 text-left font-bold text-gray-900 tracking-wide">
                      Student
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
                      Avg. score
                    </th>
                    <th className="py-3 px-4 text-left font-bold text-gray-900 tracking-wide">
                      Passed
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {studentAverages.map((student) => (
                    <tr key={student.studentId} className="hover:bg-blue-50/10">
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
                                    ? "text-blue-600"
                                    : average >= 3.0
                                    ? "text-blue-600"
                                    : average > 0
                                    ? "text-gray-700"
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

            <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
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

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
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

              <div className="bg-gray-100 border border-gray-200 rounded-xl p-4">
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

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
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
          <div className="modern-card">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
              <div className="flex items-center gap-4">
                <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                  <FileSpreadsheet className="h-4 w-4 text-blue-600" />
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
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-700"
                      )}
                    >
                      {currentSheet.isPublished ? "Published" : "Draft"}
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
                    className="btn-modern-outline flex items-center gap-2 text-sm"
                  >
                    <Eye className="h-4 w-4" />
                    Publish
                  </button>
                )}

                <button
                  onClick={exportToCSV}
                  className="btn-modern-outline flex items-center gap-2 text-sm"
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

            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="bg-blue-50/10">
                    <th className="sticky left-0 z-20 bg-blue-50 border-r border-gray-200 px-3 py-3 text-left font-bold text-gray-900 tracking-wide min-w-[200px]">
                      <div className="flex items-center justify-between">
                        <span>Student</span>
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
                                title={`${activity.name}\nType: ${activity.type}\nMax: ${activity.maxScore}${
                                  activity.description
                                    ? `\n\n${activity.description}`
                                    : ""
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (activity.description) {
                                    alert(
                                      `Description:\n\n${activity.description}`
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
                                  className="ml-1 p-1 text-gray-700 hover:bg-red-50 rounded transition-colors"
                                  title="Delete activity"
                                >
                                  <Trash2 className="h-4 w-4 text-red-600" />
                                </button>
                              </div>
                            )}
                          </div>

                          {activity.description && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                className="text-gray-400 hover:text-gray-600"
                                title={`View full description: ${activity.description}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  alert(
                                    `Description:\n\n${activity.description}`
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

                    <th className="px-3 py-3 text-left font-bold text-gray-900 tracking-wide border-b border-gray-200 bg-blue-50 min-w-[100px]">
                      <div className="text-center">
                        <div className="text-sm font-bold">Total</div>
                        <div className="text-xs text-gray-500">0-5.0</div>
                      </div>
                    </th>
                    <th className="px-3 py-3 text-left font-bold text-gray-900 tracking-wide border-b border-gray-200 bg-blue-50 min-w-[100px]">
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
                        e: React.MouseEvent<HTMLInputElement>
                      ) => {
                        const inputElement =
                          e.currentTarget as HTMLInputElement;

                        if (isLockedSavedGrade && !allowSavedEdit) {
                          setAllowSavedEdit(true);
                          setTimeout(() => {
                            startEditingSession(inputElement, true);
                          }, 0);
                          return;
                        }

                        startEditingSession(inputElement);
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
      className="px-3 py-2 border-b border-gray-200"
    >
      <div className="flex flex-col gap-1">
        <div className="relative">
          <input
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
                : "border-gray-200 hover:border-blue-500",
              isEditing && canEditValue
                ? "ring-2 ring-blue-500 ring-opacity-50"
                : "",
              currentSheet.isPublished ? "border-gray-200" : ""
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
            onDoubleClick={handleDoubleClick}
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
                ? "border-gray-200 bg-gray-100"
                : "border-gray-200 focus:ring-1 focus:ring-blue-500 focus:border-transparent"
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
                      <tr key={student.studentId} className="hover:bg-blue-50/10">
                        <td className="sticky left-0 z-10 bg-white border-r border-gray-200 px-3 py-3">
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

                        <td className="px-3 py-2 border-b border-gray-200 bg-blue-50">
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

                        <td className="px-3 py-2 border-b border-gray-200 bg-blue-50">
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

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
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

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
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

              <div className="bg-gray-100 border border-gray-200 rounded-xl p-4">
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

            <div className="mt-6 p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
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
        <div className="modern-card">
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
            <div className="overflow-x-auto">
              <table className="w-full table-modern">
                <thead>
                  <tr className="bg-blue-50/10">
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
                  {filteredGradeSheets.map((sheet) => (
                    <tr
                      key={sheet.id}
                      className="hover:bg-blue-50/10 cursor-pointer transition-colors"
                      onClick={() => setCurrentSheet(sheet)}
                    >
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                            <FileSpreadsheet className="h-4 w-4 text-blue-600" />
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

                      <td className="py-2 px-2">
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-1 rounded-full text-xs font-bold",
                            sheet.gradingPeriod === "1st Term"
                              ? "bg-blue-100 text-blue-700"
                              : sheet.gradingPeriod === "2nd Term"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-blue-100 text-blue-700"
                          )}
                        >
                          {sheet.gradingPeriod}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          <Users className="h-3 w-3 text-gray-400" />
                          <span className="text-sm font-medium text-gray-900">
                            {sheet.students.length}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <span
                          className={cn(
                            "inline-flex items-center px-3 py-1 rounded-full text-xs font-bold",
                            sheet.isPublished
                              ? "bg-blue-100 text-blue-700"
                              : "bg-gray-100 text-gray-700"
                          )}
                        >
                          {sheet.isPublished ? "Published" : "Draft"}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        <span className="text-sm text-gray-600">
                          {sheet.updatedAt.toLocaleDateString("en-US", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCurrentSheet(sheet);
                            }}
                            className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors hover:scale-110"
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
                                setCurrentSheet(sheet);
                                setTimeout(() => exportToCSV(), 100);
                              }
                            }}
                            className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors hover:scale-110"
                            title="Export CSV"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => deleteGradeSheet(sheet.id, e)}
                            className="p-2 text-gray-700 hover:text-gray-800 hover:bg-red-50 rounded-lg transition-colors hover:scale-110"
                            title="Delete sheet"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
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
        {showNewSheetModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="modern-card w-full max-w-2xl max-h-[90vh] overflow-y-auto border-0 shadow-2xl">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Plus className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">
                      Create new grade sheet
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Fill in the details to create a new sheet
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
                    Sheet title *
                  </label>
                  <input
                    type="text"
                    value={newSheet.title}
                    onChange={(e) =>
                      setNewSheet({ ...newSheet, title: e.target.value })
                    }
                    placeholder="Ex: Math grades Q1"
                    className="input-modern w-full"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
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
                      className="input-modern w-full"
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">
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
                        Assessment activities
                      </h4>
                      <p className="text-sm text-gray-500">
                        Add the activities that will be graded
                      </p>
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      {newSheet.activities.length} activities
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4 p-4 bg-gray-100 rounded-xl">
                    <div className="md:col-span-3">
                      <label className="block text-xs font-medium text-gray-700 mb-2">
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
                        className="input-modern text-sm w-full"
                        required
                      />
                    </div>

                    <div className="md:col-span-1">
                      <label className="block text-xs font-medium text-700 mb-2 ">
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
                        className="input-modern text-sm w-full"
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
                        className="btn-modern-outline inline-flex items-center justify-center w-full h-10 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02]"
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
                          className="flex items-center justify-between p-4 bg-blue-50/50 border border-blue-100 rounded-xl"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <span className="font-medium text-gray-900">
                                {activity.name}
                              </span>
                              <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
                                {activity.type}
                              </span>
                            </div>
                            <div className="text-sm text-gray-600 mt-1">
                              Max score: {activity.maxScore}
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              removeActivityFromNewSheet(activity.id)
                            }
                            className="p-2 text-gray-700 hover:text-gray-800 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
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
                    Cancel
                  </button>
                  <button
                    onClick={createNewGradeSheet}
                    disabled={
                      isSaving ||
                      newSheet.activities.length === 0 ||
                      !newSheet.courseId
                    }
                    className="btn-modern-outline px-6 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
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
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="modern-card w-full max-w-lg max-h-[90vh] overflow-y-auto border-0 shadow-2xl">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Plus className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">
                      Add activity to {currentSheet.title}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
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
                  className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
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
                    className="input-modern w-full"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
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
                      className="input-modern w-full"
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">
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
                    className="input-modern w-full min-h-[100px] resize-none"
                    rows={4}
                    maxLength={100}
                  />
                  <div className="flex justify-between items-center mt-1">
                    <p className="text-xs text-gray-500">
                      Maximum 100 characters
                    </p>
                    <span
                      className={`text-xs ${
                        (newActivityForCurrentSheet.description?.length || 0) >
                        95
                          ? "text-gray-700"
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
                    Cancel
                  </button> 
                  <button
                    onClick={addActivityToCurrentSheet}
                    disabled={!newActivityForCurrentSheet.name.trim()}
                    className="btn-modern-outline px-6 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add activity
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
