// src/lib/services/assessmentService.ts
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, where, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Assessment, Grade } from '@/types/academic';

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
      const assessments = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: this.convertTimestamp(data.createdAt),
          updatedAt: this.convertTimestamp(data.updatedAt),
          dueDate: data.dueDate || null
        } as Assessment;
      });
      
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
        return { 
          id: docSnap.id, 
          ...data,
          createdAt: this.convertTimestamp(data.createdAt),
          updatedAt: this.convertTimestamp(data.updatedAt),
          dueDate: data.dueDate || null
        } as Assessment;
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
    
    return {
      id: docSnap.id,
      ...data,
      // Asegúrate de que estos campos existan
      assessmentType: data.assessmentType || 'assessment',
      deliveryType: data.deliveryType || 'text',
      startDate: data.startDate || null,
      dueDate: data.dueDate || null
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