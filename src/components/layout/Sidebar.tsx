// src/components/layout/Sidebar.tsx - VERSIÓN MEJORADA CON PALETA EQUILIBRADA
import { Link, useParams, useLocation } from 'react-router-dom';
import type { MouseEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  LayoutDashboard, 
  BookOpen,
  Award,
  Presentation, 
  BarChart3,
  Users,
  LogOut,
  Menu,
  X, 
  FolderOpen,
  ChevronRight,
  ChevronLeft,
  Clock3,
  FileText,
  ClipboardCheck,
  BadgeCheck,
  Settings,
  Bell,
  User,
  FileSpreadsheet,
  CalendarDays,
  MessageSquare,
  CreditCard,
  Building2,
  FileBarChart2,
  KeyRound,
  ArchiveRestore,
  FileSearch,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useAcademic } from '@/contexts/AcademicContext';
import {
  ADMIN_EMAILS_CHANGED_EVENT,
  isAdminEmail,
  isOwnerAdminEmail,
} from '@/lib/services/adminAccessService';
import {
  ADMIN_PERMISSIONS_CHANGED_EVENT,
  canAccessDelegatedAdminPermission,
} from '@/lib/services/adminPermissionsService';
import {
  DEFAULT_PLATFORM_TAGLINE,
  DEFAULT_PLATFORM_NAME,
  resolvePlatformLogoUrl,
  useAdminPlatformSettings,
} from '@/lib/services/adminSettingsService';

interface NavItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
  roles: Array<'docente' | 'estudiante' | 'admin' | 'institucion'>;
  showCondition?: () => boolean;
}

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  showCollapseToggle?: boolean;
}

export function Sidebar({
  isCollapsed,
  onToggleCollapse,
  showCollapseToggle = true,
}: SidebarProps) {
  const { user, logout } = useAuth();
  const { settings: platformSettings } = useAdminPlatformSettings();
  const { courses, selectedCourse } = useAcademic();
  const location = useLocation();
  const params = useParams();
  const [isOpen, setIsOpen] = useState(false);
  const [, setAdminPermissionsVersion] = useState(0);
  
  const courseCode = params.courseCode;
  const currentCourse = courseCode
    ? courses.find((c) => c.code === courseCode)
    : null;

  const getUserFirstCourse = () => {
    if (!user) return null;
    
    if (user.role === 'admin' || user.role === 'institucion') return courses[0] || null;

    const userCourses = user.role === 'docente'
      ? courses.filter(c => c.teacherId === user.id)
      : courses.filter(c => c.enrolledStudents?.includes(user.id));
    
    return userCourses.length > 0 ? userCourses[0] : null;
  };

  const firstCourse = getUserFirstCourse();
  const preferredCourse = selectedCourse || currentCourse || firstCourse;
  const quizGuardStorageKey = user
    ? `exerciseBank:quizInProgress:${user.id}`
    : "exerciseBank:quizInProgress";

  const scrollPageToTop = () => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    const mainElement = document.querySelector("main");
    if (mainElement instanceof HTMLElement) {
      mainElement.scrollTop = 0;
    }
  };

  const confirmNavigationIfQuizInProgress = (event: MouseEvent<HTMLAnchorElement>) => {
    const inProgress = localStorage.getItem(quizGuardStorageKey) === "1";
    if (!inProgress) return;

    const confirmLeave = window.confirm(
      "If you leave now, your progress will be saved and unanswered questions will count as incorrect. Continue?",
    );
    if (!confirmLeave) {
      event.preventDefault();
      return;
    }

    const activeQuizPrefix = user
      ? `exerciseBank:activeQuiz:${user.id}:`
      : "exerciseBank:activeQuiz:";

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(activeQuizPrefix)) continue;

      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        localStorage.setItem(
          key,
          JSON.stringify({
            ...parsed,
            abandoned: true,
            updatedAt: Date.now(),
          }),
        );
      } catch {
        // Ignore malformed localStorage entries
      }
    }

    localStorage.removeItem(quizGuardStorageKey);
  };

  const dashboardPath =
    user?.role === 'docente'
      ? '/teacher'
      : user?.role === 'admin'
        ? '/admin/dashboard'
        : user?.role === 'institucion'
          ? '/institution'
          : '/student';
  const isOwnerAdmin = isOwnerAdminEmail(user?.email);
  const platformName =
    String(platformSettings.platformName || "").trim() || DEFAULT_PLATFORM_NAME;
  const platformTagline =
    String(platformSettings.platformTagline || "").trim() || DEFAULT_PLATFORM_TAGLINE;
  const brandLogo = resolvePlatformLogoUrl(platformSettings.logoUrl);

  useEffect(() => {
    const handlePermissionsChanged = () => {
      setAdminPermissionsVersion((current) => current + 1);
    };

    window.addEventListener("storage", handlePermissionsChanged);
    window.addEventListener(ADMIN_EMAILS_CHANGED_EVENT, handlePermissionsChanged as EventListener);
    window.addEventListener(ADMIN_PERMISSIONS_CHANGED_EVENT, handlePermissionsChanged as EventListener);

    return () => {
      window.removeEventListener("storage", handlePermissionsChanged);
      window.removeEventListener(ADMIN_EMAILS_CHANGED_EVENT, handlePermissionsChanged as EventListener);
      window.removeEventListener(ADMIN_PERMISSIONS_CHANGED_EVENT, handlePermissionsChanged as EventListener);
    };
  }, []);

  const navItems: NavItem[] = [
    {
      label: 'Dashboard',
      href: dashboardPath,
      icon: <LayoutDashboard className="h-4 w-4" />,
      roles: ['docente', 'estudiante', 'admin', 'institucion'],
    },
    {
      label: 'Calendar',
      href: '/calendar',
      icon: <CalendarDays className="h-4 w-4" />,
      roles: ['docente', 'estudiante', 'admin', 'institucion'],
    },
    {
      label: 'Access Approvals',
      href: '/admin/teacher-approvals',
      icon: <BadgeCheck className="h-4 w-4" />,
      roles: ['admin'],
    },
    {
      label: 'Admin Inbox',
      href: '/admin/inbox',
      icon: <MessageSquare className="h-4 w-4" />,
      roles: ['admin'],
    },
    {
      label: 'Notifications',
      href: '/admin/notifications',
      icon: <Bell className="h-4 w-4" />,
      roles: ['admin'],
    },
    {
      label: 'Deletion Requests',
      href: '/admin/deletions',
      icon: <Clock3 className="h-4 w-4" />,
      roles: ['admin'],
    },
    {
      label: 'Teacher Ops',
      href: '/admin/teacher-ops',
      icon: <FileText className="h-4 w-4" />,
      roles: ['admin'],
    },
    {
      label: 'Billing',
      href: '/admin/billing',
      icon: <CreditCard className="h-4 w-4" />,
      roles: ['admin'],
    },
    {
      label: 'Users Directory',
      href: '/admin/users',
      icon: <Users className="h-4 w-4" />,
      roles: ['admin'],
    },
    {
      label: 'Institutions',
      href: '/admin/institutions',
      icon: <Building2 className="h-4 w-4" />,
      roles: ['admin'],
    },
    {
      label: 'Reports',
      href: '/admin/reports',
      icon: <FileBarChart2 className="h-4 w-4" />,
      roles: ['admin'],
    },
    {
      label: 'Audit Log',
      href: '/admin/audit-log',
      icon: <FileSearch className="h-4 w-4" />,
      roles: ['admin'],
    },
    {
      label: 'Backups',
      href: '/admin/backups',
      icon: <ArchiveRestore className="h-4 w-4" />,
      roles: ['admin'],
    },
    {
      label: 'Settings',
      href: '/admin/settings',
      icon: <Settings className="h-4 w-4" />,
      roles: ['admin'],
    },
    {
      label: 'Admin Emails',
      href: '/admin/admins',
      icon: <Settings className="h-4 w-4" />,
      roles: ['admin'],
    },
    {
      label: 'Permissions',
      href: '/admin/permissions',
      icon: <KeyRound className="h-4 w-4" />,
      roles: ['admin'],
    },
    {
      label: 'Courses',
      href: '/courses',
      icon: <BookOpen className="h-4 w-4" />,
      roles: ['docente', 'estudiante', 'institucion'],
    },
    { 
      label: 'Assessments',
      href: preferredCourse
        ? `/courses/${preferredCourse.code}/assessments`
          : '/courses',
      icon: <ClipboardCheck className="h-4 w-4" />,
      roles: ['docente', 'estudiante'], 
    },
    {
      label: 'Exercise Bank',
      href: preferredCourse
        ? `/courses/${preferredCourse.code}/exercise-bank`
          : '/courses',
      icon: <FileText className="h-4 w-4" />,
      roles: ['docente', 'estudiante'],
      showCondition: () => preferredCourse !== null,
    },
    {
      label: 'Slides',
      href: '/slides',
      icon: <Presentation className="h-4 w-4" />,
      roles: ['docente', 'estudiante'],
    },
    {
      label: 'Files',
      href: preferredCourse
        ? `/courses/${preferredCourse.code}/files`
          : '/courses',
      icon: <FolderOpen className="h-4 w-4" />,
      roles: ['docente', 'estudiante'],
      showCondition: () => preferredCourse !== null,
    },
    {
      label: 'Grades',
      href: '/grades',
      icon: <Award className="h-4 w-4" />,
      roles: ['docente', 'estudiante', 'institucion'],
    },
    {
      label: 'Analytics',
      href: '/institution/analytics',
      icon: <BarChart3 className="h-4 w-4" />,
      roles: ['institucion'],
    },
    {
      label: 'Grade Sheets',
      href: preferredCourse
        ? `/courses/${preferredCourse.code}/grade-sheets`
          : '/courses',
      icon: <FileSpreadsheet className="h-4 w-4" />,
      roles: ['docente'],
    },
    {
      label: 'Students',
      href: '/students/list',
      icon: <Users className="h-4 w-4" />,
      roles: ['docente', 'institucion'],
    },
    {
      label: 'Statistics',
      href: '/statistics',
      icon: <BarChart3 className="h-4 w-4" />,
      roles: ['docente'],
    },
    {
      label: 'Notifications',
      href: '/teacher/notifications',
      icon: <Bell className="h-4 w-4" />,
      roles: ['docente'],
    },
    {
      label: 'Profile',
      href: user
        ? user.role === 'docente'
          ? `/teacher/profile/${user.id}`
          : user.role === 'estudiante'
            ? `/student/profile/${user.id}`
            : user.role === 'institucion'
              ? '/profile'
            : '/profile'
        : '/profile',
      icon: <User className="h-4 w-4" />,
      roles: ['docente', 'estudiante', 'admin', 'institucion'],
    },
  ];

  // Filtrar items según el rol del usuario y condiciones
  const filteredNavItems = navItems.filter(item => {
    if (!user || !item.roles.includes(user.role)) return false;
    if (item.showCondition && !item.showCondition()) return false;
    if (user.role === 'admin') {
      if (item.label === 'Dashboard' || item.label === 'Profile' || item.label === 'Calendar') return true;
      if (item.label === 'Admin Emails' || item.label === 'Permissions') {
        return isOwnerAdmin;
      }
      if (item.label === 'Access Approvals') {
        return canAccessDelegatedAdminPermission("manageTeacherApprovals", user.email);
      }
      if (item.label === 'Teacher Ops') {
        return canAccessDelegatedAdminPermission("manageTeacherOps", user.email);
      }
      if (item.label === 'Deletion Requests') {
        return canAccessDelegatedAdminPermission("manageDeletions", user.email);
      }
      if (item.label === 'Admin Inbox') {
        return canAccessDelegatedAdminPermission("manageInbox", user.email);
      }
      if (item.label === 'Notifications') {
        return canAccessDelegatedAdminPermission("manageInbox", user.email);
      }
      if (item.label === 'Settings') {
        return canAccessDelegatedAdminPermission("manageSettings", user.email);
      }
      if (item.label === 'Billing') {
        return canAccessDelegatedAdminPermission("manageBilling", user.email);
      }
      if (item.label === 'Institutions') {
        return canAccessDelegatedAdminPermission("manageInstitutions", user.email);
      }
      if (item.label === 'Users Directory') {
        return canAccessDelegatedAdminPermission("manageUsersDirectory", user.email);
      }
      if (item.label === 'Reports') {
        return canAccessDelegatedAdminPermission("exportReports", user.email);
      }
      if (item.label === 'Audit Log') {
        return canAccessDelegatedAdminPermission("exportReports", user.email);
      }
      if (item.label === 'Backups') {
        return canAccessDelegatedAdminPermission("manageBackups", user.email);
      }
      return false;
    }
    return true;
  });

  // Función para generar key único para cada item
  const generateKey = (item: NavItem) => {
    return `${item.href}-${item.label}`;
  };

  // Función mejorada para detectar activo
  const isActive = (href: string, label: string) => {
    // Casos especiales primero
    if (label === 'Dashboard') {
      return location.pathname === dashboardPath;
    }
    
    // Para "Courses" - debe coincidir exactamente con /courses o /courses/view/*
    if (label === 'Courses') {
      return location.pathname === '/courses' || 
             (location.pathname.startsWith('/courses/view/'));
    }
    
    // Para "Assessments" - debe ser la ruta de assessments
    if (label === 'Assessments') {
      return location.pathname.includes('/assessments') && 
             !location.pathname.includes('/grade-sheets');
    }

    if (label === 'Exercise Bank') {
      return location.pathname.includes('/exercise-bank');
    }
    
    // Para "Grade Sheets" - debe ser la ruta de grade-sheets
    if (label === 'Grade Sheets') {
      return location.pathname.includes('/grade-sheets');
    }
    
    // Para "Files" - debe ser exactamente la ruta de files
    if (label === 'Files') {
      return location.pathname.includes('/files');
    }

    if (label === 'Profile') {
      return location.pathname.includes('/profile');
    }

    if (label === 'Notifications') {
      return location.pathname.startsWith('/teacher/notifications') ||
        location.pathname.startsWith('/admin/notifications');
    }

    // Para otros items
    return location.pathname.startsWith(href) && 
           !location.pathname.startsWith('/courses/view/');
  };

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed left-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700/95 bg-[#0b0f16] text-slate-200 shadow-[0_12px_24px_-18px_rgba(0,0,0,0.9)] transition-colors hover:bg-slate-900 lg:hidden",
          isOpen && "pointer-events-none opacity-0",
        )}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
      >
        {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/45 backdrop-blur-[2px] lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 flex h-screen flex-col overflow-hidden border-r border-slate-800/80 bg-[#050505] shadow-[16px_0_32px_-28px_rgba(0,0,0,0.88)] transition-all duration-300 lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          isCollapsed ? 'w-20' : 'w-64'
        )}
      >
        <div className="flex h-full min-h-0 flex-col">
          {/* Header */}
          <div className={cn(
            "flex flex-col gap-2 border-b border-slate-800/90 p-3",
            isCollapsed && "items-center px-[0.5rem] py-[0.6rem]"
          )}>
            {showCollapseToggle && isCollapsed && (
              <div className={cn("flex w-full", isCollapsed ? "justify-center" : "justify-start")}>
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  className={cn(
                    "hidden h-[1.9rem] w-[1.9rem] items-center justify-center rounded-[0.55rem] border border-slate-700/95 bg-[#020617] text-slate-200 transition-[background-color,transform] duration-200 ease-out hover:bg-[#0f172a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white lg:inline-flex",
                    isCollapsed &&
                      "h-[2.35rem] w-[2.35rem] rounded-[0.65rem] border-slate-800/90 shadow-[0_10px_18px_-14px_rgba(0,0,0,0.85)]",
                  )}
                  aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                  title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronLeft className="h-4 w-4" />
                  )}
                </button>
              </div>
            )}

            <div className={cn("flex min-h-[2.4rem] w-full items-center gap-2", isCollapsed && "justify-center")}>
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-800/90 bg-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.55)]">
                <img src={brandLogo} alt={`${platformName} logo`} className="h-7 w-7 object-contain" />
              </div>
              
              {!isCollapsed && (
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold text-white">
                    {platformName}
                  </span>
                  <span className="truncate text-xs text-slate-400">
                    {platformTagline}
                  </span>
                </div>
              )}

              {!isCollapsed && (
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  className="hidden h-[2.2rem] w-[2.2rem] items-center justify-center rounded-[0.65rem] border border-slate-700/95 bg-[#020617] text-slate-200 transition-[background-color,border-color] duration-200 hover:border-slate-500/90 hover:bg-[#0f172a] lg:inline-flex"
                  aria-label="Toggle sidebar"
                  title="Toggle sidebar"
                >
                  <Menu className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav
            className={cn(
              "no-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto p-2",
              isCollapsed && "overflow-y-auto !px-[0.45rem] !py-[0.6rem] [&>*+*]:!mt-[0.45rem]",
            )}
          >
            {filteredNavItems.map((item) => {
              const active = isActive(item.href, item.label);
              const shouldRenderIcon = Boolean(item.icon);
              return (
                <Link
                  key={generateKey(item)}
                  to={item.href}
                  onClick={(event) => {
                    confirmNavigationIfQuizInProgress(event);
                    if (event.defaultPrevented) return;
                    scrollPageToTop();
                    setIsOpen(false);
                  }}
                  className={cn(
                    "group relative flex items-center rounded-xl px-3 py-2 text-slate-200 transition-all duration-200 hover:bg-slate-900/90 hover:text-white",
                    shouldRenderIcon ? "gap-3" : "gap-0",
                    active &&
                      "bg-slate-800/80 font-medium text-white shadow-[0_10px_24px_-20px_rgba(0,0,0,0.92)]",
                    isCollapsed && "justify-center rounded-[0.65rem] p-[0.4rem]"
                  )}
                  title={isCollapsed ? item.label : undefined} 
                >
                  {shouldRenderIcon && (
                    <div className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900/90 text-slate-200 transition-colors group-hover:bg-slate-800/95 group-hover:text-white",
                      isCollapsed && "h-[2.05rem] w-[2.05rem] rounded-[0.6rem]",
                      active && "bg-sky-600/20 text-indigo-200",
                    )}>
                      {item.icon}
                    </div>
                  )}
                  
                  {!isCollapsed && (
                    <>
                      <span className="flex-1 text-sm">{item.label}</span>
                      {active && (
                        <ChevronRight className="ml-auto h-4 w-4 text-sky-300 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                      )}
                    </>
                  )}
                  
                  {/* Tooltip for collapsed sidebar */}
                  {isCollapsed && (
                    <div className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md border border-slate-800/90 bg-[#050505] px-2 py-1 text-sm text-slate-200 opacity-0 shadow-[0_10px_24px_-20px_rgba(0,0,0,0.85)] transition-opacity group-hover:opacity-100">
                      {item.label}
                    </div>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User section */}
          <div className={cn("shrink-0 border-t border-slate-800/90 p-3", isCollapsed && "px-[0.5rem] py-[0.45rem]")}>
          <div className={cn(
              "flex items-center mb-2 px-2",
              isCollapsed ? "justify-center mb-1 px-0" : "gap-3"
            )}>
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-800/90 bg-slate-900 font-semibold text-slate-200">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                ) : user?.avatarEmoji ? (
                  <span className="text-base">{user.avatarEmoji}</span>
                ) : (
                  user?.name?.charAt(0)?.toUpperCase() || 'U'
                )}
              </div>
              
              {!isCollapsed && (
                <div className="flex-1 min-w-0 ">
                  <p className="truncate text-sm font-medium text-white">
                    {user?.name}
                  </p>
                  <p className="truncate text-xs capitalize text-slate-400">
                    {user?.role === 'admin' || isAdminEmail(user?.email)
                      ? 'Admin'
                      : user?.role === 'institucion'
                        ? 'Institution'
                      : user?.role === 'docente'
                        ? 'Teacher'
                        : 'Student'}
                  </p>
                </div>
              )}
            </div>
             
            <button 
              onClick={logout}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-slate-200 transition-colors hover:bg-red-900/45 hover:text-white",
                isCollapsed && "justify-center px-0 py-[0.35rem]"
              )}
              title={isCollapsed ? "Log out" : undefined}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-900/60">
                <LogOut className="h-4 w-4 text-red-200" />
              </div>
              {!isCollapsed && <span className="text-sm">Log out</span>}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
