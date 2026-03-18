import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  Mail,
  GraduationCap,
  Loader2,
  PlusCircle,
  RefreshCw,
  School,
  Search,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  approveInstitutionTeacherRequest,
  assignInstitutionCourseTeacher,
  getInstitutionDashboardData,
  linkUserToInstitutionByEmail,
  type InstitutionDashboardData,
} from "@/lib/services/institutionService";

const cardClass =
  "rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm";
const inputClass =
  "h-11 w-full rounded-xl border border-slate-200/60 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100";
const softButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60";
const miniStatClass = "min-w-0 rounded-xl border border-slate-200/60 p-2.5 sm:p-3";
const listItemClass =
  "rounded-xl border border-slate-200/60 bg-white px-3 py-2.5 transition-colors hover:border-slate-300/60 hover:bg-slate-50";

function getInitials(name: string): string {
  const tokens = name
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 2);
  if (tokens.length === 0) return "IN";
  return tokens.map((token) => token.charAt(0).toUpperCase()).join("");
}

function AvatarBadge({
  name,
  avatarUrl,
  avatarEmoji,
  toneClassName,
}: {
  name: string;
  avatarUrl?: string;
  avatarEmoji?: string;
  toneClassName: string;
}) {
  return (
    <div
      className={`inline-flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200/60 text-xs font-bold ${toneClassName}`}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={`${name} avatar`} className="h-full w-full object-cover" />
      ) : (
        <span>{avatarEmoji || getInitials(name)}</span>
      )}
    </div>
  );
}

function SectionHeader({
  icon,
  iconClassName,
  title,
  description,
}: {
  icon: ReactNode;
  iconClassName: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={`inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${iconClassName}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
    </div>
  );
} 

function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
      <div className="mx-auto inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-400">
        {icon || <AlertTriangle className="h-5 w-5" />}
      </div>
      <p className="mt-2 text-sm font-medium text-slate-700">{title}</p>
      <p className="text-xs text-slate-500">{description}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
          onClick={onAction}
        >
          <ArrowRight className="h-3.5 w-3.5" />
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

type MemberFormState = {
  teacherEmail: string;
  studentEmail: string;
};

function formatCompactDate(value: Date | null | undefined) {
  if (!value) return "Recently";
  return value.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function InstitutionDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<InstitutionDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingTeacher, setSavingTeacher] = useState(false);
  const [savingStudent, setSavingStudent] = useState(false);
  const [assigningCourseId, setAssigningCourseId] = useState("");
  const [approvingTeacherId, setApprovingTeacherId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [memberForm, setMemberForm] = useState<MemberFormState>({
    teacherEmail: "",
    studentEmail: "",
  });
  const [courseSearch, setCourseSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState<"all" | "assigned" | "unassigned">("all");
  const [teacherSearch, setTeacherSearch] = useState("");
  const [teacherFilter, setTeacherFilter] = useState<"all" | "managed" | "independent" | "idle">("all");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentFilter, setStudentFilter] = useState<"all" | "enrolled" | "without_courses">("all");
  const pendingSectionRef = useRef<HTMLElement | null>(null);
  const coursesSectionRef = useRef<HTMLElement | null>(null);
  const teacherInputRef = useRef<HTMLInputElement | null>(null);
  const studentInputRef = useRef<HTMLInputElement | null>(null);

  const teacherOptions = useMemo(
    () => (data?.teachers || []).filter((teacher) => teacher.approvalStatus === "approved"),
    [data?.teachers],
  );
  const courseUsage = data?.courses.length || 0;
  const teacherUsage = data?.teachers.length || 0;
  const studentUsage = data?.students.length || 0;

  const planStatusMeta = useMemo(() => {
    const status = data?.institution.planStatus || "active";
    if (status === "pending_payment") {
      return {
        label: "Pending payment",
        className: "border-amber-200 bg-amber-50 text-amber-700",
      };
    }
    if (status === "inactive") {
      return {
        label: "Inactive",
        className: "border-rose-200 bg-rose-50 text-rose-700",
      };
    }
    return {
      label: "Active",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }, [data?.institution.planStatus]);

  const usageRows = useMemo(
    () => [
      {
        label: "Courses",
        current: courseUsage,
        limit: data?.institution.courseLimit ?? null,
        tone: "bg-sky-500",
      },
      {
        label: "Teachers",
        current: teacherUsage,
        limit: data?.institution.teacherLimit ?? null,
        tone: "bg-violet-500",
      },
      {
        label: "Students",
        current: studentUsage,
        limit: data?.institution.studentLimit ?? null,
        tone: "bg-emerald-500",
      },
    ],
    [
      courseUsage,
      data?.institution.courseLimit,
      data?.institution.studentLimit,
      data?.institution.teacherLimit,
      studentUsage,
      teacherUsage,
    ],
  );

  const alerts = useMemo(() => {
    if (!data) return [];
    const items: Array<{
      id: string;
      title: string;
      description: string;
      tone: string;
    }> = [];

    const unassignedCourses = data.courses.filter((course) => !course.teacherId).length;
    const idleTeachers = data.teachers.filter(
      (teacher) => teacher.approvalStatus === "approved" && teacher.activeCoursesCount === 0,
    ).length;
    const studentsWithoutCourses = data.students.filter(
      (student) => student.enrolledCoursesCount === 0,
    ).length;

    if (data.institution.planStatus !== "active") {
      items.push({
        id: "plan-status",
        title: "Plan needs attention",
        description: `Workspace status is ${planStatusMeta.label.toLowerCase()}. Review billing or activation details.`,
        tone: "border-amber-200 bg-amber-50 text-amber-800",
      });
    }

    if (data.pendingTeacherRequests.length > 0) {
      items.push({
        id: "teacher-requests",
        title: `${data.pendingTeacherRequests.length} teacher request${
          data.pendingTeacherRequests.length === 1 ? "" : "s"
        } pending`,
        description: "Review approvals so teachers can access their institution flow.",
        tone: "border-sky-200 bg-sky-50 text-sky-800",
      });
    }

    if (unassignedCourses > 0) {
      items.push({
        id: "unassigned-courses",
        title: `${unassignedCourses} course${unassignedCourses === 1 ? "" : "s"} without teacher`,
        description: "Assign a teacher to avoid leaving classes unmanaged.",
        tone: "border-violet-200 bg-violet-50 text-violet-800",
      });
    }

    if (idleTeachers > 0) {
      items.push({
        id: "idle-teachers",
        title: `${idleTeachers} linked teacher${idleTeachers === 1 ? "" : "s"} without courses`,
        description: "Check if they need assignment or should remain available for later.",
        tone: "border-slate-200 bg-slate-50 text-slate-700",
      });
    }

    if (studentsWithoutCourses > 0) {
      items.push({
        id: "students-without-courses",
        title: `${studentsWithoutCourses} student${studentsWithoutCourses === 1 ? "" : "s"} without enrollment`,
        description: "Students linked to the institution still need at least one active course.",
        tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
      });
    }

    if (data.institution.courseLimit && courseUsage >= data.institution.courseLimit) {
      items.push({
        id: "course-limit",
        title: "Course limit reached",
        description: `You are using ${courseUsage}/${data.institution.courseLimit} available courses.`,
        tone: "border-rose-200 bg-rose-50 text-rose-800",
      });
    } else if (
      data.institution.courseLimit &&
      courseUsage / data.institution.courseLimit >= 0.8
    ) {
      items.push({
        id: "course-limit-near",
        title: "Course capacity is near the limit",
        description: `You are using ${courseUsage}/${data.institution.courseLimit} course slots.`,
        tone: "border-amber-200 bg-amber-50 text-amber-800",
      });
    }

    if (data.institution.studentLimit && studentUsage >= data.institution.studentLimit) {
      items.push({
        id: "student-limit",
        title: "Student limit reached",
        description: `You are using ${studentUsage}/${data.institution.studentLimit} student slots.`,
        tone: "border-rose-200 bg-rose-50 text-rose-800",
      });
    }

    return items;
  }, [courseUsage, data, planStatusMeta.label, studentUsage]);

  const filteredCourses = useMemo(() => {
    if (!data) return [];
    const term = courseSearch.trim().toLowerCase();
    return data.courses.filter((course) => {
      if (courseFilter === "assigned" && !course.teacherId) return false;
      if (courseFilter === "unassigned" && course.teacherId) return false;
      if (!term) return true;
      const searchable = `${course.name} ${course.code} ${course.semester} ${course.group} ${course.teacherName}`.toLowerCase();
      return searchable.includes(term);
    });
  }, [courseFilter, courseSearch, data]);

  const filteredTeachers = useMemo(() => {
    if (!data) return [];
    const term = teacherSearch.trim().toLowerCase();
    return data.teachers.filter((teacher) => {
      if (teacherFilter === "managed" && !teacher.institutionManaged) return false;
      if (teacherFilter === "independent" && teacher.institutionManaged) return false;
      if (teacherFilter === "idle" && teacher.activeCoursesCount > 0) return false;
      if (!term) return true;
      const searchable = `${teacher.name} ${teacher.email}`.toLowerCase();
      return searchable.includes(term);
    });
  }, [data, teacherFilter, teacherSearch]);

  const filteredStudents = useMemo(() => {
    if (!data) return [];
    const term = studentSearch.trim().toLowerCase();
    return data.students.filter((student) => {
      if (studentFilter === "enrolled" && student.enrolledCoursesCount === 0) return false;
      if (studentFilter === "without_courses" && student.enrolledCoursesCount > 0) return false;
      if (!term) return true;
      const searchable = `${student.name} ${student.email}`.toLowerCase();
      return searchable.includes(term);
    });
  }, [data, studentFilter, studentSearch]);

  const quickActions = useMemo(
    () => [
      {
        id: "create-course",
        label: "Create course",
        description: "Open the dedicated course creation flow.",
        icon: <PlusCircle className="h-4 w-4" />,
        iconClassName: "bg-sky-100 text-sky-700",
        onClick: () => navigate("/courses/create"),
      },
      {
        id: "courses",
        label: "Course directory",
        description: "Review all available institution courses.",
        icon: <BookOpen className="h-4 w-4" />,
        iconClassName: "bg-violet-100 text-violet-700",
        onClick: () => navigate("/courses"),
      },
      {
        id: "calendar",
        label: "Calendar",
        description: "Check shared academic scheduling.",
        icon: <CalendarDays className="h-4 w-4" />,
        iconClassName: "bg-amber-100 text-amber-700",
        onClick: () => navigate("/calendar"),
      },
      {
        id: "profile",
        label: "Institution profile",
        description: "Review your workspace account settings.",
        icon: <Building2 className="h-4 w-4" />,
        iconClassName: "bg-cyan-100 text-cyan-700",
        onClick: () => navigate("/profile"),
      },
      {
        id: "approvals",
        label: "Teacher approvals",
        description: "Jump to pending institution requests.",
        icon: <CheckCircle2 className="h-4 w-4" />,
        iconClassName: "bg-emerald-100 text-emerald-700",
        onClick: () => pendingSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      },
      {
        id: "assignment",
        label: "Teacher assignment",
        description: "Jump to the course assignment panel.",
        icon: <Users className="h-4 w-4" />,
        iconClassName: "bg-indigo-100 text-indigo-700",
        onClick: () => coursesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      },
    ],
    [navigate],
  );

  const loadData = async (mode: "initial" | "refresh" = "initial") => {
    if (!user) return;
    if (mode === "initial") setLoading(true);
    if (mode === "refresh") setRefreshing(true);
    setLoadError("");

    try {
      const next = await getInstitutionDashboardData(user);
      setData(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load institution workspace.";
      if (mode === "initial") {
        setLoadError(message);
      } else {
        toast.error(message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [user?.id]);

  const handleAddTeacher = async () => {
    if (!data || !memberForm.teacherEmail.trim()) return;
    setSavingTeacher(true);
    try {
      await linkUserToInstitutionByEmail({
        institutionId: data.institution.id,
        institutionName: data.institution.name,
        email: memberForm.teacherEmail,
        desiredRole: "docente",
      });
      setMemberForm((prev) => ({ ...prev, teacherEmail: "" }));
      await loadData("refresh");
      toast.success("Teacher linked to the institution successfully.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not link teacher.");
    } finally {
      setSavingTeacher(false);
    }
  };

  const handleAddStudent = async () => {
    if (!data || !memberForm.studentEmail.trim()) return;
    setSavingStudent(true);
    try {
      await linkUserToInstitutionByEmail({
        institutionId: data.institution.id,
        institutionName: data.institution.name,
        email: memberForm.studentEmail,
        desiredRole: "estudiante",
      });
      setMemberForm((prev) => ({ ...prev, studentEmail: "" }));
      await loadData("refresh");
      toast.success("Student linked to the institution successfully.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not link student.");
    } finally {
      setSavingStudent(false);
    }
  };

  const handleAssignTeacher = async (courseId: string, teacherId: string) => {
    if (!data) return;
    setAssigningCourseId(courseId);
    try {
      await assignInstitutionCourseTeacher({
        institutionId: data.institution.id,
        courseId,
        teacherId,
      });
      await loadData("refresh");
      toast.success("Teacher assignment updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not assign teacher.");
    } finally {
      setAssigningCourseId("");
    }
  };

  const handleApproveTeacherRequest = async (teacherId: string) => {
    if (!data || !user) return;
    setApprovingTeacherId(teacherId);
    try {
      await approveInstitutionTeacherRequest({
        institutionId: data.institution.id,
        teacherId,
        approvedBy: user.email || user.name || data.institution.name,
      });
      await loadData("refresh");
      toast.success("Teacher request approved successfully.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not approve teacher request.");
    } finally {
      setApprovingTeacherId("");
    }
  };

  const handleCopy = async (value: string, label: string) => {
    if (!value.trim()) {
      toast.error(`No ${label.toLowerCase()} available.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error("Clipboard permission unavailable.");
    }
  };

  if (loading) {
    return (
      <DashboardLayout contentClassName="pt-0 lg:pt-1">
        <div className="relative overflow-x-hidden">
          <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
          <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />

          <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
            <div className={cardClass}>
              <div className="flex min-h-[320px] items-center justify-center">
                <div className="text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
                  <p className="mt-3 text-sm font-medium text-slate-600">
                    Loading institution workspace...
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
      <div className="relative overflow-x-hidden">
        <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
        <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />

        <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <div className="space-y-4">
            <section className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
              <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-sky-200/35" />
              <div className="pointer-events-none absolute -right-24 -bottom-24 h-64 w-64 rounded-full bg-indigo-200/35" />
              <div className="relative space-y-4">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                    <Building2 className="h-3.5 w-3.5" />
                    Institution Role
                  </div>
                  <h1 className="mt-1 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                    {data?.institution.name || "Institution Workspace"}
                  </h1>
                  <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                    Manage your teachers, students, and institution-owned courses without affecting
                    independent teachers outside your organization.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className={`${miniStatClass} bg-white/90`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                        <School className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">
                        {data?.teachers.length || 0}
                      </p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">
                      Linked teachers
                    </p>
                    <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                      Pending: {data?.pendingTeacherRequests.length || 0}
                    </p>
                  </div>
                  <div className={`${miniStatClass} bg-white/90`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                        <Users className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">
                        {data?.students.length || 0}
                      </p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">
                      Students in scope
                    </p>
                  </div>
                  <div className={`${miniStatClass} bg-white/90`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                        <BookOpen className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">
                        {data?.courses.length || 0}
                      </p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">
                      Institution courses
                    </p>
                  </div>
                  <div className={`${miniStatClass} bg-white/90`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                        <GraduationCap className="h-4 w-4" />
                      </div>
                      <p className="truncate text-sm font-extrabold leading-5 text-slate-900">
                        {data?.institution.planName || "Institution Plan"}
                      </p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">
                      Status: {data?.institution.planStatus || "active"}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                      Limit: {data?.institution.courseLimit ?? "Unlimited"}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {loadError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {loadError}
              </div>
            ) : null}

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="space-y-4">
                <article className={cardClass}>
                  <div className="mb-3">
                    <SectionHeader
                      icon={<Sparkles className="h-4 w-4" />}
                      iconClassName="bg-sky-100 text-sky-700"
                      title="Quick Actions"
                      description="Shortcuts for the most common institution workspace tasks."
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {quickActions.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        onClick={action.onClick}
                        className="rounded-xl border border-slate-200/60 bg-white p-3 text-left transition hover:border-sky-200 hover:bg-sky-50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${action.iconClassName}`}
                          >
                            {action.icon}
                          </div>
                          <ArrowUpRight className="h-4 w-4 text-slate-400" />
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{action.label}</p>
                        <p className="mt-1 text-xs text-slate-500">{action.description}</p>
                      </button>
                    ))}
                  </div>
                </article>

                <article className={cardClass}>
                  <div className="mb-3">
                    <SectionHeader
                      icon={<AlertTriangle className="h-4 w-4" />}
                      iconClassName="bg-amber-100 text-amber-700"
                      title="Operational Alerts"
                      description="Items that need attention to keep the institution workspace running smoothly."
                    />
                  </div>
                  {alerts.length === 0 ? (
                    <EmptyState
                      title="Everything looks in order"
                      description="No urgent operational alerts were detected for this workspace."
                    />
                  ) : (
                    <div className="space-y-2">
                      {alerts.map((alert) => (
                        <div
                          key={alert.id}
                          className={`rounded-xl border px-3 py-3 ${alert.tone}`}
                        >
                          <p className="text-sm font-semibold">{alert.title}</p>
                          <p className="mt-1 text-xs opacity-80">{alert.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                <article className={cardClass}>
                  <div className="mb-3">
                    <SectionHeader
                      icon={<GraduationCap className="h-4 w-4" />}
                      iconClassName="bg-violet-100 text-violet-700"
                      title="Plan Usage"
                      description="Capacity overview for the current institution plan."
                    />
                  </div>
                  <div className="space-y-3">
                    {usageRows.map((row) => {
                      const ratio = row.limit ? Math.min(row.current / row.limit, 1) : 0;
                      return (
                        <div key={row.label} className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                            <p className="text-xs font-semibold text-slate-600">
                              {row.current}
                              {row.limit ? ` / ${row.limit}` : " / Unlimited"}
                            </p>
                          </div>
                          {row.limit ? (
                            <>
                              <div className="mt-2 h-2 rounded-full bg-white">
                                <div
                                  className={`h-2 rounded-full ${row.tone}`}
                                  style={{ width: `${Math.max(ratio * 100, 6)}%` }}
                                />
                              </div>
                              <p className="mt-1 text-[11px] text-slate-500">
                                {Math.round(ratio * 100)}% used
                              </p>
                            </>
                          ) : (
                            <p className="mt-2 text-[11px] text-slate-500">
                              No fixed limit has been configured for this resource.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </article>

                <article className={cardClass}>
                  <div className="mb-3">
                    <SectionHeader
                      icon={<UserPlus className="h-4 w-4" />}
                      iconClassName="bg-sky-100 text-sky-700"
                      title="Link Teacher"
                      description="Add an existing platform user as a teacher in this institution."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700" htmlFor="institution-teacher-email">
                      Teacher email
                    </label>
                    <input
                      ref={teacherInputRef}
                      id="institution-teacher-email"
                      className={inputClass}
                      placeholder="teacher@institution.edu"
                      value={memberForm.teacherEmail}
                      onChange={(event) =>
                        setMemberForm((prev) => ({ ...prev, teacherEmail: event.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className={`w-full ${softButtonClass}`}
                      disabled={savingTeacher || !memberForm.teacherEmail.trim()}
                      onClick={() => void handleAddTeacher()}
                    >
                      {savingTeacher ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <PlusCircle className="h-3.5 w-3.5" />
                      )}
                      Add teacher
                    </button>
                  </div>
                </article>

                <article className={cardClass}>
                  <div className="mb-3">
                    <SectionHeader
                      icon={<Users className="h-4 w-4" />}
                      iconClassName="bg-emerald-100 text-emerald-700"
                      title="Link Student"
                      description="Add an existing platform user as a student in this institution."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700" htmlFor="institution-student-email">
                      Student email
                    </label>
                    <input
                      ref={studentInputRef}
                      id="institution-student-email"
                      className={inputClass}
                      placeholder="student@institution.edu"
                      value={memberForm.studentEmail}
                      onChange={(event) =>
                        setMemberForm((prev) => ({ ...prev, studentEmail: event.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className={`w-full ${softButtonClass}`}
                      disabled={savingStudent || !memberForm.studentEmail.trim()}
                      onClick={() => void handleAddStudent()}
                    >
                      {savingStudent ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <PlusCircle className="h-3.5 w-3.5" />
                      )}
                      Add student
                    </button>
                  </div>
                </article>

                <article className={cardClass} ref={pendingSectionRef}>
                  <div className="mb-3">
                    <SectionHeader
                      icon={<Clock3 className="h-4 w-4" />}
                      iconClassName="bg-amber-100 text-amber-700"
                      title="Pending Teacher Requests"
                      description="Approve teachers registered under this institution who are waiting for access."
                    />
                  </div>
                  {(data?.pendingTeacherRequests || []).length === 0 ? (
                    <EmptyState
                      title="No pending requests"
                      description="New teacher approval requests will appear here."
                    />
                  ) : (
                    <div className="space-y-2">
                      {data?.pendingTeacherRequests.map((request) => (
                        <div key={request.id} className={listItemClass}>
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex min-w-0 items-start gap-2.5">
                              <AvatarBadge
                                name={request.name}
                                avatarUrl={request.avatarUrl}
                                avatarEmoji={request.avatarEmoji}
                                toneClassName="bg-amber-50 text-amber-700"
                              />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">
                                  {request.name}
                                </p>
                                <p className="truncate text-xs text-slate-500">
                                  {request.email || "No email"}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                    Pending
                                  </span>
                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                    ID: {request.idNumber || "Not provided"}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-slate-600">
                                  WhatsApp: {request.whatsApp || "Not provided"}
                                </p>
                                <p className="mt-1 text-[11px] text-slate-500">
                                  Requested:{" "}
                                  {request.requestedAt
                                    ? request.requestedAt.toLocaleString("es-CO", {
                                        year: "numeric",
                                        month: "short",
                                        day: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })
                                    : "Recently"}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              className={softButtonClass}
                              disabled={approvingTeacherId === request.id}
                              onClick={() => void handleApproveTeacherRequest(request.id)}
                            >
                              {approvingTeacherId === request.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              )}
                              Approve
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              </div>

              <div className="space-y-4">
                <article className={cardClass}>
                  <div className="mb-3">
                    <SectionHeader
                      icon={<Building2 className="h-4 w-4" />}
                      iconClassName="bg-slate-100 text-slate-700"
                      title="Institution State"
                      description="Core workspace identity, ownership, and status details."
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Owner</p>
                      <div className="mt-2 flex items-center gap-2">
                        <AvatarBadge
                          name={data?.institution.ownerName || "Institution owner"}
                          avatarUrl={data?.institution.ownerAvatarUrl}
                          avatarEmoji={data?.institution.ownerAvatarEmoji}
                          toneClassName="bg-white text-slate-700"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {data?.institution.ownerName || "Institution owner"}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {data?.institution.ownerEmail || "No owner email"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</p>
                      <div className="mt-1">
                        <span
                          className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${planStatusMeta.className}`}
                        >
                          {planStatusMeta.label}
                        </span>
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Created</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {formatCompactDate(data?.institution.createdAt)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Updated</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {formatCompactDate(data?.institution.updatedAt)}
                      </p>
                    </div>
                  </div>
                </article>

                <article className={cardClass} ref={coursesSectionRef}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <SectionHeader
                      icon={<BookOpen className="h-4 w-4" />}
                      iconClassName="bg-violet-100 text-violet-700"
                      title="Courses and Teacher Assignment"
                      description="Assign a linked teacher to each institution-managed course."
                    />
                    <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {data?.courses.length || 0} courses
                    </span>
                  </div>
                  {(data?.courses || []).length === 0 ? (
                    <EmptyState
                      title="No institution courses yet"
                      description="Create courses from the dedicated course management page."
                      actionLabel="Create course"
                      onAction={() => navigate("/courses/create")}
                    />
                  ) : (
                    <div className="space-y-2">
                      <div className="flex flex-col gap-2 lg:flex-row">
                        <div className="relative flex-1">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                          <input
                            value={courseSearch}
                            onChange={(event) => setCourseSearch(event.target.value)}
                            placeholder="Search course, code, group, or teacher..."
                            className="w-full rounded-xl border border-slate-200/60 bg-white py-2 pl-9 pr-3 text-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          />
                        </div>
                        <select
                          value={courseFilter}
                          onChange={(event) =>
                            setCourseFilter(event.target.value as "all" | "assigned" | "unassigned")
                          }
                          className="rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                        >
                          <option value="all">All courses</option>
                          <option value="assigned">Assigned teacher</option>
                          <option value="unassigned">Unassigned teacher</option>
                        </select>
                      </div>
                      {filteredCourses.length === 0 ? (
                        <EmptyState
                          title="No matching courses"
                          description="Try a different search or filter for your institution courses."
                        />
                      ) : null}
                      {filteredCourses.map((course) => (
                        <div key={course.id} className={listItemClass}>
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {course.name} · {course.code}
                              </p>
                              <p className="text-xs text-slate-600">
                                {course.semester} · Group {course.group} · Students{" "}
                                {course.enrolledStudentsCount}
                              </p>
                              <p className="mt-1 text-[11px] text-slate-500">
                                Current teacher: {course.teacherName || "Unassigned"}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                  {course.enrolledStudentsCount} students
                                </span>
                                {course.teacherId ? (
                                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                    Assigned
                                  </span>
                                ) : (
                                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                    Needs teacher
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col gap-2 lg:items-end">
                              <select
                                className="h-11 min-w-[230px] rounded-xl border border-slate-200/60 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                                value={course.teacherId}
                                onChange={(event) =>
                                  void handleAssignTeacher(course.id, event.target.value)
                                }
                                disabled={assigningCourseId === course.id}
                              >
                                <option value="">Unassigned teacher</option>
                                {teacherOptions.map((teacher) => (
                                  <option key={teacher.id} value={teacher.id}>
                                    {teacher.name}
                                  </option>
                                ))}
                              </select>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => navigate(`/courses/view/${course.code}`)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/60 bg-white text-slate-600 transition-colors hover:border-sky-200 hover:text-sky-700"
                                  aria-label={`Open ${course.name}`}
                                >
                                  <ArrowUpRight className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => navigate(`/courses/${course.code}/edit`)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/60 bg-white text-slate-600 transition-colors hover:border-violet-200 hover:text-violet-700"
                                  aria-label={`Edit ${course.name}`}
                                >
                                  <BookOpen className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleCopy(course.code, "Course code")}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/60 bg-white text-slate-600 transition-colors hover:border-slate-300/60 hover:text-slate-900"
                                  aria-label={`Copy ${course.code}`}
                                >
                                  <Copy className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <article className={cardClass}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <SectionHeader
                    icon={<School className="h-4 w-4" />}
                    iconClassName="bg-sky-100 text-sky-700"
                    title="Teachers"
                    description="Review the teachers currently linked to the institution."
                  />
                  <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {data?.teachers.length || 0} linked
                  </span>
                </div>
                {(data?.teachers || []).length === 0 ? (
                  <EmptyState
                    title="No teachers linked yet"
                    description="Linked teachers will appear here once added."
                    actionLabel="Add teacher"
                    onAction={() => teacherInputRef.current?.focus()}
                  />
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-col gap-2 lg:flex-row">
                      <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <input
                          value={teacherSearch}
                          onChange={(event) => setTeacherSearch(event.target.value)}
                          placeholder="Search teacher name or email..."
                          className="w-full rounded-xl border border-slate-200/60 bg-white py-2 pl-9 pr-3 text-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                        />
                      </div>
                      <select
                        value={teacherFilter}
                        onChange={(event) =>
                          setTeacherFilter(
                            event.target.value as "all" | "managed" | "independent" | "idle",
                          )
                        }
                        className="rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                      >
                        <option value="all">All teachers</option>
                        <option value="managed">Institution managed</option>
                        <option value="independent">Independent</option>
                        <option value="idle">Without courses</option>
                      </select>
                    </div>
                    {filteredTeachers.length === 0 ? (
                      <EmptyState
                        title="No matching teachers"
                        description="Try a different search or filter for linked teachers."
                      />
                    ) : null}
                    {filteredTeachers.map((teacher) => (
                      <div key={teacher.id} className={listItemClass}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-2.5">
                            <AvatarBadge
                              name={teacher.name}
                              avatarUrl={teacher.avatarUrl}
                              avatarEmoji={teacher.avatarEmoji}
                              toneClassName="bg-sky-50 text-sky-700"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {teacher.name}
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                {teacher.email || "No email"}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                  Courses: {teacher.activeCoursesCount}
                                </span>
                                <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                                  {teacher.institutionManaged ? "Institution managed" : "Independent"}
                                </span>
                                {teacher.approvalStatus === "pending" ? (
                                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                    Pending
                                  </span>
                                ) : (
                                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                    Approved
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => window.open(`mailto:${teacher.email}`, "_self")}
                              disabled={!teacher.email}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/60 bg-white text-slate-600 transition-colors hover:border-sky-200 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label={`Email ${teacher.name}`}
                            >
                              <Mail className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleCopy(teacher.email, "Teacher email")}
                              disabled={!teacher.email}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/60 bg-white text-slate-600 transition-colors hover:border-slate-300/60 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label={`Copy ${teacher.name} email`}
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <article className={cardClass}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <SectionHeader
                    icon={<Users className="h-4 w-4" />}
                    iconClassName="bg-emerald-100 text-emerald-700"
                    title="Students"
                    description="Review the students currently assigned to the institution."
                  />
                  <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {data?.students.length || 0} linked
                  </span>
                </div>
                {(data?.students || []).length === 0 ? (
                  <EmptyState
                    title="No students linked yet"
                    description="Linked students will appear here once added."
                    actionLabel="Add student"
                    onAction={() => studentInputRef.current?.focus()}
                  />
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-col gap-2 lg:flex-row">
                      <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <input
                          value={studentSearch}
                          onChange={(event) => setStudentSearch(event.target.value)}
                          placeholder="Search student name or email..."
                          className="w-full rounded-xl border border-slate-200/60 bg-white py-2 pl-9 pr-3 text-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                        />
                      </div>
                      <select
                        value={studentFilter}
                        onChange={(event) =>
                          setStudentFilter(
                            event.target.value as "all" | "enrolled" | "without_courses",
                          )
                        }
                        className="rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                      >
                        <option value="all">All students</option>
                        <option value="enrolled">With courses</option>
                        <option value="without_courses">Without courses</option>
                      </select>
                    </div>
                    {filteredStudents.length === 0 ? (
                      <EmptyState
                        title="No matching students"
                        description="Try a different search or filter for linked students."
                      />
                    ) : null}
                    {filteredStudents.map((student) => (
                      <div key={student.id} className={listItemClass}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-2.5">
                            <AvatarBadge
                              name={student.name}
                              avatarUrl={student.avatarUrl}
                              avatarEmoji={student.avatarEmoji}
                              toneClassName="bg-emerald-50 text-emerald-700"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {student.name}
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                {student.email || "No email"}
                              </p>
                              <div className="mt-1">
                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                  Enrolled courses: {student.enrolledCoursesCount}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => window.open(`mailto:${student.email}`, "_self")}
                              disabled={!student.email}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/60 bg-white text-slate-600 transition-colors hover:border-emerald-200 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label={`Email ${student.name}`}
                            >
                              <Mail className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleCopy(student.email, "Student email")}
                              disabled={!student.email}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/60 bg-white text-slate-600 transition-colors hover:border-slate-300/60 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label={`Copy ${student.name} email`}
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </section>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
