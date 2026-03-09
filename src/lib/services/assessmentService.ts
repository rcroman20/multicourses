// src/lib/services/assessmentService.ts
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, where, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Assessment, Grade } from '@/types/academic';

type AssessmentRecord = Record<string, unknown>;

const toParsedNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
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
      const assessmentRef = doc(db, 'assessments', id);
      await updateDoc(assessmentRef, {
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
      
      // Luego eliminar la evaluación
      await deleteDoc(doc(db, 'assessments', id));
    } catch (error) {
      throw error;
    }
  },

  // Obtener evaluaciones de un curso
  async getCourseAssessments(courseId: string): Promise<Assessment[]> {
    try {
      const q = query(
        collection(db, 'assessments'),
        where('courseId', '==', courseId)
      );
      const snapshot = await getDocs(q);
      const assessments = snapshot.docs.map((docSnapshot) =>
        mapAssessmentDoc(
          docSnapshot.id,
          docSnapshot.data() as AssessmentRecord,
          this.convertTimestamp,
        ),
      );
      
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
      console.log('🔍 Buscando evaluación con ID:', assessmentId);
      const docRef = doc(db, 'assessments', assessmentId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        console.log('✅ Evaluación encontrada:', data.name);
        return mapAssessmentDoc(
          docSnap.id,
          data as AssessmentRecord,
          this.convertTimestamp,
        );
      } else {
        console.log('❌ Evaluación NO encontrada en Firestore');
        return null;
      }
    } catch (error) {
      throw error;
    }
  },

// En assessmentService.ts - REEMPLAZAR ESTE MÉTODO
async getAssessmentById(assessmentId: string): Promise<Assessment | null> {
  try {
    console.log('Buscando evaluación con ID:', assessmentId);
    
    const docRef = doc(db, 'assessments', assessmentId); // Cambiar 'this.collectionName' por 'assessments'
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      console.log('No se encontró el documento');
      return null;
    }
    
    const data = docSnap.data();
    console.log('Datos encontrados:', data);
    
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
          value: data.value || 0,
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
  async getStudentGrades(studentId: string, courseId: string): Promise<Grade[]> {
    try {
      const q = query(
        collection(db, 'grades'),
        where('studentId', '==', studentId),
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
          value: data.value || 0,
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
          value: data.value || 0,
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
        value: data.value || 0,
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
