import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademic } from "@/contexts/AcademicContext";
import {
  notificationService,
  type AppNotification,
  type NotificationType,
} from "@/lib/services/notificationService";
import { assessmentService } from "@/lib/services/assessmentService";
import {
  getNotificationAutomations,
  isNotificationAutomationEnabled,
} from "@/lib/services/notificationAutomation";
import {
  getNotificationHubPreferences,
  isMutedType,
  isWithinQuietHours,
} from "@/lib/services/notificationPreferences";

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  createNotification: (input: {
    title: string;
    message: string;
    type?: NotificationType;
    link?: string; 
  }) => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { courses, assessments, grades } = useAcademic();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const hasInitializedSoundRef = useRef(false);
  const previousUnreadCountRef = useRef(0);
  const processingDeadlineRemindersRef = useRef(false);
  const processingStudentRemindersRef = useRef(false);

  useEffect(() => {
    if (!user?.id) return;

    const cleanupKey = `notifications:trim:lastRun:${user.id}`;
    const lastRun = Number(localStorage.getItem(cleanupKey) || 0);
    const minIntervalMs = 10 * 60 * 1000; // every 10 minutes
    if (Date.now() - lastRun < minIntervalMs) return;

    void notificationService
      .cleanupExcessNotifications(user.id, 20)
      .then(() => {
        localStorage.setItem(cleanupKey, String(Date.now()));
      })
      .catch(() => null);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    notificationService
      .ensureWelcomeNotification(user.id)
      .catch(() => null)
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    const unsubscribe = notificationService.subscribeUserNotifications(
      user.id,
      (list) => {
        setNotifications(list);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [user?.id]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications],
  );

  useEffect(() => {
    if (!user?.id) {
      hasInitializedSoundRef.current = false;
      previousUnreadCountRef.current = 0;
      return;
    }

    if (loading) return;

    if (!hasInitializedSoundRef.current) {
      hasInitializedSoundRef.current = true;
      previousUnreadCountRef.current = unreadCount;
      return;
    }

    const shouldPlaySound =
      user.preferences?.soundEffects &&
      unreadCount > previousUnreadCountRef.current;

    const hubPrefs = getNotificationHubPreferences(user.id);
    const latestUnread = notifications.find((item) => !item.read);
    const mutedLatestType = latestUnread ? isMutedType(hubPrefs, latestUnread.type) : false;
    const blockedByQuietHours = isWithinQuietHours(hubPrefs);
    previousUnreadCountRef.current = unreadCount;

    if (!shouldPlaySound || mutedLatestType || blockedByQuietHours) return;

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;

      const audioContext = new AudioContextClass();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.04, audioContext.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 1);

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 1);
      oscillator.onended = () => {
        audioContext.close().catch(() => null);
      };
    } catch {
      // Ignore playback errors (browser autoplay policies, etc.)
    }
  }, [loading, notifications, unreadCount, user?.id, user?.preferences?.soundEffects]);

  const createNotification: NotificationContextType["createNotification"] = async (input) => {
    if (!user?.id) return;
    await notificationService.createNotification(user.id, input);
  };

  const markAsRead: NotificationContextType["markAsRead"] = async (notificationId) => {
    if (!user?.id) return;
    await notificationService.markAsRead(user.id, notificationId);
  };

  const markAllAsRead: NotificationContextType["markAllAsRead"] = async () => {
    if (!user?.id) return;
    const unreadIds = notifications.filter((item) => !item.read).map((item) => item.id);
    await notificationService.markAllAsRead(user.id, unreadIds);
  };

  useEffect(() => {
    if (!user?.id || user.role !== "docente") return;
    if (!isNotificationAutomationEnabled(user.id, "deadlineReminder")) return;

    const teacherCourses = courses.filter((course) => course.teacherId === user.id);
    if (teacherCourses.length === 0) return;

    const sentKey = `notifications:deadline:auto:sent:${user.id}`;
    const loadSentMap = (): Record<string, number> => {
      try {
        const raw = localStorage.getItem(sentKey);
        return raw ? (JSON.parse(raw) as Record<string, number>) : {};
      } catch {
        return {};
      }
    };
    const saveSentMap = (next: Record<string, number>) => {
      localStorage.setItem(sentKey, JSON.stringify(next));
    };

    const parseDueDateTimestamp = (value: unknown): number | null => {
      if (!value) return null;
      if (value instanceof Date) return value.getTime();
      if (typeof value !== "string") return null;

      // If date-only (YYYY-MM-DD), treat deadline as end of that local day.
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split("-").map(Number);
        return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
      }

      const timestamp = new Date(value).getTime();
      return Number.isNaN(timestamp) ? null : timestamp;
    };

    const runDeadlineReminderJob = async () => {
      if (processingDeadlineRemindersRef.current) return;
      processingDeadlineRemindersRef.current = true;

      try {
        const hubPrefs = getNotificationHubPreferences(user.id);
        if (isWithinQuietHours(hubPrefs) || isMutedType(hubPrefs, "warning")) {
          return;
        }

        const now = Date.now();
        const reminderWindowHours = Math.max(
          1,
          Number(getNotificationAutomations(user.id).deadlineReminderHours || 24),
        );
        const reminderWindowMs = reminderWindowHours * 60 * 60 * 1000;
        const sentMap = loadSentMap();
        let hasChanges = false;

        for (const course of teacherCourses) {
          const assessments = await assessmentService.getCourseAssessments(course.id);
          const recipientIds = (course.enrolledStudents || []).filter(
            (entry): entry is string => typeof entry === "string" && entry.length > 0,
          );
          if (recipientIds.length === 0) continue;

          for (const assessment of assessments) {
            const dueTs = parseDueDateTimestamp((assessment as { dueDate?: unknown }).dueDate);
            if (!dueTs || dueTs <= now) continue;

            const msUntilDue = dueTs - now;
            if (msUntilDue > reminderWindowMs) continue;

            const reminderId = `deadline:${course.id}:${assessment.id}:${dueTs}`;
            if (sentMap[reminderId]) continue;

            await Promise.all(
              recipientIds.map((studentId) =>
                notificationService.createNotification(studentId, {
                  title: "Deadline reminder",
                  message: `"${assessment.name}" is due on ${new Date(dueTs).toLocaleString("en-GB")}.`,
                  type: "warning",
                  link: `/courses/${course.code}/assessments`,
                }),
              ),
            );

            sentMap[reminderId] = now;
            hasChanges = true;
          }
        }

        if (hasChanges) saveSentMap(sentMap);
      } catch {
        // Prevent loop breaks due to transient failures.
      } finally {
        processingDeadlineRemindersRef.current = false;
      }
    };

    void runDeadlineReminderJob();
    const intervalId = window.setInterval(() => {
      void runDeadlineReminderJob();
    }, 5 * 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, [courses, user?.id, user?.role]);

  useEffect(() => {
    if (!user?.id || user.role !== "estudiante") return;
    if (!isNotificationAutomationEnabled(user.id, "deadlineReminder")) return;

    const studentCourses = courses.filter((course) =>
      (course.enrolledStudents || []).includes(user.id),
    );
    if (studentCourses.length === 0) return;

    const courseById = studentCourses.reduce<Record<string, (typeof studentCourses)[number]>>(
      (acc, course) => {
        acc[course.id] = course;
        return acc;
      },
      {},
    );

    const sentKey = `notifications:smart:student:sent:${user.id}`;
    const loadSentMap = (): Record<string, number> => {
      try {
        const raw = localStorage.getItem(sentKey);
        return raw ? (JSON.parse(raw) as Record<string, number>) : {};
      } catch {
        return {};
      }
    };
    const saveSentMap = (next: Record<string, number>) => {
      localStorage.setItem(sentKey, JSON.stringify(next));
    };

    const parseDueDateTimestamp = (value: unknown): number | null => {
      if (!value) return null;
      if (value instanceof Date) return value.getTime();
      if (typeof value !== "string") return null;

      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split("-").map(Number);
        return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
      }

      const timestamp = new Date(value).getTime();
      return Number.isNaN(timestamp) ? null : timestamp;
    };

    const runSmartReminderJob = async () => {
      if (processingStudentRemindersRef.current) return;
      processingStudentRemindersRef.current = true;

      try {
        const hubPrefs = getNotificationHubPreferences(user.id);
        if (isWithinQuietHours(hubPrefs)) return;

        const now = Date.now();
        const sentMap = loadSentMap();
        let hasChanges = false;

        // Rule 1: upcoming deadlines in the next 48h.
        const upcomingWindowMs = 48 * 60 * 60 * 1000;
        for (const assessment of assessments) {
          const course = courseById[assessment.courseId];
          if (!course) continue;

          const dueTs = parseDueDateTimestamp((assessment as { dueDate?: unknown }).dueDate);
          if (!dueTs || dueTs <= now) continue;
          if (dueTs - now > upcomingWindowMs) continue;

          const reminderId = `student:deadline:${assessment.id}:${dueTs}`;
          if (sentMap[reminderId]) continue;

          if (!isMutedType(hubPrefs, "warning")) {
            await notificationService.createNotification(user.id, {
              title: "Upcoming deadline",
              message: `"${assessment.name}" is due on ${new Date(dueTs).toLocaleString("en-GB")}.`,
              type: "warning",
              link: `/courses/${course.code}/assessments/${assessment.id}`,
            });
          }

          sentMap[reminderId] = now;
          hasChanges = true;
        }

        // Rule 2: low average risk alert (once per day).
        const studentGrades = grades.filter(
          (grade) =>
            grade.studentId === user.id &&
            Boolean(courseById[grade.courseId]) &&
            typeof grade.value === "number",
        );

        if (studentGrades.length >= 3) {
          const average =
            studentGrades.reduce((sum, grade) => sum + Number(grade.value || 0), 0) /
            studentGrades.length;
          const riskKey = `student:risk:low-average:${new Date().toISOString().slice(0, 10)}`;

          if (average < 3 && !sentMap[riskKey]) {
            if (!isMutedType(hubPrefs, "warning")) {
              await notificationService.createNotification(user.id, {
                title: "Academic risk detected",
                message: `Your current average is ${average.toFixed(2)}. Review pending activities and plan recovery this week.`,
                type: "warning",
                link: "/grades",
              });
            }
            sentMap[riskKey] = now;
            hasChanges = true;
          }
        }

        if (hasChanges) saveSentMap(sentMap);
      } catch {
        // Best effort to avoid blocking the app.
      } finally {
        processingStudentRemindersRef.current = false;
      }
    };

    void runSmartReminderJob();
    const intervalId = window.setInterval(() => {
      void runSmartReminderJob();
    }, 10 * 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, [assessments, courses, grades, user?.id, user?.role]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        createNotification,
        markAsRead,
        markAllAsRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
