export interface NotificationAutomationSettings {
  assessmentCreated: boolean;
  assessmentUpdated: boolean;
  assessmentCancelled: boolean;
  newMaterial: boolean;
  gradePublished: boolean;
  deadlineReminder: boolean;
  deadlineReminderHours: number;
}

export type NotificationAutomationKey = keyof NotificationAutomationSettings;

export const defaultNotificationAutomations: NotificationAutomationSettings = {
  assessmentCreated: true,
  assessmentUpdated: true,
  assessmentCancelled: true,
  newMaterial: true,
  gradePublished: true,
  deadlineReminder: true,
  deadlineReminderHours: 24,
};

const getStorageKey = (userId: string) => `notifications:automations:${userId}`;

export function getNotificationAutomations(userId?: string): NotificationAutomationSettings {
  if (!userId || typeof window === "undefined") {
    return defaultNotificationAutomations;
  }

  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return defaultNotificationAutomations;

    const parsed = JSON.parse(raw) as Partial<NotificationAutomationSettings>;
    return {
      ...defaultNotificationAutomations,
      ...parsed,
    };
  } catch {
    return defaultNotificationAutomations;
  }
}

export function isNotificationAutomationEnabled(
  userId: string | undefined,
  key: NotificationAutomationKey,
): boolean {
  return getNotificationAutomations(userId)[key];
}
