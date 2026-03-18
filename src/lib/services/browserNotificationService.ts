import {
  getAdminPlatformSettings,
  resolvePlatformRasterIconUrl,
} from "@/lib/services/adminSettingsService";

export interface BrowserNotificationPayload {
  title: string;
  body: string;
  link?: string;
  tag?: string;
}

export const isBrowserNotificationSupported = () =>
  typeof window !== "undefined" && "Notification" in window;

export const getBrowserNotificationPermission = (): NotificationPermission | "unsupported" => {
  if (!isBrowserNotificationSupported()) return "unsupported";
  return Notification.permission;
};

export const requestBrowserNotificationPermission = async (): Promise<NotificationPermission | "unsupported"> => {
  if (!isBrowserNotificationSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
};

export const showBrowserNotification = async ({
  title,
  body,
  link,
  tag,
}: BrowserNotificationPayload): Promise<boolean> => {
  if (!isBrowserNotificationSupported()) return false;
  if (Notification.permission !== "granted") return false;

  const cleanTitle = title.trim();
  const cleanBody = body.trim();
  if (!cleanTitle || !cleanBody) return false;
  const appIconPath = resolvePlatformRasterIconUrl(getAdminPlatformSettings().logoUrl);

  const normalizedLink = typeof link === "string" ? link.trim() : "";
  const notificationTag = tag?.trim() || normalizedLink || cleanTitle;

  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.showNotification) {
        await registration.showNotification(cleanTitle, {
          body: cleanBody,
          icon: appIconPath,
          badge: appIconPath,
          tag: notificationTag,
          data: normalizedLink ? { link: normalizedLink } : {},
        });
        return true;
      }
    }

    const notification = new Notification(cleanTitle, {
      body: cleanBody,
      icon: appIconPath,
      tag: notificationTag,
    });

    notification.onclick = () => {
      window.focus();
      if (normalizedLink) {
        window.location.assign(normalizedLink);
      }
      notification.close();
    };

    return true;
  } catch {
    return false;
  }
};
