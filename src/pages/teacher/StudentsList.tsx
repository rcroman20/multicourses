import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/contexts/NotificationContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { firebaseDB } from "@/lib/firebase";
import { getCourseEnrollmentIds } from "@/lib/courseAccess";
import {
  collection,
  getDocs,
  getDoc,
  doc,
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
  School,
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
import { purgeUserDataInSparkMode } from "@/lib/services/accountDeletionService";
import {
  getUserStoredInstitution,
  isInstitutionMissing,
} from "@/lib/services/institutionProfileService";
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
});

type UserRole = "estudiante" | "docente" | "admin" | "institucion";
type RequestedRole = "estudiante" | "docente";
type TeacherApprovalStatus = "pending" | "approved" | "rejected";
type StudentRoleDisplay =
  | "student"
  | "teacher"
  | "teacher_pending"
  | "teacher_rejected"
  | "admin"
  | "institution";
type RoleFilter = "all" | "estudiante" | "docente" | "admin" | "institucion";

const INSTITUTION_FILTER_FIELDS = [
  "teacherInstitutionName",
  "institutionName",
  "institution",
  "schoolName",
  "organizationName",
  "organization",
  "companyName",
  "cohortInstitutionName",
  "cohortInstitution",
] as const;

const normalizeInstitutionValue = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
};

const isTeacherRecord = (data: Record<string, unknown>): boolean => {
  const role = normalizeUserRole(data.role);
  const requestedRole = normalizeRequestedRole(data.requestedRole);
  const approval = normalizeTeacherApprovalStatus(data.teacherApprovalStatus);
  return role === "docente" || (requestedRole === "docente" && approval === "approved");
};

const recordMatchesInstitution = (
  data: Record<string, unknown>,
  institutionKey: string,
): boolean =>
  INSTITUTION_FILTER_FIELDS.some(
    (field) => normalizeInstitutionValue(data[field]) === institutionKey,
  );

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

  if (
    normalized === "admin" ||
    normalized === "administrator" ||
    normalized === "administrador"
  ) {
    return "admin";
  }

  if (
    normalized === "institucion" ||
    normalized === "institución" ||
    normalized === "institution"
  ) {
    return "institucion";
  }

  return null;
};

const normalizeRequestedRole = (value: unknown): RequestedRole | null => {
  const normalized = normalizeUserRole(value);
  if (normalized === "docente" || normalized === "estudiante") return normalized;
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
  role: UserRole;
  requestedRole?: RequestedRole;
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
  if (student.role === "admin") return "admin";
  if (student.role === "institucion") return "institution";
  if (student.role === "docente") return "teacher";
  if (student.requestedRole !== "docente") return "student";
  if (student.teacherApprovalStatus === "pending") return "teacher_pending";
  if (student.teacherApprovalStatus === "rejected") return "teacher_rejected";
  if (student.teacherApprovalStatus === "approved") return "teacher";
  return "student";
};

const isTeacherDisplay = (
  student: Pick<Student, "role" | "requestedRole" | "teacherApprovalStatus">,
): boolean => {
  const roleDisplay = getStudentRoleDisplay(student);
  return (
    roleDisplay === "teacher" ||
    roleDisplay === "teacher_pending" ||
    roleDisplay === "teacher_rejected"
  );
};

const matchesRoleFilter = (
  student: Pick<Student, "role" | "requestedRole" | "teacherApprovalStatus">,
  roleFilter: RoleFilter,
): boolean => {
  const roleDisplay = getStudentRoleDisplay(student);

  if (roleFilter === "all") return true;
  if (roleFilter === "docente") return isTeacherDisplay(student);
  if (roleFilter === "admin") return roleDisplay === "admin";
  if (roleFilter === "institucion") return roleDisplay === "institution";
  return roleDisplay === "student";
};

const getErrorCode = (error: unknown): string => {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return String((error as { code: string }).code).toLowerCase();
  }
  return "";
};

const getErrorMessage = (error: unknown): string => {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return String((error as { message: string }).message).toLowerCase();
  }
  return "";
};

const isFunctionsFallbackError = (error: unknown): boolean => {
  const code = getErrorCode(error);
  if (
    code.includes("functions/unavailable") ||
    code.includes("functions/not-found") ||
    code.includes("functions/unimplemented") ||
    code.includes("functions/internal") ||
    code.includes("functions/deadline-exceeded")
  ) {
    return true;
  }

  const message = getErrorMessage(error);
  return (
    message.includes("failed to fetch") ||
    message.includes("preflight") ||
    message.includes("cors") ||
    message.includes("access control checks") ||
    message.includes("network request failed")
  );
};

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
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingStudent, setIsDeletingStudent] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [courseNames, setCourseNames] = useState<Record<string, string>>({});

  const isTeacher = user?.role === "docente";
  const isInstitution = user?.role === "institucion";
  const isAdmin = isAdminEmail(user?.email);
  const canManageUsers = isTeacher || isInstitution;
  const [myCourseStudentIds, setMyCourseStudentIds] = useState<Set<string>>(
    new Set(),
  );
  const [myTeacherCourseIds, setMyTeacherCourseIds] = useState<Set<string>>(
    new Set(),
  );
  const [sameInstitutionTeacherIds, setSameInstitutionTeacherIds] = useState<Set<string>>(
    new Set(),
  );
  const [teacherCourseCount, setTeacherCourseCount] = useState(0);
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
        getCourseEnrollmentIds({
          id: doc.id,
          enrolledStudents: Array.isArray(data.enrolledStudents) ? data.enrolledStudents : [],
        }).forEach((studentId) => {
          allStudentIds.add(studentId);
        });
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
      const usersById = new Map<string, Record<string, any>>();
      const studentsById = new Map<string, Record<string, any>>();
      const validCourseIds = new Set<string>();
      const coursesByUserId = new Map<string, Set<string>>();
      const teacherIds = new Set<string>();
      const userIds = new Set<string>();
      const matchedInstitutionTeacherIds = new Set<string>();
      const usersWithAnyCourse = new Set<string>();

      if (isInstitution && user?.id && !isAdmin) {
        const institutionId =
          (typeof user.institutionId === "string" && user.institutionId.trim()) || user.id;
        const storedInstitutionName = await getUserStoredInstitution(user.id, "institucion");
        const institutionKey = normalizeInstitutionValue(storedInstitutionName);

        const [usersSnapshot, studentsSnapshot, coursesSnapshot, currentUserDoc, currentStudentDoc] =
          await Promise.all([
            getDocs(query(collection(firebaseDB, "usuarios"), where("institutionId", "==", institutionId))),
            getDocs(query(collection(firebaseDB, "estudiantes"), where("institutionId", "==", institutionId))),
            getDocs(query(collection(firebaseDB, "cursos"), where("institutionId", "==", institutionId))),
            getDoc(doc(firebaseDB, "usuarios", user.id)),
            getDoc(doc(firebaseDB, "estudiantes", user.id)),
          ]);

        usersSnapshot.forEach((userDoc) => {
          usersById.set(userDoc.id, userDoc.data() as Record<string, any>);
          userIds.add(userDoc.id);
        });

        studentsSnapshot.forEach((studentDoc) => {
          studentsById.set(studentDoc.id, studentDoc.data() as Record<string, any>);
          userIds.add(studentDoc.id);
        });

        if (currentUserDoc.exists()) {
          usersById.set(user.id, currentUserDoc.data() as Record<string, any>);
          userIds.add(user.id);
        }
        if (currentStudentDoc.exists()) {
          studentsById.set(user.id, currentStudentDoc.data() as Record<string, any>);
          userIds.add(user.id);
        }

        coursesSnapshot.forEach((courseDoc) => {
          const courseData = courseDoc.data() as Record<string, any>;
          const courseId = courseDoc.id;
          validCourseIds.add(courseId);

          const teacherId = typeof courseData.teacherId === "string" ? courseData.teacherId : "";
          if (teacherId) {
            teacherIds.add(teacherId);
            if (!coursesByUserId.has(teacherId)) coursesByUserId.set(teacherId, new Set());
            coursesByUserId.get(teacherId)?.add(courseId);
            userIds.add(teacherId);
          }

          const enrolled = Array.isArray(courseData.enrolledStudents)
            ? courseData.enrolledStudents
            : [];
          enrolled.forEach((entry) => {
            const enrolledId = typeof entry === "string" ? entry : entry?.id;
            if (!enrolledId || typeof enrolledId !== "string") return;
            if (!coursesByUserId.has(enrolledId)) coursesByUserId.set(enrolledId, new Set());
            coursesByUserId.get(enrolledId)?.add(courseId);
            userIds.add(enrolledId);
          });
        });

        if (institutionKey) {
          const [allUsersSnapshot, allStudentsSnapshot] = await Promise.all([
            getDocs(collection(firebaseDB, "usuarios")),
            getDocs(collection(firebaseDB, "estudiantes")),
          ]);

          allUsersSnapshot.forEach((matchedDoc) => {
            if (usersById.has(matchedDoc.id)) return;
            const data = matchedDoc.data() as Record<string, unknown>;
            if (!recordMatchesInstitution(data, institutionKey)) return;

            usersById.set(matchedDoc.id, data as Record<string, any>);
            userIds.add(matchedDoc.id);
          });

          allStudentsSnapshot.forEach((matchedDoc) => {
            if (studentsById.has(matchedDoc.id)) return;
            const data = matchedDoc.data() as Record<string, unknown>;
            if (!recordMatchesInstitution(data, institutionKey)) return;

            studentsById.set(matchedDoc.id, data as Record<string, any>);
            userIds.add(matchedDoc.id);
          });
        }
      } else if (isTeacher && user?.id && !isAdmin) {
        const [ownedCoursesSnapshot, allCoursesSnapshot] = await Promise.all([
          getDocs(
            query(collection(firebaseDB, "cursos"), where("teacherId", "==", user.id)),
          ),
          getDocs(collection(firebaseDB, "cursos")),
        ]);

        allCoursesSnapshot.forEach((courseDoc) => {
          const courseData = courseDoc.data() as Record<string, any>;
          const teacherId = typeof courseData.teacherId === "string" ? courseData.teacherId : "";
          if (teacherId) {
            usersWithAnyCourse.add(teacherId);
          }
          const enrolled = Array.isArray(courseData.enrolledStudents)
            ? courseData.enrolledStudents
            : [];
          enrolled.forEach((entry) => {
            const enrolledId = typeof entry === "string" ? entry : entry?.id;
            if (!enrolledId || typeof enrolledId !== "string") return;
            usersWithAnyCourse.add(enrolledId);
          });
        });

        const targetStudentIds = new Set<string>();
        ownedCoursesSnapshot.forEach((courseDoc) => {
          const courseData = courseDoc.data() as Record<string, any>;
          const courseId = courseDoc.id;
          validCourseIds.add(courseId);

          const teacherId = typeof courseData.teacherId === "string" ? courseData.teacherId : "";
          if (teacherId) {
            teacherIds.add(teacherId);
            if (!coursesByUserId.has(teacherId)) coursesByUserId.set(teacherId, new Set());
            coursesByUserId.get(teacherId)?.add(courseId);
          }

          const enrolled = Array.isArray(courseData.enrolledStudents)
            ? courseData.enrolledStudents
            : [];
          enrolled.forEach((entry) => {
            const enrolledId = typeof entry === "string" ? entry : entry?.id;
            if (!enrolledId || typeof enrolledId !== "string") return;
            targetStudentIds.add(enrolledId);
            if (!coursesByUserId.has(enrolledId)) coursesByUserId.set(enrolledId, new Set());
            coursesByUserId.get(enrolledId)?.add(courseId);
          });
        });

        const studentEntries = await Promise.all(
          Array.from(targetStudentIds).map(async (studentId) => {
            const [userDoc, studentDoc] = await Promise.all([
              getDoc(doc(firebaseDB, "usuarios", studentId)),
              getDoc(doc(firebaseDB, "estudiantes", studentId)),
            ]);
            return { studentId, userDoc, studentDoc };
          }),
        );

        studentEntries.forEach(({ studentId, userDoc, studentDoc }) => {
          userIds.add(studentId);
          if (userDoc.exists()) {
            usersById.set(studentId, userDoc.data() as Record<string, any>);
          }
          if (studentDoc.exists()) {
            studentsById.set(studentId, studentDoc.data() as Record<string, any>);
          }
        });

        const studentsSnapshot = await getDocs(collection(firebaseDB, "estudiantes"));
        studentsSnapshot.forEach((studentDoc) => {
          const studentId = studentDoc.id;
          if (userIds.has(studentId)) return;
          if (usersWithAnyCourse.has(studentId)) return;

          const data = studentDoc.data() as Record<string, unknown>;
          if (isTeacherRecord(data)) return;

          userIds.add(studentId);
          studentsById.set(studentId, data as Record<string, any>);
        });

        const teacherInstitution = await getUserStoredInstitution(user.id, "docente");
        const teacherInstitutionKey = normalizeInstitutionValue(teacherInstitution);
        if (teacherInstitutionKey && !isInstitutionMissing(teacherInstitution)) {
          const [allUsersSnapshot, allStudentsSnapshot] = await Promise.all([
            getDocs(collection(firebaseDB, "usuarios")),
            getDocs(collection(firebaseDB, "estudiantes")),
          ]);

          allUsersSnapshot.forEach((matchedDoc) => {
            const matchedId = matchedDoc.id;
            const data = matchedDoc.data() as Record<string, unknown>;
            if (!isTeacherRecord(data)) return;
            if (!recordMatchesInstitution(data, teacherInstitutionKey)) return;

            userIds.add(matchedId);
            usersById.set(matchedId, data as Record<string, any>);
            if (matchedId !== user.id) {
              matchedInstitutionTeacherIds.add(matchedId);
            }
          });

          allStudentsSnapshot.forEach((matchedDoc) => {
            const matchedId = matchedDoc.id;
            const data = matchedDoc.data() as Record<string, unknown>;
            if (!isTeacherRecord(data)) return;
            if (!recordMatchesInstitution(data, teacherInstitutionKey)) return;

            userIds.add(matchedId);
            if (!studentsById.has(matchedId)) {
              studentsById.set(matchedId, data as Record<string, any>);
            }
            if (matchedId !== user.id) {
              matchedInstitutionTeacherIds.add(matchedId);
            }
          });
        }
      } else {
        const [studentsSnapshot, usersSnapshot, coursesSnapshot] = await Promise.all([
          getDocs(collection(firebaseDB, "estudiantes")),
          getDocs(collection(firebaseDB, "usuarios")),
          getDocs(collection(firebaseDB, "cursos")),
        ]);

        usersSnapshot.forEach((userDoc) => {
          usersById.set(userDoc.id, userDoc.data() as Record<string, any>);
        });
        studentsSnapshot.forEach((studentDoc) => {
          studentsById.set(studentDoc.id, studentDoc.data() as Record<string, any>);
        });
        coursesSnapshot.forEach((courseDoc) => {
          const courseData = courseDoc.data() as Record<string, any>;
          const courseId = courseDoc.id;
          validCourseIds.add(courseId);

          const teacherId = typeof courseData.teacherId === "string" ? courseData.teacherId : "";
          if (teacherId) {
            teacherIds.add(teacherId);
            if (!coursesByUserId.has(teacherId)) coursesByUserId.set(teacherId, new Set());
            coursesByUserId.get(teacherId)?.add(courseId);
          }

          const enrolled = Array.isArray(courseData.enrolledStudents)
            ? courseData.enrolledStudents
            : [];
          enrolled.forEach((entry) => {
            const enrolledId = typeof entry === "string" ? entry : entry?.id;
            if (!enrolledId || typeof enrolledId !== "string") return;
            if (!coursesByUserId.has(enrolledId)) coursesByUserId.set(enrolledId, new Set());
            coursesByUserId.get(enrolledId)?.add(courseId);
          });
        });

        usersById.forEach((_, id) => userIds.add(id));
        studentsById.forEach((_, id) => userIds.add(id));
        coursesByUserId.forEach((_, id) => userIds.add(id));
      }

      const studentList: Student[] = Array.from(userIds).map((id) => {
        const userData = usersById.get(id) || {};
        const studentData = studentsById.get(id) || {};
        const roleFromData =
          normalizeUserRole(userData.role) ||
          normalizeUserRole(studentData.role);
        const requestedRole =
          normalizeRequestedRole(userData.requestedRole) ||
          normalizeRequestedRole(studentData.requestedRole) ||
          undefined;
        const teacherApprovalStatus =
          normalizeTeacherApprovalStatus(userData.teacherApprovalStatus) ||
          normalizeTeacherApprovalStatus(studentData.teacherApprovalStatus) ||
          undefined;
        const isKnownAdmin =
          roleFromData === "admin" ||
          isAdminEmail(userData.email || studentData.email);
        const inferredRole =
          isKnownAdmin
            ? "admin"
            : roleFromData
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

        const roleDisplay = getStudentRoleDisplay({
          role: inferredRole as UserRole,
          requestedRole,
          teacherApprovalStatus,
        });

        return {
          id,
          idNumber:
            studentData.idNumber ||
            userData.idNumber ||
            userData.identification ||
            "",
          email: studentData.email || userData.email || "",
          name: studentData.name || userData.name || "Unknown user",
          role: inferredRole as UserRole,
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
          canDelete: roleDisplay === "student",
        };
      });

      studentList.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
      setStudents(studentList);
      setSameInstitutionTeacherIds(matchedInstitutionTeacherIds);
      setError("");
    } catch {
      setError("Error loading students");
      toast.error("Error loading students");
      setSameInstitutionTeacherIds(new Set());
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin, isInstitution, isTeacher, user?.id, user?.institutionId]);

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

  useEffect(() => {
    if (isTeacher && roleFilter === "admin") {
      setRoleFilter("docente");
    }
  }, [isTeacher, roleFilter]);

  const studentsWithCourses = useMemo(
    () =>
      students.filter((student) => {
        if (getStudentRoleDisplay(student) === "institution") return false;
        return isTeacherDisplay(student) || student.courses.length > 0;
      }),
    [students],
  );

  const studentsWithoutCourses = useMemo(() => {
    const withoutCourses = students.filter((student) => !student.courses || student.courses.length === 0);

    if (isTeacher) return withoutCourses;

    if (isInstitution) return withoutCourses;

    if (isAdmin) return withoutCourses;
    return [];
  }, [students, isAdmin, isInstitution, isTeacher]);

  const baseStudents = useMemo(() => {
    if (isTeacher) {
      return students.filter((student) => {
        if (getStudentRoleDisplay(student) === "institution") return false;
        if (isTeacherDisplay(student)) {
          return sameInstitutionTeacherIds.has(student.id);
        }
        if (!myCourseStudentIds.has(student.id)) return false;

        const courseIds = Array.isArray(student.courses) ? student.courses : [];
        if (courseIds.length === 0) return true;
        return courseIds.some((courseId) => myTeacherCourseIds.has(courseId));
      });
    }
    if (isInstitution) return studentsWithCourses;
    if (isAdmin) return studentsWithCourses;
    return studentsWithCourses.filter((student) => student.id === user?.id);
  }, [
    students,
    studentsWithCourses,
    isAdmin,
    isInstitution,
    isTeacher,
    myCourseStudentIds,
    myTeacherCourseIds,
    sameInstitutionTeacherIds,
    user?.id,
  ]);

  const filteredStudents = useMemo(() => {
    let list = [...baseStudents];

    list = list.filter((student) => matchesRoleFilter(student, roleFilter));

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

  const filteredStudentsWithoutCourses = useMemo(() => {
    let list = [...studentsWithoutCourses];

    list = list.filter((student) => matchesRoleFilter(student, roleFilter));

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

    return list;
  }, [studentsWithoutCourses, roleFilter, debouncedSearchTerm]);

  const withoutCoursesContainsInstitution = useMemo(
    () =>
      filteredStudentsWithoutCourses.some(
        (student) => getStudentRoleDisplay(student) === "institution",
      ),
    [filteredStudentsWithoutCourses],
  );
  const showWithoutCoursesSection =
    ((isTeacher &&
      (roleFilter === "all" || roleFilter === "institucion")) ||
      isInstitution) &&
    filteredStudentsWithoutCourses.length > 0;

  const withoutCoursesSectionTitle = (() => {
    if (roleFilter === "docente") {
      return `Teachers Without Courses (${filteredStudentsWithoutCourses.length})`;
    }
    if (roleFilter === "admin") {
      return `Admins Without Courses (${filteredStudentsWithoutCourses.length})`;
    }
    if (roleFilter === "institucion") {
      return `Institutions Without Courses (${filteredStudentsWithoutCourses.length})`;
    }
    if (withoutCoursesContainsInstitution) {
      return `Users Without Courses (${filteredStudentsWithoutCourses.length})`;
    }
    return `Students Without Courses (${filteredStudentsWithoutCourses.length})`;
  })();

  const withoutCoursesSectionSubtitle = (() => {
    if (roleFilter === "docente") {
      return "These teachers are not currently assigned to any course";
    }
    if (roleFilter === "admin") {
      return "These admins are related to the institution but not linked to courses";
    }
    if (roleFilter === "institucion") {
      return "These institutions are not linked to any course";
    }
    if (withoutCoursesContainsInstitution) {
      return "These users are not enrolled in or linked to any course";
    }
    return "These students are not enrolled in any course";
  })();
  const primarySectionTitle = (() => {
    if (isInstitution) {
      if (roleFilter === "institucion") return "Institution Accounts";
      if (roleFilter === "docente") return "Teachers";
      if (roleFilter === "admin") return "Admins";
      if (roleFilter === "estudiante") return "Students";
      return "Institution Users";
    }
    if (!isTeacher) return "Registered Users";
    if (roleFilter === "institucion") return "Institution Accounts";
    if (roleFilter === "docente") return "Teachers";
    if (roleFilter === "estudiante") return "Students";
    return "My Students";
  })();
  const primarySectionSubtitle = (() => {
    if (roleFilter === "institucion") {
      return `${filteredStudents.length} institution accounts with courses`;
    }
    if (roleFilter === "docente") {
      return `${filteredStudents.length} teachers with courses`;
    }
    if (roleFilter === "estudiante") {
      return `${filteredStudents.length} students with courses`;
    }
    return `${filteredStudents.length} users with courses`;
  })();
  const primaryEmptyTitle =
    searchTerm || roleFilter !== "all"
      ? "No results found"
      : roleFilter === "institucion"
        ? "No institutions with courses"
        : roleFilter === "admin"
          ? "No admins with course links"
        : roleFilter === "docente"
          ? "No teachers with courses"
          : "No students with courses";
  const primaryEmptySubtitle =
    searchTerm || roleFilter !== "all"
      ? "Try different search terms"
      : roleFilter === "institucion"
        ? "No institution accounts are currently linked to courses"
        : roleFilter === "admin"
          ? "No institution admins are currently linked to course activity"
        : roleFilter === "docente"
          ? "No teachers are currently linked to courses"
          : "All students are currently without course assignments";

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, roleFilter, sortBy, sortOrder]);

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
          className="h-10 w-10 rounded-full object-cover border border-gray-200/60"
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

    if (roleDisplay === "admin") {
      return (
        <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-bold text-violet-700">
          <Shield className="h-3 w-3" />
          Admin
        </span>
      );
    }

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

    if (roleDisplay === "institution") {
      return (
        <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-bold text-cyan-700">
          <School className="h-3 w-3" />
          Institution
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
        role: "estudiante",
        courses: [],
        createdAt: new Date(),
      });

      // Update local state
      const addedStudent: Student = {
        id: docRef.id,
        ...newStudent,
        role: "estudiante",
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
      const code = getErrorCode(error);

      if (isFunctionsFallbackError(error)) {
        try {
          await purgeUserDataInSparkMode(
            studentToDelete.id,
            studentToDelete.email,
          );
          setStudents((prev) =>
            prev.filter((student) => student.id !== studentToDelete.id),
          );
          toast.success(
            "Student removed successfully.",
          );
          setStudentToDelete(null);
          return;
        } catch {
          setError("Error deleting student");
          toast.error("Could not remove the student from Firestore.");
          return;
        }
      }

      if (code.includes("functions/permission-denied")) {
        toast.error(
          isTeacher
            ? "You can only delete students assigned exclusively to your courses."
            : "You do not have permission to delete this account.",
        );
      } else if (code.includes("functions/unavailable")) {
        toast.error("Delete service unavailable. Deploy Cloud Functions and retry.");
      } else if (code.includes("functions/failed-precondition")) {
        toast.error(
          isTeacher
            ? "Only student accounts from your course roster can be deleted here."
            : "This account cannot be deleted from this panel.",
        );
      } else {
        setError("Error deleting student");
        toast.error("Error deleting student");
      }
    } finally {
      setIsDeletingStudent(false);
    }
  };

  // Statistics
  const statsSource = isInstitution ? students : filteredStudents;
  const studentCount = isAdmin || isInstitution
    ? students.length
    : isTeacher
      ? filteredStudents.length
      : students.filter((s) => s.id === user?.id).length;

  const studentCountByRole = {
    estudiante: statsSource.filter(
      (s) => getStudentRoleDisplay(s) === "student",
    ).length,
    docente: statsSource.filter((s) => isTeacherDisplay(s)).length,
    admin: statsSource.filter((s) => getStudentRoleDisplay(s) === "admin").length,
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

          <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
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

        <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <div className="flex flex-col gap-3">
        <section className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
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
            isTeacher
              ? teacherPlanCourseLimit || teacherPlanStudentLimit
                ? "lg:grid-cols-5"
                : "lg:grid-cols-4"
              : "lg:grid-cols-5"
          }`}
        >
          <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 shadow-sm">
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
              <div className="rounded-full border border-slate-200/60 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
                All
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 shadow-sm">
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

          <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 shadow-sm">
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
                {isTeacher ? "Institution" : "Staff"}
              </div>
            </div>
          </div>

          {!isTeacher && (
            <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                      <Shield className="h-4 w-4" />
                    </div>
                    <p className="text-lg font-extrabold leading-5 text-slate-900">{studentCountByRole.admin}</p>
                  </div>
                  <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Admins</p>
                </div>
                <div className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700">
                  Platform
                </div>
              </div>
            </div>
          )}

          <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 shadow-sm">
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

        <div className="rounded-2xl border border-slate-200/60 bg-white p-3 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by ID, name, email or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl border border-slate-300/60 bg-slate-50 py-2.5 pl-10 pr-3 text-sm font-medium text-slate-700 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select
                  value={roleFilter}
                  onChange={(e) =>
                    setRoleFilter(e.target.value as RoleFilter)
                  }
                  className="h-10 appearance-none rounded-xl border border-slate-300/60 bg-slate-50 pl-10 pr-8 text-sm font-medium text-slate-700 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="all">All Roles</option>
                  <option value="estudiante">Students</option>
                  <option value="docente">
                    {isTeacher ? "Teachers (same institution)" : "Teachers"}
                  </option>
                  <option value="institucion">Institutions</option>
                  {!isTeacher && <option value="admin">Admins</option>}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>

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

        <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
          <div className="border-b border-slate-200/60 bg-slate-50/60 px-4 py-4 sm:px-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                    <UserCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      {primarySectionTitle}
                    </h3>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {primarySectionSubtitle}
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
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200/60 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
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
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200/60 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
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
                {primaryEmptyTitle}
              </h3>
              <p className="mx-auto mb-6 max-w-md text-slate-600">
                {primaryEmptySubtitle}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar]:h-2">
              <table className="w-full table-modern [&_td]:align-top [&_th]:align-top">
                <thead>
                  <tr className="border-b border-slate-200/60 bg-slate-50">
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
                    {canManageUsers && (
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
                        "border-b border-slate-200/60 transition-all duration-300 hover:bg-sky-50/30",
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
                      {canManageUsers && (
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            {(() => {
                              const roleDisplay = getStudentRoleDisplay(student);
                              const isInstitutionRecord = roleDisplay === "institution";
                              const isAdminRecord = roleDisplay === "admin";
                              const canOpenEnrollPage =
                                !isInstitutionRecord &&
                                !isAdminRecord &&
                                (!isTeacher ||
                                  (!isTeacherPlanBlocked &&
                                    (!isTeacherStudentQuotaReached || myCourseStudentIds.has(student.id))));
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
                                    isInstitutionRecord
                                      ? "Institution accounts cannot be enrolled in courses."
                                      : isAdminRecord
                                      ? "Admin accounts cannot be enrolled in courses."
                                      : isTeacher && isTeacherPlanBlocked
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
            <div className="flex items-center justify-between border-t border-slate-200/60 bg-slate-50 px-6 py-4">
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
                  className="rounded-lg border border-slate-300/60 bg-white px-3 py-1.5 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-50"
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
                  className="rounded-lg border border-slate-300/60 bg-white px-3 py-1.5 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Students Without Courses Section - Only students WITHOUT courses */}
        {showWithoutCoursesSection && (
          <div className="rounded-2xl border border-slate-200/60 bg-slate-50/60 p-4 shadow-sm sm:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100">
                <BookOpen className="h-4 w-4 text-amber-700" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {withoutCoursesSectionTitle}
                </h3>
                <p className="text-sm text-slate-600">
                  {withoutCoursesSectionSubtitle}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar]:h-2">
              <table className="w-full table-modern [&_td]:align-top [&_th]:align-top">
                <thead>
                  <tr className="border-b border-slate-200/60 bg-slate-100/70">
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
                  {filteredStudentsWithoutCourses.map((student, index) => (
                    <tr
                      key={student.id}
                      className={cn(
                        "border-b border-slate-200/60 transition-all duration-300 hover:bg-sky-50/30",
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
                            <span className="rounded-full border border-slate-300/60 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
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
                          {(() => {
                            const roleDisplay = getStudentRoleDisplay(student);
                            const isInstitutionRecord = roleDisplay === "institution";
                            const isAdminRecord = roleDisplay === "admin";
                            return isInstitutionRecord || isAdminRecord ? (
                            <button
                              type="button"
                              disabled
                              className="cursor-not-allowed rounded-xl p-2 text-slate-400"
                              title={
                                isInstitutionRecord
                                  ? "Institution accounts cannot be enrolled in courses."
                                  : "Admin accounts cannot be enrolled in courses."
                              }
                            >
                              <LinkIcon className="h-4 w-4" />
                            </button>
                          ) : (
                            <Link
                              to={`/students/${student.id}/enroll`}
                              className="rounded-xl p-2 text-sky-600 transition-all duration-300 hover:bg-sky-50 hover:text-sky-700"
                              title="Enroll in courses"
                            >
                              <LinkIcon className="h-4 w-4" />
                            </Link>
                          )})()}
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
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl border border-slate-200/60 bg-white shadow-[0_32px_72px_-40px_rgba(15,23,42,0.6)]">
            <div className="border-b border-slate-200/60 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100">
                    <UserPlus className="h-4 w-4 text-sky-700" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Add New Student
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Register a student
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setError("");
                  }}
                  className="rounded-lg border border-slate-200/60 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {error && (
              <div className="mx-4 mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <p className="text-sm font-medium">{error}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleAddStudent} className="p-4">
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
                    placeholder="Student ID"
                    className="h-10 w-full rounded-xl border border-slate-300/60 bg-slate-50 px-3 text-sm font-medium text-slate-700 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
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
                    className="h-10 w-full rounded-xl border border-slate-300/60 bg-slate-50 px-3 text-sm font-medium text-slate-700 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
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
                    className="h-10 w-full rounded-xl border border-slate-300/60 bg-slate-50 px-3 text-sm font-medium text-slate-700 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
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
                    className="h-10 w-full rounded-xl border border-slate-300/60 bg-slate-50 px-3 text-sm font-medium text-slate-700 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    required
                  />
                </div>

                <div className="mt-1 flex gap-2 border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setError("");
                    }}
                    className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-sky-300 bg-sky-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Add Student
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
