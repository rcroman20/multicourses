import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, ChevronLeft, ChevronRight, Circle, Loader2, Sparkles, X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  contentClassName?: string;
  showHeader?: boolean;
}

const HEADER_HEIGHT = 72;
const avatarOptions = ['😎', '🧠', '🎓', '🚀', '📚', '💡', '🧪', '🧩', '🔥', '🌟', '🦊', '🐼', '🐧', '🦉', '🐱'];

type HeaderParams = Record<string, string | undefined>;
type HeaderValue = string | ((params: HeaderParams) => string);

type HeaderRule = {
  path: string;
  title: HeaderValue;
  subtitle: HeaderValue;
};

const pageHeaderRules: HeaderRule[] = [
  { path: '/', title: 'Home', subtitle: 'Welcome to MultiCourses' },
  { path: '/auth', title: 'Authentication', subtitle: 'Sign in to continue' },
  { path: '/student', title: 'Student Dashboard', subtitle: 'Your academic overview' },
  { path: '/teacher', title: 'Teacher Dashboard', subtitle: 'Your teaching overview' },
  { path: '/courses/create', title: 'Create Course', subtitle: 'Set up a new course' },
  {
    path: '/courses/:courseCode/edit',
    title: 'Edit Course',
    subtitle: ({ courseCode }) => `Adjust course settings${courseCode ? ` (${courseCode})` : ''}`,
  },
  {
    path: '/courses/:courseCode/files',
    title: 'Files',
    subtitle: ({ courseCode }) => `Manage materials${courseCode ? ` for ${courseCode}` : ''}`,
  },
  {
    path: '/courses/:courseCode/exercise-bank/stats',
    title: 'Exercise Quiz Statistics',
    subtitle: ({ courseCode }) => `Performance metrics${courseCode ? ` for ${courseCode}` : ''}`,
  },
  {
    path: '/courses/:courseCode/exercise-bank',
    title: 'Exercise Bank',
    subtitle: ({ courseCode }) => `Question catalog${courseCode ? ` for ${courseCode}` : ''}`,
  },
  {
    path: '/courses/:courseCode/assessments/:assessmentId/:tab',
    title: 'Assessment Detail',
    subtitle: 'Assessment information and activity',
  },
  {
    path: '/courses/:courseCode/assessments/:assessmentId',
    title: 'Assessment Detail',
    subtitle: 'Assessment information and activity',
  },
  {
    path: '/courses/:courseCode/assessments',
    title: 'Assessments',
    subtitle: ({ courseCode }) => `Track activities${courseCode ? ` for ${courseCode}` : ''}`,
  },
  {
    path: '/courses/view/:courseCode',
    title: ({ courseCode }) => `Course Detail${courseCode ? ` (${courseCode})` : ''}`,
    subtitle: 'Course overview and progress',
  },
  { path: '/courses', title: 'Courses', subtitle: 'Browse and manage your courses' },
  {
    path: '/courses/:courseCode/grade-sheets/:gradeSheetId/edit',
    title: 'Edit Grade Sheet',
    subtitle: 'Update grading activities and scores',
  },
  { path: '/courses/:courseCode/grade-sheets/new', title: 'Grade Sheets', subtitle: 'Create and manage grade sheets' },
  { path: '/courses/:courseCode/grade-sheets', title: 'Grade Sheets', subtitle: 'Create and manage grade sheets' },
  { path: '/grades', title: 'Grades', subtitle: 'Student grades and summaries' },
  { path: '/slides', title: 'Slides', subtitle: 'Presentations and learning resources' },
  { path: '/calendar', title: 'Calendar', subtitle: 'Your upcoming schedule, deadlines, and operational timeline' },
  { path: '/teacher/profile/:userId', title: 'Profile', subtitle: 'Profile and account settings' },
  { path: '/student/profile/:userId', title: 'Profile', subtitle: 'Profile and account settings' },
  { path: '/profile', title: 'Profile', subtitle: 'Profile and account settings' },
  { path: '/students/:studentId/enroll', title: 'Enroll Student', subtitle: 'Assign the student to courses' },
  { path: '/students/:studentId', title: 'Student Detail', subtitle: 'Academic detail and enrollment status' },
  { path: '/students/list', title: 'Students List', subtitle: 'Manage enrolled students' },
  { path: '/statistics', title: 'Academic Statistics', subtitle: 'Performance and progress analytics' },
  { path: '/teacher/notifications', title: 'Notifications Center', subtitle: 'Recent alerts and updates' },
  { path: '/admin', title: 'Admin Access', subtitle: 'Manage admin permissions by email' },
  { path: '/admin/dashboard', title: 'Admin Dashboard', subtitle: 'Central admin workspace' },
  { path: '/admin/admins', title: 'Admin Emails', subtitle: 'Manage admin access by email' },
  { path: '/admin/teacher-approvals', title: 'Teacher Approvals', subtitle: 'Review and process teacher requests' },
  { path: '/admin/teacher-ops', title: 'Teacher Operations', subtitle: 'Active teacher workload and usage analytics' },
  { path: '/admin/deletions', title: 'Account Deletions', subtitle: 'Process account deletion requests' },
  { path: '/admin/inbox', title: 'Inbound Requests', subtitle: 'Contact and estimator messages' },
];

const resolveHeaderValue = (value: HeaderValue, params: HeaderParams): string =>
  typeof value === 'function' ? value(params) : value;

const getPageHeaderByPathname = (pathname: string): { title: string; subtitle: string } => {
  for (const rule of pageHeaderRules) {
    const match = matchPath({ path: rule.path, end: true }, pathname);
    if (!match) continue;
    return {
      title: resolveHeaderValue(rule.title, match.params),
      subtitle: resolveHeaderValue(rule.subtitle, match.params),
    };
  }

  return {
    title: 'MultiCourses',
    subtitle: 'Learning management platform',
  };
};

function getGreetingByHour() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getSectionSubtitle(sectionKey: string, role?: 'docente' | 'estudiante' | 'admin') {
  const teacherSubtitles: Record<string, string> = {
    dashboard: 'Teacher dashboard overview',
    calendar: 'Schedule and class events',
    courses: 'Course management',
    assessments: 'Assignments and evaluations',
    exerciseBank: 'Question and activity bank',
    slides: 'Presentations and decks',
    files: 'Materials and documents',
    grades: 'Grades and scoring',
    students: 'Students and enrollment',
    statistics: 'Performance analytics',
    notifications: 'Recent alerts and updates',
    admin: 'Admin access and permissions',
    profile: 'Account settings',
  };

  const studentSubtitles: Record<string, string> = {
    dashboard: 'Student dashboard overview',
    calendar: 'Schedule and due dates',
    courses: 'Your enrolled courses',
    assessments: 'Assignments and evaluations',
    exerciseBank: 'Practice quizzes by theme',
    slides: 'Presentations and classes',
    files: 'Files and materials',
    grades: 'Your grades and progress',
    profile: 'Account settings',
  };

  const adminSubtitles: Record<string, string> = {
    dashboard: 'Admin dashboard overview',
    admin: 'Admin modules and governance',
    profile: 'Account settings',
  };

  const source =
    role === 'docente'
      ? teacherSubtitles
      : role === 'admin'
        ? adminSubtitles
        : studentSubtitles;
  return source[sectionKey] ?? 'Section overview';
}

function resolveSectionKey(pathname: string): string {
  if (pathname === '/teacher' || pathname === '/student') return 'dashboard';
  if (pathname.startsWith('/calendar')) return 'calendar';
  if (pathname.startsWith('/grades') || pathname.includes('/grade-sheets')) return 'grades';
  if (pathname.startsWith('/slides')) return 'slides';
  if (pathname.startsWith('/statistics')) return 'statistics';
  if (pathname.startsWith('/teacher/notifications')) return 'notifications';
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/students')) return 'students';
  if (pathname.includes('/exercise-bank')) return 'exerciseBank';
  if (pathname.includes('/assessments')) return 'assessments';
  if (pathname.includes('/files')) return 'files';
  if (pathname.includes('/profile')) return 'profile';
  if (pathname.startsWith('/courses')) return 'courses';
  return 'dashboard';
}

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const maybeToDate = (value as { toDate?: () => Date }).toDate;
    if (typeof maybeToDate === 'function') {
      const date = maybeToDate();
      return Number.isNaN(date.getTime()) ? 0 : date.getTime();
    }
  }
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const seconds = Number((value as { seconds?: unknown }).seconds);
    const nanoseconds = Number((value as { nanoseconds?: unknown }).nanoseconds ?? 0);
    if (Number.isFinite(seconds)) {
      return seconds * 1000 + Math.floor(nanoseconds / 1e6);
    }
  }
  if (typeof value === 'number') return value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function formatNotificationTime(value: unknown): string {
  const millis = toMillis(value);
  if (!millis) return '';
  try {
    return new Date(millis).toLocaleString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}

function getNotificationTone(type: string | undefined, isUnread: boolean): {
  itemClass: string;
  dotClass: string;
  newBadgeClass: string;
} {
  const tone = type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'info';

  if (tone === 'success') {
    return {
      itemClass: isUnread
        ? 'border-emerald-200 bg-emerald-50/85 hover:bg-emerald-100/75'
        : 'border-emerald-100 bg-emerald-50/40 opacity-85 hover:bg-emerald-50/70',
      dotClass: isUnread ? 'fill-emerald-500 text-emerald-500' : 'fill-emerald-300 text-emerald-300',
      newBadgeClass: 'border-emerald-200 bg-emerald-100 text-emerald-700',
    };
  }

  if (tone === 'warning') {
    return {
      itemClass: isUnread
        ? 'border-amber-200 bg-amber-50/85 hover:bg-amber-100/75'
        : 'border-amber-100 bg-amber-50/45 opacity-85 hover:bg-amber-50/70',
      dotClass: isUnread ? 'fill-amber-500 text-amber-500' : 'fill-amber-300 text-amber-300',
      newBadgeClass: 'border-amber-200 bg-amber-100 text-amber-700',
    };
  }

  return {
    itemClass: isUnread
      ? 'border-sky-300 bg-sky-50 hover:bg-sky-100/80'
      : 'border-sky-100 bg-sky-50/40 opacity-85 hover:bg-sky-50/70',
    dotClass: isUnread ? 'fill-sky-500 text-sky-500' : 'fill-sky-300 text-sky-300',
    newBadgeClass: 'border-sky-200 bg-sky-100 text-sky-700',
  };
}

export function DashboardLayout({
  children,
  title,
  subtitle,
  contentClassName,
  showHeader = true,
}: DashboardLayoutProps) {
  const { user, updateProfile } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications();

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(Boolean(user?.preferences?.compactSidebar));
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [avatarEmoji, setAvatarEmoji] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [savingAvatar, setSavingAvatar] = useState(false);
  const notificationsRef = useRef<HTMLDivElement | null>(null);

  const routeHeader = useMemo(() => getPageHeaderByPathname(pathname), [pathname]);
  const resolvedTitle = title ?? routeHeader.title;
  const resolvedSubtitle = subtitle ?? routeHeader.subtitle;
  const userRole = user?.role as 'docente' | 'estudiante' | 'admin' | undefined;
  const isDashboardSection = pathname === '/teacher' || pathname === '/student';
  const sectionKey = useMemo(() => resolveSectionKey(pathname), [pathname]);

  const headerTitle = isDashboardSection
    ? `${getGreetingByHour()}, ${user?.name || 'User'}`
    : resolvedTitle;
  const headerSubtitle = isDashboardSection
    ? getSectionSubtitle('dashboard', userRole)
    : resolvedSubtitle || getSectionSubtitle(sectionKey, userRole);

  useEffect(() => {
    setIsSidebarCollapsed(Boolean(user?.preferences?.compactSidebar));
  }, [user?.preferences?.compactSidebar]);

  useEffect(() => {
    setAvatarEmoji(user?.avatarEmoji?.trim() || '');
    setAvatarUrl(user?.avatarUrl?.trim() || '');
  }, [user?.avatarEmoji, user?.avatarUrl]);

  useEffect(() => {
    setIsNotificationsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isNotificationsOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (notificationsRef.current?.contains(target)) return;
      setIsNotificationsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isNotificationsOpen]);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((current) => !current);
  };

  const hasValidAvatarUrl = (() => {
    const value = avatarUrl.trim();
    if (!value) return false;
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  })();

  const hasEmojiAvatar = avatarEmoji.trim().length > 0;
  const canCompleteAvatarSetup = hasValidAvatarUrl || hasEmojiAvatar;
  const shouldForceAvatarSetup = Boolean(user && !user.avatarSetupCompleted);

  const handleCompleteAvatarSetup = async () => {
    if (!canCompleteAvatarSetup || !user) return;

    try {
      setSavingAvatar(true);
      await updateProfile({
        avatarUrl: hasValidAvatarUrl ? avatarUrl.trim() : '',
        avatarEmoji: avatarEmoji.trim() || '😎',
        avatarSetupCompleted: true,
      });
    } finally {
      setSavingAvatar(false);
    }
  };

  const handleNotificationClick = async (notificationId: string, link?: string) => {
    await markAsRead(notificationId);
    const rawLink = link?.trim();
    if (rawLink) {
      if (/^(mailto:|tel:)/i.test(rawLink)) {
        window.location.href = rawLink;
      } else {
        let resolvedLink = rawLink;
        const isBareDomain =
          /^www\./i.test(rawLink) ||
          /^[a-z0-9.-]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(rawLink);

        if (isBareDomain) {
          resolvedLink = `https://${rawLink}`;
        }

        const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(resolvedLink);
        if (hasScheme) {
          try {
            const parsed = new URL(resolvedLink);
            if (parsed.origin === window.location.origin) {
              navigate(`${parsed.pathname}${parsed.search}${parsed.hash}`);
            } else {
              window.open(parsed.toString(), "_blank", "noopener,noreferrer");
            }
          } catch {
            navigate(resolvedLink.startsWith("/") ? resolvedLink : `/${resolvedLink}`);
          }
        } else {
          navigate(resolvedLink.startsWith("/") ? resolvedLink : `/${resolvedLink}`);
        }
      }
    }
    setIsNotificationsOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebar}
        showCollapseToggle={false}
      />

      <main
        className={cn(
          'relative min-h-screen bg-slate-50 transition-all duration-300',
          isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64',
        )}
      >
        {showHeader ? (
          <header className="sticky top-0 z-30 border-b border-slate-700/60 bg-[#071633] shadow-[0_8px_20px_rgba(15,23,42,0.12)]">
            <div className="flex h-[72px] items-center justify-between gap-3 px-4 pl-16 lg:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className="hidden h-10 w-10 items-center justify-center rounded-xl border border-slate-500/45 bg-slate-900/35 text-slate-100 transition-colors hover:border-sky-300/70 hover:bg-slate-900/50 lg:inline-flex"
                  aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  {isSidebarCollapsed ? (
                    <ChevronRight className="h-5 w-5" />
                  ) : (
                    <ChevronLeft className="h-5 w-5" />
                  )}
                </button>

                <div className="min-w-0">
                  <h1 className="truncate text-lg font-extrabold text-slate-50 sm:text-xl lg:text-2xl">
                    {headerTitle}
                  </h1>
                  <p className="truncate text-xs font-semibold text-blue-200/90 sm:text-sm">
                    {headerSubtitle}
                  </p>
                </div>
              </div>

              <div className="relative" ref={notificationsRef}>
                <button
                  type="button"
                  onClick={() => setIsNotificationsOpen((current) => !current)}
                  className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-500/45 bg-slate-900/35 text-slate-100 transition-colors hover:border-sky-300/70 hover:bg-slate-900/50"
                  aria-label="Notifications"
                >
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 ? (
                    <span className="absolute right-0.5 top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  ) : null}
                </button>

                {isNotificationsOpen ? (
                  <>
                    <button
                      type="button"
                      className="fixed inset-x-0 bottom-0 z-40 bg-slate-900/20"
                      style={{ top: HEADER_HEIGHT }}
                      onClick={() => setIsNotificationsOpen(false)}
                      aria-label="Close notifications"
                    />

                    <div
                      className="fixed right-3 z-50 w-[min(440px,calc(100vw-24px))] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_16px_32px_rgba(15,23,42,0.2)]"
                      style={{ top: HEADER_HEIGHT + 8 }}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-base font-extrabold text-slate-900">Notifications</p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={markAllAsRead}
                            disabled={loading || unreadCount === 0}
                            className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                            Mark all
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsNotificationsOpen(false)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100"
                            aria-label="Close notifications"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                        {loading ? (
                          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading notifications...
                          </div>
                        ) : notifications.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-sm text-slate-600">
                            No notifications available.
                          </div>
                        ) : (
                          notifications.map((item) => {
                            const isUnread = item.read !== true;
                            const formattedTime = formatNotificationTime(item.createdAt);
                            const tone = getNotificationTone(item.type, isUnread);

                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => handleNotificationClick(item.id, item.link)}
                                className={cn(
                                  'w-full rounded-xl border px-3 py-2.5 text-left transition-colors',
                                  tone.itemClass,
                                )}
                              >
                                <div className="flex items-start gap-2">
                                  <Circle
                                    className={cn(
                                      'mt-1 h-2.5 w-2.5 flex-shrink-0',
                                      tone.dotClass,
                                    )}
                                  />

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start gap-2">
                                      <p
                                        className={cn(
                                          'flex-1 break-words whitespace-normal text-sm font-semibold leading-5',
                                          isUnread ? 'text-slate-900' : 'text-slate-700',
                                        )}
                                      >
                                        {item.title || 'Notification'}
                                      </p>
                                      {isUnread ? (
                                        <span
                                          className={cn(
                                            'rounded-full border px-1.5 py-0.5 text-[10px] font-bold',
                                            tone.newBadgeClass,
                                          )}
                                        >
                                          NEW
                                        </span>
                                      ) : null}
                                    </div>

                                    <p className="mt-0.5 break-words whitespace-pre-wrap text-xs leading-5 text-slate-600">
                                      {item.message || ''}
                                    </p>
                                    {formattedTime ? (
                                      <p className="mt-1 text-[11px] text-slate-500">{formattedTime}</p>
                                    ) : null}
                                  </div>
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </header>
        ) : null}

        <div
          className={cn(
            'bg-slate-50',
            showHeader ? 'px-4 pb-6 pt-4 lg:px-6' : 'pr-4 pb-4 pt-20 pl-20 sm:pt-16 sm:pl-16',
            contentClassName,
          )}
        >
          {children}
        </div>
      </main>

      {shouldForceAvatarSetup ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-2xl">
            <div className="bg-blue-700 px-6 py-5 text-white">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Set your profile photo</h2>
                  <p className="text-sm text-blue-100">
                    Choose an icon or add an image URL to continue.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-5 p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-blue-100 bg-blue-50 text-4xl">
                  {hasValidAvatarUrl ? (
                    <img src={avatarUrl.trim()} alt="Avatar preview" className="h-full w-full object-cover" />
                  ) : (
                    <span>{avatarEmoji || '🙂'}</span>
                  )}
                </div>
                <p className="text-sm text-gray-600">This step is required only once.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-800">Image URL (optional)</label>
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(event) => setAvatarUrl(event.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                  className="h-11 w-full rounded-xl border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {avatarUrl.trim().length > 0 && !hasValidAvatarUrl ? (
                  <p className="text-xs text-red-500">Enter a valid `http` or `https` URL.</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-800">Or pick an icon</p>
                <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
                  {avatarOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setAvatarEmoji(option)}
                      className={cn(
                        'h-11 w-11 rounded-xl border text-2xl transition-colors',
                        avatarEmoji === option
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/60',
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleCompleteAvatarSetup}
                disabled={!canCompleteAvatarSetup || savingAvatar}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save and continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
