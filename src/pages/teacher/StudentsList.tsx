import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/contexts/NotificationContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { firebaseDB } from "@/lib/firebase";
import {
  collection,
  getDocs,
  addDoc,
  query,
  where,
} from "firebase/firestore";
import {
  Users,
  Mail,
  Phone,
  UserPlus,
  User as UserIcon,
  Trash2,
  Search,
  Filter,
  GraduationCap,
  Hash,
  Loader2,
  AlertCircle,
  X,
  Save,
  ChevronDown,
  Eye,
  Link as LinkIcon,
  UserCheck,
  Shield,
  Clock,
  BookOpen,
  SortAsc,
  SortDesc,
} from "lucide-react";
import { z } from "zod";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { deleteUserByAdmin } from "@/lib/services/adminUserDeletionService";
import { isTeacherPlanExpired } from "@/lib/services/teacherPlanAccessService";
import { isAdminEmail } from "@/lib/services/adminAccessService";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const studentSchema = z.object({
  idNumber: z.string().min(5, "ID must have at least 5 characters"),
  email: z.string().email("Enter a valid email"),
  name: z.string().min(3, "Name must have at least 3 characters"),
  whatsApp: z.string().min(10, "Enter a valid phone number"),
  role: z.enum(["estudiante", "docente"]).default("estudiante"),
});

type UserRole = "estudiante" | "docente";
type TeacherApprovalStatus = "pending" | "approved" | "rejected";
type StudentRoleDisplay = "student" | "teacher" | "teacher_pending" | "teacher_rejected";

const normalizeUserRole = (value: unknown): UserRole | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();

  if (
    normalized === "docente" ||
    normalized === "teacher" ||
    normalized === "profesor" ||
    normalized === "professor" ||
    normalized === "instructor"
  ) {
    return "docente";
  }

  if (
    normalized === "estudiante" ||
    normalized === "student" ||
    normalized === "alumno" ||
    normalized === "learner"
  ) {
    return "estudiante";
  }

  return null;
};

const normalizeTeacherApprovalStatus = (
  value: unknown,
): TeacherApprovalStatus | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "pending" ||
    normalized === "approved" ||
    normalized === "rejected"
  ) {
    return normalized as TeacherApprovalStatus;
  }
  return null;
};

interface Student {
  id: string;
  idNumber: string;
  email: string;
  name: string;
  role: "estudiante" | "docente";
  requestedRole?: UserRole;
  teacherApprovalStatus?: TeacherApprovalStatus;
  whatsApp: string;
  avatarUrl?: string;
  avatarEmoji?: string;
  createdAt?: Date;
  courses: string[];
  canDelete: boolean;
}

const getStudentRoleDisplay = (
  student: Pick<Student, "role" | "requestedRole" | "teacherApprovalStatus">,
): StudentRoleDisplay => {
  if (student.role === "docente") return "teacher";
  if (student.requestedRole !== "docente") return "student";
  if (student.teacherApprovalStatus === "pending") return "teacher_pending";
  if (student.teacherApprovalStatus === "rejected") return "teacher_rejected";
  if (student.teacherApprovalStatus === "approved") return "teacher";
  return "student";
};

const isTeacherDisplay = (
  student: Pick<Student, "role" | "requestedRole" | "teacherApprovalStatus">,
): boolean => getStudentRoleDisplay(student) !== "student";

export default function StudentsPage() {
  const { user } = useAuth();
  const {
    createNotification,
  } = useNotifications();
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<
    "all" | "estudiante" | "docente"
  >("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingStudent, setIsDeletingStudent] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [courseNames, setCourseNames] = useState<Record<string, string>>({});

  const isTeacher = user?.role === "docente";
  const isAdmin = isAdminEmail(user?.email);
  const [myCourseStudentIds, setMyCourseStudentIds] = useState<Set<string>>(
    new Set(),
  );
  const [myTeacherCourseIds, setMyTeacherCourseIds] = useState<Set<string>>(
    new Set(),
  );
  const [teacherCourseCount, setTeacherCourseCount] = useState(0);
  const [showOnlyMyStudents, setShowOnlyMyStudents] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;
  const [sortBy, setSortBy] = useState<
    "createdAt" | "idNumber" | "name" | "role"
  >("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Form state for new student
  const [newStudent, setNewStudent] = useState({
    idNumber: "",
    email: "",
    name: "",
    whatsApp: "",
    role: "estudiante" as "estudiante" | "docente",
  });

  const fetchCourseNames = useCallback(async () => {
    try {
      const coursesRef = collection(firebaseDB, "cursos");
      const querySnapshot = await getDocs(coursesRef);

      const names: Record<string, string> = {};
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        names[doc.id] = data.name || data.nombre || "";
      });

      setCourseNames(names);
    } catch {
      toast.error("Could not load course names");
    }
  }, []);

  const fetchTeacherCourses = useCallback(async () => {
    if (!isTeacher || !user?.id) {
      setMyCourseStudentIds(new Set());
      setMyTeacherCourseIds(new Set());
      setTeacherCourseCount(0);
      return;
    }

    try {
      const coursesRef = collection(firebaseDB, "cursos");
      const teacherCoursesQuery = query(
        coursesRef,
        where("teacherId", "==", user.id),
      );
      const querySnapshot = await getDocs(teacherCoursesQuery);

      const ownedCourseIds = new Set<string>();
      const allStudentIds = new Set<string>();

      querySnapshot.forEach((doc) => {
        ownedCourseIds.add(doc.id);
        const data = doc.data() as Record<string, any>;
        if (data.enrolledStudents && Array.isArray(data.enrolledStudents)) {
          data.enrolledStudents.forEach((studentId: string) => {
            allStudentIds.add(studentId);
          });
        }
      });

      setMyTeacherCourseIds(ownedCourseIds);
      setMyCourseStudentIds(allStudentIds);
      setTeacherCourseCount(querySnapshot.size);
    } catch {
      // Non-critical for page usage; avoid noisy toast while navigating.
    }
  }, [isTeacher, user?.id]);

  const fetchStudents = useCallback(async () => {
    setIsLoading(true);
    try {
      const [studentsSnapshot, usersSnapshot, coursesSnapshot] = await Promise.all([
        getDocs(collection(firebaseDB, "estudiantes")),
        getDocs(collection(firebaseDB, "usuarios")),
        getDocs(collection(firebaseDB, "cursos")),
      ]);

      const usersById = new Map<string, Record<string, any>>();
      usersSnapshot.forEach((userDoc) => {
        usersById.set(userDoc.id, userDoc.data() as Record<string, any>);
      });

      const studentsById = new Map<string, Record<string, any>>();
      studentsSnapshot.forEach((studentDoc) => {
        studentsById.set(studentDoc.id, studentDoc.data() as Record<string, any>);
      });

      const validCourseIds = new Set<string>(
        coursesSnapshot.docs.map((courseDoc) => courseDoc.id),
      );

      const coursesByUserId = new Map<string, Set<string>>();
      const teacherIds = new Set<string>();
      coursesSnapshot.forEach((courseDoc) => {
        const courseData = courseDoc.data() as Record<string, any>;
        const courseId = courseDoc.id;

        const teacherId = typeof courseData.teacherId === "string" ? courseData.teacherId : "";
        if (teacherId) {
          teacherIds.add(teacherId);
          if (!coursesByUserId.has(teacherId)) coursesByUserId.set(teacherId, new Set());
          coursesByUserId.get(teacherId)?.add(courseId);
        }

        const enrolled = Array.isArray(courseData.enrolledStudents) ? courseData.enrolledStudents : [];
        enrolled.forEach((entry) => {
          const userId = typeof entry === "string" ? entry : entry?.id;
          if (!userId || typeof userId !== "string") return;
          if (!coursesByUserId.has(userId)) coursesByUserId.set(userId, new Set());
          coursesByUserId.get(userId)?.add(courseId);
        });
      });

      const userIds = new Set<string>([
        ...Array.from(usersById.keys()),
        ...Array.from(studentsById.keys()),
        ...Array.from(coursesByUserId.keys()),
      ]);

      const studentList: Student[] = Array.from(userIds).map((id) => {
        const userData = usersById.get(id) || {};
        const studentData = studentsById.get(id) || {};
        const roleFromData =
          normalizeUserRole(userData.role) ||
          normalizeUserRole(studentData.role);
        const requestedRole =
          normalizeUserRole(userData.requestedRole) ||
          normalizeUserRole(studentData.requestedRole) ||
          undefined;
        const teacherApprovalStatus =
          normalizeTeacherApprovalStatus(userData.teacherApprovalStatus) ||
          normalizeTeacherApprovalStatus(studentData.teacherApprovalStatus) ||
          undefined;
        const inferredRole =
          roleFromData
            ? roleFromData
            : requestedRole === "docente" && teacherApprovalStatus === "approved"
              ? "docente"
            : (teacherIds.has(id) ? "docente" : "estudiante");

        const directCourses = Array.isArray(studentData.courses)
          ? studentData.courses.filter(
              (courseId): courseId is string =>
                typeof courseId === "string" && validCourseIds.has(courseId),
            )
          : [];
        const inferredCourses = Array.from(coursesByUserId.get(id) || []).filter(
          (courseId) => validCourseIds.has(courseId),
        );

        const createdAt =
          studentData.createdAt?.toDate?.() ||
          userData.createdAt?.toDate?.() ||
          undefined;

        return {
          id,
          idNumber:
            studentData.idNumber ||
            userData.idNumber ||
            userData.identification ||
            "",
          email: studentData.email || userData.email || "",
          name: studentData.name || userData.name || "Unknown user",
          role: inferredRole as "docente" | "estudiante",
          requestedRole,
          teacherApprovalStatus,
          whatsApp:
            studentData.whatsApp ||
            studentData.phone ||
            userData.phone ||
            userData.whatsApp ||
            userData.whatsapp ||
            "",
          avatarUrl: userData.avatarUrl || studentData.avatarUrl || "",
          avatarEmoji: userData.avatarEmoji || studentData.avatarEmoji || "",
          createdAt,
          courses: Array.from(new Set([...directCourses, ...inferredCourses])),
          canDelete: inferredRole === "estudiante",
        };
      });

      studentList.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
      setStudents(studentList);
      setError("");
    } catch {
      setError("Error loading students");
      toast.error("Error loading students");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([
        fetchStudents(),
        fetchCourseNames(),
        fetchTeacherCourses(),
      ]);
    };

    loadData();
  }, [fetchStudents, fetchCourseNames, fetchTeacherCourses]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim().toLowerCase());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const studentsWithCourses = useMemo(
    () =>
      students.filter(
        (student) =>
          isTeacherDisplay(student) ||
          (student.courses && student.courses.length > 0),
      ),
    [students],
  );

  const studentsWithoutCourses = useMemo(() => {
    const withoutCourses = students.filter(
      (student) =>
        !isTeacherDisplay(student) &&
        (!student.courses || student.courses.length === 0),
    );

    if (isTeacher && showOnlyMyStudents) {
      return [];
    }

    if (isAdmin || isTeacher) return withoutCourses;
    return [];
  }, [students, isTeacher, isAdmin, showOnlyMyStudents]);

  const baseStudents = useMemo(() => {
    if (isTeacher && showOnlyMyStudents) {
      return students.filter((student) => {
        if (isTeacherDisplay(student)) return false;
        if (!myCourseStudentIds.has(student.id)) return false;

        const courseIds = Array.isArray(student.courses) ? student.courses : [];
        if (courseIds.length === 0) return true;
        return courseIds.some((courseId) => myTeacherCourseIds.has(courseId));
      });
    }
    if (isAdmin) return studentsWithCourses;
    if (isTeacher) return studentsWithCourses;
    return studentsWithCourses.filter((student) => student.id === user?.id);
  }, [
    students,
    studentsWithCourses,
    isAdmin,
    isTeacher,
    showOnlyMyStudents,
    myCourseStudentIds,
    myTeacherCourseIds,
    user?.id,
  ]);

  const filteredStudents = useMemo(() => {
    let list = [...baseStudents];

    if (roleFilter !== "all") {
      list = list.filter((student) =>
        roleFilter === "docente"
          ? isTeacherDisplay(student)
          : !isTeacherDisplay(student),
      );
    }

    if (debouncedSearchTerm) {
      list = list.filter((student) => {
        const normalizedName = student.name.toLowerCase();
        const normalizedEmail = student.email.toLowerCase();
        return (
          normalizedName.includes(debouncedSearchTerm) ||
          normalizedEmail.includes(debouncedSearchTerm) ||
          student.whatsApp.includes(debouncedSearchTerm) ||
          student.idNumber.includes(debouncedSearchTerm)
        );
      });
    }

    list.sort((a, b) => {
      if (sortBy === "createdAt") {
        const valueA = a.createdAt?.getTime() ?? 0;
        const valueB = b.createdAt?.getTime() ?? 0;
        return sortOrder === "asc" ? valueA - valueB : valueB - valueA;
      }

      if (sortBy === "idNumber") {
        const value = a.idNumber.localeCompare(b.idNumber, undefined, {
          numeric: true,
        });
        return sortOrder === "asc" ? value : -value;
      }

      if (sortBy === "role") {
        const value = getStudentRoleDisplay(a).localeCompare(
          getStudentRoleDisplay(b),
        );
        return sortOrder === "asc" ? value : -value;
      }

      const value = a.name.localeCompare(b.name);
      return sortOrder === "asc" ? value : -value;
    });

    return list;
  }, [baseStudents, roleFilter, debouncedSearchTerm, sortBy, sortOrder]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, roleFilter, sortBy, sortOrder, showOnlyMyStudents]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const paginatedStudents = useMemo(
    () =>
      filteredStudents.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize,
      ),
    [filteredStudents, currentPage],
  );

  const renderStudentAvatar = (student: Student) => {
    if (student.avatarUrl) {
      return (
        <img
          src={student.avatarUrl}
          alt={`${student.name} avatar`}
          className="h-10 w-10 rounded-full object-cover border border-gray-200"
        />
      );
    }

    if (student.avatarEmoji) {
      return (
        <div className="h-10 w-10 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-lg">
          {student.avatarEmoji}
        </div>
      );
    }

    return (
      <div className="h-10 w-10 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center">
        <UserIcon className="h-5 w-5 text-blue-600" />
      </div>
    );
  };

  const renderStudentRoleBadge = (student: Student) => {
    const roleDisplay = getStudentRoleDisplay(student);

    if (roleDisplay === "teacher") {
      return (
        <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-700">
          <Shield className="h-3 w-3" />
          Teacher
        </span>
      );
    }

    if (roleDisplay === "teacher_pending") {
      return (
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700">
          <Clock className="h-3 w-3" />
           Pending
        </span>
      );
    }

    if (roleDisplay === "teacher_rejected") {
      return (
        <span className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700">
          <AlertCircle className="h-3 w-3" />
          Teacher Rejected
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700">
        <GraduationCap className="h-3 w-3" />
        Student
      </span>
    );
  };

  const handleSortClick = (
    field: "createdAt" | "idNumber" | "name" | "role",
  ) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortBy(field);
    setSortOrder(field === "createdAt" ? "desc" : "asc");
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (
      isTeacher &&
      (isTeacherPlanBlocked || isTeacherStudentQuotaReached)
    ) {
      const message = isTeacherPlanBlocked
        ? "Plan expired. Renew payment to add users."
        : "Student quota reached for your current plan.";
      setError(message);
      toast.error(message);
      return;
    }

    const validation = studentSchema.safeParse(newStudent);
    if (!validation.success) {
      setError(validation.error.errors[0].message);
      toast.error(validation.error.errors[0].message);
      return;
    }

    setIsSubmitting(true);
    try {
      // Check if student already exists
      const existingStudentById = students.find(
        (student) => student.idNumber === newStudent.idNumber,
      );

      if (existingStudentById) {
        setError("A student with this ID already exists");
        toast.error("A student with this ID already exists");
        return;
      }

      const existingStudentByEmail = students.find(
        (student) => student.email === newStudent.email,
      );

      if (existingStudentByEmail) {
        setError("A student with this email already exists");
        toast.error("A student with this email already exists");
        return;
      }

      // Add to Firestore
      const docRef = await addDoc(collection(firebaseDB, "estudiantes"), {
        ...newStudent,
        courses: [],
        createdAt: new Date(),
      });

      // Update local state
      const addedStudent: Student = {
        id: docRef.id,
        ...newStudent,
        courses: [],
        createdAt: new Date(),
        canDelete: true,
      };

      setStudents((prev) => [addedStudent, ...prev]);

      // Reset form
      setNewStudent({
        idNumber: "",
        email: "",
        name: "",
        whatsApp: "",
        role: "estudiante",
      });
      setShowAddForm(false);
      await createNotification({
        title: "User created",
        message: `${addedStudent.name} was added successfully.`,
        type: "success",
        link: `/students/${addedStudent.id}`,
      });
      toast.success("User added successfully");
    } catch {
      setError("Error adding student");
      toast.error("Error adding student");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteStudent = async () => {
    if (!studentToDelete) return;
    if (!studentToDelete.canDelete) {
      toast.error("This user cannot be deleted from this panel.");
      setStudentToDelete(null);
      return;
    }
    setIsDeletingStudent(true);
    try {
      // Cloud Function also removes Firebase Auth user to keep identity data in sync.
      await deleteUserByAdmin(studentToDelete.id);
      setStudents((prev) =>
        prev.filter((student) => student.id !== studentToDelete.id),
      );
      toast.success("User deleted successfully (Firestore + Auth).");
      setStudentToDelete(null);
    } catch (error: unknown) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : "";

      if (code.includes("functions/permission-denied")) {
        toast.error("You do not have permission to delete this account.");
      } else if (code.includes("functions/unavailable")) {
        toast.error("Delete service unavailable. Deploy Cloud Functions and retry.");
      } else if (code.includes("functions/failed-precondition")) {
        toast.error("This account cannot be deleted from this panel.");
      } else {
        setError("Error deleting student");
        toast.error("Error deleting student");
      }
    } finally {
      setIsDeletingStudent(false);
    }
  };

  // Statistics
  const studentCount = isAdmin
    ? students.length
    : isTeacher
      ? filteredStudents.length
      : students.filter((s) => s.id === user?.id).length;

  const studentCountByRole = {
    estudiante: filteredStudents.filter((s) => !isTeacherDisplay(s)).length,
    docente: filteredStudents.filter((s) => isTeacherDisplay(s)).length,
  };
  const teacherPlanCourseLimit =
    typeof user?.teacherPlanCourseLimit === "number" && user.teacherPlanCourseLimit > 0
      ? user.teacherPlanCourseLimit
      : null;
  const teacherPlanStudentLimit =
    typeof user?.teacherPlanStudentLimit === "number" && user.teacherPlanStudentLimit > 0
      ? user.teacherPlanStudentLimit
      : null;
  const remainingTeacherCourseQuota = teacherPlanCourseLimit
    ? Math.max(0, teacherPlanCourseLimit - teacherCourseCount)
    : null;
  const usedTeacherStudentQuota = myCourseStudentIds.size;
  const remainingTeacherStudentQuota = teacherPlanStudentLimit
    ? Math.max(0, teacherPlanStudentLimit - usedTeacherStudentQuota)
    : null;
  const isTeacherStudentQuotaReached =
    isTeacher &&
    Boolean(teacherPlanStudentLimit) &&
    usedTeacherStudentQuota >= teacherPlanStudentLimit;
  const isTeacherPlanBlocked =
    isTeacher &&
    isTeacherPlanExpired({
      role: user?.role,
      teacherPlanStatus: user?.teacherPlanStatus,
      teacherPlanExpiresAt: user?.teacherPlanExpiresAt,
    });
  const canTeacherAddUsers =
    !isTeacher || (!isTeacherPlanBlocked && !isTeacherStudentQuotaReached);
  const sortLabel =
    sortBy === "createdAt"
      ? "Most Recent"
      : sortBy === "idNumber"
        ? "ID Number"
        : sortBy === "name"
          ? "Name"
          : "Role";

  // Loading state
  if (isLoading) {
    return (
      <DashboardLayout contentClassName="pt-0 lg:pt-1">
        <div className="relative overflow-x-clip">
          <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
          <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />

          <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
            <div className="flex min-h-[320px] items-center justify-center">
              <div className="space-y-2 text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
                <div>
                  <p className="text-lg font-semibold text-slate-900">Loading students</p>
                  <p className="text-sm text-slate-600">
                    Please wait while we load the student data
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout contentClassName="pt-0 lg:pt-1">
      <div className="relative overflow-x-clip">
        <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
        <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />

        <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <div className="flex flex-col gap-3">
        <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
          <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-sky-200/35" />
          <div className="pointer-events-none absolute -right-24 -bottom-24 h-64 w-64 rounded-full bg-indigo-200/35" />
          <div className="relative z-10">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                  <Users className="h-3.5 w-3.5" />
                  Student Workspace
                </div>
                <h2 className="mt-3 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                  Student Management Center
                </h2>
                <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                  Manage users, monitor enrollments, and keep course rosters clean.
                </p>
              </div>
              <button
                onClick={() => setShowAddForm(true)}
                disabled={!canTeacherAddUsers}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <UserPlus className="h-4 w-4" />
                Add User
              </button>
            </div>
          </div>
        </section>

        <div
          className={`grid grid-cols-1 gap-2 sm:grid-cols-2 ${
            isTeacher && (teacherPlanCourseLimit || teacherPlanStudentLimit)
              ? "lg:grid-cols-5"
              : "lg:grid-cols-4"
          }`}
        >
          <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                    <Users className="h-4 w-4" />
                  </div>
                  <p className="text-lg font-extrabold leading-5 text-slate-900">{studentCount}</p>
                </div>
                <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Total Registered</p>
              </div>
              <div className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
                All
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                    <GraduationCap className="h-4 w-4" />
                  </div>
                  <p className="text-lg font-extrabold leading-5 text-slate-900">{studentCountByRole.estudiante}</p>
                </div>
                <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Students</p>
              </div>
              <div className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                Active
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                    <Shield className="h-4 w-4" />
                  </div>
                  <p className="text-lg font-extrabold leading-5 text-slate-900">{studentCountByRole.docente}</p>
                </div>
                <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Teachers</p>
              </div>
              <div className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700">
                Staff
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <p className="text-lg font-extrabold leading-5 text-slate-900">{studentsWithoutCourses.length}</p>
                </div>
                <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Without Courses</p>
              </div>
              <div className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                Review
              </div>
            </div>
          </div>

          {isTeacher && (teacherPlanCourseLimit || teacherPlanStudentLimit) && (
            <div className="min-w-0 rounded-xl border border-sky-200 bg-sky-50 p-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                      <BookOpen className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-extrabold leading-5 text-slate-900">
                      {teacherPlanStudentLimit
                        ? `${usedTeacherStudentQuota}/${teacherPlanStudentLimit}`
                        : usedTeacherStudentQuota}
                    </p>
                  </div>
                  <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Plan Students</p>
                  <p className="text-[10px] text-slate-500">
                    Courses: {teacherPlanCourseLimit ? `${teacherCourseCount}/${teacherPlanCourseLimit}` : teacherCourseCount}
                  </p>
                </div>
                <div className="rounded-full border border-sky-200 bg-white px-2 py-1 text-[11px] font-semibold text-sky-700">
                  Rem {teacherPlanStudentLimit ? remainingTeacherStudentQuota : "inf"}
                </div>
              </div>
              {isTeacherPlanBlocked && (
                <p className="mt-1.5 text-[10px] font-semibold text-rose-700">
                  Plan expired. Renew payment to continue.
                </p>
              )}
              {!isTeacherPlanBlocked && teacherPlanCourseLimit && remainingTeacherCourseQuota === 0 && (
                <p className="mt-1.5 text-[10px] font-semibold text-amber-700">
                  Course quota reached.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by ID, name, email or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2.5 pl-10 pr-3 text-sm font-medium text-slate-700 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select
                  value={roleFilter}
                  onChange={(e) =>
                    setRoleFilter(
                      e.target.value as "all" | "estudiante" | "docente",
                    )
                  }
                  className="h-10 appearance-none rounded-xl border border-slate-300 bg-slate-50 pl-10 pr-8 text-sm font-medium text-slate-700 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="all">All Roles</option>
                  <option value="estudiante">Students</option>
                  <option value="docente">Teachers</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>

              {isTeacher && (
                <button
                  onClick={() => setShowOnlyMyStudents((prev) => !prev)}
                  className={cn(
                    "h-10 rounded-xl border px-3 text-sm font-semibold transition",
                    showOnlyMyStudents
                      ? "border-sky-300 bg-sky-50 text-sky-700"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                  )}
                >
                  {showOnlyMyStudents ? "Only My Students" : "All Students"}
                </button>
              )}

              <button
                onClick={() => setShowAddForm(true)}
                disabled={!canTeacherAddUsers}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <UserPlus className="h-4 w-4" />
                Add User
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50/60 px-4 py-4 sm:px-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                    <UserCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      {isTeacher && showOnlyMyStudents
                        ? "My Students"
                        : "Registered Users"}
                    </h3>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {filteredStudents.length} users with courses
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Clock className="h-4 w-4 text-slate-400" />
                <span className="text-sm text-slate-600">
                  Sorted by: <span className="font-medium">{sortLabel}</span> (
                  {sortOrder})
                </span>
                <button
                  onClick={() => handleSortClick("createdAt")}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Most Recent
                  {sortBy === "createdAt" &&
                    (sortOrder === "asc" ? (
                      <SortAsc className="h-3 w-3" />
                    ) : (
                      <SortDesc className="h-3 w-3" />
                    ))}
                </button>
                {(searchTerm || roleFilter !== "all") && (
                  <button
                    onClick={() => {
                      setSearchTerm("");
                      setRoleFilter("all");
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <X className="h-3 w-3" />
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          </div>

          {filteredStudents.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100">
                <Users className="h-10 w-10 text-slate-400" />
              </div>
              <h3 className="mb-2 text-xl font-bold text-slate-900">
                {searchTerm || roleFilter !== "all"
                  ? "No results found"
                  : "No students with courses"}
              </h3>
              <p className="mx-auto mb-6 max-w-md text-slate-600">
                {searchTerm || roleFilter !== "all"
                  ? "Try different search terms"
                  : "All students are currently without course assignments"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto stm-table-wrap">
              <table className="w-full table-modern stm-table">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="min-w-[180px] px-6 py-4 text-left font-bold text-slate-900">
                      <button
                        onClick={() => handleSortClick("idNumber")}
                        className="flex items-center gap-2 transition-colors hover:text-sky-700"
                      >
                        <Hash className="h-4 w-4 text-slate-500" />
                        ID Number
                        {sortBy === "idNumber" &&
                          (sortOrder === "asc" ? (
                            <SortAsc className="h-4 w-4" />
                          ) : (
                            <SortDesc className="h-4 w-4" />
                          ))}
                      </button>
                    </th>
                    <th className="min-w-[220px] px-4 py-4 text-left font-bold text-slate-900">
                      <button
                        onClick={() => handleSortClick("name")}
                        className="flex items-center gap-2 transition-colors hover:text-sky-700"
                      >
                        Name & Details
                        {sortBy === "name" &&
                          (sortOrder === "asc" ? (
                            <SortAsc className="h-4 w-4" />
                          ) : (
                            <SortDesc className="h-4 w-4" />
                          ))}
                      </button>
                    </th>
                    <th className="min-w-[320px] px-4 py-4 text-left font-bold text-slate-900">
                      Contact Information
                    </th>
                    <th className="min-w-[120px] px-4 py-4 text-left font-bold text-slate-900">
                      <button
                        onClick={() => handleSortClick("role")}
                        className="flex items-center gap-2 transition-colors hover:text-sky-700"
                      >
                        Role
                        {sortBy === "role" &&
                          (sortOrder === "asc" ? (
                            <SortAsc className="h-4 w-4" />
                          ) : (
                            <SortDesc className="h-4 w-4" />
                          ))}
                      </button>
                    </th>
                    {isTeacher && (
                      <th className="min-w-[140px] px-4 py-4 text-left font-bold text-slate-900">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {paginatedStudents.map((student, index) => (
                    <tr
                      key={student.id}
                      className={cn(
                        "border-b border-slate-200 transition-all duration-300 hover:bg-sky-50/30",
                        index % 2 === 0 ? "bg-white" : "bg-slate-50/30",
                      )}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {renderStudentAvatar(student)}
                          <span className="font-mono text-sm font-semibold text-slate-900">
                            {student.idNumber}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <span className="font-semibold text-slate-900">
                            {student.name}
                          </span>
                          {student.courses && student.courses.length > 0 ? (
                            <div className="mt-2">
                              <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700">
                                {student.courses.length} course
                                {student.courses.length !== 1 ? "s" : ""}
                              </span>
                              <div className="mt-1 space-y-0.5 text-xs text-slate-600">
                                {student.courses
                                  .filter((courseId) => Boolean(courseNames[courseId]))
                                  .slice(0, 2)
                                  .map((courseId) => (
                                    <div key={courseId} className="leading-tight">
                                      {courseNames[courseId]}
                                    </div>
                                  ))}
                                {student.courses.filter((courseId) => Boolean(courseNames[courseId])).length > 2 && (
                                  <div className="text-slate-500">
                                    +{student.courses.filter((courseId) => Boolean(courseNames[courseId])).length - 2} more
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 text-xs text-slate-400">
                              No courses assigned
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50">
                              <Mail className="h-4 w-4 text-sky-600" />
                            </div>
                            <span className="whitespace-nowrap text-sm text-slate-700">
                              {student.email}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50">
                              <Phone className="h-4 w-4 text-sky-600" />
                            </div>
                            <span className="text-sm text-slate-700">
                              {student.whatsApp}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {renderStudentRoleBadge(student)}
                      </td>
                      {isTeacher && (
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            {(() => {
                              const canOpenEnrollPage =
                                !isTeacherPlanBlocked &&
                                (!isTeacherStudentQuotaReached || myCourseStudentIds.has(student.id));
                              return canOpenEnrollPage ? (
                                <Link
                                  to={`/students/${student.id}/enroll`}
                                  className="rounded-xl p-2 text-sky-600 transition-all duration-300 hover:bg-sky-50 hover:text-sky-700"
                                  title="Enroll in courses"
                                >
                                  <LinkIcon className="h-4 w-4" />
                                </Link>
                              ) : (
                                <button
                                  type="button"
                                  disabled
                                  className="cursor-not-allowed rounded-xl p-2 text-slate-400"
                                  title={
                                    isTeacherPlanBlocked
                                      ? "Plan expired. Renew payment to continue."
                                      : "Student quota reached for your current plan."
                                  }
                                >
                                  <LinkIcon className="h-4 w-4" />
                                </button>
                              );
                            })()}
                            <Link
                              to={`/students/${student.id}`}
                              className="rounded-xl p-2 text-slate-600 transition-all duration-300 hover:bg-slate-100 hover:text-slate-800"
                              title="View details"
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                            <button
                              onClick={() => setStudentToDelete(student)}
                              disabled={!student.canDelete}
                              className="rounded-xl p-2 text-rose-600 transition-all duration-300 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                              title={
                                student.canDelete
                                  ? "Delete student"
                                  : "Cannot delete this user from here"
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filteredStudents.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
              <p className="text-sm text-slate-600">
                Showing {(currentPage - 1) * pageSize + 1}-
                {Math.min(currentPage * pageSize, filteredStudents.length)} of{" "}
                {filteredStudents.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(1, prev - 1))
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-50"
                >
                  Prev
                </button>
                <span className="text-sm text-slate-700">
                  Page {currentPage} / {totalPages}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Students Without Courses Section - Only students WITHOUT courses */}
        {isTeacher && studentsWithoutCourses.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm sm:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100">
                <BookOpen className="h-4 w-4 text-amber-700" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Students Without Courses ({studentsWithoutCourses.length})
                </h3>
                <p className="text-sm text-slate-600">
                  These students are not enrolled in any course
                </p>
              </div>
            </div>

            <div className="overflow-x-auto stm-table-wrap">
              <table className="w-full table-modern stm-table">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100/70">
                    <th className="min-w-[180px] px-6 py-4 text-left font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        <Hash className="h-4 w-4 text-slate-500" />
                        ID Number
                      </div>
                    </th>
                    <th className="min-w-[220px] px-4 py-4 text-left font-bold text-slate-900">
                      Name & Details
                    </th>
                    <th className="min-w-[320px] px-4 py-4 text-left font-bold text-slate-900">
                      Contact Information
                    </th>
                    <th className="min-w-[120px] px-4 py-4 text-left font-bold text-slate-900">
                      Role
                    </th>
                    <th className="min-w-[200px] px-4 py-4 text-left font-bold text-slate-900">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {studentsWithoutCourses.map((student, index) => (
                    <tr
                      key={student.id}
                      className={cn(
                        "border-b border-slate-200 transition-all duration-300 hover:bg-sky-50/30",
                        index % 2 === 0 ? "bg-white" : "bg-slate-50/30",
                      )}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {renderStudentAvatar(student)}
                          <span className="font-mono text-sm font-semibold text-slate-900">
                            {student.idNumber}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <span className="font-semibold text-slate-900">
                            {student.name}
                          </span>
                          <div className="mt-2">
                            <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                              No courses
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50">
                              <Mail className="h-4 w-4 text-sky-600" />
                            </div>
                            <span className="whitespace-nowrap text-sm text-slate-700">
                              {student.email}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50">
                              <Phone className="h-4 w-4 text-sky-600" />
                            </div>
                            <span className="text-sm text-slate-700">
                              {student.whatsApp}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {renderStudentRoleBadge(student)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/students/${student.id}/enroll`}
                            className="rounded-xl p-2 text-sky-600 transition-all duration-300 hover:bg-sky-50 hover:text-sky-700"
                            title="Enroll in courses"
                          >
                            <LinkIcon className="h-4 w-4" />
                          </Link>
                          <Link
                            to={`/students/${student.id}`}
                            className="rounded-xl p-2 text-slate-600 transition-all duration-300 hover:bg-slate-100 hover:text-slate-800"
                            title="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          <button
                            onClick={() => setStudentToDelete(student)}
                            disabled={!student.canDelete}
                            className="rounded-xl p-2 text-rose-600 transition-all duration-300 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                            title={
                              student.canDelete
                                ? "Delete student"
                                : "Cannot delete this user from here"
                            }
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

            {studentsWithoutCourses.length > 10 && (
              <div className="mt-4 text-center">
                <button className="text-sm font-semibold text-sky-700 hover:text-sky-800">
                  View all {studentsWithoutCourses.length} students...
                </button>
              </div>
            )}
          </div>
        )}
          </div>
        </div>
      </div>

      <AlertDialog
        open={!!studentToDelete}
        onOpenChange={(open) => {
          if (!open && !isDeletingStudent) {
            setStudentToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. {studentToDelete?.name} will be
              permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingStudent}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmDeleteStudent();
              }}
              disabled={isDeletingStudent}
              className="bg-gray-900 hover:bg-black"
            >
              {isDeletingStudent ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Student Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px] stm-modal-overlay">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-[0_32px_72px_-40px_rgba(15,23,42,0.6)] stm-modal">
            <div className="border-b border-slate-200 p-4 stm-modal-head">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100">
                    <UserPlus className="h-4 w-4 text-sky-700" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Add New User
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Register a student or teacher
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setError("");
                  }}
                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {error && (
              <div className="mx-4 mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700 stm-alert">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <p className="text-sm font-medium">{error}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleAddStudent} className="p-4 stm-modal-form">
              <div className="space-y-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    ID Number *
                  </label>
                  <input
                    type="text"
                    value={newStudent.idNumber}
                    onChange={(e) =>
                      setNewStudent({ ...newStudent, idNumber: e.target.value })
                    }
                    placeholder="Student or teacher ID"
                    className="h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-medium text-slate-700 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 stm-modal-input"
                    required
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Unique identification number
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={newStudent.name}
                    onChange={(e) =>
                      setNewStudent({ ...newStudent, name: e.target.value })
                    }
                    placeholder="Full name"
                    className="h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-medium text-slate-700 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 stm-modal-input"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={newStudent.email}
                    onChange={(e) =>
                      setNewStudent({ ...newStudent, email: e.target.value })
                    }
                    placeholder="Email address"
                    className="h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-medium text-slate-700 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 stm-modal-input"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    value={newStudent.whatsApp}
                    onChange={(e) =>
                      setNewStudent({ ...newStudent, whatsApp: e.target.value })
                    }
                    placeholder="Phone number"
                    className="h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-medium text-slate-700 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 stm-modal-input"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Role *
                  </label>
                  <div className="relative">
                    <select
                      value={newStudent.role}
                      onChange={(e) =>
                        setNewStudent({
                          ...newStudent,
                          role: e.target.value as "estudiante" | "docente",
                        })
                      }
                      className="h-10 w-full appearance-none rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-medium text-slate-700 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 stm-modal-input"
                      required
                    >
                      <option value="estudiante">Student</option>
                      <option value="docente">Teacher</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>

                <div className="flex gap-2 pt-3 stm-modal-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setError("");
                    }}
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 stm-modal-btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-sky-300 bg-sky-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50 stm-modal-btn-primary"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Add User
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
