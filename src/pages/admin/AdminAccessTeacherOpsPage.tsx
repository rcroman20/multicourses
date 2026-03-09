import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { toast } from "sonner";
import { FileText, Users } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { firebaseDB } from "@/lib/firebase";
import { getTeacherPlanDefinition, resolveTeacherPlanId } from "@/lib/services/teacherPlanService";
import { AdminWorkspaceShell } from "@/pages/admin/components/AdminWorkspaceShell";
import { useAdminWorkspaceCounts } from "@/pages/admin/hooks/useAdminWorkspaceCounts";
import { AdminSectionHeader } from "@/pages/admin/components/common/AdminSectionHeader";
import { AdminMetricCard } from "@/pages/admin/components/common/AdminMetricCard";
import { AdminLoadingState } from "@/pages/admin/components/common/AdminLoadingState";
import { AdminEmptyState } from "@/pages/admin/components/common/AdminEmptyState";

type TeacherOpsCourseSnapshot = {
  id: string;
  name: string;
  code: string;
  group: string;
  semester: string;
  enrolledCount: number;
  assessmentsCount: number;
  gradeSheetsCount: number;
  gradesCount: number;
  filesCount: number;
  filesBytes: number;
};

type TeacherOpsSnapshot = {
  teacherId: string;
  name: string;
  email: string;
  approvalStatus: string;
  planLabel: string;
  planStatus: string;
  institutionName: string;
  institutionOwnership: string;
  institutionType: string;
  paymentMethod: string;
  courseCount: number;
  enrolledStudentsTotal: number;
  uniqueStudentsTotal: number;
  assessmentsTotal: number;
  gradeSheetsTotal: number;
  gradesTotal: number;
  filesTotal: number;
  filesBytesTotal: number;
  courses: TeacherOpsCourseSnapshot[];
};

type FirebaseUsageSnapshot = {
  trackedDocuments: number;
  teacherUsers: number;
  studentsUsers: number;
  courses: number;
  assessments: number;
  grades: number;
  gradeSheets: number;
  files: number;
  firestorePayloadBytes: number;
  filesReferencedBytes: number;
  recent7dAssessments: number;
  recent7dGrades: number;
  recent7dFiles: number;
  recent7dTeacherRequests: number;
  projectedMonthlyWrites: number;
};

const toText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

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

const toCountArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
};

const estimateObjectBytes = (value: unknown): number => {
  try {
    const json = JSON.stringify(value ?? {});
    return new TextEncoder().encode(json).length;
  } catch {
    return 0;
  }
};

export default function AdminAccessTeacherOpsPage() {
  const { counts } = useAdminWorkspaceCounts();
  const [teacherOpsSnapshots, setTeacherOpsSnapshots] = useState<TeacherOpsSnapshot[]>([]);
  const [firebaseUsageSnapshot, setFirebaseUsageSnapshot] = useState<FirebaseUsageSnapshot | null>(null);
  const [loadingTeacherOps, setLoadingTeacherOps] = useState(false);

  const loadTeacherOpsSnapshots = async () => {
    setLoadingTeacherOps(true);
    try {
      const readCollection = async (collectionName: string) => {
        try {
          const snap = await getDocs(collection(firebaseDB, collectionName));
          return snap.docs.map((item) => ({
            id: item.id,
            data: (item.data() || {}) as Record<string, unknown>,
          }));
        } catch {
          return [] as Array<{ id: string; data: Record<string, unknown> }>;
        }
      };

      const [users, courses, assessments, grades, gradeSheets, files] = await Promise.all([
        readCollection("usuarios"),
        readCollection("cursos"),
        readCollection("evaluaciones"),
        readCollection("notas"),
        readCollection("gradeSheets"),
        readCollection("course_files"),
      ]);

      const teachers = users.filter(({ data }) => {
        const role = toText(data.role).toLowerCase();
        const requestedRole = toText(data.requestedRole).toLowerCase();
        return role === "docente" || role === "teacher" || requestedRole === "docente";
      });

      const assessmentsPerCourse = new Map<string, number>();
      for (const record of assessments) {
        const courseId = toText(record.data.courseId);
        if (!courseId) continue;
        assessmentsPerCourse.set(courseId, (assessmentsPerCourse.get(courseId) || 0) + 1);
      }

      const gradesPerCourse = new Map<string, number>();
      for (const record of grades) {
        const courseId = toText(record.data.courseId);
        if (!courseId) continue;
        gradesPerCourse.set(courseId, (gradesPerCourse.get(courseId) || 0) + 1);
      }

      const gradeSheetsPerCourse = new Map<string, number>();
      for (const record of gradeSheets) {
        const courseId = toText(record.data.courseId);
        if (!courseId) continue;
        gradeSheetsPerCourse.set(courseId, (gradeSheetsPerCourse.get(courseId) || 0) + 1);
      }

      const filesPerCourse = new Map<string, { count: number; bytes: number }>();
      for (const record of files) {
        const courseId = toText(record.data.courseId);
        if (!courseId) continue;
        const current = filesPerCourse.get(courseId) || { count: 0, bytes: 0 };
        const sizeRaw = record.data.size;
        const sizeBytes =
          typeof sizeRaw === "number" && Number.isFinite(sizeRaw)
            ? Math.max(0, Math.floor(sizeRaw))
            : 0;
        filesPerCourse.set(courseId, {
          count: current.count + 1,
          bytes: current.bytes + sizeBytes,
        });
      }

      const coursesByTeacher = new Map<string, Array<{ id: string; data: Record<string, unknown> }>>();
      for (const course of courses) {
        const teacherId = toText(course.data.teacherId);
        if (!teacherId) continue;
        const bucket = coursesByTeacher.get(teacherId) || [];
        bucket.push(course);
        coursesByTeacher.set(teacherId, bucket);
      }

      const teacherSnapshots: TeacherOpsSnapshot[] = teachers
        .map((teacher) => {
          const teacherCoursesRaw = coursesByTeacher.get(teacher.id) || [];
          const uniqueStudents = new Set<string>();
          let enrolledStudentsTotal = 0;
          let assessmentsTotal = 0;
          let gradeSheetsTotal = 0;
          let gradesTotal = 0;
          let filesTotal = 0;
          let filesBytesTotal = 0;

          const courseSnapshots: TeacherOpsCourseSnapshot[] = teacherCoursesRaw.map((course) => {
            const courseId = course.id;
            const enrolled = toCountArray(course.data.enrolledStudents);
            for (const studentId of enrolled) uniqueStudents.add(studentId);
            enrolledStudentsTotal += enrolled.length;

            const assessmentsCount = assessmentsPerCourse.get(courseId) || 0;
            const gradeSheetsCount = gradeSheetsPerCourse.get(courseId) || 0;
            const gradesCount = gradesPerCourse.get(courseId) || 0;
            const filesStats = filesPerCourse.get(courseId) || { count: 0, bytes: 0 };

            assessmentsTotal += assessmentsCount;
            gradeSheetsTotal += gradeSheetsCount;
            gradesTotal += gradesCount;
            filesTotal += filesStats.count;
            filesBytesTotal += filesStats.bytes;

            return {
              id: courseId,
              name: toText(course.data.name) || "Untitled course",
              code: toText(course.data.code) || "No code",
              group: toText(course.data.group) || "No group",
              semester: toText(course.data.semester) || "No semester",
              enrolledCount: enrolled.length,
              assessmentsCount,
              gradeSheetsCount,
              gradesCount,
              filesCount: filesStats.count,
              filesBytes: filesStats.bytes,
            };
          });

          const planId = resolveTeacherPlanId(toText(teacher.data.teacherPlanId));
          const planLabel = planId ? getTeacherPlanDefinition(planId).label : "Not assigned";
          const planStatus = toText(teacher.data.teacherPlanStatus) || "Not set";
          const approvalStatus = toText(teacher.data.teacherApprovalStatus) || "Not set";

          return {
            teacherId: teacher.id,
            name: toText(teacher.data.name) || "Teacher",
            email: toText(teacher.data.email) || "No email",
            approvalStatus,
            planLabel,
            planStatus,
            institutionName: toText(teacher.data.teacherInstitutionName) || "Not provided",
            institutionOwnership: toText(teacher.data.teacherInstitutionOwnership) || "Not provided",
            institutionType: toText(teacher.data.teacherInstitutionType) || "Not provided",
            paymentMethod: toText(teacher.data.teacherPaymentMethod) || "Not provided",
            courseCount: courseSnapshots.length,
            enrolledStudentsTotal,
            uniqueStudentsTotal: uniqueStudents.size,
            assessmentsTotal,
            gradeSheetsTotal,
            gradesTotal,
            filesTotal,
            filesBytesTotal,
            courses: courseSnapshots.sort((a, b) => a.name.localeCompare(b.name)),
          };
        })
        .sort((a, b) => b.courseCount - a.courseCount || a.name.localeCompare(b.name));

      const now = Date.now();
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
      const isRecent = (value: unknown): boolean => {
        const date = toDate(value);
        if (!date) return false;
        return date.getTime() >= sevenDaysAgo;
      };

      const recent7dAssessments = assessments.filter(
        (item) => isRecent(item.data.createdAt) || isRecent(item.data.updatedAt),
      ).length;
      const recent7dGrades = grades.filter(
        (item) => isRecent(item.data.gradedAt) || isRecent(item.data.createdAt),
      ).length;
      const recent7dFiles = files.filter((item) => isRecent(item.data.uploadedAt)).length;
      const recent7dTeacherRequests = users.filter((item) => isRecent(item.data.teacherRequestedAt)).length;

      const trackedCollections = [users, courses, assessments, grades, gradeSheets, files];
      const trackedDocuments = trackedCollections.reduce((acc, list) => acc + list.length, 0);
      const firestorePayloadBytes = trackedCollections.reduce(
        (acc, list) => acc + list.reduce((inner, item) => inner + estimateObjectBytes(item.data), 0),
        0,
      );
      const filesReferencedBytes = files.reduce((acc, item) => {
        const sizeRaw = item.data.size;
        const sizeBytes =
          typeof sizeRaw === "number" && Number.isFinite(sizeRaw)
            ? Math.max(0, Math.floor(sizeRaw))
            : 0;
        return acc + sizeBytes;
      }, 0);

      const projectedMonthlyWrites = Math.round(
        ((recent7dAssessments + recent7dGrades + recent7dFiles + recent7dTeacherRequests) * 30) / 7,
      );

      const teacherUsers = users.filter(({ data }) => {
        const role = toText(data.role).toLowerCase();
        return role === "docente" || role === "teacher";
      }).length;
      const studentsUsers = users.filter(({ data }) => {
        const role = toText(data.role).toLowerCase();
        return role === "estudiante" || role === "student";
      }).length;

      setTeacherOpsSnapshots(teacherSnapshots);
      setFirebaseUsageSnapshot({
        trackedDocuments,
        teacherUsers,
        studentsUsers,
        courses: courses.length,
        assessments: assessments.length,
        grades: grades.length,
        gradeSheets: gradeSheets.length,
        files: files.length,
        firestorePayloadBytes,
        filesReferencedBytes,
        recent7dAssessments,
        recent7dGrades,
        recent7dFiles,
        recent7dTeacherRequests,
        projectedMonthlyWrites,
      });
    } catch {
      toast.error("Could not load teacher analytics data.");
    } finally {
      setLoadingTeacherOps(false);
    }
  };

  useEffect(() => {
    void loadTeacherOpsSnapshots();
  }, []);

  return (
    <DashboardLayout contentClassName="pt-0 lg:pt-1">
      <AdminWorkspaceShell activeTab="teacherOps" counts={counts}>
        <section className="space-y-4">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <AdminSectionHeader
              icon={FileText}
              iconClassName="border-indigo-200 bg-indigo-50 text-indigo-700"
              title="Firebase Usage (Estimated)"
              description="Operational control based on current Firestore data and recent platform activity."
            />

            {loadingTeacherOps ? (
              <AdminLoadingState message="Loading usage and teacher intelligence..." />
            ) : !firebaseUsageSnapshot ? (
              <AdminEmptyState message="No usage snapshot available yet." />
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <AdminMetricCard
                    label="Tracked docs"
                    value={firebaseUsageSnapshot.trackedDocuments.toLocaleString("en-US")}
                  />
                  <AdminMetricCard
                    label="Firestore payload (approx)"
                    value={formatBytes(firebaseUsageSnapshot.firestorePayloadBytes)}
                  />
                  <AdminMetricCard
                    label="Files referenced size"
                    value={formatBytes(firebaseUsageSnapshot.filesReferencedBytes)}
                  />
                  <AdminMetricCard
                    label="Projected writes / month"
                    value={firebaseUsageSnapshot.projectedMonthlyWrites.toLocaleString("en-US")}
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  These are platform-derived estimates for operational control. Official billing values must be
                  verified in Firebase Console billing reports.
                </p>
              </div>
            )}
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <AdminSectionHeader
              icon={Users}
              iconClassName="border-indigo-200 bg-indigo-50 text-indigo-700"
              title="Teachers, Courses, and Institutions"
              description="Full operational snapshot per teacher with courses, students, and assessments."
            />

            {loadingTeacherOps ? (
              <AdminLoadingState message="Loading teacher data..." />
            ) : teacherOpsSnapshots.length === 0 ? (
              <AdminEmptyState message="No teacher records available yet." />
            ) : (
              <div className="space-y-2">
                {teacherOpsSnapshots.map((teacher) => (
                  <article key={teacher.teacherId} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{teacher.name}</p>
                        <p className="text-xs text-slate-600">{teacher.email}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                          {teacher.planLabel}
                        </span>
                        <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                          Approval: {teacher.approvalStatus}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-700 md:grid-cols-4 xl:grid-cols-6">
                      <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                        Courses: <span className="font-semibold">{teacher.courseCount}</span>
                      </p>
                      <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                        Students: <span className="font-semibold">{teacher.uniqueStudentsTotal}</span>
                      </p>
                      <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                        Assessments: <span className="font-semibold">{teacher.assessmentsTotal}</span>
                      </p>
                      <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                        Grade sheets: <span className="font-semibold">{teacher.gradeSheetsTotal}</span>
                      </p>
                      <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                        Grades: <span className="font-semibold">{teacher.gradesTotal}</span>
                      </p>
                      <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                        Files: <span className="font-semibold">{teacher.filesTotal}</span> ({formatBytes(teacher.filesBytesTotal)})
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </article>
        </section>
      </AdminWorkspaceShell>
    </DashboardLayout>
  );
}
