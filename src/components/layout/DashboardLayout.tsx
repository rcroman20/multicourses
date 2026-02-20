// src/components/layout/DashboardLayout.tsx - MODIFICADO
import { ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { Bell, CheckCheck, Circle, Loader2, Menu, Sparkles } from 'lucide-react';

interface DashboardLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  contentClassName?: string;
}

const avatarOptions = ['😎', '🧠', '🎓', '🚀', '📚', '💡', '🧪', '🧩', '🔥', '🌟', '🦊', '🐼', '🐧', '🦉', '🐱'];

export function DashboardLayout({
  children,
  title,
  subtitle,
  contentClassName,
}: DashboardLayoutProps) {
  const { user, updateProfile } = useAuth();
  const navigate = useNavigate();
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    Boolean(user?.preferences?.compactSidebar),
  );
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [avatarEmoji, setAvatarEmoji] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [savingAvatar, setSavingAvatar] = useState(false);

  useEffect(() => {
    setIsSidebarCollapsed(Boolean(user?.preferences?.compactSidebar));
  }, [user?.preferences?.compactSidebar]);

  useEffect(() => {
    setAvatarEmoji(user?.avatarEmoji?.trim() || '');
    setAvatarUrl(user?.avatarUrl?.trim() || '');
  }, [user?.avatarEmoji, user?.avatarUrl]);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
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
    if (link) navigate(link);
    setIsNotificationsOpen(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar 
        isCollapsed={isSidebarCollapsed} 
        onToggleCollapse={toggleSidebar}
      />
      
      <main className={cn(
        "min-h-screen transition-all duration-300",
        isSidebarCollapsed ? "lg:ml-16" : "lg:ml-64"
      )}>
        {/* Header */}
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-sm border-b border-border">
          <div className="py-4 pr-4 pl-16 lg:px-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Toggle button para desktop */}
                <button
                  onClick={toggleSidebar}
                  className="hidden lg:flex items-center justify-center h-5 w-5 rounded-lg text-gray-600 hover:bg-blue-100 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:bg-blue-100 transition-colors"
                  aria-label={isSidebarCollapsed ? 'Expandir sidebar' : 'Contraer sidebar'}
                >
                  <Menu className="h-5 w-5" />
                </button>
                
                <div className="flex flex-col gap-1">
                  {title && (
                    <h1 className="text-2xl font-bold text-foreground lg:text-3xl">
                      {title}
                    </h1>
                  )}
                  {subtitle && (
                    <p className="text-muted-foreground">{subtitle}</p>
                  )}
                </div>
              </div>
              
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsNotificationsOpen((prev) => !prev)}
                  className="relative h-10 w-10 rounded-xl border border-blue-200 bg-blue-100/50 hover:bg-blue-100 flex items-center justify-center transition-colors"
                  aria-label="Notifications"
                >
                  <Bell className="h-5 w-5 text-blue-600" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>

                {isNotificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
                      <p className="text-sm font-semibold text-gray-900">Notifications</p>
                      <button
                        type="button"
                        onClick={markAllAsRead}
                        disabled={unreadCount === 0}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 disabled:text-gray-400"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        Mark all read
                      </button>
                    </div>

                    <div className="max-h-80 overflow-y-auto">
                      {loading ? (
                        <div className="px-3 py-4 text-sm text-gray-500">Loading notifications...</div>
                      ) : notifications.length === 0 ? (
                        <div className="px-3 py-4 text-sm text-gray-500">No notifications yet.</div>
                      ) : (
                        notifications.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleNotificationClick(item.id, item.link)}
                            className="w-full text-left px-3 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-start gap-2">
                              <Circle
                                className={`h-2.5 w-2.5 mt-1.5 ${
                                  item.read ? 'text-gray-300 fill-gray-300' : 'text-blue-500 fill-blue-500'
                                }`}
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">{item.title}</p>
                                <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{item.message}</p>
                                <p className="text-[11px] text-gray-400 mt-1">
                                  {item.createdAt.toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className={cn("p-4 lg:p-8", contentClassName)}>
          {children}
        </div>
      </main>

      {shouldForceAvatarSetup && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl border border-blue-200 bg-white shadow-2xl overflow-hidden">
            <div className="bg-blue-600 px-6 py-5 text-white">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
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

            <div className="p-6 space-y-5">
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 rounded-2xl border border-blue-100 bg-blue-50 overflow-hidden flex items-center justify-center text-4xl">
                  {hasValidAvatarUrl ? (
                    <img src={avatarUrl.trim()} alt="Avatar preview" className="h-full w-full object-cover" />
                  ) : (
                    <span>{avatarEmoji || '🙂'}</span>
                  )}
                </div>
                <p className="text-sm text-gray-600">
                  This step is required only once.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-800">Image URL (optional)</label>
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                  className="w-full h-11 rounded-xl border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {avatarUrl.trim().length > 0 && !hasValidAvatarUrl && (
                  <p className="text-xs text-red-500">Enter a valid `http` or `https` URL.</p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-800">Or pick an icon</p>
                <div className="grid grid-cols-5 sm:grid-cols-8 gap-2">
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
                className="w-full h-11 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                {savingAvatar && <Loader2 className="h-4 w-4 animate-spin" />}
                Save and continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Si no tienes la función cn, puedes usar esta simple versión
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
