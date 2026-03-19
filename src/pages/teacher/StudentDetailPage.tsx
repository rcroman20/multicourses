import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { firebaseDB } from '@/lib/firebase';
import { 
  doc, 
  getDoc, 
  setDoc,
  collection, 
  query, 
  where, 
  getDocs,
  updateDoc
} from 'firebase/firestore';
import {
  ArrowLeft,
  Users,
  Mail,
  Phone,
  Globe,
  Instagram,
  BookOpen,
  GraduationCap,
  Calendar,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Edit,
  Save,
  Plus,
  Trash2,
  Shield,
  Hash,
  ExternalLink,
  Clock,
  FileText,
  BarChart3,
  X,
  User,
  School,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { changeCourseEnrollmentWithPlan } from '@/lib/services/teacherPlanEnforcementService';
import { isAdminEmail } from '@/lib/services/adminAccessService';

interface Student {
  id: string;
  idNumber: string;
  email: string;
  name: string;
  role: 'estudiante' | 'docente' | 'admin' | 'institucion';
  requestedRole?: 'estudiante' | 'docente';
  teacherApprovalStatus?: 'pending' | 'approved' | 'rejected';
  whatsApp: string;
  location?: string;
  avatarUrl?: string;
  avatarEmoji?: string;
  bio?: string;
  website?: string;
  instagram?: string;
  createdAt?: Date;
  courses?: string[];
}

interface Course {
  id: string;
  name: string;
  code: string;
  description: string;
  semester: string;
  group: string;
  enrolledStudents: string[];
  teacherId: string;
  teacherName: string;
  status: string;
} 

type UserRole = "estudiante" | "docente" | "admin" | "institucion";
type RequestedRole = "estudiante" | "docente";
type StudentRoleDisplay =
  | "student"
  | "teacher"
  | "teacher_pending"
  | "teacher_rejected"
  | "admin"
  | "institution";

const normalizeUserRole = (
  value: unknown,
): UserRole | null => {
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
): "pending" | "approved" | "rejected" | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "pending" ||
    normalized === "approved" ||
    normalized === "rejected"
  ) {
    return normalized as "pending" | "approved" | "rejected";
  }
  return null;
};

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

export default function StudentDetailPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [student, setStudent] = useState<Student | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrolledCourses, setEnrolledCourses] = useState<Course[]>([]);
  const [availableCourses, setAvailableCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [studentGrades, setStudentGrades] = useState<any[]>([]);
  const [studentAssessments, setStudentAssessments] = useState<any[]>([]);
  
  // Estados para edición
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    idNumber: '',
    email: '',
    whatsApp: ''
  });

  const isTeacher = user?.role === 'docente';
  const isInstitution = user?.role === 'institucion';
  const canManageEnrollment = isTeacher || isInstitution;
  const institutionId = (user?.institutionId || user?.id || '').trim();
  const studentRoleDisplay = student ? getStudentRoleDisplay(student) : "student";
  const isInstitutionAccount = studentRoleDisplay === "institution";
  const detailTitle =
    studentRoleDisplay === "admin"
      ? "Admin Detail"
      : studentRoleDisplay === "institution"
        ? "Institution Detail"
      : studentRoleDisplay === "teacher" ||
          studentRoleDisplay === "teacher_pending" ||
          studentRoleDisplay === "teacher_rejected"
        ? "Teacher Detail"
        : "Student Detail";
  const detailSubtitle =
    studentRoleDisplay === "admin"
      ? "Account detail and enrollment status"
      : studentRoleDisplay === "institution"
        ? "Institution account detail and workspace status"
      : studentRoleDisplay === "teacher_pending"
        ? "Teacher request pending admin approval"
        : studentRoleDisplay === "teacher_rejected"
          ? "Teacher request was rejected by an admin"
          : "Academic detail and enrollment status";

  const renderRoleBadge = () => {
    if (!student) return null;

    if (studentRoleDisplay === "admin") {
      return (
        <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700">
          <Shield className="h-3 w-3" />
          Admin
        </span>
      );
    }

    if (studentRoleDisplay === "teacher") {
      return (
        <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
          <Shield className="h-3 w-3" />
          Teacher
        </span>
      );
    }

    if (studentRoleDisplay === "teacher_pending") {
      return (
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
          <Clock className="h-3 w-3" />
          Teacher Pending
        </span>
      );
    }

    if (studentRoleDisplay === "teacher_rejected") {
      return (
        <span className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
          <XCircle className="h-3 w-3" />
          Teacher Rejected
        </span>
      );
    }

    if (studentRoleDisplay === "institution") {
      return (
        <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-0.5 text-xs font-semibold text-cyan-700">
          <School className="h-3 w-3" />
          Institution
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
        <GraduationCap className="h-3 w-3" />
        Student
      </span>
    );
  };

  useEffect(() => {
    if (studentId) {
      fetchStudentData();
    }
  }, [studentId]);

  // Inicializar el formulario de edición cuando se carga el estudiante
  useEffect(() => {
    if (student) {
      setEditForm({
        name: student.name,
        idNumber: student.idNumber,
        email: student.email,
        whatsApp: student.whatsApp
      });
    }
  }, [student]);

  const fetchStudentData = async () => {
    setIsLoading(true);
    try {
      // Fetch profile from both collections to avoid missing user fields
      const studentRef = doc(firebaseDB, 'estudiantes', studentId!);
      const userRef = doc(firebaseDB, 'usuarios', studentId!);
      const [studentSnap, userSnap] = await Promise.all([
        getDoc(studentRef),
        getDoc(userRef),
      ]);
      
      if (!studentSnap.exists() && !userSnap.exists()) {
        navigate('/students/list');
        return;
      }

      const studentData = studentSnap.exists() ? studentSnap.data() : {};
      const userData = userSnap.exists() ? userSnap.data() : {};
      const roleFromUser = normalizeUserRole(userData?.role);
      const roleFromStudent = normalizeUserRole(studentData.role);
      const roleFromData =
        roleFromUser ||
        roleFromStudent ||
        "estudiante";
      const requestedRole =
        normalizeRequestedRole(studentData.requestedRole) ||
        normalizeRequestedRole(userData?.requestedRole) ||
        undefined;
      const teacherApprovalStatus =
        normalizeTeacherApprovalStatus(studentData.teacherApprovalStatus) ||
        normalizeTeacherApprovalStatus(userData?.teacherApprovalStatus) ||
        undefined;
      const isKnownAdmin =
        roleFromUser === "admin" ||
        roleFromStudent === "admin" ||
        isAdminEmail(studentData.email || userData?.email);
      const role: UserRole =
        isKnownAdmin
          ? "admin"
          : roleFromData === "estudiante" &&
              requestedRole === "docente" &&
              teacherApprovalStatus === "approved"
            ? "docente"
            : roleFromData;
      
      const studentObj: Student = {
        id: studentId!,
        idNumber: studentData.idNumber || userData?.idNumber || '',
        email: studentData.email || userData?.email || '',
        name: studentData.name || userData?.name || 'Student',
        role,
        requestedRole,
        teacherApprovalStatus,
        whatsApp:
          studentData.whatsApp ||
          studentData.phone ||
          userData?.phone ||
          userData?.whatsApp ||
          userData?.whatsapp ||
          '',
        location: userData?.location || studentData.location || '',
        avatarUrl: userData?.avatarUrl || studentData.avatarUrl || '',
        avatarEmoji: userData?.avatarEmoji || studentData.avatarEmoji || '',
        bio: userData?.bio || studentData.bio || '',
        website: userData?.website || studentData.website || '',
        instagram: userData?.instagram || studentData.instagram || '',
        createdAt: studentData.createdAt?.toDate?.() || userData?.createdAt?.toDate?.(),
        courses: Array.isArray(studentData.courses) ? studentData.courses : [],
      };

      setStudent(studentObj);

      // Fetch student grades from gradeSheets
      await fetchStudentGrades(studentId!);

      // Fetch student assessments
      await fetchStudentAssessments(studentId!);

      if (canManageEnrollment) {
        await fetchManagerCourses(studentObj.courses || []);
      }

    } catch (err) {
      setError('Error loading student data');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchManagerCourses = async (studentCourseIds: string[]) => {
    try {
      const coursesRef = collection(firebaseDB, 'cursos');
      const courseSnapshots = isTeacher
        ? [await getDocs(query(coursesRef, where('teacherId', '==', user?.id)))]
        : institutionId
          ? await Promise.all([
              getDocs(query(coursesRef, where('institutionId', '==', institutionId))),
              getDocs(query(coursesRef, where('createdByInstitutionId', '==', institutionId))),
            ])
          : [];

      const coursesMap = new Map<string, Course>();
      courseSnapshots.forEach((snapshot) => {
        snapshot.forEach((courseDoc) => {
          const data = courseDoc.data();
          coursesMap.set(courseDoc.id, {
            id: courseDoc.id,
            name: data.name || data.nombre || 'Unnamed Course',
            code: data.code || data.codigo || 'N/A',
            description: data.description || '',
            semester: data.semester || '',
            group: data.group || '',
            enrolledStudents: Array.isArray(data.enrolledStudents) ? data.enrolledStudents : [],
            teacherId: data.teacherId || '',
            teacherName: data.teacherName || '',
            status: data.status || 'active',
          });
        });
      });

      const coursesList = Array.from(coursesMap.values());

      setCourses(coursesList);

      // Separate enrolled and available courses
      const enrolled = coursesList.filter(course => 
        studentCourseIds.includes(course.id)
      );
      const available = coursesList.filter(course => 
        !studentCourseIds.includes(course.id)
      );

      setEnrolledCourses(enrolled);
      setAvailableCourses(available);

    } catch (err) {
    }
  };

  const fetchStudentGrades = async (studentId: string) => {
    try {
      const gradeSheetsRef = collection(firebaseDB, 'gradeSheets');
      const gradeSheetsSnapshot = await getDocs(gradeSheetsRef);
      
      const grades: any[] = [];
      
      gradeSheetsSnapshot.forEach((doc) => {
        const sheetData = doc.data();
        const studentInSheet = sheetData.students?.find((s: any) => s.studentId === studentId);
        
        if (studentInSheet && studentInSheet.total) {
          grades.push({
            sheetId: doc.id,
            sheetTitle: sheetData.title || 'Unnamed Sheet',
            courseName: sheetData.courseName || 'Unknown Course',
            gradingPeriod: sheetData.gradingPeriod || 'N/A',
            grade: studentInSheet.total,
            status: studentInSheet.status || 'pending',
            updatedAt: sheetData.updatedAt?.toDate() || new Date(),
          });
        }
      });
      
      // Sort by most recent
      grades.sort((a, b) => b.updatedAt - a.updatedAt);
      setStudentGrades(grades);
      
    } catch (err) {
    }
  };

  const fetchStudentAssessments = async (studentId: string) => {
    try {
      const assessmentsRef = collection(firebaseDB, 'assessments');
      const assessmentsSnapshot = await getDocs(assessmentsRef);
      
      const assessments: any[] = [];
      
      assessmentsSnapshot.forEach((doc) => {
        const assessmentData = doc.data();
        if (assessmentData) {
          assessments.push({
            id: doc.id,
            name: assessmentData.name || 'Unnamed Assessment',
            courseId: assessmentData.courseId,
            type: assessmentData.type || 'homework',
            status: assessmentData.status || 'draft',
            dueDate: assessmentData.dueDate,
            createdAt: assessmentData.createdAt,
          });
        }
      });
      
      setStudentAssessments(assessments.slice(0, 5));
      
    } catch (err) {
    }
  };

  // Función para guardar los cambios del estudiante
  const handleSaveChanges = async () => {
    if (!student) return;
    if (isInstitutionAccount) {
      setError("Institution accounts cannot be edited from this workspace.");
      return;
    }

    // Validaciones básicas
    if (!editForm.name.trim()) {
      setError('El nombre es requerido');
      return;
    }
    if (!editForm.idNumber.trim()) {
      setError('El número de ID es requerido');
      return;
    }
    if (!editForm.email.trim()) {
      setError('El correo electrónico es requerido');
      return;
    }
    if (!editForm.whatsApp.trim()) {
      setError('El número de WhatsApp es requerido');
      return;
    }

    setIsUpdating(true);
    try {
      // Update in both collections to keep data synced
      const studentRef = doc(firebaseDB, 'estudiantes', student.id);
      const userRef = doc(firebaseDB, 'usuarios', student.id);
      const payload = {
        name: editForm.name.trim(),
        idNumber: editForm.idNumber.trim(),
        email: editForm.email.trim(),
        whatsApp: editForm.whatsApp.trim(),
        phone: editForm.whatsApp.trim(),
        updatedAt: new Date()
      };

      const [studentSnap, userSnap] = await Promise.all([
        getDoc(studentRef),
        getDoc(userRef),
      ]);

      if (studentSnap.exists()) {
        await updateDoc(studentRef, payload);
      }

      if (userSnap.exists()) {
        await updateDoc(userRef, payload);
      } else {
        await setDoc(
          userRef,
          {
            ...payload,
            role: student.role,
            createdAt: new Date(),
          },
          { merge: true },
        );
      }

      // Actualizar también en la colección de usuarios si existe
      try {
        const userRef = doc(firebaseDB, 'usuarios', student.id);
        await updateDoc(userRef, {
          name: editForm.name.trim(),
          idNumber: editForm.idNumber.trim(),
          email: editForm.email.trim(),
          phone: editForm.whatsApp.trim(),
          whatsApp: editForm.whatsApp.trim(),
          updatedAt: new Date()
        });
      } catch (err) {
        console.log('Usuario no encontrado en colección usuarios, solo actualizando en estudiantes');
      }

      // Actualizar estado local
      setStudent(prev => prev ? {
        ...prev,
        name: editForm.name.trim(),
        idNumber: editForm.idNumber.trim(),
        email: editForm.email.trim(),
        whatsApp: editForm.whatsApp.trim()
      } : null);

      setSuccess('Información del estudiante actualizada exitosamente');
      setTimeout(() => setSuccess(''), 3000);
      setIsEditing(false);

    } catch (err) {
      setError('Error al actualizar la información del estudiante');
    } finally {
      setIsUpdating(false);
    }
  };

  const enrollStudentInCourse = async (courseId: string) => {
    if (!student || !canManageEnrollment) return;
    if (isInstitutionAccount) {
      setError("Institution accounts cannot be enrolled in courses.");
      return;
    }

    setIsUpdating(true);
    try {
      await changeCourseEnrollmentWithPlan({
        courseId,
        studentId: student.id,
        action: "enroll",
      });

      const course = courses.find(c => c.id === courseId);
      if (course) {
        setEnrolledCourses(prev => [...prev, course]);
        setAvailableCourses(prev => prev.filter(c => c.id !== courseId));
        
        setStudent(prev => prev ? {
          ...prev,
          courses: [...(prev.courses || []), courseId]
        } : null);

        setSuccess(`Student enrolled in ${course.code} successfully`);
        setTimeout(() => setSuccess(''), 3000);
        
        setTimeout(() => fetchStudentData(), 500);
      }

    } catch (error: any) {
      setError(
        typeof error?.message === "string" && error.message.trim().length > 0
          ? error.message
          : 'Error enrolling student in course',
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const unenrollStudentFromCourse = async (courseId: string) => {
    if (!student || !canManageEnrollment) return;
    if (isInstitutionAccount) {
      setError("Institution accounts cannot be enrolled in courses.");
      return;
    }

    if (!confirm('Are you sure you want to unenroll this student from the course?')) {
      return;
    }

    setIsUpdating(true);
    try {
      await changeCourseEnrollmentWithPlan({
        courseId,
        studentId: student.id,
        action: "unenroll",
      });

      const course = courses.find(c => c.id === courseId);
      if (course) {
        setEnrolledCourses(prev => prev.filter(c => c.id !== courseId));
        setAvailableCourses(prev => [...prev, course]);
        
        setStudent(prev => prev ? {
          ...prev,
          courses: prev.courses?.filter(id => id !== courseId) || []
        } : null);

        setSuccess(`Student unenrolled from ${course.code} successfully`);
        setTimeout(() => setSuccess(''), 3000);
        
        setTimeout(() => fetchStudentData(), 500);
      }

    } catch (error: any) {
      setError(
        typeof error?.message === "string" && error.message.trim().length > 0
          ? error.message
          : 'Error unenrolling student from course',
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const handleEditFormChange = (field: keyof typeof editForm, value: string) => {
    setEditForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const cancelEdit = () => {
    if (student) {
      setEditForm({
        name: student.name,
        idNumber: student.idNumber,
        email: student.email,
        whatsApp: student.whatsApp
      });
    }
    setIsEditing(false);
    setError('');
  };

  const normalizeWebsiteUrl = (value?: string) => {
    const cleaned = value?.trim() || '';
    if (!cleaned) return '';
    return /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
  };

  const normalizeInstagramUrl = (value?: string) => {
    const cleaned = value?.trim() || '';
    if (!cleaned) return '';
    if (/^https?:\/\//i.test(cleaned)) return cleaned;

    const username = cleaned
      .replace(/^@/, '')
      .replace(/^instagram\.com\//i, '')
      .replace(/^www\.instagram\.com\//i, '')
      .replace(/\/+$/, '');

    return username ? `https://instagram.com/${username}` : '';
  };

  const websiteUrl = normalizeWebsiteUrl(student?.website);
  const instagramUrl = normalizeInstagramUrl(student?.instagram);

  if (isLoading) {
    return (
      <DashboardLayout contentClassName="pt-0 lg:pt-1">
        <div className="relative overflow-x-clip">
          <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
          <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />
          <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
            <div className="flex min-h-[360px] items-center justify-center">
              <div className="space-y-2 text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
                <p className="text-lg font-semibold text-slate-900">Loading student data</p>
                <p className="text-sm text-slate-600">
                  Please wait while we load the student information.
                </p>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!student) {
    return (
      <DashboardLayout contentClassName="pt-0 lg:pt-1">
        <div className="relative overflow-x-clip">
          <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
          <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />
          <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
            <div className="flex min-h-[360px] items-center justify-center">
              <div className="text-center">
                <AlertCircle className="mx-auto mb-3 h-10 w-10 text-slate-400" />
                <h3 className="mb-2 text-base font-semibold text-slate-900">Student not found</h3>
                <p className="mb-5 text-xs text-slate-500">The student you're looking for doesn't exist.</p>
                <button
                  onClick={() => navigate('/students/list')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/60 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Students List
                </button>
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
      <div className="space-y-3">
        {/* Back button */}
        <div className="flex items-center justify-between rounded-xl border border-slate-200/60 bg-slate-50/70 px-3 py-2">
          <button
            onClick={() => navigate('/students/list')}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 transition hover:text-sky-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Students List
          </button>
          
          {isTeacher && !isEditing && !isInstitutionAccount && (
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
            >
              <Edit className="h-3.5 w-3.5" />
              Edit Student
            </button>
          )}
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-700" />
              <p className="text-sm font-medium text-emerald-800">{success}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-700" />
              <p className="text-sm font-medium text-rose-800">{error}</p>
            </div>
          </div>
        )}

        {/* Student Information Card */}
        <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-3 border-b border-slate-200/60 pb-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{detailTitle}</h2>
              <p className="text-sm text-slate-500">{detailSubtitle}</p>
            </div>
          </div>
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="flex-1">
              {/* Header con opción de edición */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-full border border-sky-200 bg-sky-100 flex items-center justify-center overflow-hidden">
                    {student.avatarUrl ? (
                      <img
                        src={student.avatarUrl}
                        alt={`${student.name} avatar`}
                        className="h-full w-full object-cover"
                      />
                    ) : student.avatarEmoji ? (
                      <span className="text-2xl">{student.avatarEmoji}</span>
                    ) : (
                      <User className="h-6 w-6 text-sky-600" />
                    )}
                  </div>
                  <div>
                    {isEditing ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => handleEditFormChange('name', e.target.value)}
                          className="text-2xl font-bold text-slate-900 bg-transparent border-b-2 border-sky-500 focus:outline-none focus:border-sky-700 px-1 py-1"
                          placeholder="Nombre completo"
                        />
                        <div className="flex items-center gap-3 mt-1">
                          {renderRoleBadge()}
                        </div>
                      </div>
                    ) : (
                      <>
                        <h2 className="text-2xl font-bold text-slate-900">{student.name}</h2>
                        <div className="flex items-center gap-3 mt-1">
                          {renderRoleBadge()}
                          <span className="text-sm text-slate-400">•</span>
                          <span className="text-sm text-slate-500">
                            Joined: {student.createdAt ? student.createdAt.toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            }) : 'N/A'}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
                {/* Columna izquierda */}
                <div className="space-y-2">
                  {/* ID Number */}
                  <div className="rounded-xl border border-slate-200/60 bg-slate-50/60 p-2.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100">
                        <Hash className="h-4 w-4 text-sky-700" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-slate-500">ID Number</p>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.idNumber}
                            onChange={(e) => handleEditFormChange('idNumber', e.target.value)}
                            className="w-full border-b border-sky-400 bg-transparent px-1 py-0.5 text-sm font-semibold text-slate-900 focus:border-sky-700 focus:outline-none"
                            placeholder="Número de identificación"
                          />
                        ) : (
                          <p className="text-sm font-semibold text-slate-900">{student.idNumber}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Email */}
                  <div className="rounded-xl border border-slate-200/60 bg-slate-50/60 p-2.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
                        <Mail className="h-4 w-4 text-emerald-700" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-slate-500">Email</p>
                        {isEditing ? (
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={(e) => handleEditFormChange('email', e.target.value)}
                            className="w-full border-b border-sky-400 bg-transparent px-1 py-0.5 text-sm font-semibold text-slate-900 focus:border-sky-700 focus:outline-none"
                            placeholder="correo@ejemplo.com"
                          />
                        ) : (
                          <p className="text-sm font-semibold text-slate-900">{student.email}</p>
                        )}
                      </div>
                    </div>
                  </div>
                                    {/* Phone / WhatsApp */}
                  <div className="rounded-xl border border-slate-200/60 bg-slate-50/60 p-2.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100">
                        <Phone className="h-4 w-4 text-indigo-700" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-slate-500">Phone / WhatsApp</p>
                        {isEditing ? (
                          <input
                            type="tel"
                            value={editForm.whatsApp}
                            onChange={(e) => handleEditFormChange('whatsApp', e.target.value)}
                            className="w-full border-b border-sky-400 bg-transparent px-1 py-0.5 text-sm font-semibold text-slate-900 focus:border-sky-700 focus:outline-none"
                            placeholder="Número de teléfono"
                          />
                        ) : (
                          <p className="text-sm font-semibold text-slate-900">{student.whatsApp}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Location */}
                  <div className="rounded-xl border border-slate-200/60 bg-slate-50/60 p-2.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-100">
                        <Calendar className="h-4 w-4 text-cyan-700" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-slate-500">Location</p>
                        <p className="text-sm font-semibold text-slate-900 break-words">
                          {student.location?.trim() ? student.location : 'No location available'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Columna derecha */}
                <div className="space-y-2">
    {/* Enrolled Courses */}
                  <div className="rounded-xl border border-slate-200/60 bg-slate-50/60 p-2.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
                        <BookOpen className="h-4 w-4 text-amber-700" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500">Enrolled Courses</p>
                        <p className="text-sm font-semibold text-slate-900">
                          {student.courses?.length || 0} course{student.courses?.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Bio */}
                  <div className="rounded-xl border border-slate-200/60 bg-slate-50/60 p-2.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100">
                        <FileText className="h-4 w-4 text-sky-700" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-slate-500">Bio</p>
                        <p className="text-sm font-semibold text-slate-900 break-words">
                          {student.bio?.trim() ? student.bio : 'No bio available'}
                        </p>
                      </div>
                    </div>
                  </div>

              

                  {/* Social Links */}
                  <div className="rounded-xl border border-slate-200/60 bg-slate-50/60 p-2.5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100">
                        <ExternalLink className="h-4 w-4 text-indigo-700" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-slate-500">Social Links</p>
                        {websiteUrl || instagramUrl ? (
                          <div className="mt-1 flex flex-wrap gap-2">
                            {websiteUrl && (
                              <a
                                href={websiteUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                              >
                                <Globe className="h-3.5 w-3.5" />
                                Website
                              </a>
                            )}
                            {instagramUrl && (
                              <a
                                href={instagramUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                              >
                                <Instagram className="h-3.5 w-3.5" />
                                Instagram
                              </a>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm font-semibold text-slate-900">No social links available</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Botones de acción para edición */}
              {isEditing && (
                <div className="mt-4 flex justify-end gap-2 border-t border-slate-200/60 pt-3">
                  <button
                    onClick={cancelEdit}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/60 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveChanges}
                    disabled={isUpdating}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                  >
                    {isUpdating ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-3.5 w-3.5" />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Course Management Section (Only for Teachers) */}
        {canManageEnrollment && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {/* Enrolled Courses */}
            <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100">
                    <CheckCircle className="h-4.5 w-4.5 text-emerald-700" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Enrolled Courses</h3>
                    <p className="text-sm text-slate-500">
                      {enrolledCourses.length} of {courses.length} courses
                    </p>
                  </div>
                </div>
                {isInstitutionAccount ? (
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500"
                    title="Institution accounts cannot be enrolled in courses."
                  >
                    Manage Enrollment
                  </button>
                ) : (
                  <Link
                    to={`/students/${student.id}/enroll`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                  >
                    Manage Enrollment
                  </Link>
                )}
              </div>

              {enrolledCourses.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-8 text-center">
                  <BookOpen className="mx-auto mb-3 h-10 w-10 text-slate-400" />
                  <p className="mb-1 text-sm font-semibold text-slate-900">No enrolled courses</p>
                  <p className="text-xs text-slate-600">This student is not enrolled in any of your courses</p>
                  {isInstitutionAccount ? (
                    <button
                      type="button"
                      disabled
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500"
                      title="Institution accounts cannot be enrolled in courses."
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Enrollment Unavailable
                    </button>
                  ) : (
                    <Link
                      to={`/students/${student.id}/enroll`}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Enroll in Courses
                    </Link>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {enrolledCourses.map((course) => (
                    <div
                      key={course.id}
                      className="flex items-center justify-between rounded-xl border border-slate-200/60 bg-slate-50/40 p-3 transition hover:border-slate-300/60"
                    >
                      <div className="flex-1">
                        <div className="mb-1.5 flex items-center gap-2.5">
                          <h4 className="font-semibold text-slate-900">{course.name}</h4>
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
                            {course.code}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>Semester {course.semester} - Group {course.group}</span>
                          </div>
                          <span>•</span>
                          <div className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            <span>{course.enrolledStudents.length} students</span>
                          </div>
                          <span>•</span>
                          <div className="flex items-center gap-1">
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                              course.status === 'active' 
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700' 
                                : 'border-slate-200/60 bg-slate-100 text-slate-600'
                            }`}>
                              {course.status}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => unenrollStudentFromCourse(course.id)}
                        disabled={isUpdating || isInstitutionAccount}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                        title={
                          isInstitutionAccount
                            ? "Institution accounts cannot be enrolled in courses."
                            : "Unenroll from course"
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Available Courses */}
            <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100">
                    <Plus className="h-4.5 w-4.5 text-sky-700" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Available Courses</h3>
                    <p className="text-sm text-slate-500">
                      Courses where student is not enrolled
                    </p>
                  </div>
                </div>
                <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  {availableCourses.length} available
                </span>
              </div>

              {availableCourses.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-8 text-center">
                  <CheckCircle className="mx-auto mb-3 h-10 w-10 text-emerald-400" />
                  <p className="mb-1 text-sm font-semibold text-slate-900">All courses enrolled</p>
                  <p className="text-xs text-slate-600">Student is enrolled in all your available courses</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableCourses.map((course) => (
                    <div
                      key={course.id}
                      className="flex items-center justify-between rounded-xl border border-slate-200/60 bg-slate-50/40 p-3 transition hover:border-slate-300/60"
                    >
                      <div className="flex-1">
                        <div className="mb-1.5 flex items-center gap-2.5">
                          <h4 className="font-semibold text-slate-900">{course.name}</h4>
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            {course.code}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>Semester {course.semester} - Group {course.group}</span>
                          </div>
                          <span>•</span>
                          <div className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            <span>{course.enrolledStudents.length} students</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => enrollStudentInCourse(course.id)}
                        disabled={isUpdating || isInstitutionAccount}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                        title={
                          isInstitutionAccount
                            ? "Institution accounts cannot be enrolled in courses."
                            : "Enroll in course"
                        }
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
