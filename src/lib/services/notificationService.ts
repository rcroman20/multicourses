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
import { firebaseDB } from "@/lib/firebase";

export type NotificationType = "info" | "success" | "warning";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  link?: string;
  createdAt: Date;
}

interface CreateNotificationInput {
  title: string;
  message: string;
  type?: NotificationType;
  link?: string;
}

const notificationsCollection = (userId: string) =>
  collection(firebaseDB, "usuarios", userId, "notifications");

const mapNotification = (id: string, data: Record<string, unknown>): AppNotification => {
  const createdAtValue = data.createdAt as Timestamp | undefined;

  return {
    id,
    title: String(data.title || ""),
    message: String(data.message || ""),
    type: (data.type as NotificationType) || "info",
    read: Boolean(data.read),
    link: data.link ? String(data.link) : undefined,
    createdAt: createdAtValue?.toDate?.() || new Date(),
  };
};

export const notificationService = {
  subscribeUserNotifications(
    userId: string,
    onData: (notifications: AppNotification[]) => void,
    onError?: (error: unknown) => void,
  ) {
    const q = query(
      notificationsCollection(userId),
      orderBy("createdAt", "desc"),
      limit(20),
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
    const expiresAt = Timestamp.fromDate(
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    );

    await addDoc(notificationsCollection(userId), {
      title: input.title.trim(),
      message: input.message.trim(),
      type: input.type || "info",
      link: input.link?.trim() || "",
      read: false,
      createdAt: serverTimestamp(),
      expiresAt,
    });

    // Keep collection lean: retain only the latest 20 notifications.
    await this.cleanupExcessNotifications(userId, 20);
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
};
