import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import {
  AlertTriangle,
  BadgeCheck,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock3,
  GraduationCap,
  LayoutDashboard,
  MessageSquare,
  ShieldCheck,
  Users,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAcademic } from "@/contexts/AcademicContext";
import { firebaseDB } from "@/lib/firebase";
import {
  getPendingTeacherApprovalRequests,
  getTeacherApprovalRequests,
} from "@/lib/services/teacherApprovalService";
import { getTeacherPlanDefinition, resolveTeacherPlanId } from "@/lib/services/teacherPlanService";

type TeacherOpsRow = {
  teacherId: string;
  teacherName: string;
  coursesCount: number;
  studentsCount: number;
  classSlotsCount: number;
  dueSoonCount: number;
  overdueCount: number;
  workloadScore: number;
};

type TeacherPlanMeta = {
  courseLimit: number | null;
  studentLimit: number | null;
  expiresAt: Date | null;
  planLabel: string;
  avatarUrl: string;
  avatarEmoji: string;
};

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const addMonths = (value: Date, months: number): Date => {
  const next = new Date(value);
  next.setMonth(next.getMonth() + months);
  return next;
};

const formatShortDate = (value: Date | null): string =>
  value
    ? value.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Not set";

const getInitials = (name: string): string => {
  const tokens = name
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 2);
  if (tokens.length === 0) return "T";
  return tokens.map((token) => token.charAt(0).toUpperCase()).join("");
};

const resolveTeacherPlanFromRecord = (merged: Record<string, unknown>) => {
  const planIdRaw = String(merged.teacherPlanId || merged.teacherInterestedPlan || "").trim();
  const directPlanId = resolveTeacherPlanId(planIdRaw);
  if (directPlanId) return getTeacherPlanDefinition(directPlanId);

  const planNameRaw = String(merged.teacherPlanName || "").trim().toLowerCase();
  if (planNameRaw.includes("growth") || planNameRaw.includes("semiannual")) {
    return getTeacherPlanDefinition("growth");
  }
  if (planNameRaw.includes("scale") || planNameRaw.includes("annual")) {
    return getTeacherPlanDefinition("scale");
  }
  if (planNameRaw.includes("starter") || planNameRaw.includes("monthly")) {
    return getTeacherPlanDefinition("starter");
  }

  // Fallback to starter when plan data is missing so we never render "-" limits.
  return getTeacherPlanDefinition("starter");
};

const getLoadTone = (score: number): { text: string; badge: string } => {
  if (score >= 70) return { text: "text-rose-700", badge: "border-rose-200 bg-rose-50 text-rose-700" };
  if (score >= 50) return { text: "text-amber-700", badge: "border-amber-200 bg-amber-50 text-amber-700" };
  return { text: "text-emerald-700", badge: "border-emerald-200 bg-emerald-50 text-emerald-700" };
};

const getLoadLabel = (score: number): string => {
  if (score >= 70) return "High load";
  if (score >= 50) return "Balanced";
  return "Healthy";
};

export default function AdminAccessTeacherOpsPage() {
  const { courses, assessments, loading } = useAcademic();
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number | null>(null);
  const [paymentPendingCount, setPaymentPendingCount] = useState<number | null>(null);
  const [rejectedCount, setRejectedCount] = useState<number | null>(null);
  const [opsError, setOpsError] = useState("");
  const [teacherPlanMetaById, setTeacherPlanMetaById] = useState<Record<string, TeacherPlanMeta>>({});

  useEffect(() => {
    let isMounted = true;

    const loadTeacherOps = async () => {
      const [pendingResult, requestsResult] = await Promise.allSettled([
        getPendingTeacherApprovalRequests(),
        getTeacherApprovalRequests(),
      ]);

      if (!isMounted) return;

      if (pendingResult.status === "fulfilled") {
        setPendingApprovalsCount(pendingResult.value.length);
      } else {
        setPendingApprovalsCount(0);
        setOpsError("Could not load some teacher workflow counters.");
      }

      if (requestsResult.status === "fulfilled") {
        setPaymentPendingCount(
          requestsResult.value.filter((request) => request.status === "approved").length,
        );
        setRejectedCount(
          requestsResult.value.filter((request) => request.status === "rejected").length,
        );
      } else {
        setPaymentPendingCount(0);
        setRejectedCount(0);
        setOpsError("Could not load some teacher workflow counters.");
      }
    };

    void loadTeacherOps();

    return () => {
      isMounted = false;
    };
  }, []);

  const teacherRows = useMemo<TeacherOpsRow[]>(() => {
    const now = Date.now();
    const nextWeek = now + 7 * 24 * 60 * 60 * 1000;
    const byTeacher = new Map<string, TeacherOpsRow>();
    const courseTeacherMap = new Map<string, string>();

    courses.forEach((course) => {
      const teacherId = String(course.teacherId || "").trim();
      if (!teacherId) return;

      const teacherName = String(course.teacherName || "").trim() || "Teacher";
      const row = byTeacher.get(teacherId) || {
        teacherId,
        teacherName,
        coursesCount: 0,
        studentsCount: 0,
        classSlotsCount: 0,
        dueSoonCount: 0,
        overdueCount: 0,
        workloadScore: 0,
      };

      const studentsCount = Array.isArray(course.enrolledStudents) ? course.enrolledStudents.length : 0;
      const classSlotsCount = Array.isArray(course.classSchedule) ? course.classSchedule.length : 0;

      row.coursesCount += 1;
      row.studentsCount += studentsCount;
      row.classSlotsCount += classSlotsCount;
      row.teacherName = teacherName;

      byTeacher.set(teacherId, row);
      courseTeacherMap.set(String(course.id || ""), teacherId);
    });

    assessments.forEach((assessment) => {
      const courseId = String((assessment as { courseId?: unknown }).courseId || "");
      const teacherId = courseTeacherMap.get(courseId);
      if (!teacherId) return;

      const row = byTeacher.get(teacherId);
      if (!row) return;

      const dueDate = toDate((assessment as { dueDate?: unknown }).dueDate);
      if (!dueDate) return;

      const dueTimestamp = dueDate.getTime();
      if (dueTimestamp < now) row.overdueCount += 1;
      if (dueTimestamp >= now && dueTimestamp <= nextWeek) row.dueSoonCount += 1;
    });

    return Array.from(byTeacher.values())
      .map((row) => {
        const workloadScore = Math.min(
          100,
          Math.round(
            row.coursesCount * 12 +
              row.studentsCount * 0.9 +
              row.dueSoonCount * 8 +
              row.overdueCount * 15,
          ),
        );
        return { ...row, workloadScore };
      })
      .sort((a, b) => b.workloadScore - a.workloadScore);
  }, [assessments, courses]);

  const activeTeachersCount = teacherRows.length;
  const teacherAssignedCoursesCount = useMemo(
    () => courses.filter((course) => String(course.teacherId || "").trim().length > 0).length,
    [courses],
  );
  const unassignedCoursesCount = useMemo(
    () => courses.filter((course) => String(course.teacherId || "").trim().length === 0).length,
    [courses],
  );
  const coursesWithoutScheduleCount = useMemo(
    () =>
      courses.filter((course) => {
        const schedule = Array.isArray(course.classSchedule) ? course.classSchedule : [];
        return schedule.length === 0;
      }).length,
    [courses],
  );
  const teachersWithHighLoadCount = useMemo(
    () => teacherRows.filter((row) => row.workloadScore >= 70).length,
    [teacherRows],
  );

  useEffect(() => {
    let isMounted = true;
    const teacherIds = teacherRows.map((row) => row.teacherId);
    if (teacherIds.length === 0) {
      setTeacherPlanMetaById({});
      return;
    }

    const loadTeacherPlanMeta = async () => {
      const entries = await Promise.all(
        teacherIds.map(async (teacherId) => {
          const [userSnapResult, studentSnapResult] = await Promise.allSettled([
            getDoc(doc(firebaseDB, "usuarios", teacherId)),
            getDoc(doc(firebaseDB, "estudiantes", teacherId)),
          ]);

          const userData =
            userSnapResult.status === "fulfilled" && userSnapResult.value.exists()
              ? (userSnapResult.value.data() as Record<string, unknown>)
              : {};
          const studentData =
            studentSnapResult.status === "fulfilled" && studentSnapResult.value.exists()
              ? (studentSnapResult.value.data() as Record<string, unknown>)
              : {};
          const merged = { ...studentData, ...userData };

          const inferredPlan = resolveTeacherPlanFromRecord(merged);
          const courseLimit = toNumber(merged.teacherPlanCourseLimit) ?? inferredPlan.courseLimit;
          const studentLimit = toNumber(merged.teacherPlanStudentLimit) ?? inferredPlan.studentLimit;

          const explicitExpiresAt = toDate(merged.teacherPlanExpiresAt);
          const planStartAt =
            toDate(merged.teacherPlanAssignedAt) ||
            toDate(merged.teacherApprovedAt) ||
            toDate(merged.teacherRequestedAt) ||
            toDate(merged.createdAt);
          const expiresAt =
            explicitExpiresAt || (planStartAt ? addMonths(planStartAt, inferredPlan.durationMonths || 12) : null);
          const avatarUrl = String(merged.avatarUrl || merged.photoURL || merged.photoUrl || "").trim();
          const avatarEmoji = String(merged.avatarEmoji || "").trim();

          return [
            teacherId,
            {
              courseLimit,
              studentLimit,
              expiresAt,
              planLabel: inferredPlan.label,
              avatarUrl,
              avatarEmoji,
            },
          ] as const;
        }),
      );

      if (!isMounted) return;
      setTeacherPlanMetaById(Object.fromEntries(entries));
    };

    void loadTeacherPlanMeta();

    return () => {
      isMounted = false;
    };
  }, [teacherRows]);

  return (
    <DashboardLayout contentClassName="pt-0 lg:pt-1">
      <div className="relative overflow-x-hidden">
        <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
        <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />

        <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <section className="space-y-4">
            <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
              <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-sky-200/35" />
              <div className="pointer-events-none absolute -right-24 -bottom-24 h-64 w-64 rounded-full bg-indigo-200/35" />

              <div className="relative space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  Admin Module
                </div>

                <div className="min-w-0">
                  <h1 className="mt-1 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                    Teacher Ops
                  </h1>
                  <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                    Operational monitoring for teacher workload, delivery pressure, and workflow backlog.
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                        <Users className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{activeTeachersCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Active teachers</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                        <BookOpen className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{teacherAssignedCoursesCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Assigned courses</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                        <Clock3 className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">
                        {pendingApprovalsCount === null ? "..." : pendingApprovalsCount}
                      </p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Pending approvals</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700">
                        <BadgeCheck className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">
                        {paymentPendingCount === null ? "..." : paymentPendingCount}
                      </p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Payment pending</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Teacher Workload Snapshot</p>
                    <p className="text-xs text-slate-500">Current delivery pressure and scheduling indicators by teacher.</p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {teacherRows.length} teachers
                  </span>
                </div>

                {loading.assessments || loading.courses ? (
                  <div className="flex min-h-[260px] items-center justify-center">
                    <div className="space-y-2 text-center">
                      <Clock3 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
                      <p className="text-base font-semibold text-slate-900">Loading teacher operations</p>
                      <p className="text-sm text-slate-600">Building workload overview from live academic data</p>
                    </div>
                  </div>
                ) : teacherRows.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                    <Users className="mx-auto h-9 w-9 text-slate-400" />
                    <p className="mt-2 text-sm font-medium text-slate-700">No active teachers found</p>
                    <p className="text-xs text-slate-500">Assign teachers to courses to start operational monitoring.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {teacherRows.map((row) => {
                      const tone = getLoadTone(row.workloadScore);
                      const planMeta = teacherPlanMetaById[row.teacherId];
                      const avatarUrl = planMeta?.avatarUrl || "";
                      const avatarEmoji = planMeta?.avatarEmoji || "";
                      const courseLimit = planMeta?.courseLimit ?? null;
                      const studentLimit = planMeta?.studentLimit ?? null;
                      const remainingCourses =
                        courseLimit !== null ? Math.max(0, courseLimit - row.coursesCount) : null;
                      const remainingStudents =
                        studentLimit !== null ? Math.max(0, studentLimit - row.studentsCount) : null;
                      return (
                        <div
                          key={row.teacherId}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:border-slate-300 hover:bg-slate-50"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-sky-100 text-[11px] font-bold text-sky-700">
                                  {avatarUrl ? (
                                    <img
                                      src={avatarUrl}
                                      alt={`${row.teacherName} avatar`}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <span>{avatarEmoji || getInitials(row.teacherName)}</span>
                                  )}
                                </div>
                                <p className="truncate text-sm font-semibold text-slate-900">{row.teacherName}</p>
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone.badge}`}>
                                  {getLoadLabel(row.workloadScore)}
                                </span>
                              </div>
                              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-slate-600 sm:grid-cols-4">
                                <p>Courses: {row.coursesCount}</p>
                                <p>Students: {row.studentsCount}</p>
                                <p>Due 7d: {row.dueSoonCount}</p>
                                <p>Overdue: {row.overdueCount}</p>
                              </div>
                              <div className="mt-1 grid grid-cols-1 gap-x-3 gap-y-0.5 text-xs text-slate-600 sm:grid-cols-3">
                                <p>
                                  Course usage:{" "}
                                  <span className="font-semibold text-slate-800">
                                    {courseLimit === null ? `${row.coursesCount} / 0` : `${row.coursesCount} / ${courseLimit}`}
                                  </span>
                                  {remainingCourses !== null ? (
                                    <span className="ml-1 text-slate-500">({remainingCourses} left)</span>
                                  ) : null}
                                </p>
                                <p>
                                  Students out of:{" "}
                                  <span className="font-semibold text-slate-800">
                                    {studentLimit === null ? `${row.studentsCount} / 0` : `${row.studentsCount} / ${studentLimit}`}
                                  </span>
                                  {remainingStudents !== null ? (
                                    <span className="ml-1 text-slate-500">({remainingStudents} left)</span>
                                  ) : null}
                                </p>
                                <p>
                                  Plan expires:{" "}
                                  <span className="font-semibold text-slate-800">
                                    {formatShortDate(planMeta?.expiresAt || null)}
                                  </span>
                                </p>
                              </div>
                              <p className="mt-0.5 text-[10px] text-slate-500">
                                Plan: <span className="font-semibold text-slate-700">{planMeta?.planLabel || "Starter Annual"}</span>
                              </p>
                            </div>
                            <p className={`text-lg font-extrabold ${tone.text}`}>{row.workloadScore}</p>
                          </div>
                          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                row.workloadScore >= 70
                                  ? "bg-rose-600"
                                  : row.workloadScore >= 50
                                    ? "bg-amber-600"
                                    : "bg-emerald-600"
                              }`}
                              style={{ width: `${row.workloadScore}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Operational Flags</p>
                    <p className="text-xs text-slate-500">Queue pressure and delivery risk signals.</p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    Monitor
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Pending approvals</p>
                    <p className="text-sm font-bold text-amber-700">{pendingApprovalsCount ?? "..."}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Payment pending</p>
                    <p className="text-sm font-bold text-sky-700">{paymentPendingCount ?? "..."}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Unassigned courses</p>
                    <p className="text-sm font-bold text-rose-700">{unassignedCoursesCount}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">No schedule</p>
                    <p className="text-sm font-bold text-amber-700">{coursesWithoutScheduleCount}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">High load teachers</p>
                    <p className="text-sm font-bold text-rose-700">{teachersWithHighLoadCount}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Rejected requests</p>
                    <p className="text-sm font-bold text-slate-700">{rejectedCount ?? "..."}</p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2">
                  <Link
                    to="/admin/teacher-approvals"
                    className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-center text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                  >
                    Open Teacher Approvals
                  </Link>
                  <Link
                    to="/admin/admins"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Open Admin Emails
                  </Link>
                </div>

                {opsError ? (
                  <p className="mt-2 text-xs text-amber-700">
                    <MessageSquare className="mr-1 inline h-3.5 w-3.5" />
                    {opsError}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />
                    Monitoring stream active.
                  </p>
                )}
              </article>
            </section>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
