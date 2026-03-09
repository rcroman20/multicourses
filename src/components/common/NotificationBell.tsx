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
    <div ref={bellRef} className={cn("td-notification-wrap", className)}>
      <button
        type="button"
        onClick={() => setIsNotificationsOpen((prev) => !prev)}
        className="td-notification-btn"
        aria-label="Notifications"
      >
        <Bell className="td-notification-icon" />
        {unreadCount > 0 && (
          <span className="td-notification-badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isNotificationsOpen && (
        <div className="td-notification-popover">
          <div className="td-notification-header">
            <p className="td-notification-title">Notifications</p>
            <button
              type="button"
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
              className="td-notification-mark-all"
            >
              <CheckCheck className="td-notification-mark-icon" />
              Mark all read
            </button>
          </div>

          <div className="td-notification-list">
            {notificationsLoading ? (
              <div className="td-notification-empty">Loading notifications...</div>
            ) : notifications.length === 0 ? (
              <div className="td-notification-empty">No notifications yet.</div>
            ) : (
              notifications.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNotificationClick(item.id, item.link)}
                  className="td-notification-item"
                >
                  <div className="td-notification-item-row">
                    <Circle
                      className={`td-notification-dot ${
                        item.read
                          ? "td-notification-dot-read"
                          : "td-notification-dot-unread"
                      }`}
                    />
                    <div className="td-notification-item-main">
                      <p className="td-notification-item-title">{item.title}</p>
                      <p className="td-notification-item-message">{item.message}</p>
                      <p className="td-notification-item-date">
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
