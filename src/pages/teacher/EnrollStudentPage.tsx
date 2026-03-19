import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { firebaseDB } from '@/lib/firebase';
import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs
} from 'firebase/firestore';
import {
  ArrowLeft,
  Users,
  IdCard,
  Mail,
  Phone,
  BookOpen,
  CheckCircle,
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  Search,
  Filter,
  ChevronDown,
  Target,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { changeCourseEnrollmentWithPlan } from '@/lib/services/teacherPlanEnforcementService';

interface Student {
  id: string;
  idNumber: string;
  email: string;
  name: string;
  role: 'estudiante' | 'docente' | 'institucion';
  whatsApp: string;
  avatarUrl?: string;
  avatarEmoji?: string;
  courses: string[]; // Cambiado de enrolledCourses a courses
}

const normalizeStudentRole = (value: unknown): Student["role"] => {
  const normalized = String(value || "").trim().toLowerCase();
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
    normalized === "institucion" ||
    normalized === "institución" ||
    normalized === "institution"
  ) {
    return "institucion";
  }
  return "estudiante";
};

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
  credits: number;
}

export default function EnrollStudentPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [student, setStudent] = useState<Student | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [filteredCourses, setFilteredCourses] = useState<Course[]>([]);
  const [studentCourses, setStudentCourses] = useState<string[]>([]); // Cambiado de enrolledCourses a studentCourses
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [semesterFilter, setSemesterFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const isTeacher = user?.role === 'docente';
  const isInstitution = user?.role === 'institucion';
  const canManageEnrollment = isTeacher || isInstitution;
  const institutionId = (user?.institutionId || user?.id || '').trim();
  const isInstitutionAccount = student?.role === 'institucion';
  const teacherPlanName = (user?.teacherPlanName || "No assigned plan").trim();
  const teacherPlanStudentLimit =
    typeof user?.teacherPlanStudentLimit === "number" && user.teacherPlanStudentLimit > 0
      ? user.teacherPlanStudentLimit
      : null;
  const teacherPlanExpiresAt =
    user?.teacherPlanExpiresAt instanceof Date
      ? user.teacherPlanExpiresAt
      : user?.teacherPlanExpiresAt
        ? new Date(user.teacherPlanExpiresAt)
        : null;

  useEffect(() => {
    if (studentId) {
      fetchStudentData();
    }
  }, [studentId]);

  useEffect(() => {
    filterCourses();
  }, [courses, studentCourses, searchTerm, semesterFilter, statusFilter]);

  const fetchStudentData = async () => {
    setIsLoading(true);
    try {
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

      const studentData = studentSnap.exists() ? (studentSnap.data() as Record<string, any>) : {};
      const userData = userSnap.exists() ? (userSnap.data() as Record<string, any>) : {};
      const mergedCourses = Array.from(
        new Set(
          [studentData.courses, userData.courses]
            .flatMap((value) => (Array.isArray(value) ? value : []))
            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
        ),
      );
      const studentObj: Student = {
        id: studentId!,
        idNumber: studentData.idNumber || userData.idNumber || userData.identification || '',
        email: studentData.email || userData.email || '',
        name: studentData.name || userData.name || 'Student',
        role: normalizeStudentRole(studentData.role || userData.role || 'estudiante'),
        whatsApp: studentData.whatsApp || userData.whatsApp || userData.whatsapp || userData.phone || '',
        avatarUrl: studentData.avatarUrl || userData.avatarUrl || '',
        avatarEmoji: studentData.avatarEmoji || userData.avatarEmoji || '',
        courses: mergedCourses,
      };

      setStudent(studentObj);
      setStudentCourses(mergedCourses);

      if (canManageEnrollment) {
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
              credits: data.credits || 0,
            });
          });
        });

        setCourses(Array.from(coursesMap.values()));
      }

    } catch (err) {
      setError('Error loading student data');
    } finally {
      setIsLoading(false);
    }
  };

  const filterCourses = () => {
    let filtered = courses;

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(course =>
        course.name.toLowerCase().includes(term) ||
        course.code.toLowerCase().includes(term) ||
        course.description.toLowerCase().includes(term)
      );
    }

    // Filter by semester
    if (semesterFilter !== 'all') {
      filtered = filtered.filter(course => course.semester === semesterFilter);
    }

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(course => course.status === statusFilter);
    }

    setFilteredCourses(filtered);
  };

  const enrollStudentInCourse = async (courseId: string) => {
    if (!student || !canManageEnrollment) return;
    if (student.role === "institucion") {
      setError("Institution accounts cannot be enrolled in courses.");
      return;
    }

    if (
      isTeacher &&
      teacherPlanExpiresAt &&
      !Number.isNaN(teacherPlanExpiresAt.getTime()) &&
      teacherPlanExpiresAt.getTime() < Date.now()
    ) {
      setError(
        `Your ${teacherPlanName} plan has expired. Renew your plan to enroll students.`,
      );
      return;
    }

    if (isTeacher && teacherPlanStudentLimit) {
      const uniqueStudentIds = new Set<string>();
      for (const course of courses) {
        for (const enrolledId of course.enrolledStudents || []) {
          if (typeof enrolledId === "string" && enrolledId.trim().length > 0) {
            uniqueStudentIds.add(enrolledId);
          }
        }
      }

      const alreadyManaged = uniqueStudentIds.has(student.id);
      const projectedTotal = alreadyManaged
        ? uniqueStudentIds.size
        : uniqueStudentIds.size + 1;

      if (projectedTotal > teacherPlanStudentLimit) {
        setError(
          `Plan limit reached: ${teacherPlanName} allows up to ${teacherPlanStudentLimit} unique students.`,
        );
        return;
      }
    }

    setIsUpdating(true);
    try {
      await changeCourseEnrollmentWithPlan({
        courseId,
        studentId: student.id,
        action: "enroll",
      });

      // Update local state
      setStudentCourses(prev => [...prev, courseId]);
      setCourses((prev) =>
        prev.map((course) =>
          course.id === courseId
            ? {
                ...course,
                enrolledStudents: course.enrolledStudents.includes(student.id)
                  ? course.enrolledStudents
                  : [...course.enrolledStudents, student.id],
              }
            : course,
        ),
      );
      
      const course = courses.find(c => c.id === courseId);
      if (course) {
        setSuccess(`Student enrolled in ${course.code} successfully`);
        setTimeout(() => setSuccess(''), 3000);
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
    if (student.role === "institucion") {
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

      // Update local state
      setStudentCourses(prev => prev.filter(id => id !== courseId));
      setCourses((prev) =>
        prev.map((course) =>
          course.id === courseId
            ? {
                ...course,
                enrolledStudents: course.enrolledStudents.filter(
                  (enrolledId) => enrolledId !== student.id,
                ),
              }
            : course,
        ),
      );
      
      const course = courses.find(c => c.id === courseId);
      if (course) {
        setSuccess(`Student unenrolled from ${course.code} successfully`);
        setTimeout(() => setSuccess(''), 3000);
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

  const toggleEnrollment = async (courseId: string, isEnrolled: boolean) => {
    if (isEnrolled) {
      await unenrollStudentFromCourse(courseId);
    } else {
      await enrollStudentInCourse(courseId);
    }
  };

  const getSemesterOptions = () => {
    const semesters = new Set(courses.map(course => course.semester).filter(Boolean));
    return Array.from(semesters).sort();
  };

  const availableCoursesCount = Math.max(0, courses.length - studentCourses.length);
  const activeFilteredCourses = filteredCourses.filter((course) => course.status === 'active').length;
  const hasActiveFilters = Boolean(searchTerm || semesterFilter !== 'all' || statusFilter !== 'all');
  const managedStudentSet = new Set<string>();
  for (const course of courses) {
    for (const enrolledId of course.enrolledStudents || []) {
      if (typeof enrolledId === "string" && enrolledId.trim().length > 0) {
        managedStudentSet.add(enrolledId);
      }
    }
  }
  const managedStudentCount = managedStudentSet.size;
  const remainingStudentSlots = teacherPlanStudentLimit
    ? Math.max(0, teacherPlanStudentLimit - managedStudentCount)
    : null;
  const teacherPlanPriceText =
    typeof user?.teacherPlanPriceCop === "number" && user.teacherPlanPriceCop > 0
      ? `$${user.teacherPlanPriceCop.toLocaleString("en-US")} COP`
      : "Custom";
  const teacherPlanExpiresText =
    teacherPlanExpiresAt && !Number.isNaN(teacherPlanExpiresAt.getTime())
      ? teacherPlanExpiresAt.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "No expiration date";

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
            <div className="flex min-h-[320px] items-center justify-center">
              <div className="text-center">
                <AlertCircle className="mx-auto mb-3 h-10 w-10 text-slate-400" />
                <h3 className="mb-2 text-base font-semibold text-slate-900">Student not found</h3>
                <p className="mb-5 text-xs text-slate-500">The student you are looking for does not exist.</p>
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
          <div className="flex flex-col gap-3">
            <section className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50 to-cyan-50 p-3 shadow-sm">
              <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-sky-200/35" />
              <div className="pointer-events-none absolute -right-24 -bottom-24 h-64 w-64 rounded-full bg-cyan-200/35" />
              <div className="relative z-10 grid gap-3 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start">
                <div>
                  <div className="flex flex-col items-start gap-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                      <Users className="h-3.5 w-3.5" />
                      Enrollment Workspace
                    </div>
                    <button
                      onClick={() => navigate('/students/list')}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 transition hover:text-sky-700"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back to Students List
                    </button>
                  </div>
                  <h2 className="mt-2 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                    Enroll Student
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm text-slate-600">
                    Assign and manage this student across your accessible courses from one place.
                  </p>
                </div>

                <aside className="rounded-xl border border-slate-200/60 bg-white/95 p-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Student Scope</p>

                  <div className="mt-1.5 flex min-w-0 items-start gap-2 rounded-lg border border-slate-200/60 bg-slate-50 px-2.5 py-1">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-sky-200 bg-sky-100 text-base font-bold text-sky-700">
                      {student.avatarUrl ? (
                        <img
                          src={student.avatarUrl}
                          alt={student.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span>{student.avatarEmoji || student.name.charAt(0)}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold leading-tight text-slate-900">{student.name}</h3>
                      <div className="mt-0.5 flex flex-col gap-0.5 text-xs leading-none text-slate-600">
                        <div className="inline-flex items-center gap-1.5">
                          <IdCard className="h-3.5 w-3.5 text-slate-400" />
                          <span>{student.idNumber || 'N/A'}</span>
                        </div>
                        <div className="inline-flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5 text-slate-400" />
                          <span className="truncate" title={student.email}>{student.email}</span>
                        </div>
                        <div className="inline-flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-slate-400" />
                          <span>{student.whatsApp || 'No phone number'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                </aside>
              </div>
            </section>

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

            {isInstitutionAccount && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-700" />
                  <p className="text-sm font-medium text-amber-800">
                    Institution accounts cannot be enrolled in courses from this workspace.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white p-2.5 shadow-sm">
                <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                  <BookOpen className="h-4 w-4" />
                </div>
                <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Total Courses</p>
                <p className="text-lg font-extrabold leading-5 text-slate-900">{courses.length}</p>
              </div>

              <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white p-2.5 shadow-sm">
                <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <CheckCircle className="h-4 w-4" />
                </div>
                <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Enrolled In</p>
                <p className="text-lg font-extrabold leading-5 text-slate-900">{studentCourses.length}</p>
              </div>

              <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white p-2.5 shadow-sm">
                <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                  <Target className="h-4 w-4" />
                </div>
                <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Available</p>
                <p className="text-lg font-extrabold leading-5 text-slate-900">{availableCoursesCount}</p>
              </div>

              <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white p-2.5 shadow-sm">
                <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                  <Filter className="h-4 w-4" />
                </div>
                <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Active in Filter</p>
                <p className="text-lg font-extrabold leading-5 text-slate-900">{activeFilteredCourses}</p>
              </div>
            </div>

            <section className="rounded-2xl border border-slate-200/60 bg-white p-3 shadow-sm">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px_200px_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search courses by name, code or description..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-300/60 bg-slate-50 pl-10 pr-3 text-sm font-medium text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  />
                </div>

                <div className="relative">
                  <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    value={semesterFilter}
                    onChange={(e) => setSemesterFilter(e.target.value)}
                    className="h-10 w-full appearance-none rounded-xl border border-slate-300/60 bg-slate-50 pl-10 pr-9 text-sm font-medium text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="all">All Semesters</option>
                    {getSemesterOptions().map((semester) => (
                      <option key={semester} value={semester}>
                        Semester {semester}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>

                <div className="relative">
                  <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-10 w-full appearance-none rounded-xl border border-slate-300/60 bg-slate-50 pl-10 pr-9 text-sm font-medium text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      setSemesterFilter('all');
                      setStatusFilter('all');
                    }}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200/60 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </section>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
              <section className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
                <div className="border-b border-slate-200/60 bg-slate-50/60 px-4 py-4 sm:px-6">
                  <div className="flex items-center gap-3">
                    <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                      <Users className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Course Enrollment List</h3>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {filteredCourses.length} courses found{searchTerm ? ` for "${searchTerm}"` : ''}
                      </p>
                    </div>
                  </div>
                </div>

                {filteredCourses.length === 0 ? (
                  <div className="px-4 py-12 text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
                      <BookOpen className="h-8 w-8 text-slate-400" />
                    </div>
                    <h3 className="mb-2 text-lg font-bold text-slate-900">No courses found</h3>
                    <p className="mx-auto max-w-md text-sm text-slate-600">
                      {hasActiveFilters
                        ? 'Try different search terms or filters.'
                        : 'No courses are currently available for enrollment.'}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-[920px] w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200/60 bg-slate-50">
                          <th className="min-w-[240px] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Course
                          </th>
                          <th className="min-w-[95px] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Semester
                          </th>
                          <th className="min-w-[90px] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Group
                          </th>
                          <th className="min-w-[80px] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Credits
                          </th>
                          <th className="min-w-[85px] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Students
                          </th>
                          <th className="min-w-[95px] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Status
                          </th>
                          <th className="min-w-[140px] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCourses.map((course, index) => {
                          const isEnrolled = studentCourses.includes(course.id);

                          return (
                            <tr
                              key={course.id}
                              className={cn(
                                'border-b border-slate-200/60 transition hover:bg-sky-50/30',
                                index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30',
                              )}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                                    <BookOpen className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate font-semibold text-slate-900" title={course.name}>
                                      {course.name}
                                    </p>
                                    <p className="text-xs font-medium text-sky-700">{course.code}</p>
                                    {course.description && (
                                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500" title={course.description}>
                                        {course.description}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3 font-medium text-slate-700">{course.semester || 'N/A'}</td>
                              <td className="px-3 py-3 font-medium text-slate-700">{course.group || 'N/A'}</td>
                              <td className="px-3 py-3 font-medium text-slate-700">{course.credits || 0}</td>
                              <td className="px-3 py-3">
                                <div className="inline-flex items-center gap-1.5 text-slate-700">
                                  <Users className="h-3.5 w-3.5 text-slate-400" />
                                  <span className="font-medium">{course.enrolledStudents.length}</span>
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <span
                                  className={cn(
                                    'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                                    course.status === 'active'
                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                      : 'border-slate-200/60 bg-slate-100 text-slate-600',
                                  )}
                                >
                                  {course.status === 'active' ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td className="px-3 py-3">
                                <button
                                  onClick={() => toggleEnrollment(course.id, isEnrolled)}
                                  disabled={isUpdating || isInstitutionAccount}
                                  className={cn(
                                    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
                                    isEnrolled
                                      ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                                      : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
                                  )}
                                  title={
                                    isInstitutionAccount
                                      ? 'Institution accounts cannot be enrolled in courses.'
                                      : isEnrolled
                                        ? 'Unenroll from course'
                                        : 'Enroll in course'
                                  }
                                >
                                  {isUpdating ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : isEnrolled ? (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  ) : (
                                    <Plus className="h-3.5 w-3.5" />
                                  )}
                                  <span>{isEnrolled ? 'Unenroll' : 'Enroll'}</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <aside className="space-y-3 xl:sticky xl:top-24 xl:self-start">
                {isTeacher ? (
                  <section className="rounded-2xl border border-sky-200 bg-sky-50 p-3 shadow-sm">
                    <h4 className="text-sm font-semibold text-slate-900">Active Teacher Plan</h4>
                    <p className="mt-1 text-xs text-slate-700">
                      {teacherPlanName} · {teacherPlanPriceText}
                    </p>
                    <div className="mt-2 space-y-1 text-xs text-slate-600">
                      <p>
                        Student limit: {teacherPlanStudentLimit ?? "Unlimited"} (remaining{" "}
                        {remainingStudentSlots ?? "Unlimited"})
                      </p>
                      <p>Managed students: {managedStudentCount}</p>
                      <p>Expires: {teacherPlanExpiresText}</p>
                    </div>
                  </section>
                ) : (
                  <section className="rounded-2xl border border-cyan-200 bg-cyan-50 p-3 shadow-sm">
                    <h4 className="text-sm font-semibold text-slate-900">Institution Scope</h4>
                    <p className="mt-1 text-xs text-slate-700">
                      You can manage enrollment for courses owned by your institution.
                    </p>
                    <div className="mt-2 space-y-1 text-xs text-slate-600">
                      <p>Institution ID: {institutionId || 'Unavailable'}</p>
                      <p>Managed courses: {courses.length}</p>
                      <p>Managed students: {managedStudentCount}</p>
                    </div>
                  </section>
                )}

                <section className="rounded-2xl border border-slate-200/60 bg-white p-3 shadow-sm">
                  <h4 className="mb-2 text-sm font-semibold text-slate-900">Enrollment Summary</h4>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Filtered courses</span>
                      <span className="font-semibold text-slate-900">{filteredCourses.length}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Active in filter</span>
                      <span className="font-semibold text-slate-900">{activeFilteredCourses}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Already enrolled</span>
                      <span className="font-semibold text-emerald-700">{studentCourses.length}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Pending assignment</span>
                      <span className="font-semibold text-amber-700">{availableCoursesCount}</span>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200/60 bg-sky-50/60 p-3 shadow-sm">
                  <div className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                    <Zap className="h-4 w-4" />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900">Quick Guide</h4>
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
                    <li className="flex items-start gap-1.5">
                      <CheckCircle className="mt-0.5 h-3.5 w-3.5 text-emerald-600" />
                      <span>Use <strong>Enroll</strong> to add the student to a course.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <CheckCircle className="mt-0.5 h-3.5 w-3.5 text-emerald-600" />
                      <span>Use <strong>Unenroll</strong> to remove current assignment.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <CheckCircle className="mt-0.5 h-3.5 w-3.5 text-emerald-600" />
                      <span>Apply filters to focus by semester and status.</span>
                    </li>
                  </ul>
                </section>
              </aside>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
