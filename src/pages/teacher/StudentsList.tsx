import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/contexts/NotificationContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { firebaseDB } from "@/lib/firebase";
import {
  collection,
  getDoc,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
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

interface Student {
  id: string;
  idNumber: string;
  email: string;
  name: string;
  role: "estudiante" | "docente";
  whatsApp: string;
  avatarUrl?: string;
  avatarEmoji?: string;
  createdAt?: Date;
  courses: string[];
  canDelete: boolean;
}

export default function StudentsPage() {
  const { user } = useAuth();
  const { createNotification } = useNotifications();
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
  const isAdmin = user?.role === "docente"; // Only if you have admin role
  const [myCourseStudentIds, setMyCourseStudentIds] = useState<Set<string>>(
    new Set(),
  );
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
        names[doc.id] = data.name || data.nombre || "Unknown Course";
      });

      setCourseNames(names);
    } catch {
      toast.error("Could not load course names");
    }
  }, []);

  const fetchTeacherCourses = useCallback(async () => {
    if (!isTeacher || !user?.id) return;

    try {
      const coursesRef = collection(firebaseDB, "cursos");
      const teacherCoursesQuery = query(
        coursesRef,
        where("teacherId", "==", user.id),
      );
      const querySnapshot = await getDocs(teacherCoursesQuery);

      const allStudentIds = new Set<string>();

      querySnapshot.forEach((doc) => {
        const data = doc.data() as Record<string, any>;
        if (data.enrolledStudents && Array.isArray(data.enrolledStudents)) {
          data.enrolledStudents.forEach((studentId: string) => {
            allStudentIds.add(studentId);
          });
        }
      });

      setMyCourseStudentIds(allStudentIds);
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
        const roleFromData = userData.role || studentData.role;
        const inferredRole =
          roleFromData === "docente" || roleFromData === "estudiante"
            ? roleFromData
            : (teacherIds.has(id) ? "docente" : "estudiante");

        const directCourses = Array.isArray(studentData.courses)
          ? studentData.courses.filter((courseId): courseId is string => typeof courseId === "string")
          : [];
        const inferredCourses = Array.from(coursesByUserId.get(id) || []);

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
          student.role === "docente" ||
          (student.courses && student.courses.length > 0),
      ),
    [students],
  );

  const studentsWithoutCourses = useMemo(() => {
    const withoutCourses = students.filter(
      (student) =>
        student.role === "estudiante" &&
        (!student.courses || student.courses.length === 0),
    );

    if (isTeacher && showOnlyMyStudents) {
      return withoutCourses.filter(
        (student) => !myCourseStudentIds.has(student.id),
      );
    }

    if (isAdmin || isTeacher) return withoutCourses;
    return [];
  }, [students, isTeacher, isAdmin, showOnlyMyStudents, myCourseStudentIds]);

  const baseStudents = useMemo(() => {
    if (isAdmin) return studentsWithCourses;
    if (isTeacher) {
      return showOnlyMyStudents
        ? studentsWithCourses.filter(
            (student) =>
              student.role === "docente" || myCourseStudentIds.has(student.id),
          )
        : studentsWithCourses;
    }
    return studentsWithCourses.filter((student) => student.id === user?.id);
  }, [
    studentsWithCourses,
    isAdmin,
    isTeacher,
    showOnlyMyStudents,
    myCourseStudentIds,
    user?.id,
  ]);

  const filteredStudents = useMemo(() => {
    let list = [...baseStudents];

    if (roleFilter !== "all") {
      list = list.filter((student) => student.role === roleFilter);
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
        const value = a.role.localeCompare(b.role);
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
      // Delete from both collections if present (estudiantes + usuarios)
      const studentRef = doc(firebaseDB, "estudiantes", studentToDelete.id);
      const userRef = doc(firebaseDB, "usuarios", studentToDelete.id);

      const [studentSnap, userSnap] = await Promise.all([
        getDoc(studentRef),
        getDoc(userRef),
      ]);

      const deleteOps: Promise<void>[] = [];
      if (studentSnap.exists()) deleteOps.push(deleteDoc(studentRef));
      if (userSnap.exists()) deleteOps.push(deleteDoc(userRef));

      if (deleteOps.length === 0) {
        toast.error("User record not found");
        return;
      }

      await Promise.all(deleteOps);
      setStudents((prev) =>
        prev.filter((student) => student.id !== studentToDelete.id),
      );
      toast.success("User deleted successfully");
      setStudentToDelete(null);
    } catch {
      setError("Error deleting student");
      toast.error("Error deleting student");
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
    estudiante: filteredStudents.filter((s) => s.role === "estudiante").length,
    docente: filteredStudents.filter((s) => s.role === "docente").length,
  };
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
      <DashboardLayout
        title="Students Management"
        subtitle="Manage students and teachers in the system"
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-2">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
            <div className="space-y-2">
              <p className="text-lg font-semibold text-gray-900">
                Loading students
              </p>
              <p className="text-sm text-gray-600">
                Please wait while we load the student data
              </p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Students Management"
      subtitle="Manage students and teachers in the system"
    >
      <div className="space-y-2">
        {/* Stats Header */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-blue-500" />
                  <p className="text-xs font-semibold text-blue-600  tracking-wide">
                    Total Registered
                  </p>
                </div>
                <p className="text-xl font-bold text-gray-900">
                  {studentCount}
                </p>
            
              </div>
              <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                <Users className="h-4 w-4 text-blue-500" />
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <GraduationCap className="h-4 w-4 text-blue-500" />
                  <p className="text-xs font-semibold text-blue-600 tracking-wide">
                    Students
                  </p>
                </div>
                <p className="text-xl font-bold text-gray-900">
                  {studentCountByRole.estudiante}
                </p>
              </div>
              <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                <GraduationCap className="h-4 w-4 text-blue-500" />
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-blue-500" />
                  <p className="text-xs font-semibold text-blue-600  tracking-wide">
                    Teachers
                  </p>
                </div>
                <p className="text-xl font-bold text-gray-900">
                  {studentCountByRole.docente}
                </p>
              </div>
              <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                <Shield className="h-4 w-4 text-blue-500" />
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="h-4 w-4 text-blue-500" />
                  <p className="text-xs font-semibold text-blue-600 tracking-wide">
                    Without Courses
                  </p>
                </div>
                <p className="text-xl font-bold text-gray-900">
                  {studentsWithoutCourses.length}
                </p>
              </div>
              <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                <BookOpen className="h-4 w-4 text-blue-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="bg-white border border-gray-200 rounded-2xl p-3 shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by ID, name, email or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <select
                  value={roleFilter}
                  onChange={(e) =>
                    setRoleFilter(
                      e.target.value as "all" | "estudiante" | "docente",
                    )
                  }
                  className="pl-10 pr-4 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none text-sm font-medium"
                >
                  <option value="all">All Roles</option>
                  <option value="estudiante">Students</option>
                  <option value="docente">Teachers</option>
                </select>
              </div>

              {isTeacher && (
                <button
                  onClick={() => setShowOnlyMyStudents((prev) => !prev)}
                  className={cn(
                    "px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all duration-300",
                    showOnlyMyStudents
                      ? "border-blue-500 text-blue-700 bg-blue-50"
                      : "border-gray-300 text-gray-700 hover:bg-gray-50",
                  )}
                >
                  {showOnlyMyStudents ? "Only My Students" : "All Students"}
                </button>
              )}

              <button
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
              >
                <UserPlus className="h-4 w-4" />
                Add User
              </button>
            </div>
          </div>
        </div>

        {/* Students List - Only students WITH courses */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-200 bg-white">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                    <UserCheck className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">
                      {isTeacher && showOnlyMyStudents
                        ? "My Students"
                        : "Registered Users"}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {filteredStudents.length} users with courses
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600">
                  Sorted by: <span className="font-medium">{sortLabel}</span> (
                  {sortOrder})
                </span>
                <button
                  onClick={() => handleSortClick("createdAt")}
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
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
                    className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
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
              <div className="h-20 w-20 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center">
                <Users className="h-10 w-10 text-gray-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {searchTerm || roleFilter !== "all"
                  ? "No results found"
                  : "No students with courses"}
              </h3>
              <p className="text-gray-600 max-w-md mx-auto mb-6">
                {searchTerm || roleFilter !== "all"
                  ? "Try different search terms"
                  : "All students are currently without course assignments"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-blue-50/50 border-b border-gray-200">
                    <th className="text-left px-6 py-4 font-bold text-gray-900 min-w-[180px]">
                      <button
                        onClick={() => handleSortClick("idNumber")}
                        className="flex items-center gap-2 hover:text-blue-600 transition-colors"
                      >
                        <Hash className="h-4 w-4 text-gray-500" />
                        ID Number
                        {sortBy === "idNumber" &&
                          (sortOrder === "asc" ? (
                            <SortAsc className="h-4 w-4" />
                          ) : (
                            <SortDesc className="h-4 w-4" />
                          ))}
                      </button>
                    </th>
                    <th className="text-left px-4 py-4 font-bold text-gray-900 min-w-[220px]">
                      <button
                        onClick={() => handleSortClick("name")}
                        className="flex items-center gap-2 hover:text-blue-600 transition-colors"
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
                    <th className="text-left px-4 py-4 font-bold text-gray-900 min-w-[200px]">
                      Contact Information
                    </th>
                    <th className="text-left px-4 py-4 font-bold text-gray-900 min-w-[120px]">
                      <button
                        onClick={() => handleSortClick("role")}
                        className="flex items-center gap-2 hover:text-blue-600 transition-colors"
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
                      <th className="text-left px-4 py-4 font-bold text-gray-900 min-w-[140px]">
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
                        "border-b border-gray-200 hover:bg-blue-50/30 transition-all duration-300",
                        index % 2 === 0 ? "bg-white" : "bg-gray-50/30",
                      )}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {renderStudentAvatar(student)}
                          <span className="font-mono text-sm font-semibold text-gray-900">
                            {student.idNumber}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <span className="font-semibold text-gray-900">
                            {student.name}
                          </span>
                          {student.courses && student.courses.length > 0 ? (
                            <div className="mt-2">
                              <span className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                                {student.courses.length} course
                                {student.courses.length !== 1 ? "s" : ""}
                              </span>
                              <div className="mt-1 text-xs text-gray-600 space-y-0.5">
                                {student.courses.slice(0, 2).map((courseId) => (
                                  <div key={courseId} className="leading-tight">
                                    {courseNames[courseId] || "Unknown Course"}
                                  </div>
                                ))}
                                {student.courses.length > 2 && (
                                  <div className="text-gray-500">
                                    +{student.courses.length - 2} more
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 text-xs text-gray-400">
                              No courses assigned
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center">
                              <Mail className="h-4 w-4 text-blue-500" />
                            </div>
                            <span className="text-sm text-gray-700 break-all">
                              {student.email}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center">
                              <Phone className="h-4 w-4 text-blue-500" />
                            </div>
                            <span className="text-sm text-gray-700">
                              {student.whatsApp}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={cn(
                            "inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold",
                            student.role === "docente"
                              ? "bg-blue-100 text-blue-700 border border-blue-200"
                              : "bg-blue-100 text-blue-700 border border-blue-200",
                          )}
                        >
                          {student.role === "docente" ? (
                            <>
                              <Shield className="h-3 w-3" />
                              Teacher
                            </>
                          ) : (
                            <>
                              <GraduationCap className="h-3 w-3" />
                              Student
                            </>
                          )}
                        </span>
                      </td>
                      {isTeacher && (
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/students/${student.id}/enroll`}
                              className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-all duration-300"
                              title="Enroll in courses"
                            >
                              <LinkIcon className="h-4 w-4" />
                            </Link>
                            <Link
                              to={`/students/${student.id}`}
                              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-all duration-300"
                              title="View details"
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                            <button
                              onClick={() => setStudentToDelete(student)}
                              disabled={!student.canDelete}
                              className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
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
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <p className="text-sm text-gray-600">
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
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
                >
                  Prev
                </button>
                <span className="text-sm text-gray-700">
                  Page {currentPage} / {totalPages}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                  }
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Students Without Courses Section - Only students WITHOUT courses */}
        {isTeacher && studentsWithoutCourses.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                <BookOpen className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900">
                  Students Without Courses ({studentsWithoutCourses.length})
                </h3>
                <p className="text-sm text-gray-600">
                  These students are not enrolled in any course
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-200">
                    <th className="text-left px-6 py-4 font-bold text-gray-900 min-w-[180px]">
                      <div className="flex items-center gap-2">
                        <Hash className="h-4 w-4 text-gray-500" />
                        ID Number
                      </div>
                    </th>
                    <th className="text-left px-4 py-4 font-bold text-gray-900 min-w-[220px]">
                      Name & Details
                    </th>
                    <th className="text-left px-4 py-4 font-bold text-gray-900 min-w-[200px]">
                      Contact Information
                    </th>
                    <th className="text-left px-4 py-4 font-bold text-gray-900 min-w-[120px]">
                      Role
                    </th>
                    <th className="text-left px-4 py-4 font-bold text-gray-900 min-w-[200px]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {studentsWithoutCourses.map((student, index) => (
                    <tr
                      key={student.id}
                      className={cn(
                        "border-b border-gray-200 hover:bg-gray-50/50 transition-all duration-300",
                        index % 2 === 0 ? "bg-white" : "bg-gray-50/30",
                      )}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {renderStudentAvatar(student)}
                          <span className="font-mono text-sm font-semibold text-gray-900">
                            {student.idNumber}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <span className="font-semibold text-gray-900">
                            {student.name}
                          </span>
                          <div className="mt-2">
                            <span className="text-xs font-medium px-2 py-1 bg-gray-100 text-gray-700 rounded-full">
                              No courses
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center">
                              <Mail className="h-4 w-4 text-blue-500" />
                            </div>
                            <span className="text-sm text-gray-700 break-all">
                              {student.email}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center">
                              <Phone className="h-4 w-4 text-blue-500" />
                            </div>
                            <span className="text-sm text-gray-700">
                              {student.whatsApp}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={cn(
                            "inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold",
                            student.role === "docente"
                              ? "bg-blue-100 text-blue-700 border border-blue-200"
                              : "bg-blue-100 text-blue-700 border border-blue-200",
                          )}
                        >
                          {student.role === "docente" ? (
                            <>
                              <Shield className="h-3 w-3" />
                              Teacher
                            </>
                          ) : (
                            <>
                              <GraduationCap className="h-3 w-3" />
                              Student
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/students/${student.id}/enroll`}
                            className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-all duration-300"
                            title="Enroll in courses"
                          >
                            <LinkIcon className="h-4 w-4" />
                          </Link>
                          <Link
                            to={`/students/${student.id}`}
                            className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-all duration-300"
                            title="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          <button
                            onClick={() => setStudentToDelete(student)}
                            disabled={!student.canDelete}
                            className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
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
                <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                  View all {studentsWithoutCourses.length} students...
                </button>
              </div>
            )}
          </div>
        )}
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                    <UserPlus className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">
                      Add New User
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Register a student or teacher
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setError("");
                  }}
                  className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {error && (
              <div className="mx-6 mt-6 p-4 rounded-xl bg-gray-100 border border-gray-200 text-gray-700">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <p className="font-medium">{error}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleAddStudent} className="p-6">
              <div className="space-y-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ID Number *
                  </label>
                  <input
                    type="text"
                    value={newStudent.idNumber}
                    onChange={(e) =>
                      setNewStudent({ ...newStudent, idNumber: e.target.value })
                    }
                    placeholder="Student or teacher ID"
                    className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Unique identification number
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={newStudent.name}
                    onChange={(e) =>
                      setNewStudent({ ...newStudent, name: e.target.value })
                    }
                    placeholder="Full name"
                    className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={newStudent.email}
                    onChange={(e) =>
                      setNewStudent({ ...newStudent, email: e.target.value })
                    }
                    placeholder="Email address"
                    className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    value={newStudent.whatsApp}
                    onChange={(e) =>
                      setNewStudent({ ...newStudent, whatsApp: e.target.value })
                    }
                    placeholder="Phone number"
                    className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
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
                      className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium appearance-none"
                      required
                    >
                      <option value="estudiante">Student</option>
                      <option value="docente">Teacher</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                <div className="flex gap-3 pt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setError("");
                    }}
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-all duration-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-3 rounded-xl bg-blue-600 text-white hover:shadow-lg font-medium transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Save className="h-5 w-5" />
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
