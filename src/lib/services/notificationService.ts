import {
  addDoc,
  collection,
  deleteDoc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  updateDoc,
  doc,
  writeBatch,
} from "firebase/firestore";
import { firebaseAuth, firebaseDB } from "@/lib/firebase";

export type NotificationType = "info" | "success" | "warning";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  link?: string;
  courseCode?: string;
  createdAt: Date;
}

interface CreateNotificationInput {
  title: string;
  message: string;
  type?: NotificationType;
  link?: string;
  courseCode?: string;
  dedupeKey?: string;
}

const notificationsCollection = (userId: string) =>
  collection(firebaseDB, "usuarios", userId, "notifications");

const RESERVED_COURSE_SEGMENTS = new Set([
  "view",
  "create",
  "edit",
  "new",
  "grades",
  "assessments",
  "files",
  "exercise-bank",
  "grade-sheets",
]);

const extractCourseCodeFromLink = (link?: string): string | undefined => {
  if (!link) return undefined;
  const cleaned = link.trim();
  if (!cleaned) return undefined;

  const fromView = cleaned.match(/\/courses\/view\/([^/?#]+)/i);
  const fromCourse = cleaned.match(/\/courses\/([^/?#]+)(?:\/|$)/i);
  const rawCandidate = fromView?.[1] || fromCourse?.[1] || "";
  let candidate = "";
  try {
    candidate = decodeURIComponent(rawCandidate).trim();
  } catch {
    candidate = rawCandidate.trim();
  }
  if (!candidate) return undefined;
  if (RESERVED_COURSE_SEGMENTS.has(candidate.toLowerCase())) return undefined;
  return candidate.toUpperCase();
};

const mapNotification = (id: string, data: Record<string, unknown>): AppNotification => {
  const createdAtValue = data.createdAt as Timestamp | undefined;
  const link = data.link ? String(data.link) : undefined;
  const courseCodeFromData =
    typeof data.courseCode === "string" ? data.courseCode.trim().toUpperCase() : "";
  const courseCode = courseCodeFromData || extractCourseCodeFromLink(link);
  const rawTitle = String(data.title || "").trim();
  const title =
    courseCode && rawTitle && !rawTitle.toUpperCase().includes(courseCode)
      ? `${rawTitle} • ${courseCode}`
      : rawTitle;

  return {
    id,
    title,
    message: String(data.message || ""),
    type: (data.type as NotificationType) || "info",
    read: Boolean(data.read),
    link,
    courseCode: courseCode || undefined,
    createdAt: createdAtValue?.toDate?.() || new Date(),
  };
};

const normalizeNotificationField = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const hasNotificationPayloadChanged = (
  existingData: Record<string, unknown>,
  nextPayload: {
    title: string;
    message: string;
    type: NotificationType;
    link: string;
  },
): boolean =>
  normalizeNotificationField(existingData.title) !== nextPayload.title ||
  normalizeNotificationField(existingData.message) !== nextPayload.message ||
  normalizeNotificationField(existingData.type) !== nextPayload.type ||
  normalizeNotificationField(existingData.link) !== nextPayload.link;

export const notificationService = {
  subscribeUserNotifications(
    userId: string,
    onData: (notifications: AppNotification[]) => void,
    onError?: (error: unknown) => void,
  ) {
    const q = query(
      notificationsCollection(userId),
      orderBy("createdAt", "desc"),
      limit(50),
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const notifications = snapshot.docs.map((item) =>
          mapNotification(item.id, item.data() as Record<string, unknown>),
        );
        onData(notifications);
      },
      (error) => {
        onError?.(error);
      },
    );
  },

  async createNotification(userId: string, input: CreateNotificationInput) {
    const currentUserId = firebaseAuth.currentUser?.uid || "";
    if (!currentUserId) {
      throw new Error("You must be signed in to create notifications.");
    }

    const expiresAt = Timestamp.fromDate(
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    );
    const link = input.link?.trim() || "";

    const payload = {
      title: input.title.trim(),
      message: input.message.trim(),
      type: input.type || "info",
      link,
      senderId: currentUserId,
      read: false,
      createdAt: Timestamp.now(),
      expiresAt,
    };

    const dedupeKey = input.dedupeKey?.trim();
    if (dedupeKey) {
      try {
        const safeDedupeId = dedupeKey
          .replace(/[^a-zA-Z0-9:_-]/g, "_")
          .slice(0, 240);
        const notificationRef = doc(firebaseDB, "usuarios", userId, "notifications", `dedupe_${safeDedupeId}`);

        // Dedupe by deterministic ID only when the sender can read the target path.
        // For cross-user writes (teacher -> students), fallback to addDoc to avoid read-denied errors.
        if (currentUserId && currentUserId === userId) {
          const existing = await getDoc(notificationRef);
          if (!existing.exists()) {
            await setDoc(notificationRef, payload);
          } else {
            const existingData = existing.data() as Record<string, unknown>;
            if (
              hasNotificationPayloadChanged(existingData, {
                title: payload.title,
                message: payload.message,
                type: payload.type,
                link: payload.link,
              })
            ) {
              // Firestore rules only allow updating the "read" field.
              // Keep existing deduped notification and avoid forbidden updates.
              return;
            }
          }
        } else {
          await addDoc(notificationsCollection(userId), payload);
        }
      } catch {
        // If dedupe logic fails for any reason, fallback to a regular notification write.
        await addDoc(notificationsCollection(userId), payload);
      }
    } else {
      await addDoc(notificationsCollection(userId), payload);
    }

    // Keep collection lean: retain only the latest 50 notifications.
    try {
      await this.cleanupExcessNotifications(userId, 50);
    } catch {
      // Best effort cleanup; do not fail notification delivery on permission/index issues.
    }
  },

  async ensureWelcomeNotification(userId: string) {
    const userRef = doc(firebaseDB, "usuarios", userId);
    const userSnapshot = await getDoc(userRef);
    const userData = userSnapshot.data() as
      | { notificationsWelcomeSent?: boolean }
      | undefined;

    // Send welcome only once in the lifetime of the user account.
    if (userData?.notificationsWelcomeSent) return;

    await this.createNotification(userId, {
      title: "Welcome",
      message: "Your in-app notifications are now active.",
      type: "success",
    });

    await setDoc(
      userRef,
      {
        notificationsWelcomeSent: true,
        notificationsWelcomeSentAt: serverTimestamp(),
      },
      { merge: true },
    );
  },

  async markAsRead(userId: string, notificationId: string) {
    await updateDoc(
      doc(firebaseDB, "usuarios", userId, "notifications", notificationId),
      { read: true },
    );
  },

  async markAllAsRead(userId: string, notificationIds: string[]) {
    if (notificationIds.length === 0) return;

    const batch = writeBatch(firebaseDB);
    notificationIds.forEach((id) => {
      batch.update(doc(firebaseDB, "usuarios", userId, "notifications", id), {
        read: true,
      });
    });
    await batch.commit();
  },

  async cleanupOldNotifications(userId: string, days = 7) {
    const cutoff = Timestamp.fromDate(
      new Date(Date.now() - days * 24 * 60 * 60 * 1000),
    );

    const q = query(
      notificationsCollection(userId),
      where("createdAt", "<=", cutoff),
      limit(200),
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return 0;

    const batch = writeBatch(firebaseDB);
    snapshot.docs.forEach((item) => {
      batch.delete(item.ref);
    });
    await batch.commit();
    return snapshot.size;
  },

  async cleanupExcessNotifications(userId: string, keep = 20) {
    const q = query(
      notificationsCollection(userId),
      orderBy("createdAt", "desc"),
      limit(500),
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty || snapshot.size <= keep) return 0;

    const toDelete = snapshot.docs.slice(keep);
    const batch = writeBatch(firebaseDB);
    toDelete.forEach((item) => {
      batch.delete(item.ref);
    });
    await batch.commit();
    return toDelete.length;
  },

  async cleanupDuplicateNotifications(userId: string, recentHours = 72) {
    const q = query(
      notificationsCollection(userId),
      orderBy("createdAt", "desc"),
      limit(200),
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return 0;

    const cutoff = Date.now() - recentHours * 60 * 60 * 1000;
    const seen = new Set<string>();
    const toDelete: typeof snapshot.docs = [];

    snapshot.docs.forEach((docSnapshot) => {
      const data = docSnapshot.data() as Record<string, unknown>;
      const createdAt = (data.createdAt as Timestamp | undefined)?.toDate?.().getTime() || 0;
      const title = String(data.title || "").trim();
      const message = String(data.message || "").trim();
      const type = String(data.type || "info");
      const link = String(data.link || "");
      const dedupe = String(data.dedupeKey || "").trim();

      if (createdAt > 0 && createdAt < cutoff) return;

      const fingerprint = dedupe || `${type}|${title}|${message}|${link}`;
      if (!fingerprint) return;

      if (seen.has(fingerprint)) {
        toDelete.push(docSnapshot);
        return;
      }
      seen.add(fingerprint);
    });

    if (toDelete.length === 0) return 0;

    const batch = writeBatch(firebaseDB);
    toDelete.forEach((item) => {
      batch.delete(item.ref);
    });
    await batch.commit();
    return toDelete.length;
  },
};
