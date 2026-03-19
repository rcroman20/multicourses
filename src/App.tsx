// src/App.tsx
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, matchPath, useParams } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AcademicProvider } from "@/contexts/AcademicContext";
import { useAuth } from "@/contexts/AuthContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AdminRoute } from "@/components/auth/AdminRoute";
import { AdminPermissionRoute } from "@/components/auth/AdminPermissionRoute";
import { CookieConsentBanner } from "@/components/common/CookieConsentBanner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  ADMIN_PLATFORM_NAME_COOKIE,
  ADMIN_PLATFORM_NAME_STORAGE_KEY,
  ADMIN_PLATFORM_SETTINGS_STORAGE_KEY,
  DEFAULT_PLATFORM_NAME,
  DEFAULT_PWA_BACKGROUND_COLOR,
  DEFAULT_PWA_COURSES_LABEL,
  DEFAULT_PWA_GRADES_LABEL,
  DEFAULT_PWA_SHORT_NAME,
  DEFAULT_SITE_DESCRIPTION,
  DEFAULT_THEME_COLOR,
  type AdminPlatformSettings,
  resolveHexColor,
  resolvePlatformFaviconUrl,
  resolvePlatformShareImageUrl,
  resolvePlatformThemeColor,
  resolvePlatformTouchIconUrl,
  useAdminPlatformSettings,
} from "@/lib/services/adminSettingsService";
import { isAdminEmail } from "@/lib/services/adminAccessService";



// Importar páginas en orden lógico
// 1. Páginas públicas
const Index = lazy(() => import("./pages/shared/Index"));
const AboutPage = lazy(() => import("./pages/shared/AboutPage"));
const ContactPage = lazy(() => import("./pages/shared/ContactPage"));
const NotFound = lazy(() => import("./pages/shared/NotFound"));
const AuthPage = lazy(() => import("./pages/shared/AuthPage"));
const TeacherPlanDetailPage = lazy(() => import("./pages/shared/TeacherPlanDetailPage"));
const MaintenancePage = lazy(() => import("./pages/shared/MaintenancePage"));
const PrivacyPolicyPage = lazy(() => import("./pages/shared/PrivacyPolicyPage"));
const TermsConditionsPage = lazy(() => import("./pages/shared/TermsConditionsPage"));
const CookiesPolicyPage = lazy(() => import("./pages/shared/CookiesPolicyPage"));

// 2. Dashboards principales
const StudentDashboard = lazy(() => import("./pages/students/StudentDashboard"));
const TeacherDashboard = lazy(() => import("./pages/teacher/TeacherDashboard"));
const InstitutionDashboardPage = lazy(() => import("./pages/institution/InstitutionDashboardPage"));
const InstitutionAnalyticsPage = lazy(() => import("./pages/institution/InstitutionAnalyticsPage"));
 
// 3. Páginas compartidas (estudiantes y profesores)
const CoursesPage = lazy(() => import("./pages/shared/CoursesPage"));
const GradesPage = lazy(() => import("./pages/shared/GradesPage"));
const SlidesPage = lazy(() => import("./pages/shared/SlidesPage"));
const CalendarPage = lazy(() => import("./pages/shared/CalendarPage"));
const AssessmentsPage = lazy(() => import("./pages/shared/AssessmentsPage"));
const AssessmentDetailPage = lazy(() => import("./pages/shared/AssessmentDetailPage"));

const FileManager = lazy(() => import("./pages/shared/FileManager"));
const ExerciseBankPage = lazy(() => import("./pages/shared/ExerciseBankPage"));
const ExerciseQuizStatsPage = lazy(() => import("./pages/teacher/ExerciseQuizStatsPage"));
const ProfileSettingsPage = lazy(() => import("./pages/shared/ProfileSettingsPage"));
const AdminDashboardPage = lazy(() => import("./pages/admin/AdminDashboardPage"));
const AdminAccessAdminsPage = lazy(() => import("./pages/admin/AdminAccessAdminsPage"));
const AdminAccessTeacherApprovalsPage = lazy(() => import("./pages/admin/AdminAccessTeacherApprovalsPage"));
const AdminAccessTeacherOpsPage = lazy(() => import("./pages/admin/AdminAccessTeacherOpsPage"));
const AdminAccessDeletionsPage = lazy(() => import("./pages/admin/AdminAccessDeletionsPage"));
const AdminAccessInboxPage = lazy(() => import("./pages/admin/AdminSupportConversationsPage"));
const AdminSettingsPage = lazy(() => import("./pages/admin/AdminSettingsPage"));
const AdminBillingPage = lazy(() => import("./pages/admin/AdminBillingPage"));
const AdminInstitutionsPage = lazy(() => import("./pages/admin/AdminInstitutionsPage"));
const AdminUsersPage = lazy(() => import("./pages/admin/AdminUsersPage"));
const AdminReportsPage = lazy(() => import("./pages/admin/AdminReportsPage"));
const AdminBackupsPage = lazy(() => import("./pages/admin/AdminBackupsPage"));
const AdminAuditLogPage = lazy(() => import("./pages/admin/AdminAuditLogPage"));
const AdminInstitutionDetailPage = lazy(() => import("./pages/admin/AdminInstitutionDetailPage"));
const AdminPermissionsPage = lazy(() => import("./pages/admin/AdminPermissionsPage"));
const AdminNotificationsPage = lazy(() => import("./pages/admin/AdminNotificationsPage"));
const TeacherApprovalWaitingPage = lazy(() => import("./pages/shared/TeacherApprovalWaitingPage"));

// 4. Páginas exclusivas de profesores (organizadas por categoría)
// 4.1 Gestión de cursos
const CreateCoursePage = lazy(() => import("./pages/teacher/CreateCoursePage"));
const CoursesEditPage = lazy(() => import("./pages/teacher/CoursesEditPage"));

// 4.2 Gestión de estudiantes
const StudentsList = lazy(() => import("./pages/teacher/StudentsList"));
const StudentDetailPage = lazy(() => import("./pages/teacher/StudentDetailPage"));
const EnrollStudentPage = lazy(() => import("./pages/teacher/EnrollStudentPage"));

// 4.3 Gestión de calificaciones
const GradeSheetsPage = lazy(() => import("./pages/teacher/GradeSheetsPage"));
const GradeSheetEditPage = lazy(() => import("./pages/teacher/GradeSheetEditPage"));

// 4.4 Estadísticas
const StatsPage = lazy(() => import("./pages/teacher/StatsPage"));
const NotificationsPage = lazy(() => import("./pages/teacher/NotificationsPage"));

const queryClient = new QueryClient();
const DEFAULT_APP_NAME = DEFAULT_PLATFORM_NAME;
const DEFAULT_MANIFEST_DESCRIPTION =
  "Academic operations platform for teachers, students, admins, and institutions.";

type TitleRule = {
  path: string;
  title: string | ((params: Record<string, string | undefined>) => string);
};

const inferImageMimeType = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  if (normalized.endsWith(".svg")) return "image/svg+xml";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".ico")) return "image/x-icon";
  return "image/png";
};

const toManifestDataUrl = (manifest: Record<string, unknown>): string =>
  `data:application/manifest+json;charset=utf-8,${encodeURIComponent(JSON.stringify(manifest))}`;

const buildDynamicManifest = (settings: AdminPlatformSettings): Record<string, unknown> => {
  const platformName = String(settings.platformName || "").trim() || DEFAULT_PLATFORM_NAME;
  const shortName =
    String(settings.pwaShortName || "").trim() ||
    (platformName.length > 18 ? `${platformName.slice(0, 17).trim()}…` : platformName) ||
    DEFAULT_PWA_SHORT_NAME;
  const themeColor = resolvePlatformThemeColor(settings.themeColor || DEFAULT_THEME_COLOR);
  const backgroundColor = resolveHexColor(
    settings.pwaBackgroundColor || DEFAULT_PWA_BACKGROUND_COLOR,
    DEFAULT_PWA_BACKGROUND_COLOR,
  );
  const description =
    String(settings.siteDescription || "").trim() ||
    DEFAULT_SITE_DESCRIPTION ||
    DEFAULT_MANIFEST_DESCRIPTION;
  const coursesShortcutLabel =
    String(settings.pwaCoursesShortcutLabel || "").trim() || DEFAULT_PWA_COURSES_LABEL;
  const gradesShortcutLabel =
    String(settings.pwaGradesShortcutLabel || "").trim() || DEFAULT_PWA_GRADES_LABEL;
  const icon192 = resolvePlatformTouchIconUrl(settings.touchIconUrl || settings.logoUrl);
  const icon512 = resolvePlatformShareImageUrl(settings.shareImageUrl || settings.logoUrl);
  const icon192Type = inferImageMimeType(icon192);
  const icon512Type = inferImageMimeType(icon512);

  return {
    id: "/",
    name: platformName,
    short_name: shortName,
    description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: backgroundColor,
    theme_color: themeColor,
    orientation: "portrait",
    icons: [
      {
        src: icon192,
        sizes: "192x192",
        type: icon192Type,
        purpose: "any",
      },
      {
        src: icon512,
        sizes: "512x512",
        type: icon512Type,
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: coursesShortcutLabel,
        short_name: coursesShortcutLabel,
        url: "/courses",
        icons: [{ src: icon192, sizes: "192x192", type: icon192Type }],
      },
      {
        name: gradesShortcutLabel,
        short_name: gradesShortcutLabel,
        url: "/grades",
        icons: [{ src: icon192, sizes: "192x192", type: icon192Type }],
      },
    ],
  };
};



const titleRules: TitleRule[] = [
  { path: "/", title: "Home" },
  { path: "/about", title: "About" },
  { path: "/acerca-de", title: "Acerca de" },
  { path: "/contact", title: "Contact" },
  { path: "/privacy-policy", title: "Privacy Policy" },
  { path: "/terms-and-conditions", title: "Terms & Conditions" },
  { path: "/cookies-policy", title: "Cookies Policy" },
  { path: "/plans/:planId", title: "Teacher Plan Detail" },
  { path: "/auth", title: "Authentication" },
  { path: "/maintenance", title: "Maintenance" },
  { path: "/teacher-approval-waiting", title: "Teacher Approval Pending" },
  { path: "/teacher-approval-rejected", title: "Teacher Approval Rejected" },
  { path: "/student", title: "Students Dashboard" },
  { path: "/teacher", title: "Teacher Dashboard" },
  { path: "/institution", title: "Institution Dashboard" },
  { path: "/institution/analytics", title: "Institution Analytics" },
  { path: "/courses", title: "Courses" },
  {
    path: "/courses/view/:courseCode",
    title: ({ courseCode }) => `Course Detail ${courseCode ? `(${courseCode})` : ""}`.trim(),
  },
  { path: "/courses/create", title: "Create Course" },
  { path: "/courses/:courseCode/edit", title: "Edit Course" },
  {
    path: "/courses/:courseCode/files",
    title: ({ courseCode }) => `Files ${courseCode ? `(${courseCode})` : ""}`.trim(),
  },
  {
    path: "/courses/:courseCode/exercise-bank/stats",
    title: ({ courseCode }) => `Exercise Quiz Statistics ${courseCode ? `(${courseCode})` : ""}`.trim(),
  },
  {
    path: "/courses/:courseCode/exercise-bank",
    title: ({ courseCode }) => `Exercise Bank ${courseCode ? `(${courseCode})` : ""}`.trim(),
  },
  {
    path: "/courses/:courseCode/assessments/:assessmentId/:tab",
    title: "Assessment Detail",
  },
  {
    path: "/courses/:courseCode/assessments/:assessmentId",
    title: "Assessment Detail",
  },
  {
    path: "/courses/:courseCode/assessments",
    title: ({ courseCode }) => `Assessments ${courseCode ? `(${courseCode})` : ""}`.trim(),
  },
  { path: "/grades", title: "Grades" },
  { path: "/slides", title: "Slides" },
  { path: "/calendar", title: "Calendar" },
  { path: "/profile", title: "Profile" },
  { path: "/teacher/profile/:userId", title: "Profile" },
  { path: "/student/profile/:userId", title: "Profile" },
  { path: "/students/list", title: "Students List" },
  { path: "/students/:studentId", title: "Student Detail" },
  { path: "/students/:studentId/enroll", title: "Enroll Student" },
  {
    path: "/courses/:courseCode/grade-sheets",
    title: ({ courseCode }) => `Grade Sheets ${courseCode ? `(${courseCode})` : ""}`.trim(),
  },
  {
    path: "/courses/:courseCode/grade-sheets/new",
    title: ({ courseCode }) => `Grade Sheets ${courseCode ? `(${courseCode})` : ""}`.trim(),
  },
  {
    path: "/courses/:courseCode/grade-sheets/:gradeSheetId/edit",
    title: "Edit Grade Sheet",
  },
  { path: "/statistics", title: "Academic Statistics" },
  { path: "/teacher/notifications", title: "Notifications Center" },
  { path: "/admin", title: "Admin Access" },
  { path: "/admin/dashboard", title: "Admin Dashboard" },
  { path: "/admin/admins", title: "Admin Emails" },
  { path: "/admin/teacher-approvals", title: "Access Approvals" },
  { path: "/admin/teacher-ops", title: "Teacher Operations" },
  { path: "/admin/deletions", title: "Deletion Requests" },
  { path: "/admin/inbox", title: "Admin Inbox" },
  { path: "/admin/support-conversations", title: "Support Conversations" },
  { path: "/admin/settings", title: "Settings" },
  { path: "/admin/billing", title: "Billing" },
  { path: "/admin/institutions", title: "Institutions" },
  { path: "/admin/institutions/:institutionKey", title: "Institution Detail" },
  { path: "/admin/users", title: "Users Directory" },
  { path: "/admin/reports", title: "Reports" },
  { path: "/admin/backups", title: "Backups" },
  { path: "/admin/audit-log", title: "Audit Log" },
  { path: "/admin/notifications", title: "Notifications" },
  { path: "/admin/permissions", title: "Permissions" },
  { path: "*", title: "Page Not Found" },
];

function getDocumentTitle(pathname: string, appName: string = DEFAULT_APP_NAME): string {
  for (const rule of titleRules) {
    const match = matchPath({ path: rule.path, end: true }, pathname);
    if (match) {
      const pageTitle =
        typeof rule.title === "function" ? rule.title(match.params) : rule.title;
      return `${pageTitle} | ${appName}`;
    }
  }

  return appName;
}

function DocumentTitleManager() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { settings } = useAdminPlatformSettings();
  const appName = String(settings.platformName || "").trim() || DEFAULT_APP_NAME;

  useEffect(() => {
    const isProfilePath =
      pathname === "/profile" ||
      pathname.startsWith("/teacher/profile/") ||
      pathname.startsWith("/student/profile/");

    if (isProfilePath && user?.name) {
      document.title = `${user.name} | ${appName}`;
      return;
    }

    document.title = getDocumentTitle(pathname, appName);
  }, [appName, pathname, user?.name]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(ADMIN_PLATFORM_NAME_STORAGE_KEY, appName);
      const rawStoredSettings = window.localStorage.getItem(ADMIN_PLATFORM_SETTINGS_STORAGE_KEY);
      const parsedStoredSettings =
        rawStoredSettings && rawStoredSettings.trim().length > 0
          ? JSON.parse(rawStoredSettings)
          : {};
      window.localStorage.setItem(
        ADMIN_PLATFORM_SETTINGS_STORAGE_KEY,
        JSON.stringify({
          ...(parsedStoredSettings && typeof parsedStoredSettings === "object"
            ? parsedStoredSettings
            : {}),
          platformName: appName,
        }),
      );
      document.cookie = `${ADMIN_PLATFORM_NAME_COOKIE}=${encodeURIComponent(appName)}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // Ignore storage write failures so title updates continue to work.
    }
  }, [appName]);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const message = {
      type: "SET_PLATFORM_NAME",
      platformName: appName,
    };

    const sendToWorker = async () => {
      try {
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage(message);
          return;
        }

        const registration = await navigator.serviceWorker.ready;
        registration.active?.postMessage(message);
        registration.waiting?.postMessage(message);
        registration.installing?.postMessage(message);
      } catch {
        // Ignore service worker messaging failures so app rendering continues.
      }
    };

    void sendToWorker();
  }, [appName]);

  return null;
}

function BrandAssetsManager() {
  const { settings } = useAdminPlatformSettings();

  useEffect(() => {
    const faviconHref = resolvePlatformFaviconUrl(settings.faviconUrl || settings.logoUrl);
    const touchIconHref = resolvePlatformTouchIconUrl(settings.touchIconUrl || settings.logoUrl);
    const themeColor = resolvePlatformThemeColor(settings.themeColor);
    const faviconType = faviconHref.endsWith(".svg")
      ? "image/svg+xml"
      : faviconHref.endsWith(".ico")
        ? "image/x-icon"
        : "image/png";
    const faviconSizes = faviconHref.endsWith(".svg") ? "any" : "32x32";

    const ensureLink = (
      selector: string,
      rel: string,
      sizes?: string,
      type?: string,
    ): HTMLLinkElement => {
      const existing = document.head.querySelector(selector);
      if (existing instanceof HTMLLinkElement) return existing;
      const link = document.createElement("link");
      link.rel = rel;
      if (sizes) link.sizes = sizes;
      if (type) link.type = type;
      document.head.appendChild(link);
      return link;
    };

    const favicon = ensureLink('link[rel="icon"]', "icon", faviconSizes, faviconType);
    favicon.href = faviconHref;
    favicon.type = faviconType;
    favicon.sizes.value = faviconSizes;

    const shortcutIcon = ensureLink('link[rel="shortcut icon"]', "shortcut icon", faviconSizes, faviconType);
    shortcutIcon.href = faviconHref;
    shortcutIcon.type = faviconType;

    const appleTouch = ensureLink(
      'link[rel="apple-touch-icon"]',
      "apple-touch-icon",
      "180x180",
    );
    appleTouch.href = touchIconHref;

    const existingThemeColor = document.head.querySelector('meta[name="theme-color"]');
    const themeMeta =
      existingThemeColor instanceof HTMLMetaElement
        ? existingThemeColor
        : (() => {
            const meta = document.createElement("meta");
            meta.name = "theme-color";
            document.head.appendChild(meta);
            return meta;
          })();
    themeMeta.content = themeColor;
  }, [settings.faviconUrl, settings.logoUrl, settings.themeColor, settings.touchIconUrl]);

  return null;
}

function ManifestManager() {
  const { settings } = useAdminPlatformSettings();

  useEffect(() => {
    const selector = 'link[rel="manifest"]';
    const existing = document.head.querySelector(selector);
    const manifestLink =
      existing instanceof HTMLLinkElement
        ? existing
        : (() => {
            const link = document.createElement("link");
            link.rel = "manifest";
            document.head.appendChild(link);
            return link;
          })();

    manifestLink.href = toManifestDataUrl(buildDynamicManifest(settings));
  }, [settings]);

  return null;
}

function GradeSheetsNewRedirect() {
  const { courseCode } = useParams<{ courseCode: string }>();
  return <Navigate to={`/courses/${courseCode || ""}/grade-sheets`} replace />;
}

function HomeworkAssessmentsRedirect() {
  const { courseCode } = useParams<{ courseCode: string }>();
  return <Navigate to={`/courses/${courseCode || ""}/assessments`} replace />;
}

function HomeworkAssessmentDetailRedirect() {
  const { courseCode, assessmentId } = useParams<{ courseCode: string; assessmentId: string }>();
  return <Navigate to={`/courses/${courseCode || ""}/assessments/${assessmentId || ""}/overview`} replace />;
}

const resolveRoleHomePath = (role?: string): string => {
  if (role === "docente") return "/teacher";
  if (role === "admin") return "/admin/dashboard";
  if (role === "institucion") return "/institution";
  if (role === "estudiante") return "/student";
  return "/";
};

function MaintenanceModeGate({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { settings, isLoading: settingsLoading } = useAdminPlatformSettings();
  const maintenanceMode = settings.maintenanceMode === true;
  const isMaintenancePath = pathname === "/maintenance";
  const isAuthPath = pathname === "/auth";
  const isAdminPath = pathname.startsWith("/admin");
  const isLegalPath =
    pathname === "/privacy-policy" ||
    pathname === "/terms-and-conditions" ||
    pathname === "/cookies-policy";
  const isAdminUser = user?.role === "admin" || isAdminEmail(user?.email);
  const isPreviewMode = new URLSearchParams(search).get("preview") === "1";

  if (authLoading || settingsLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!maintenanceMode) {
    if (isMaintenancePath) {
      return <Navigate to={resolveRoleHomePath(user?.role)} replace />;
    }
    return <>{children}</>;
  }

  if (isAdminUser) {
    if (isMaintenancePath && !isPreviewMode) {
      return <Navigate to="/admin/dashboard" replace />;
    }
    return <>{children}</>;
  }

  if (isMaintenancePath || isAuthPath || isLegalPath || isAdminPath) {
    return <>{children}</>;
  }

  return <Navigate to="/maintenance" replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
          <AcademicProvider>
            <NotificationProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <DocumentTitleManager />
      <BrandAssetsManager />
      <ManifestManager />
      <MaintenanceModeGate>
                <Suspense fallback={<div className="min-h-screen bg-background" />}>
                  <Routes>
              {/* ========== RUTAS PÚBLICAS ========== */}
              <Route
                path="/"
                element={<Index />}
              />
              <Route
                path="/auth"
                element={<AuthPage />}
              />
              <Route
                path="/maintenance"
                element={<MaintenancePage />}
              />
              <Route
                path="/about"
                element={<AboutPage />}
              />
              <Route
                path="/acerca-de"
                element={<AboutPage />}
              />
              <Route
                path="/contact"
                element={<ContactPage />}
              />
              <Route
                path="/privacy-policy"
                element={<PrivacyPolicyPage />}
              />
              <Route
                path="/terms-and-conditions"
                element={<TermsConditionsPage />}
              />
              <Route
                path="/cookies-policy"
                element={<CookiesPolicyPage />}
              />
              <Route
                path="/plans/:planId"
                element={<TeacherPlanDetailPage />}
              />
              <Route
                path="/teacher-approval-waiting"
                element={
                  <ProtectedRoute>
                    <TeacherApprovalWaitingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/teacher-approval-rejected"
                element={
                  <ProtectedRoute>
                    <TeacherApprovalWaitingPage />
                  </ProtectedRoute>
                }
              />

              {/* ========== RUTAS DE DASHBOARD PRINCIPAL ========== */}
              <Route
                path="/student"
                element={
                  <ProtectedRoute requiredRole="estudiante">
                    <StudentDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/teacher"
                element={
                  <ProtectedRoute requiredRole="docente">
                    <TeacherDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/institution"
                element={
                  <ProtectedRoute requiredRole="institucion">
                    <InstitutionDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/institution/analytics"
                element={
                  <ProtectedRoute requiredRole="institucion">
                    <InstitutionAnalyticsPage />
                  </ProtectedRoute>
                }
              />

              

              {/* ========== RUTAS COMPARTIDAS ========== */}
              {/* Cursos */}
              <Route
                path="/courses"
                element={
                  <ProtectedRoute requiredRole={["docente", "estudiante", "admin", "institucion"]}>
                    <CoursesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/courses/view/:courseCode"
                element={
                  <ProtectedRoute requiredRole={["docente", "estudiante", "admin", "institucion"]}>
                    <CoursesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/courses/:courseCode/files"
                element={
                  <ProtectedRoute requiredRole={["docente", "estudiante"]}>
                    <FileManager />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/courses/:courseCode/exercise-bank"
                element={
                  <ProtectedRoute requiredRole={["docente", "estudiante", "admin"]}>
                    <ExerciseBankPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/courses/:courseCode/exercise-bank/stats"
                element={
                  <ProtectedRoute requiredRole={["docente", "admin"]}>
                    <ExerciseQuizStatsPage />
                  </ProtectedRoute>
                }
              />

              {/* Evaluaciones/Homework */}
              <Route
                path="/courses/:courseCode/assessments"
                element={
                  <ProtectedRoute requiredRole={["docente", "estudiante"]}>
                    <AssessmentsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/courses/:courseCode/assessments/:assessmentId"
                element={
                  <ProtectedRoute requiredRole={["docente", "estudiante"]}>
                    <AssessmentDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/courses/:courseCode/assessments/:assessmentId/:tab"
                element={
                  <ProtectedRoute requiredRole={["docente", "estudiante"]}>
                    <AssessmentDetailPage />
                  </ProtectedRoute>
                }
              />
 
              {/* Calificaciones */}
              <Route
                path="/grades"
                element={
                  <ProtectedRoute requiredRole={["docente", "estudiante", "institucion"]}>
                    <GradesPage />
                  </ProtectedRoute>
                }
              />

              {/* Diapositivas */}
              <Route
                path="/slides"
                element={
                  <ProtectedRoute requiredRole={["docente", "estudiante"]}>
                    <SlidesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/calendar"
                element={
                  <ProtectedRoute requiredRole={["docente", "estudiante", "admin", "institucion"]}>
                    <CalendarPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <ProfileSettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <AdminRoute>
                    <Navigate to="/admin/dashboard" replace />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/dashboard"
                element={
                  <AdminRoute>
                    <AdminDashboardPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/admins"
                element={
                  <AdminPermissionRoute ownerOnly>
                    <AdminAccessAdminsPage />
                  </AdminPermissionRoute>
                }
              />
              <Route
                path="/admin/teacher-approvals"
                element={
                  <AdminPermissionRoute permission="manageTeacherApprovals">
                    <AdminAccessTeacherApprovalsPage />
                  </AdminPermissionRoute>
                }
              />
              <Route
                path="/admin/teacher-ops"
                element={
                  <AdminPermissionRoute permission="manageTeacherOps">
                    <AdminAccessTeacherOpsPage />
                  </AdminPermissionRoute>
                }
              />
              <Route
                path="/admin/deletions"
                element={
                  <AdminPermissionRoute permission="manageDeletions">
                    <AdminAccessDeletionsPage />
                  </AdminPermissionRoute>
                }
              />
              <Route
                path="/admin/inbox"
                element={
                  <AdminPermissionRoute permission="manageInbox">
                    <AdminAccessInboxPage />
                  </AdminPermissionRoute>
                }
              />
              <Route
                path="/admin/settings"
                element={
                  <AdminPermissionRoute permission="manageSettings">
                    <AdminSettingsPage />
                  </AdminPermissionRoute>
                }
              />
              <Route
                path="/admin/billing"
                element={
                  <AdminPermissionRoute permission="manageBilling">
                    <AdminBillingPage />
                  </AdminPermissionRoute>
                }
              />
              <Route
                path="/admin/institutions"
                element={
                  <AdminPermissionRoute permission="manageInstitutions">
                    <AdminInstitutionsPage />
                  </AdminPermissionRoute>
                }
              />
              <Route
                path="/admin/institutions/:institutionKey"
                element={
                  <AdminPermissionRoute permission="manageInstitutions">
                    <AdminInstitutionDetailPage />
                  </AdminPermissionRoute>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <AdminPermissionRoute permission="manageUsersDirectory">
                    <AdminUsersPage />
                  </AdminPermissionRoute>
                }
              />
              <Route
                path="/admin/reports"
                element={
                  <AdminPermissionRoute permission="exportReports">
                    <AdminReportsPage />
                  </AdminPermissionRoute>
                }
              />
              <Route
                path="/admin/backups"
                element={
                  <AdminPermissionRoute permission="manageBackups">
                    <AdminBackupsPage />
                  </AdminPermissionRoute>
                }
              />
              <Route
                path="/admin/audit-log"
                element={
                  <AdminPermissionRoute permission="exportReports">
                    <AdminAuditLogPage />
                  </AdminPermissionRoute>
                }
              />
              <Route
                path="/admin/support-conversations"
                element={
                  <AdminPermissionRoute permission="manageInbox">
                    <Navigate to="/admin/inbox" replace />
                  </AdminPermissionRoute>
                }
              />
              <Route
                path="/admin/notifications"
                element={
                  <AdminPermissionRoute permission="manageInbox">
                    <AdminNotificationsPage />
                  </AdminPermissionRoute>
                }
              />
              <Route
                path="/admin/permissions"
                element={
                  <AdminPermissionRoute ownerOnly>
                    <AdminPermissionsPage />
                  </AdminPermissionRoute>
                }
              />
              <Route
                path="/teacher/profile/:userId"
                element={
                  <ProtectedRoute requiredRole="docente">
                    <ProfileSettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/student/profile/:userId"
                element={
                  <ProtectedRoute requiredRole="estudiante">
                    <ProfileSettingsPage />
                  </ProtectedRoute>
                }
              />
          

              {/* ========== RUTAS EXCLUSIVAS DE PROFESORES ========== */}
              {/* Gestión de Cursos */}
              <Route
                path="/courses/create"
                element={
                  <ProtectedRoute requiredRole={["docente", "admin", "institucion"]}>
                    <CreateCoursePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/courses/:courseCode/edit"
                element={
                  <ProtectedRoute requiredRole={["docente", "admin", "institucion"]}>
                    <CoursesEditPage />
                  </ProtectedRoute>
                }
              />

              {/* Gestión de Estudiantes */}
              <Route
                path="/students/list"
                element={
                  <ProtectedRoute requiredRole={["docente", "institucion"]}>
                    <StudentsList />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/students/:studentId"
                element={
                  <ProtectedRoute requiredRole={["docente", "institucion"]}>
                    <StudentDetailPage />
                  </ProtectedRoute>
                }
              />



              <Route
                path="/students/:studentId/enroll"
                element={
                  <ProtectedRoute requiredRole={["docente", "institucion"]}>
                    <EnrollStudentPage />
                  </ProtectedRoute>
                }
              />

              {/* Gestión de Calificaciones */}
              <Route
                path="/courses/:courseCode/grade-sheets"
                element={
                  <ProtectedRoute requiredRole="docente">
                    <GradeSheetsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/courses/:courseCode/grade-sheets/new"
                element={<GradeSheetsNewRedirect />}
              />
              <Route
                path="/courses/:courseCode/grade-sheets/:gradeSheetId/edit"
                element={
                  <ProtectedRoute requiredRole="docente">
                    <GradeSheetEditPage />
                  </ProtectedRoute>
                }
              />
              {/* Estadísticas */}
              <Route
                path="/statistics"
                element={
                  <ProtectedRoute requiredRole="docente">
                    <StatsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/teacher/notifications"
                element={
                  <ProtectedRoute requiredRole="docente">
                    <NotificationsPage />
                  </ProtectedRoute>
                }
              />

              {/* ========== REDIRECCIONES ========== */}
              {/* Redirigir rutas antiguas */}
              <Route path="/estudiante" element={<Navigate to="/student" replace />} />
              <Route path="/docente" element={<Navigate to="/teacher" replace />} />
              <Route path="/estadisticas" element={<Navigate to="/statistics" replace />} />
              <Route path="/cursos/nuevo" element={<Navigate to="/courses/create" replace />} />
              <Route path="/estudiantes/lista" element={<Navigate to="/students/list" replace />} />
              <Route path="/notas" element={<Navigate to="/grades" replace />} />
              <Route path="/inscribir-estudiante" element={<Navigate to="/students/list" replace />} />
              <Route path="/diapositivas" element={<Navigate to="/slides" replace />} />
              
              {/* Redirigir rutas antiguas de homework */}
              <Route 
                path="/cursos/:courseCode/homework" 
                element={<HomeworkAssessmentsRedirect />} 
              />
              <Route 
                path="/cursos/:courseCode/homework/:assessmentId" 
                element={<HomeworkAssessmentDetailRedirect />} 
              />
              {/* ========== 404 ========== */}
              <Route
                path="*"
                element={(
                  <DashboardLayout title="Page Not Found">
                    <NotFound />
                  </DashboardLayout>
                )}
              />
                  </Routes>
                </Suspense>
              </MaintenanceModeGate>
              <CookieConsentBanner />
            </BrowserRouter>
          </NotificationProvider>
        </AcademicProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
