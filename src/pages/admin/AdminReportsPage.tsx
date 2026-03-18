import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import * as XLSX from "xlsx";
import {
  Building2,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Download,
  FileBarChart2,
  Inbox,
  Loader2,
  School,
  ShieldCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { appendAdminAuditLog } from "@/lib/services/adminAuditLogService";
import { firebaseDB } from "@/lib/firebase";
import { assertAdminPermission } from "@/lib/services/adminPermissionGuardService";
import { getPendingAccountDeletionRequests } from "@/lib/services/accountDeletionService";
import { getAdminDirectoryDataset } from "@/lib/services/adminDirectoryService";
import {
  getContactMessages,
  type ContactMessageRecord,
} from "@/lib/services/contactMessageService";
import {
  getPricingContactRequests,
  type PricingContactRequestRecord,
} from "@/lib/services/pricingContactService";
import {
  getTeacherApprovalRequests,
  type TeacherApprovalRequestRecord,
} from "@/lib/services/teacherApprovalService";

type ReportSheet = {
  name: string;
  rows: Array<Record<string, unknown>>;
};

type PdfSection = {
  title: string;
  rows: Array<Record<string, unknown>>;
};

type ReportPack = {
  key: string;
  title: string;
  description: string;
  icon: typeof Users;
  iconTone: string;
  excelLabel: string;
  pdfLabel: string;
  summary: string;
  buildSheets: () => ReportSheet[];
  buildPdfSections: () => PdfSection[];
};

type ReportDataState = {
  users: Awaited<ReturnType<typeof getAdminDirectoryDataset>>["users"];
  approvals: TeacherApprovalRequestRecord[];
  deletions: Awaited<ReturnType<typeof getPendingAccountDeletionRequests>>;
  pricing: PricingContactRequestRecord[];
  contact: ContactMessageRecord[];
  courses: Array<Record<string, unknown>>;
  assessments: Array<Record<string, unknown>>;
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

const formatDate = (value: Date | null): string => {
  if (!value) return "Not set";
  return value.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatDateTime = (value: Date | null): string => {
  if (!value) return "Not set";
  return value.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const normalizeSheetRows = (rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> => {
  if (rows.length === 0) {
    return [{ status: "No records available" }];
  }

  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => {
        if (value instanceof Date) return [key, formatDateTime(value)];
        return [key, value ?? ""];
      }),
    ),
  );
};

const exportWorkbook = (filename: string, sheets: ReportSheet[]) => {
  const workbook = XLSX.utils.book_new();

  sheets.forEach((sheet) => {
    const normalized = normalizeSheetRows(sheet.rows);
    const worksheet = XLSX.utils.json_to_sheet(normalized);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
  });

  XLSX.writeFile(workbook, filename);
};

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const openPrintablePdfReport = (
  filename: string,
  title: string,
  subtitle: string,
  sections: PdfSection[],
) => {
  const generatedAt = formatDateTime(new Date());
  const sectionMarkup = sections
    .map((section) => {
      const rows = normalizeSheetRows(section.rows);
      const headers = Object.keys(rows[0] || {});
      const tableHead = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
      const tableBody = rows
        .map(
          (row) =>
            `<tr>${headers
              .map((header) => `<td>${escapeHtml(row[header])}</td>`)
              .join("")}</tr>`,
        )
        .join("");

      return `
        <section class="report-section">
          <h2>${escapeHtml(section.title)}</h2>
          <table>
            <thead><tr>${tableHead}</tr></thead>
            <tbody>${tableBody}</tbody>
          </table>
        </section>
      `;
    })
    .join("");

  const html = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 32px;
            color: #0f172a;
          }
          h1 {
            margin: 0;
            font-size: 24px;
          }
          .subtitle {
            margin-top: 6px;
            font-size: 13px;
            color: #475569;
          }
          .meta {
            margin-top: 10px;
            font-size: 12px;
            color: #64748b;
          }
          .report-section {
            margin-top: 28px;
            break-inside: avoid;
          }
          h2 {
            font-size: 15px;
            margin: 0 0 10px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
          }
          th,
          td {
            border: 1px solid #cbd5e1;
            padding: 8px;
            font-size: 11px;
            text-align: left;
            vertical-align: top;
            word-break: break-word;
          }
          th {
            background: #f8fafc;
            font-weight: 700;
          }
          @media print {
            body {
              margin: 18px;
            }
          }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p class="subtitle">${escapeHtml(subtitle)}</p>
        <p class="meta">Generated at ${escapeHtml(generatedAt)}. Suggested filename: ${escapeHtml(filename)}.</p>
        ${sectionMarkup}
        <script>
          window.addEventListener("load", function () {
            setTimeout(function () {
              window.print();
            }, 150);
          });
          window.addEventListener("afterprint", function () {
            setTimeout(function () {
              window.close();
            }, 150);
          });
          window.addEventListener("focus", function () {
            document.title = ${JSON.stringify(title)};
            document.body.setAttribute("data-filename", ${JSON.stringify(filename)});
          });
          window.addEventListener("pagehide", function () {
            if (window.__reportObjectUrl) {
              URL.revokeObjectURL(window.__reportObjectUrl);
            }
          });
          if (window.location.href.startsWith("blob:")) {
            window.__reportObjectUrl = window.location.href;
          };
        </script>
      </body>
    </html>
  `;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const printableWindow = window.open(objectUrl, "_blank", "noopener,noreferrer,width=1200,height=900");

  if (!printableWindow) {
    URL.revokeObjectURL(objectUrl);
    toast.error("Popup blocked. Allow popups to open the PDF print view.");
    return;
  }
};

const getRoleLabel = (role: string): string => {
  if (role === "docente") return "Teacher";
  if (role === "estudiante") return "Student";
  if (role === "admin") return "Admin";
  return role || "Unknown";
};

const getApprovalStatusLabel = (status: string | null | undefined): string => {
  if (!status) return "Not requested";
  if (status === "pending") return "Pending";
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return status;
};

const getPlanStatusLabel = (status: string): string => {
  if (!status) return "Not set";
  if (status === "pending_payment") return "Pending payment";
  return status.replace(/_/g, " ");
};

export default function AdminReportsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [reportData, setReportData] = useState<ReportDataState>({
    users: [],
    approvals: [],
    deletions: [],
    pricing: [],
    contact: [],
    courses: [],
    assessments: [],
  });

  useEffect(() => {
    let active = true;

    const loadReports = async () => {
      setLoading(true);
      const nextWarnings: string[] = [];
      const [
        directoryResult,
        approvalsResult,
        deletionsResult,
        pricingResult,
        contactResult,
        coursesResult,
        assessmentsResult,
      ] = await Promise.allSettled([
        getAdminDirectoryDataset(),
        getTeacherApprovalRequests(),
        getPendingAccountDeletionRequests(),
        getPricingContactRequests(),
        getContactMessages(),
        getDocs(collection(firebaseDB, "cursos")),
        getDocs(collection(firebaseDB, "assessments")),
      ]);

      if (!active) return;

      const users = directoryResult.status === "fulfilled" ? directoryResult.value.users : [];
      if (directoryResult.status === "fulfilled") {
        nextWarnings.push(...directoryResult.value.warnings);
      } else {
        nextWarnings.push("Could not load directory export data.");
      }
      if (approvalsResult.status === "rejected") nextWarnings.push("Could not load approval export data.");
      if (deletionsResult.status === "rejected") nextWarnings.push("Could not load deletion export data.");
      if (pricingResult.status === "rejected") nextWarnings.push("Could not load pricing export data.");
      if (contactResult.status === "rejected") nextWarnings.push("Could not load contact export data.");
      if (coursesResult.status === "rejected") nextWarnings.push("Could not load course export data.");
      if (assessmentsResult.status === "rejected") nextWarnings.push("Could not load assessment export data.");

      setWarnings(nextWarnings);
      setReportData({
        users,
        approvals: approvalsResult.status === "fulfilled" ? approvalsResult.value : [],
        deletions: deletionsResult.status === "fulfilled" ? deletionsResult.value : [],
        pricing: pricingResult.status === "fulfilled" ? pricingResult.value : [],
        contact: contactResult.status === "fulfilled" ? contactResult.value : [],
        courses:
          coursesResult.status === "fulfilled"
            ? coursesResult.value.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }))
            : [],
        assessments:
          assessmentsResult.status === "fulfilled"
            ? assessmentsResult.value.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }))
            : [],
      });
      setLoading(false);
    };

    void loadReports();

    return () => {
      active = false;
    };
  }, []);

  const institutionsSummaryRows = useMemo(() => {
    const grouped = new Map<
      string,
      { users: number; teachers: number; students: number; admins: number; paymentPending: number }
    >();

    reportData.users.forEach((user) => {
      if (!user.institutionName) return;
      const current = grouped.get(user.institutionName) || {
        users: 0,
        teachers: 0,
        students: 0,
        admins: 0,
        paymentPending: 0,
      };
      current.users += 1;
      if (user.role === "docente") current.teachers += 1;
      if (user.role === "estudiante") current.students += 1;
      if (user.role === "admin") current.admins += 1;
      if (user.teacherPlanStatus === "pending_payment") current.paymentPending += 1;
      grouped.set(user.institutionName, current);
    });

    return Array.from(grouped.entries())
      .map(([institution, values]) => ({
        institution,
        users: values.users,
        teachers: values.teachers,
        students: values.students,
        admins: values.admins,
        paymentPending: values.paymentPending,
      }))
      .sort((left, right) => right.users - left.users);
  }, [reportData.users]);

  const usersRows = useMemo(
    () =>
      reportData.users.map((user) => ({
        name: user.name,
        email: user.email,
        role: getRoleLabel(user.role),
        institution: user.institutionName || "No institution",
        approvalStatus: getApprovalStatusLabel(user.teacherApprovalStatus),
        plan: user.teacherPlanLabel,
        planStatus: getPlanStatusLabel(user.teacherPlanStatus),
        paymentMethod: user.paymentMethod || "Not set",
        activeCourses: user.activeCoursesCount,
        enrollments: user.enrolledCoursesCount,
      })),
    [reportData.users],
  );

  const missingInstitutionRows = useMemo(
    () =>
      reportData.users
        .filter((user) => user.institutionMissing)
        .map((user) => ({
          name: user.name,
          email: user.email,
          role: getRoleLabel(user.role),
          plan: user.teacherPlanLabel,
          approvalStatus: getApprovalStatusLabel(user.teacherApprovalStatus),
        })),
    [reportData.users],
  );

  const approvalRows = useMemo(
    () =>
      reportData.approvals.map((approval) => ({
        name: approval.name,
        email: approval.email,
        status: getApprovalStatusLabel(approval.status),
        requestedAt: formatDateTime(approval.requestedAt),
        plan: approval.teacherPlanId || approval.interestedPlan || "Not set",
        planStatus: getPlanStatusLabel(approval.teacherPlanStatus || ""),
        institution: approval.institutionName || "No institution",
        ownership: approval.institutionOwnership || "Not set",
        type: approval.institutionType || "Not set",
        paymentMethod: approval.paymentMethod || "Not set",
        whatsApp: approval.whatsApp || "Not set",
      })),
    [reportData.approvals],
  );

  const billingRows = useMemo(
    () =>
      reportData.users
        .filter((user) => user.role === "docente" || user.requestedRole === "docente")
        .map((user) => ({
          name: user.name,
          email: user.email,
          institution: user.institutionName || "No institution",
          plan: user.teacherPlanLabel,
          planStatus: getPlanStatusLabel(user.teacherPlanStatus),
          paymentMethod: user.paymentMethod || "Not set",
          approvalStatus: getApprovalStatusLabel(user.teacherApprovalStatus),
          activeCourses: user.activeCoursesCount,
          enrollments: user.enrolledCoursesCount,
        })),
    [reportData.users],
  );

  const inboxRows = useMemo(() => {
    const contactRows = reportData.contact.map((item) => ({
      source: "Contact",
      name: item.name,
      email: item.email,
      role: item.role,
      institution: item.institution || "No institution",
      subject: item.subject,
      status: item.status,
      createdAt: formatDateTime(item.createdAt),
      resolvedAt: formatDateTime(item.resolvedAt || null),
    }));

    const pricingRows = reportData.pricing.map((item) => ({
      source: "Pricing",
      name: item.name,
      email: item.email,
      role: item.role,
      institution: item.institutionName || "No institution",
      subject: item.interestedPlanId || "Pricing request",
      status: item.status,
      createdAt: formatDateTime(item.createdAt),
      resolvedAt: formatDateTime(item.resolvedAt || null),
    }));

    return [...contactRows, ...pricingRows].sort((left, right) =>
      String(right.createdAt).localeCompare(String(left.createdAt)),
    );
  }, [reportData.contact, reportData.pricing]);

  const academicCourseRows = useMemo(
    () =>
      reportData.courses.map((course) => ({
        code: String(course.code || "").trim() || "N/A",
        name: String(course.name || "").trim() || "Course",
        teacherName: String(course.teacherName || "").trim() || "Unassigned",
        teacherId: String(course.teacherId || "").trim() || "Not set",
        credits: Number(course.credits) || 0,
        enrolledStudents: Array.isArray(course.enrolledStudents) ? course.enrolledStudents.length : 0,
        classSlots: Array.isArray(course.classSchedule) ? course.classSchedule.length : 0,
      })),
    [reportData.courses],
  );

  const academicAssessmentRows = useMemo(
    () =>
      reportData.assessments.map((assessment) => ({
        id: String(assessment.id || "").trim(),
        name: String(assessment.name || assessment.title || "").trim() || "Assessment",
        courseId: String(assessment.courseId || "").trim() || "Not linked",
        dueDate: formatDateTime(toDate(assessment.dueDate)),
        createdAt: formatDateTime(toDate(assessment.createdAt)),
        type: String(assessment.type || assessment.category || "").trim() || "Not set",
      })),
    [reportData.assessments],
  );

  const deletionRows = useMemo(
    () =>
      reportData.deletions.map((item) => ({
        name: item.name,
        email: item.email,
        role: getRoleLabel(item.role),
        status: item.status,
        requestedAt: formatDateTime(item.requestedAt),
        scheduledDeletionAt: formatDateTime(item.scheduledDeletionAt),
        completedAt: formatDateTime(item.completedAt),
      })),
    [reportData.deletions],
  );

  const institutionsCount = institutionsSummaryRows.length;
  const totalExportPacks = 7;
  const totalRowsAvailable =
    usersRows.length +
    approvalRows.length +
    billingRows.length +
    inboxRows.length +
    academicCourseRows.length +
    academicAssessmentRows.length +
    deletionRows.length;

  const reportPacks = useMemo<ReportPack[]>(
    () => [
      {
        key: "users",
        title: "Users directory pack",
        description: "Global directory with role, institution, plan state, and activity coverage.",
        icon: Users,
        iconTone: "bg-sky-100 text-sky-700",
        excelLabel: "Export Excel",
        pdfLabel: "Export PDF",
        summary: `${usersRows.length} users`,
        buildSheets: () => [
          { name: "Users", rows: usersRows },
          { name: "Missing Institution", rows: missingInstitutionRows },
        ],
        buildPdfSections: () => [
          { title: "Users Directory", rows: usersRows },
          { title: "Missing Institution", rows: missingInstitutionRows },
        ],
      },
      {
        key: "institutions",
        title: "Institutions summary pack",
        description: "Organization coverage, member mix, and payment pending pressure by institution.",
        icon: Building2,
        iconTone: "bg-cyan-100 text-cyan-700",
        excelLabel: "Export Excel",
        pdfLabel: "Export PDF",
        summary: `${institutionsSummaryRows.length} institutions`,
        buildSheets: () => [
          { name: "Institutions", rows: institutionsSummaryRows },
          { name: "Missing Institution", rows: missingInstitutionRows },
        ],
        buildPdfSections: () => [
          { title: "Institutions Summary", rows: institutionsSummaryRows },
          { title: "Users Missing Institution", rows: missingInstitutionRows },
        ],
      },
      {
        key: "approvals",
        title: "Teacher approvals pack",
        description: "Teacher access requests with plan choice, institution metadata, and payment status.",
        icon: CheckCircle2,
        iconTone: "bg-violet-100 text-violet-700",
        excelLabel: "Export Excel",
        pdfLabel: "Export PDF",
        summary: `${approvalRows.length} approval records`,
        buildSheets: () => [{ name: "Teacher Approvals", rows: approvalRows }],
        buildPdfSections: () => [{ title: "Teacher Approval Pipeline", rows: approvalRows }],
      },
      {
        key: "billing",
        title: "Billing and plan registry",
        description: "Teacher plan allocation, payment method, and operational plan readiness.",
        icon: CreditCard,
        iconTone: "bg-emerald-100 text-emerald-700",
        excelLabel: "Export Excel",
        pdfLabel: "Export PDF",
        summary: `${billingRows.length} teacher billing rows`,
        buildSheets: () => [{ name: "Billing Registry", rows: billingRows }],
        buildPdfSections: () => [{ title: "Billing and Plan Registry", rows: billingRows }],
      },
      {
        key: "inbox",
        title: "Inbox and demand pack",
        description: "Contact and pricing demand in a single operational follow-up export.",
        icon: Inbox,
        iconTone: "bg-amber-100 text-amber-700",
        excelLabel: "Export Excel",
        pdfLabel: "Export PDF",
        summary: `${inboxRows.length} inbox records`,
        buildSheets: () => [
          {
            name: "Contact Messages",
            rows: reportData.contact.map((item) => ({
              name: item.name,
              email: item.email,
              role: item.role,
              institution: item.institution || "No institution",
              subject: item.subject,
              status: item.status,
              createdAt: formatDateTime(item.createdAt),
              resolvedAt: formatDateTime(item.resolvedAt || null),
            })),
          },
          {
            name: "Pricing Requests",
            rows: reportData.pricing.map((item) => ({
              name: item.name,
              email: item.email,
              role: item.role,
              institution: item.institutionName || "No institution",
              interestedPlanId: item.interestedPlanId || "Not set",
              desiredCourses: item.desiredCourses,
              desiredStudents: item.desiredStudents,
              status: item.status,
              createdAt: formatDateTime(item.createdAt),
              resolvedAt: formatDateTime(item.resolvedAt || null),
            })),
          },
        ],
        buildPdfSections: () => [
          { title: "Inbox Activity", rows: inboxRows },
        ],
      },
      {
        key: "academic",
        title: "Academic operations pack",
        description: "Courses and assessments exported together for operational review and QA.",
        icon: School,
        iconTone: "bg-indigo-100 text-indigo-700",
        excelLabel: "Export Excel",
        pdfLabel: "Export PDF",
        summary: `${academicCourseRows.length + academicAssessmentRows.length} academic rows`,
        buildSheets: () => [
          { name: "Courses", rows: academicCourseRows },
          { name: "Assessments", rows: academicAssessmentRows },
        ],
        buildPdfSections: () => [
          { title: "Courses", rows: academicCourseRows },
          { title: "Assessments", rows: academicAssessmentRows },
        ],
      },
      {
        key: "governance",
        title: "Governance queue pack",
        description: "Deletion queue, approvals, and unresolved inbox workload for executive follow-up.",
        icon: ShieldCheck,
        iconTone: "bg-rose-100 text-rose-700",
        excelLabel: "Export Excel",
        pdfLabel: "Export PDF",
        summary: `${deletionRows.length + approvalRows.length + inboxRows.length} governance rows`,
        buildSheets: () => [
          { name: "Pending Deletions", rows: deletionRows },
          { name: "Teacher Approvals", rows: approvalRows },
          { name: "Inbox Activity", rows: inboxRows },
        ],
        buildPdfSections: () => [
          { title: "Pending Deletions", rows: deletionRows },
          { title: "Teacher Approvals", rows: approvalRows },
          { title: "Inbox Activity", rows: inboxRows },
        ],
      },
    ],
    [
      academicAssessmentRows,
      academicCourseRows,
      approvalRows,
      billingRows,
      deletionRows,
      inboxRows,
      institutionsSummaryRows,
      missingInstitutionRows,
      reportData.contact,
      reportData.pricing,
      usersRows,
    ],
  );

  const handleExportExcel = (pack: ReportPack) => {
    try {
      assertAdminPermission(
        "exportReports",
        user?.email,
        "You do not have permission to export admin reports.",
      );
      const filename = `${pack.key}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      exportWorkbook(filename, pack.buildSheets());
      void appendAdminAuditLog({
        actorEmail: user?.email || "admin",
        actorName: user?.name || "Admin",
        action: "Exported report pack",
        category: "report",
        targetType: "report_pack",
        targetId: pack.key,
        targetLabel: pack.title,
        detail: `Excel • ${filename}`,
      }).catch(() => undefined);
      toast.success(`${pack.title} exported to Excel.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export report.");
    }
  };

  const handleExportPdf = (pack: ReportPack) => {
    try {
      assertAdminPermission(
        "exportReports",
        user?.email,
        "You do not have permission to export admin reports.",
      );
      const filename = `${pack.key}-${new Date().toISOString().slice(0, 10)}.pdf`;
      openPrintablePdfReport(
        filename,
        pack.title,
        "Use the browser print dialog and choose Save as PDF.",
        pack.buildPdfSections(),
      );
      void appendAdminAuditLog({
        actorEmail: user?.email || "admin",
        actorName: user?.name || "Admin",
        action: "Opened report print view",
        category: "report",
        targetType: "report_pack",
        targetId: pack.key,
        targetLabel: pack.title,
        detail: `PDF • ${filename}`,
      }).catch(() => undefined);
      toast.success("PDF print view opened.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export report.");
    }
  };

  return (
    <DashboardLayout contentClassName="pt-0 lg:pt-1">
      <div className="relative overflow-x-hidden">
        <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
        <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />

        <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <section className="space-y-4">
            <section className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
              <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-sky-200/35" />
              <div className="pointer-events-none absolute -right-24 -bottom-24 h-64 w-64 rounded-full bg-indigo-200/35" />

              <div className="relative space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                  <FileBarChart2 className="h-3.5 w-3.5" />
                  Admin Module
                </div>

                <div className="min-w-0">
                  <h1 className="mt-1 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                    Reports
                  </h1>
                  <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                    Export and reporting packs. Download admin datasets in Excel or open a print-ready PDF view.
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                        <Users className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{reportData.users.length}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Users indexed</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{institutionsCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Institutions covered</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                        <ClipboardList className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{totalExportPacks}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Export packs</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                        <Download className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{totalRowsAvailable}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Rows ready to export</p>
                  </div>
                </div>
              </div>
            </section>

            {loading ? (
              <div className="flex min-h-[320px] items-center justify-center">
                <div className="space-y-2 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
                  <p className="text-base font-semibold text-slate-900">Loading reporting packs</p>
                  <p className="text-sm text-slate-600">Preparing export-ready admin datasets</p>
                </div>
              </div>
            ) : (
              <>
                {warnings.length > 0 ? (
                  <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-700">
                    {warnings.join(" ")}
                  </div>
                ) : null}

                <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                  {reportPacks.map((pack) => {
                    const Icon = pack.icon;
                    return (
                      <article key={pack.key} className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="inline-flex items-center gap-1 rounded-full border border-slate-200/60 bg-slate-50 px-2 py-0.5">
                              <Icon className={`h-3.5 w-3.5 ${pack.iconTone.split(" ").at(-1) || "text-slate-700"}`} />
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                {pack.title}
                              </span>
                            </div>
                            <p className="mt-2 text-sm font-semibold text-slate-900">{pack.summary}</p>
                            <p className="mt-1 text-xs text-slate-500">{pack.description}</p>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => handleExportExcel(pack)}
                            className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <Download className="h-3.5 w-3.5" />
                              {pack.excelLabel}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExportPdf(pack)}
                            className="rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <Download className="h-3.5 w-3.5" />
                              {pack.pdfLabel}
                            </span>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </section>
              </>
            )}
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
