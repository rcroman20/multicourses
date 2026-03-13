// src/lib/services/assessmentService.ts
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, where, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Assessment, Grade } from '@/types/academic';

type AssessmentRecord = Record<string, unknown>;
const ASSESSMENT_COLLECTIONS = ['assessments', 'evaluaciones'] as const;
type CourseAssessmentLookupOptions = {
  courseCode?: string;
  courseName?: string;
};

type StudentGradeLookupOptions = {
  courseCode?: string;
  courseName?: string;
};

const normalizeMatchText = (value: unknown): string =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const toParsedNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(
      value
        .trim()
        .replace(/\s+/g, "")
        .replace(/,/g, "."),
    );
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const pickNumber = (candidates: unknown[], fallback: number): number => {
  for (const candidate of candidates) {
    const parsed = toParsedNumber(candidate);
    if (parsed !== null) return parsed;
  }
  return fallback;
};

const normalizeForumRequirements = (data: AssessmentRecord) => {
  const assessmentType = String(data.assessmentType || "assessment");
  const activityType = String(data.type || "");
  if (!(assessmentType === "assessment" && activityType === "forum")) return null;

  const rawRequirements =
    data.forumRequirements && typeof data.forumRequirements === "object"
      ? (data.forumRequirements as AssessmentRecord)
      : {};

  return {
    preset: String(rawRequirements.preset || data.forumPreset || "custom"),
    mainResponseMinWords: Math.max(
      0,
      pickNumber(
        [
          rawRequirements.mainResponseMinWords,
          data.forumMainResponseMinWords,
          data.mainResponseMinWords,
        ],
        80,
      ),
    ),
    peerRepliesRequired: Math.max(
      0,
      pickNumber(
        [
          rawRequirements.peerRepliesRequired,
          data.forumPeerRepliesRequired,
          data.peerRepliesRequired,
        ],
        2,
      ),
    ),
    peerReplyCommentsRequired: Math.max(
      0,
      pickNumber(
        [
          rawRequirements.peerReplyCommentsRequired,
          data.forumPeerReplyCommentsRequired,
          data.peerReplyCommentsRequired,
        ],
        1,
      ),
    ),
    mainResponsesRequired: Math.max(
      1,
      pickNumber(
        [
          rawRequirements.mainResponsesRequired,
          data.forumMainResponsesRequired,
          data.mainResponsesRequired,
        ],
        1,
      ),
    ),
  };
};

const mapAssessmentDoc = (
  id: string,
  data: AssessmentRecord,
  convertTimestamp: (timestamp: unknown) => Date | null,
): Assessment => ({
  id,
  ...(data as Assessment),
  createdAt: convertTimestamp(data.createdAt),
  updatedAt: convertTimestamp(data.updatedAt),
  dueDate: (data.dueDate as Assessment["dueDate"]) || null,
  forumRequirements: normalizeForumRequirements(data) as (Assessment & { forumRequirements?: unknown })["forumRequirements"],
});

const getAssessmentRefCandidates = (assessmentId: string) =>
  ASSESSMENT_COLLECTIONS.map((collectionName) => ({
    collectionName,
    ref: doc(db, collectionName, assessmentId),
  }));

const matchesCourseReference = (
  data: AssessmentRecord,
  lookup: { courseId: string; courseCode: string; courseName: string },
): boolean => {
  const courseId = String(data.courseId || "").trim();
  const courseCode = normalizeMatchText(data.courseCode);
  const courseName = normalizeMatchText(data.courseName);

  const hasCourseIdLookup = lookup.courseId.length > 0;
  const hasCourseCodeLookup = lookup.courseCode.length > 0;
  const hasCourseNameLookup = lookup.courseName.length > 0;

  if (hasCourseIdLookup && courseId && courseId === lookup.courseId) return true;
  if (hasCourseCodeLookup && courseCode && courseCode === lookup.courseCode) return true;
  if (hasCourseNameLookup && courseName && courseName === lookup.courseName) return true;

  if (hasCourseIdLookup && !hasCourseCodeLookup && !hasCourseNameLookup) return false;
  if (!hasCourseIdLookup && hasCourseCodeLookup && !hasCourseNameLookup) return false;
  if (!hasCourseIdLookup && !hasCourseCodeLookup && hasCourseNameLookup) return false;

  return false;
};

export const assessmentService = {
  // Crear evaluación
  async createAssessment(assessment: Omit<Assessment, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const now = Timestamp.now();
      const docRef = await addDoc(collection(db, 'assessments'), {
        ...assessment,
        createdAt: now,
        updatedAt: now
      });
      return docRef.id;
    } catch (error) {
      throw error;
    }
  },

  // Actualizar evaluación
  async updateAssessment(id: string, data: Partial<Assessment>): Promise<void> {
    try {
      const candidates = getAssessmentRefCandidates(id);
      for (const candidate of candidates) {
        const snap = await getDoc(candidate.ref);
        if (!snap.exists()) continue;
        await updateDoc(candidate.ref, {
          ...data,
          updatedAt: Timestamp.now()
        });
        return;
      }
      // Fallback to primary collection for forward compatibility.
      await updateDoc(candidates[0].ref, {
        ...data,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      throw error;
    }
  },

  // Eliminar evaluación
  async deleteAssessment(id: string): Promise<void> {
    try {
      // Primero eliminar todas las calificaciones asociadas
      const grades = await this.getAssessmentGrades(id);
      const deletePromises = grades.map(grade => 
        deleteDoc(doc(db, 'grades', grade.id))
      );
      await Promise.all(deletePromises);
      
      // Luego eliminar la evaluación (compatible with legacy transferred records).
      const candidates = getAssessmentRefCandidates(id);
      for (const candidate of candidates) {
        const snap = await getDoc(candidate.ref);
        if (!snap.exists()) continue;
        await deleteDoc(candidate.ref);
        return;
      }

      // Fallback to primary collection.
      await deleteDoc(candidates[0].ref);
    } catch (error) {
      throw error;
    }
  },

  // Obtener evaluaciones de un curso
  async getCourseAssessments(courseId: string, options?: CourseAssessmentLookupOptions): Promise<Assessment[]> {
    try {
      const normalizedCourseId = String(courseId || "").trim();
      const rawCourseCode = String(options?.courseCode || "").trim();
      const rawCourseName = String(options?.courseName || "").trim();
      const querySpecs: Array<{ field: "courseId" | "courseCode" | "courseName"; value: string }> = [];

      if (normalizedCourseId) querySpecs.push({ field: "courseId", value: normalizedCourseId });
      if (rawCourseCode) querySpecs.push({ field: "courseCode", value: rawCourseCode });
      if (rawCourseName) querySpecs.push({ field: "courseName", value: rawCourseName });

      if (querySpecs.length === 0) return [];

      const snapshotsByQuery = await Promise.allSettled(
        ASSESSMENT_COLLECTIONS.flatMap((collectionName) =>
          querySpecs.map((spec) =>
            getDocs(
              query(
                collection(db, collectionName),
                where(spec.field, '==', spec.value),
              ),
            ),
          ),
        ),
      );

      const snapshots = snapshotsByQuery
        .filter(
          (
            result,
          ): result is PromiseFulfilledResult<Awaited<ReturnType<typeof getDocs>>> =>
            result.status === "fulfilled",
        )
        .map((result) => result.value);

      const lookup = {
        courseId: normalizedCourseId,
        courseCode: normalizeMatchText(rawCourseCode),
        courseName: normalizeMatchText(rawCourseName),
      };

      const assessmentsById = new Map<string, Assessment>();
      snapshots.forEach((snapshot) => {
        snapshot.docs.forEach((docSnapshot) => {
          const rawData = docSnapshot.data() as AssessmentRecord;
          if (!matchesCourseReference(rawData, lookup)) return;
          if (assessmentsById.has(docSnapshot.id)) return;
          assessmentsById.set(
            docSnapshot.id,
            mapAssessmentDoc(
              docSnapshot.id,
              rawData,
              this.convertTimestamp,
            ),
          );
        });
      });
      const assessments = Array.from(assessmentsById.values());
      
      // Ordenar manualmente por fecha de creación
      return assessments.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA; // Más reciente primero
      });
    } catch (error) {
      throw error;
    }
  },

  // Obtener evaluación por ID
  async getById(assessmentId: string): Promise<Assessment | null> {
    try {
      for (const candidate of getAssessmentRefCandidates(assessmentId)) {
        const docSnap = await getDoc(candidate.ref);
        if (!docSnap.exists()) continue;

        const data = docSnap.data();
        return mapAssessmentDoc(
          docSnap.id,
          data as AssessmentRecord,
          this.convertTimestamp,
        );
      }
      return null;
    } catch (error) {
      throw error;
    }
  },

// En assessmentService.ts - REEMPLAZAR ESTE MÉTODO
async getAssessmentById(assessmentId: string): Promise<Assessment | null> {
  try {
    for (const candidate of getAssessmentRefCandidates(assessmentId)) {
      const docSnap = await getDoc(candidate.ref);
      if (!docSnap.exists()) continue;

      const data = docSnap.data();
      const mapped = mapAssessmentDoc(
        docSnap.id,
        data as AssessmentRecord,
        this.convertTimestamp,
      );

      return {
        ...mapped,
        assessmentType: (data.assessmentType as Assessment["assessmentType"]) || 'assessment',
        deliveryType: (data.deliveryType as Assessment["deliveryType"]) || 'text',
        startDate: (data.startDate as Assessment["startDate"]) || null,
        dueDate: (data.dueDate as Assessment["dueDate"]) || null,
      } as Assessment;
    }
    return null;
  } catch (error) {
    throw error;
  }
},

  // Calificar evaluación para un estudiante
  async gradeAssessment(gradeData: Omit<Grade, 'id' | 'gradedAt'>): Promise<string> {
    try {
      const now = Timestamp.now();
      const docRef = await addDoc(collection(db, 'grades'), {
        ...gradeData,
        gradedAt: now
      });
      return docRef.id;
    } catch (error) {
      throw error;
    }
  },
  // Actualizar calificación
  async updateGrade(gradeId: string, data: Partial<Grade>): Promise<void> {
    try {
      const gradeRef = doc(db, 'grades', gradeId);
      await updateDoc(gradeRef, {
        ...data,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      throw error;
    }
  },

  // Obtener calificaciones de una evaluación
  async getAssessmentGrades(assessmentId: string): Promise<Grade[]> {
    try {
      const q = query(
        collection(db, 'grades'),
        where('assessmentId', '==', assessmentId)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const data = doc.data();
        // Usar type assertion con propiedades opcionales
        return {
          id: doc.id,
          assessmentId: data.assessmentId || '',
          studentId: data.studentId || '',
          courseId: data.courseId || '',
          value: pickNumber([data.value], 0),
          gradedBy: data.gradedBy || '',
          comment: data.comment || '',
          gradedAt: this.convertTimestamp(data.gradedAt),
          updatedAt: this.convertTimestamp(data.updatedAt),
          ...data // Esto mantiene cualquier otra propiedad
        } as Grade;
      });
    } catch (error) {
      throw error;
    }
  },

  // Obtener calificaciones de un estudiante en un curso
  async getStudentGrades(
    studentId: string,
    courseId: string,
    options?: StudentGradeLookupOptions,
  ): Promise<Grade[]> {
    try {
      const normalizedCourseId = String(courseId || "").trim();
      const normalizedCourseCode = normalizeMatchText(options?.courseCode);
      const normalizedCourseName = normalizeMatchText(options?.courseName);

      const [strictSnapshot, studentSnapshot] = await Promise.all([
        normalizedCourseId
          ? getDocs(
              query(
                collection(db, 'grades'),
                where('studentId', '==', studentId),
                where('courseId', '==', normalizedCourseId),
              ),
            )
          : Promise.resolve(null),
        getDocs(
          query(
            collection(db, 'grades'),
            where('studentId', '==', studentId),
          ),
        ),
      ]);

      const mergedDocs = new Map<string, Awaited<ReturnType<typeof getDocs>>["docs"][number]>();
      strictSnapshot?.docs.forEach((docSnap) => mergedDocs.set(docSnap.id, docSnap));
      studentSnapshot.docs.forEach((docSnap) => mergedDocs.set(docSnap.id, docSnap));

      const assessmentCourseCache = new Map<string, { courseId: string; courseCode: string; courseName: string } | null>();

      const matchesGradeCourse = async (data: Record<string, unknown>) => {
        const gradeCourseId = String(data.courseId || "").trim();
        const gradeCourseCode = normalizeMatchText(data.courseCode);
        const gradeCourseName = normalizeMatchText(data.courseName);

        if (normalizedCourseId && gradeCourseId && gradeCourseId === normalizedCourseId) return true;
        if (normalizedCourseCode && gradeCourseCode && gradeCourseCode === normalizedCourseCode) return true;
        if (normalizedCourseName && gradeCourseName && gradeCourseName === normalizedCourseName) return true;

        const assessmentId = String(data.assessmentId || "").trim();
        if (!assessmentId) return false;

        if (!assessmentCourseCache.has(assessmentId)) {
          const linkedAssessment = await this.getAssessmentById(assessmentId);
          assessmentCourseCache.set(
            assessmentId,
            linkedAssessment
              ? {
                  courseId: String(linkedAssessment.courseId || "").trim(),
                  courseCode: normalizeMatchText(
                    (linkedAssessment as unknown as Record<string, unknown>).courseCode,
                  ),
                  courseName: normalizeMatchText(
                    (linkedAssessment as unknown as Record<string, unknown>).courseName,
                  ),
                }
              : null,
          );
        }

        const linkedCourse = assessmentCourseCache.get(assessmentId);
        if (!linkedCourse) return false;
        if (normalizedCourseId && linkedCourse.courseId && linkedCourse.courseId === normalizedCourseId) return true;
        if (normalizedCourseCode && linkedCourse.courseCode && linkedCourse.courseCode === normalizedCourseCode) return true;
        if (normalizedCourseName && linkedCourse.courseName && linkedCourse.courseName === normalizedCourseName) return true;

        return false;
      };

      const allCandidateGrades = Array.from(mergedDocs.values()).map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          assessmentId: data.assessmentId || '',
          studentId: data.studentId || '',
          courseId: data.courseId || '',
          value: pickNumber([data.value], 0),
          gradedBy: data.gradedBy || '',
          comment: data.comment || '',
          gradedAt: this.convertTimestamp(data.gradedAt),
          updatedAt: this.convertTimestamp(data.updatedAt),
          ...data
        } as Grade;
      });

      const results = await Promise.all(
        allCandidateGrades.map(async (grade) => {
          const matches = await matchesGradeCourse(grade as unknown as Record<string, unknown>);
          if (!matches) return null;
          return {
            ...grade,
            courseId: normalizedCourseId || String(grade.courseId || "").trim(),
          };
        }),
      );

      return results.filter((item): item is Grade => item !== null);
    } catch (error) {
      throw error;
    }
  },

  // Obtener todas las calificaciones de un curso
  async getCourseGrades(courseId: string): Promise<Grade[]> {
    try {
      const q = query(
        collection(db, 'grades'),
        where('courseId', '==', courseId)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          assessmentId: data.assessmentId || '',
          studentId: data.studentId || '',
          courseId: data.courseId || '',
          value: pickNumber([data.value], 0),
          gradedBy: data.gradedBy || '',
          comment: data.comment || '',
          gradedAt: this.convertTimestamp(data.gradedAt),
          updatedAt: this.convertTimestamp(data.updatedAt),
          ...data
        } as Grade;
      });
    } catch (error) {
      throw error;
    }
  },

  // Obtener calificación específica de un estudiante en una evaluación
  async getStudentAssessmentGrade(studentId: string, assessmentId: string): Promise<Grade | null> {
    try {
      const q = query(
        collection(db, 'grades'),
        where('studentId', '==', studentId),
        where('assessmentId', '==', assessmentId)
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) return null;
      
      const doc = snapshot.docs[0];
      const data = doc.data();
      return { 
        id: doc.id,
        assessmentId: data.assessmentId || '',
        studentId: data.studentId || '',
        courseId: data.courseId || '',
        value: pickNumber([data.value], 0),
        gradedBy: data.gradedBy || '',
        comment: data.comment || '',
        gradedAt: this.convertTimestamp(data.gradedAt),
        updatedAt: this.convertTimestamp(data.updatedAt),
        ...data
      } as Grade;
    } catch (error) {
      throw error;
    }
  },

  // Método auxiliar para convertir Timestamp a Date (convertir de private a función regular)
  convertTimestamp(timestamp: any): Date | null {
    if (!timestamp) return null;
    if (timestamp instanceof Date) return timestamp;
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }
    return new Date(timestamp);
  }
};
