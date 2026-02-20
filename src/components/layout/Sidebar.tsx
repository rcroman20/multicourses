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
  FileText,
  ClipboardCheck,
  Settings,
  Bell,
  User,
  FileSpreadsheet,
  CalendarDays,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useAcademic } from '@/contexts/AcademicContext';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles: Array<'docente' | 'estudiante'>;
  showCondition?: () => boolean;
}

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ isCollapsed, onToggleCollapse }: SidebarProps) {
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

  // Definir los items de navegación con rutas en inglés
  const navItems: NavItem[] = [
    {
      label: 'Dashboard',
      href: user?.role === 'docente' ? '/teacher' : '/student',
      icon: <LayoutDashboard className="h-4 w-4" />,
      roles: ['docente', 'estudiante'],
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
      roles: ['docente', 'estudiante'],
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
      label: 'Profile',
      href: user
        ? `${user.role === 'docente' ? '/teacher' : '/student'}/profile/${user.id}`
        : '/profile',
      icon: <User className="h-4 w-4" />,
      roles: ['docente', 'estudiante'],
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
      const dashboardPath = user?.role === 'docente' ? '/teacher' : '/student';
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
        className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-lg bg-blue-600 text-white shadow-md hover:bg-blue-700 transition-colors"
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
      >
        {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-40 h-screen bg-gray-900 border-r border-gray-800 transition-all duration-300 lg:translate-x-0 flex flex-col',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          isCollapsed ? 'w-16' : 'w-64'
        )}
      >
        <div className="flex h-full min-h-0 flex-col">
          {/* Header */}
          <div className={cn(
            "flex items-center gap-2 p-4 border-b border-gray-700",
            isCollapsed && "justify-center p-3"
          )}>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white flex-shrink-0 overflow-hidden border border-blue-200">
              <img src="/logo.png" alt="Multicourses logo" className="h-7 w-7 object-contain" />
            </div>
            
            {!isCollapsed && (
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-semibold text-white truncate">
                  Multicourses
                </span>
                <span className="text-xs text-gray-300 truncate">
                  Academic Platform
                </span>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-2 space-y-1">
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
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-gray-200 hover:bg-gray-700/50 hover:text-white transition-all duration-200 group relative',
                    active && 'bg-blue-600/25 text-white font-medium border-l-2 border-blue-400',
                    isCollapsed && 'justify-center px-2'
                  )}
                  title={isCollapsed ? item.label : undefined} 
                >
                  <div className={cn(
                    "flex items-center justify-center h-8 w-8 rounded-lg",
                    active ? "bg-blue-500/20" : "bg-gray-700/30",
                    active ? "text-blue-300" : "text-gray-400"
                  )}>
                    {item.icon}
                  </div>
                  
                  {!isCollapsed && (
                    <>
                      <span className="flex-1 text-sm">{item.label}</span>
                      {active && (
                        <ChevronRight className="h-4 w-4 ml-auto text-blue-400" />
                      )}
                    </>
                  )}
                  
                  {/* Tooltip for collapsed sidebar */}
                  {isCollapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-gray-100 text-sm rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 border border-gray-700">
                      {item.label}
                    </div>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User section */}
          <div className="shrink-0 border-t border-gray-700 p-3">
          <div className={cn(
              "flex items-center mb-2 px-2",
              isCollapsed ? "justify-center" : "gap-3"
            )}>
              <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold flex-shrink-0 overflow-hidden">
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
                  <p className="text-sm font-medium text-white truncate">
                    {user?.name}
                  </p>
                  <p className="text-xs text-gray-300 capitalize truncate">
                    {user?.role === 'docente' ? 'Teacher' : 'Student'}
                  </p>
                </div>
              )}
            </div>
             
            <button 
              onClick={logout}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-300 hover:bg-red-600/10 hover:text-red-300 w-full transition-colors",
                isCollapsed && "justify-center px-2"
              )}
              title={isCollapsed ? "Log out" : undefined}
            >
              <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                <LogOut className="h-4 w-4 text-red-400" />
              </div>
              {!isCollapsed && <span className="text-sm">Log out</span>}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
