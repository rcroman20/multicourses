import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  type Timestamp,
} from "firebase/firestore";
import { firebaseDB } from "@/lib/firebase";

type RawDoc = Record<string, unknown>;

interface BackupCollection {
  id: string;
  data: RawDoc;
}

export interface CourseBackupPayload {
  version: number;
  exportedAt: string;
  source: {
    courseId: string;
    courseCode: string;
    courseName: string;
    teacherId?: string;
  };
  data: {
    course: BackupCollection | null;
    assessments: BackupCollection[];
    gradeSheets: BackupCollection[];
    periods: BackupCollection[];
    weeks: BackupCollection[];
    files: BackupCollection[];
    exerciseQuestions: BackupCollection[];
    exerciseThemeLinks: BackupCollection[];
    units: BackupCollection[];
    legacyAssessments: BackupCollection[];
  };
}

interface RestoreOptions {
  keepStudents?: boolean;
  preserveIdentity?: boolean;
}

export interface CourseBackupSnapshot {
  id: string;
  teacherId: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  createdAt: Date;
  exportedAt: string;
  payload: CourseBackupPayload;
}

function stripServerFields(input: RawDoc): RawDoc {
  const next = { ...input };
  delete next.id;
  delete next.createdAt;
  delete next.updatedAt;
  return next;
}

function normalizeBackup(raw: unknown): CourseBackupPayload {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid backup file");
  }
  const parsed = raw as CourseBackupPayload;
  if (!parsed.data || !parsed.data.course) {
    throw new Error("Backup missing course data");
  }
  return parsed;
}

async function fetchByCourse(collectionName: string, courseId: string): Promise<BackupCollection[]> {
  const q = query(collection(firebaseDB, collectionName), where("courseId", "==", courseId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((item) => ({
    id: item.id,
    data: item.data() as RawDoc,
  }));
}

export const courseBackupService = {
  async exportCourseBackup(courseId: string): Promise<CourseBackupPayload> {
    const courseRef = doc(firebaseDB, "cursos", courseId);
    const courseSnap = await getDoc(courseRef);
    if (!courseSnap.exists()) {
      throw new Error("Course not found");
    }

    const courseData = courseSnap.data() as RawDoc;

    const [
      assessments,
      gradeSheets,
      periods,
      weeks,
      files,
      exerciseQuestions,
      exerciseThemeLinks,
      units,
      legacyAssessments,
    ] = await Promise.all([
      fetchByCourse("assessments", courseId),
      fetchByCourse("gradeSheets", courseId),
      fetchByCourse("periods", courseId),
      fetchByCourse("weeks", courseId),
      fetchByCourse("course_files", courseId),
      fetchByCourse("exerciseQuestions", courseId),
      fetchByCourse("exerciseThemeLinks", courseId),
      fetchByCourse("unidades", courseId),
      fetchByCourse("evaluaciones", courseId),
    ]);

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      source: {
        courseId,
        courseCode: String(courseData.code || ""),
        courseName: String(courseData.name || ""),
        teacherId: typeof courseData.teacherId === "string" ? courseData.teacherId : undefined,
      },
      data: {
        course: { id: courseSnap.id, data: courseData },
        assessments,
        gradeSheets,
        periods,
        weeks,
        files,
        exerciseQuestions,
        exerciseThemeLinks,
        units,
        legacyAssessments,
      },
    };
  },

  downloadBackupFile(backup: CourseBackupPayload) {
    const stamp = new Date().toISOString().slice(0, 10);
    const courseCode = backup.source.courseCode || "course";
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${courseCode}-backup-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  async restoreCourseBackup(
    backupInput: unknown,
    teacher: { id: string; name: string },
    options?: RestoreOptions,
  ) {
    const backup = normalizeBackup(backupInput);
    const keepStudents = options?.keepStudents ?? true;
    const preserveIdentity = options?.preserveIdentity ?? true;
    const sourceCourseData = backup.data.course?.data || {};

    const sourceCode = String(sourceCourseData.code || backup.source.courseCode || "COURSE");
    const sourceName = String(sourceCourseData.name || backup.source.courseName || "Restored Course");
    const restoredCode = preserveIdentity ? sourceCode : `${sourceCode}-R${Date.now().toString().slice(-4)}`;
    const restoredName = preserveIdentity ? sourceName : `${sourceName} (Restored)`;

    if (preserveIdentity) {
      const existingWithSameCodeQuery = query(
        collection(firebaseDB, "cursos"),
        where("teacherId", "==", teacher.id),
        where("code", "==", restoredCode),
      );
      const existingWithSameCode = await getDocs(existingWithSameCodeQuery);
      if (!existingWithSameCode.empty) {
        throw new Error(`A course with code "${restoredCode}" already exists. Delete it first or restore as clone.`);
      }
    }

    const newCoursePayload: RawDoc = {
      ...stripServerFields(sourceCourseData),
      name: restoredName,
      code: restoredCode,
      teacherId: teacher.id,
      teacherName: teacher.name,
      enrolledStudents: keepStudents
        ? (Array.isArray(sourceCourseData.enrolledStudents) ? sourceCourseData.enrolledStudents : [])
        : [],
      createdAt: serverTimestamp(),
    };

    const newCourseRef = await addDoc(collection(firebaseDB, "cursos"), newCoursePayload);
    const newCourseId = newCourseRef.id;

    const gradeSheetIdMap = new Map<string, string>();
    const periodIdMap = new Map<string, string>();
    const weekIdMap = new Map<string, string>();

    for (const item of backup.data.gradeSheets || []) {
      const payload = {
        ...stripServerFields(item.data),
        courseId: newCourseId,
        teacherId: teacher.id,
        teacherName: teacher.name,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const created = await addDoc(collection(firebaseDB, "gradeSheets"), payload);
      gradeSheetIdMap.set(item.id, created.id);
    }

    for (const item of backup.data.periods || []) {
      const payload = {
        ...stripServerFields(item.data),
        courseId: newCourseId,
        teacherId: teacher.id,
        createdAt: serverTimestamp(),
      };
      const created = await addDoc(collection(firebaseDB, "periods"), payload);
      periodIdMap.set(item.id, created.id);
    }

    for (const item of backup.data.weeks || []) {
      const oldPeriodId = String(item.data.periodId || "");
      const payload = {
        ...stripServerFields(item.data),
        courseId: newCourseId,
        periodId: periodIdMap.get(oldPeriodId) || null,
        createdAt: serverTimestamp(),
      };
      const created = await addDoc(collection(firebaseDB, "weeks"), payload);
      weekIdMap.set(item.id, created.id);
    }

    for (const item of backup.data.files || []) {
      const oldPeriodId = String(item.data.periodId || "");
      const oldWeekId = String(item.data.weekId || "");
      const payload = {
        ...stripServerFields(item.data),
        courseId: newCourseId,
        periodId: periodIdMap.get(oldPeriodId) || null,
        weekId: weekIdMap.get(oldWeekId) || null,
        uploadedAt: serverTimestamp(),
      };
      await addDoc(collection(firebaseDB, "course_files"), payload);
    }

    for (const item of backup.data.assessments || []) {
      const oldGradeSheetId = String(item.data.gradeSheetId || "");
      const payload = {
        ...stripServerFields(item.data),
        courseId: newCourseId,
        createdBy: teacher.id,
        gradeSheetId: gradeSheetIdMap.get(oldGradeSheetId) || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await addDoc(collection(firebaseDB, "assessments"), payload);
    }

    for (const item of backup.data.exerciseQuestions || []) {
      const source = stripServerFields(item.data);
      const theme = String(source.theme || "").trim();
      const question = String(source.question || "").trim();
      const rawOptions = Array.isArray(source.options)
        ? source.options.map((value) => String(value || ""))
        : [];
      const options = rawOptions.slice(0, 4);
      const correctOptionIndex = Math.max(
        0,
        Math.min(
          3,
          Number.isInteger(source.correctOptionIndex)
            ? Number(source.correctOptionIndex)
            : 0,
        ),
      );

      // Keep restore resilient when backup question data does not match current strict rules.
      if (!theme || !question || options.length !== 4) {
        continue;
      }

      const payload = {
        courseId: newCourseId,
        theme,
        question,
        options,
        correctOptionIndex,
        isPublished: Boolean(source.isPublished),
        createdBy: teacher.id,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(firebaseDB, "exerciseQuestions"), payload);
    }

    for (const item of backup.data.exerciseThemeLinks || []) {
      const source = stripServerFields(item.data);
      const theme = String(source.theme || "").trim();
      const oldGradeSheetId = String(source.gradeSheetId || "");
      const mappedGradeSheetId = gradeSheetIdMap.get(oldGradeSheetId) || "";

      // Skip invalid link rows so restore of the full course can still succeed.
      if (!theme || !mappedGradeSheetId) {
        continue;
      }

      const payload = {
        courseId: newCourseId,
        theme,
        gradeSheetId: mappedGradeSheetId,
        updatedBy: teacher.id,
        updatedAt: serverTimestamp(),
      };
      await addDoc(collection(firebaseDB, "exerciseThemeLinks"), payload);
    }

    for (const item of backup.data.units || []) {
      const payload = {
        ...stripServerFields(item.data),
        courseId: newCourseId,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(firebaseDB, "unidades"), payload);
    }

    for (const item of backup.data.legacyAssessments || []) {
      const payload = {
        ...stripServerFields(item.data),
        courseId: newCourseId,
        createdBy: teacher.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await addDoc(collection(firebaseDB, "evaluaciones"), payload);
    }

    return {
      newCourseId,
      newCourseCode: restoredCode,
      newCourseName: restoredName,
    };
  },

  async saveBackupSnapshot(courseId: string, teacher: { id: string; name: string }) {
    const backup = await this.exportCourseBackup(courseId);
    const docRef = await addDoc(collection(firebaseDB, "courseBackups"), {
      teacherId: teacher.id,
      teacherName: teacher.name,
      courseId: backup.source.courseId,
      courseCode: backup.source.courseCode,
      courseName: backup.source.courseName,
      exportedAt: backup.exportedAt,
      payload: backup,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  },

  async listTeacherBackups(teacherId: string, courseId?: string): Promise<CourseBackupSnapshot[]> {
    const q = query(collection(firebaseDB, "courseBackups"), where("teacherId", "==", teacherId));
    const snapshot = await getDocs(q);
    const items = snapshot.docs
      .map((item) => {
        const data = item.data() as Record<string, unknown>;
        const createdAtValue = data.createdAt as Timestamp | undefined;
        return {
          id: item.id,
          teacherId: String(data.teacherId || ""),
          courseId: String(data.courseId || ""),
          courseCode: String(data.courseCode || ""),
          courseName: String(data.courseName || ""),
          exportedAt: String(data.exportedAt || ""),
          payload: data.payload as CourseBackupPayload,
          createdAt: createdAtValue?.toDate?.() || new Date(0),
        } as CourseBackupSnapshot;
      })
      .filter((item) => !courseId || item.courseId === courseId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return items;
  },

  async cleanupOldTeacherBackups(teacherId: string, days = 7) {
    const now = Date.now();
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    const allBackups = await this.listTeacherBackups(teacherId);
    const stale = allBackups.filter((item) => item.createdAt.getTime() < cutoff);
    if (stale.length === 0) return { deleted: 0 };

    await Promise.all(
      stale.map((item) => deleteDoc(doc(firebaseDB, "courseBackups", item.id))),
    );

    return { deleted: stale.length };
  },

  async runAutoBackupIfDue(
    teacher: { id: string; name: string },
    courseIds: string[],
    hours = 24,
  ) {
    if (!teacher.id || courseIds.length === 0) {
      return { created: 0, skipped: true };
    }

    const intervalMs = Math.max(1, hours) * 60 * 60 * 1000;
    const now = Date.now();
    const storageKey = `courseBackups:autoLastRun:${teacher.id}`;
    const lastRunRaw = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
    const lastRun = lastRunRaw ? Number(lastRunRaw) : 0;

    if (lastRun > 0 && now - lastRun < intervalMs) {
      return { created: 0, skipped: true };
    }

    const snapshots = await this.listTeacherBackups(teacher.id);
    const latestByCourse = new Map<string, number>();
    snapshots.forEach((item) => {
      const current = latestByCourse.get(item.courseId) || 0;
      const createdAt = item.createdAt.getTime();
      if (createdAt > current) {
        latestByCourse.set(item.courseId, createdAt);
      }
    });

    let created = 0;
    for (const courseId of courseIds) {
      const lastCourseBackup = latestByCourse.get(courseId) || 0;
      if (lastCourseBackup > 0 && now - lastCourseBackup < intervalMs) {
        continue;
      }
      await this.saveBackupSnapshot(courseId, teacher);
      created += 1;
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, String(now));
    }

    return { created, skipped: false };
  },

  async restoreFromSnapshot(
    snapshotId: string,
    teacher: { id: string; name: string },
    options?: RestoreOptions,
  ) {
    const ref = doc(firebaseDB, "courseBackups", snapshotId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new Error("Backup snapshot not found");
    }

    const data = snap.data() as Record<string, unknown>;
    if (String(data.teacherId || "") !== teacher.id) {
      throw new Error("You do not have access to this backup");
    }

    return this.restoreCourseBackup(data.payload, teacher, options);
  },

  async deleteSnapshot(snapshotId: string) {
    await deleteDoc(doc(firebaseDB, "courseBackups", snapshotId));
  },
};
