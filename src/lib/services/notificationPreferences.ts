import type { NotificationType } from "@/lib/services/notificationService";

export interface NotificationHubPreferences {
  quietHoursEnabled: boolean;
  quietHourStart: string;
  quietHourEnd: string;
  muteInfo: boolean;
  muteSuccess: boolean;
  muteWarning: boolean;
}

export const defaultNotificationHubPreferences: NotificationHubPreferences = {
  quietHoursEnabled: false,
  quietHourStart: "22:00",
  quietHourEnd: "07:00",
  muteInfo: false,
  muteSuccess: false,
  muteWarning: false,
};

const getPrefsKey = (userId: string) => `notifications:hubprefs:${userId}`;

export function getNotificationHubPreferences(userId?: string): NotificationHubPreferences {
  if (!userId || typeof window === "undefined") {
    return defaultNotificationHubPreferences;
  }

  try {
    const raw = localStorage.getItem(getPrefsKey(userId));
    if (!raw) return defaultNotificationHubPreferences;
    const parsed = JSON.parse(raw) as Partial<NotificationHubPreferences>;
    return {
      ...defaultNotificationHubPreferences,
      ...parsed,
    };
  } catch {
    return defaultNotificationHubPreferences;
  }
}

function timeToMinutes(value: string): number {
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return 0;
  }
  return hour * 60 + minute;
}

export function isWithinQuietHours(
  prefs: NotificationHubPreferences,
  at: Date = new Date(),
): boolean {
  if (!prefs.quietHoursEnabled) return false;

  const start = timeToMinutes(prefs.quietHourStart);
  const end = timeToMinutes(prefs.quietHourEnd);
  const current = at.getHours() * 60 + at.getMinutes();

  if (start === end) return true;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

export function isMutedType(
  prefs: NotificationHubPreferences,
  type: NotificationType,
): boolean {
  if (type === "info") return prefs.muteInfo;
  if (type === "success") return prefs.muteSuccess;
  return prefs.muteWarning;
}
