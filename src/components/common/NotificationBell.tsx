import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, Circle } from "lucide-react";
import { useNotifications } from "@/contexts/NotificationContext";
import { cn } from "@/lib/utils";

interface NotificationBellProps {
  className?: string;
}

export function NotificationBell({ className }: NotificationBellProps) {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    loading: notificationsLoading,
    markAsRead,
    markAllAsRead,
  } = useNotifications();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isNotificationsOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (bellRef.current?.contains(target)) return;
      setIsNotificationsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isNotificationsOpen]);

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
    <div ref={bellRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setIsNotificationsOpen((prev) => !prev)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200/60 bg-white text-blue-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-[0.3rem] -top-[0.3rem] z-[2] inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-red-500 px-[0.2rem] text-[10px] font-bold leading-4 text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isNotificationsOpen && (
        <div className="absolute right-0 top-[calc(100%+0.45rem)] z-[60] w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200/60 bg-white shadow-[0_16px_30px_-18px_rgba(15,23,42,0.45)] max-md:fixed max-md:left-3 max-md:right-3 max-md:top-[calc(env(safe-area-inset-top,0px)+3.65rem)] max-md:z-[80] max-md:w-auto max-md:max-h-[calc(100vh-env(safe-area-inset-top,0px)-4.5rem)]">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 px-3 py-[0.55rem]">
            <p className="text-[0.8125rem] font-bold leading-[1.125rem] text-slate-900">Notifications</p>
            <button
              type="button"
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
              className="inline-flex items-center gap-[0.2rem] bg-transparent text-[11px] font-semibold leading-3.5 text-blue-600 transition hover:text-blue-700 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              <CheckCheck className="h-[0.8rem] w-[0.8rem]" />
              Mark all read
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notificationsLoading ? (
              <div className="px-3 py-[0.85rem] text-[0.8125rem] leading-[1.125rem] text-slate-500">Loading notifications...</div>
            ) : notifications.length === 0 ? (
              <div className="px-3 py-[0.85rem] text-[0.8125rem] leading-[1.125rem] text-slate-500">No notifications yet.</div>
            ) : (
              notifications.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNotificationClick(item.id, item.link)}
                  className="w-full border-b border-slate-100 bg-white px-3 py-[0.7rem] text-left transition last:border-b-0 hover:bg-slate-50"
                >
                  <div className="flex items-start gap-[0.45rem]">
                    <Circle
                      className={`mt-[0.3rem] h-2.5 w-2.5 shrink-0 ${
                        item.read
                          ? "fill-slate-300 text-slate-300"
                          : "fill-blue-500 text-blue-500"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[0.8125rem] font-bold leading-[1.1rem] text-slate-900">{item.title}</p>
                      <p className="mt-[0.1rem] line-clamp-2 text-xs leading-4 text-slate-600">{item.message}</p>
                      <p className="mt-1 text-[11px] leading-3.5 text-slate-400">
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
  );
}
