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
  FileText,
  ClipboardCheck,
  Settings,
  Bell,
  User,
  FileSpreadsheet,
  CalendarDays,
  ShieldCheck,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useAcademic } from '@/contexts/AcademicContext';
import { isAdminEmail } from '@/lib/services/adminAccessService';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles: Array<'docente' | 'estudiante' | 'admin'>;
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
  const { courses, selectedCourse } = useAcademic();
  const location = useLocation();
  const params = useParams();
  const [isOpen, setIsOpen] = useState(false);
  
  const courseCode = params.courseCode;
  const currentCourse = courseCode
    ? courses.find((c) => c.code === courseCode)
    : null;

  const getUserFirstCourse = () => {
    if (!user) return null;
    
    if (user.role === 'admin') return null;

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
    user?.role === 'docente' ? '/teacher' : user?.role === 'admin' ? '/admin/dashboard' : '/student';

  const navItems: NavItem[] = [
    {
      label: 'Dashboard',
      href: dashboardPath,
      icon: <LayoutDashboard className="h-4 w-4" />,
      roles: ['docente', 'estudiante', 'admin'],
    },
    {
      label: 'Calendar',
      href: '/calendar',
      icon: <CalendarDays className="h-4 w-4" />,
      roles: ['docente', 'estudiante'],
    },
    {
      label: 'Courses',
      href: '/courses',
      icon: <BookOpen className="h-4 w-4" />,
      roles: ['docente', 'estudiante', 'admin'],
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
      roles: ['docente', 'estudiante'],
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
      roles: ['docente'],
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
      label: 'Admin Emails',
      href: '/admin/admins',
      icon: <ShieldCheck className="h-4 w-4" />,
      roles: ['admin'],
    },
    {
      label: 'Teacher Approvals',
      href: '/admin/teacher-approvals',
      icon: <ClipboardCheck className="h-4 w-4" />,
      roles: ['admin'],
    },
    {
      label: 'Teacher Ops',
      href: '/admin/teacher-ops',
      icon: <BarChart3 className="h-4 w-4" />,
      roles: ['admin'],
    },
    {
      label: 'Deletion Requests',
      href: '/admin/deletions',
      icon: <Users className="h-4 w-4" />,
      roles: ['admin'],
    },
    {
      label: 'Admin Inbox',
      href: '/admin/inbox',
      icon: <Bell className="h-4 w-4" />,
      roles: ['admin'],
    },
    {
      label: 'Profile',
      href: user
        ? user.role === 'docente'
          ? `/teacher/profile/${user.id}`
          : user.role === 'estudiante'
            ? `/student/profile/${user.id}`
            : '/profile'
        : '/profile',
      icon: <User className="h-4 w-4" />,
      roles: ['docente', 'estudiante', 'admin'],
    },
  ];

  // Filtrar items según el rol del usuario y condiciones
  const filteredNavItems = navItems.filter(item => {
    if (!user || !item.roles.includes(user.role)) return false;
    if (item.showCondition && !item.showCondition()) return false;
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
      return location.pathname.startsWith('/teacher/notifications');
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
          "app-sidebar-mobile-toggle fixed top-3 left-3 z-50 h-10 w-10 rounded-lg flex items-center justify-center transition-colors lg:hidden",
          isOpen && "pointer-events-none opacity-0",
        )}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
      >
        {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="app-sidebar-overlay fixed inset-0 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'app-sidebar fixed top-0 left-0 z-40 flex h-screen flex-col transition-all duration-300 lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          isCollapsed ? 'w-20' : 'w-64'
        )}
      >
        <div className="flex h-full min-h-0 flex-col">
          {/* Header */}
          <div className={cn(
            "app-sidebar-header relative flex items-center gap-2 p-4",
            isCollapsed ? "app-sidebar-header-collapsed justify-center" : "pr-12"
          )}>
            <div className="app-sidebar-brand-icon flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
              <img src="/logo.png" alt="Multicourses logo" className="h-7 w-7 object-contain" />
            </div>
            
            {!isCollapsed && (
              <div className="flex flex-col flex-1 min-w-0">
                <span className="app-sidebar-brand-title truncate text-sm font-semibold">
                  Multicourses
                </span>
                <span className="app-sidebar-brand-subtitle truncate text-xs">
                  Academic Platform
                </span>
              </div>
            )}

            {showCollapseToggle && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className={cn(
                  "app-sidebar-toggle-btn hidden items-center justify-center lg:inline-flex",
                  isCollapsed && "app-sidebar-toggle-btn-collapsed",
                )}
                aria-label={isCollapsed ? "Expandir sidebar" : "Contraer sidebar"}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </button>
            )}
          </div>

          {/* Navigation */}
          <nav
            className={cn(
              "app-sidebar-nav no-scrollbar flex-1 min-h-0 space-y-1 overflow-y-auto p-2",
              isCollapsed && "app-sidebar-nav-collapsed",
            )}
          >
            {filteredNavItems.map((item) => {
              const active = isActive(item.href, item.label);
              return (
                <Link
                  key={generateKey(item)}
                  to={item.href}
                  onClick={(event) => {
                    confirmNavigationIfQuizInProgress(event);
                    if (event.defaultPrevented) return;
                    setIsOpen(false);
                  }}
                  className={cn(
                    "app-sidebar-link group relative flex items-center gap-3 rounded-xl px-3 py-2 transition-all duration-200",
                    active && "app-sidebar-link-active font-medium",
                    isCollapsed && "app-sidebar-link-collapsed justify-center"
                  )}
                  title={isCollapsed ? item.label : undefined} 
                >
                  <div className={cn(
                    "app-sidebar-icon-wrap flex h-8 w-8 items-center justify-center rounded-lg",
                    isCollapsed && "app-sidebar-icon-wrap-collapsed",
                  )}>
                    {item.icon}
                  </div>
                  
                  {!isCollapsed && (
                    <>
                      <span className="flex-1 text-sm">{item.label}</span>
                      {active && (
                        <ChevronRight className="app-sidebar-active-arrow ml-auto h-4 w-4" />
                      )}
                    </>
                  )}
                  
                  {/* Tooltip for collapsed sidebar */}
                  {isCollapsed && (
                    <div className="app-sidebar-tooltip pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md px-2 py-1 text-sm opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                      {item.label}
                    </div>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User section */}
          <div className={cn("app-sidebar-user shrink-0 p-3", isCollapsed && "app-sidebar-user-collapsed")}>
          <div className={cn(
              "flex items-center mb-2 px-2",
              isCollapsed ? "justify-center mb-1 px-0" : "gap-3"
            )}>
              <div className="app-sidebar-avatar flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold">
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
                  <p className="app-sidebar-user-name truncate text-sm font-medium">
                    {user?.name}
                  </p>
                  <p className="app-sidebar-user-role truncate text-xs capitalize">
                    {user?.role === 'admin' || isAdminEmail(user?.email)
                      ? 'Admin'
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
                "app-sidebar-logout flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
                isCollapsed && "app-sidebar-logout-collapsed justify-center px-0"
              )}
              title={isCollapsed ? "Log out" : undefined}
            >
              <div className="app-sidebar-logout-icon flex h-8 w-8 items-center justify-center rounded-lg">
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
