// src/lib/services/gradeSheetService.ts
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDoc, 
  orderBy, 
  Timestamp 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Define la interfaz StudentGrade primero
export interface StudentGrade {
  studentId: string;
  name: string;
  grades: Record<string, {
    value?: number | null;
    comment?: string;
    submittedAt?: Date | null;
  }>;
  total?: number;
  status: 'pending' | 'completed' | 'incomplete';
}

// Define la interfaz Activity
export interface Activity {
  id: string;
  name: string;
  type: 'exam' | 'quiz' | 'homework' | 'project' | 'participation' | 'self_evaluation' | 'presentation' | 'lab' | 'essay';
  maxScore: number;
  description?: string;
  maxPoints?: number; 
  percentage: number;
  weight: number;
  passingScore: number;
  dueDate?: Date;
  status: string;
  createdAt: Date;
}

// Actualiza la interfaz GradeSheet
export interface GradeSheet {
  id: string;
  title: string;
  courseId: string;
  courseName: string;
  gradingPeriod: 'quarter1' | 'quarter2' | 'quarter3' | 'quarter4' | 'semester1' | 'semester2' | 'final';
  activities: Activity[];
  students: StudentGrade[];
  teacherId: string;
  teacherName: string;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  description?: string;
  weight?: number;
  weightPercentage?: number;
}

export const gradeSheetService = {
  // Obtener hojas de calificación por curso
  async getByCourse(courseId: string): Promise<GradeSheet[]> {
    try {
      const q = query(
        collection(db, 'gradeSheets'),
        where('courseId', '==', courseId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      
      const sheets: GradeSheet[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        sheets.push({
          id: doc.id,
          title: data.title || '',
          courseId: data.courseId || '',
          courseName: data.courseName || '',
          gradingPeriod: data.gradingPeriod || 'quarter1',
          activities: data.activities || [],
          students: data.students || [],
          teacherId: data.teacherId || '',
          teacherName: data.teacherName || '',
          isPublished: data.isPublished || false,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          description: data.description,
          weight: data.weight,
          weightPercentage: data.weightPercentage || 0
        });
      });
      
      return sheets;
    } catch (error) {
      console.error('Error getting grade sheets:', error);
      throw error;
    }
  },

  // Obtener todas las hojas de calificación del docente
  async getByTeacher(teacherId: string): Promise<GradeSheet[]> {
    try {
      const q = query(
        collection(db, 'gradeSheets'),
        where('teacherId', '==', teacherId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      
      const sheets: GradeSheet[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        sheets.push({
          id: doc.id,
          title: data.title || '',
          courseId: data.courseId || '',
          courseName: data.courseName || '',
          gradingPeriod: data.gradingPeriod || 'quarter1',
          activities: data.activities || [],
          students: data.students || [],
          teacherId: data.teacherId || '',
          teacherName: data.teacherName || '',
          isPublished: data.isPublished || false,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          description: data.description,
          weight: data.weight,
          weightPercentage: data.weightPercentage || 0
        });
      });
      
      return sheets;
    } catch (error) {
      console.error('Error getting teacher grade sheets:', error);
      throw error;
    }
  },

  // Obtener hoja de calificación por ID
  async getById(id: string): Promise<GradeSheet | null> {
    try {
      const docRef = doc(db, 'gradeSheets', id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          title: data.title || '',
          courseId: data.courseId || '',
          courseName: data.courseName || '',
          gradingPeriod: data.gradingPeriod || 'quarter1',
          activities: data.activities || [],
          students: data.students || [],
          teacherId: data.teacherId || '',
          teacherName: data.teacherName || '',
          isPublished: data.isPublished || false,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          description: data.description,
          weight: data.weight,
          weightPercentage: data.weightPercentage || 0
        };
      }
      return null;
    } catch (error) {
      console.error('Error getting grade sheet:', error);
      throw error;
    }
  },

  // Crear nueva hoja de calificación
  async create(gradeSheet: Omit<GradeSheet, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const now = Timestamp.now();
      const docRef = await addDoc(collection(db, 'gradeSheets'), {
        ...gradeSheet,
        createdAt: now,
        updatedAt: now
      });
      return docRef.id;
    } catch (error) {
      console.error('Error creating grade sheet:', error);
      throw error;
    }
  },

  // Actualizar hoja de calificación
  async update(id: string, data: Partial<GradeSheet>): Promise<void> {
    try {
      const sheetRef = doc(db, 'gradeSheets', id);
      await updateDoc(sheetRef, {
        ...data,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error('Error updating grade sheet:', error);
      throw error;
    }
  },

  // Eliminar hoja de calificación
  async delete(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'gradeSheets', id));
    } catch (error) {
      console.error('Error deleting grade sheet:', error);
      throw error;
    }
  },

  // Agregar actividad a una hoja de calificación
  async addActivity(sheetId: string, activity: Activity): Promise<void> {
    try {
      const sheetRef = doc(db, 'gradeSheets', sheetId);
      const sheetDoc = await getDoc(sheetRef);
      
      if (sheetDoc.exists()) {
        const data = sheetDoc.data();
        const activities = data.activities || [];
        
        await updateDoc(sheetRef, {
          activities: [...activities, activity],
          updatedAt: Timestamp.now()
        });
      }
    } catch (error) {
      console.error('Error adding activity to grade sheet:', error);
      throw error;
    }
  },

  // Actualizar actividades en una hoja de calificación
  async updateActivities(sheetId: string, activities: Activity[]): Promise<void> {
    try {
      const sheetRef = doc(db, 'gradeSheets', sheetId);
      await updateDoc(sheetRef, {
        activities: activities,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error('Error updating activities:', error);
      throw error;
    }
  },

  // Actualizar calificación de un estudiante
  async updateStudentGrade(
    sheetId: string,
    studentId: string,
    activityId: string,
    grade: number,
    comment: string = ''
  ): Promise<void> {
    try {
      const sheetRef = doc(db, 'gradeSheets', sheetId);
      const sheetDoc = await getDoc(sheetRef);
      
      if (!sheetDoc.exists()) {
        throw new Error('Grade sheet not found');
      }
      
      const data = sheetDoc.data();
      const students = data.students || [];
      
      // Buscar o crear el estudiante
      const studentIndex = students.findIndex((s: any) => s.studentId === studentId);
      
      const gradeData = {
        value: grade,
        comment: comment,
        submittedAt: Timestamp.now()
      };
      
      if (studentIndex >= 0) {
        // Actualizar estudiante existente
        students[studentIndex].grades = {
          ...students[studentIndex].grades,
          [activityId]: gradeData
        };
        students[studentIndex].status = 'completed';
        
        // Calcular total
        const grades = Object.values(students[studentIndex].grades);
        const total = grades.reduce((sum: number, g: any) => sum + (g.value || 0), 0);
        students[studentIndex].total = total;
      } else {
        // Crear nuevo estudiante
        console.warn(`Student ${studentId} not found in grade sheet, creating new entry`);
        const newStudent: any = {
          studentId: studentId,
          name: `Student ${studentId.substring(0, 8)}`,
          grades: {
            [activityId]: gradeData
          },
          status: 'completed',
          total: grade
        };
        students.push(newStudent);
      }
      
      // Actualizar el documento
      await updateDoc(sheetRef, {
        students: students,
        updatedAt: Timestamp.now(),
        isPublished: true
      });
      
      console.log(`✅ Grade updated for student ${studentId} in activity ${activityId}`);
      
    } catch (error) {
      console.error('Error updating student grade:', error);
      throw error;
    }
  },

  // Obtener calificaciones de estudiantes para una actividad específica
  async getStudentGradesForActivity(sheetId: string, activityId: string): Promise<{studentId: string, grade: number, comment: string}[]> {
    try {
      const sheet = await this.getById(sheetId);
      if (!sheet || !sheet.students) {
        return [];
      }
      
      const grades: {studentId: string, grade: number, comment: string}[] = [];
      
      sheet.students.forEach((student: StudentGrade) => {
        if (student.grades[activityId] && student.grades[activityId].value !== null && student.grades[activityId].value !== undefined) {
          grades.push({
            studentId: student.studentId,
            grade: student.grades[activityId].value!,
            comment: student.grades[activityId].comment || ''
          });
        }
      });
      
      return grades;
    } catch (error) {
      console.error('Error getting student grades for activity:', error);
      throw error;
    }
  },

  // Publicar/despublicar hoja de calificaciones
  async togglePublish(sheetId: string, publish: boolean): Promise<void> {
    try {
      const sheetRef = doc(db, 'gradeSheets', sheetId);
      await updateDoc(sheetRef, {
        isPublished: publish,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error('Error toggling publish status:', error);
      throw error;
    }
  },

  // Añadir múltiples estudiantes a una hoja de calificaciones
  async addStudents(sheetId: string, newStudents: Omit<StudentGrade, 'grades' | 'total'>[]): Promise<void> {
    try {
      const sheetRef = doc(db, 'gradeSheets', sheetId);
      const sheetDoc = await getDoc(sheetRef);
      
      if (!sheetDoc.exists()) {
        throw new Error('Grade sheet not found');
      }
      
      const data = sheetDoc.data();
      const existingStudents = data.students || [];
      
      // Filtrar estudiantes que ya existen
      const studentsToAdd = newStudents.filter(newStudent => 
        !existingStudents.some((existing: any) => existing.studentId === newStudent.studentId)
      );
      
      if (studentsToAdd.length === 0) {
        console.log('No new students to add');
        return;
      }
      
      // Preparar estudiantes con estructura completa
      const formattedStudents = studentsToAdd.map(student => ({
        ...student,
        grades: {},
        total: 0,
        status: 'pending'
      }));
      
      await updateDoc(sheetRef, {
        students: [...existingStudents, ...formattedStudents],
        updatedAt: Timestamp.now()
      });
      
      console.log(`✅ Added ${formattedStudents.length} new students to grade sheet`);
      
    } catch (error) {
      console.error('Error adding students to grade sheet:', error);
      throw error;
    }
  },

  // Eliminar estudiante de una hoja de calificaciones
  async removeStudent(sheetId: string, studentId: string): Promise<void> {
    try {
      const sheetRef = doc(db, 'gradeSheets', sheetId);
      const sheetDoc = await getDoc(sheetRef);
      
      if (!sheetDoc.exists()) {
        throw new Error('Grade sheet not found');
      }
      
      const data = sheetDoc.data();
      const students = data.students || [];
      
      const filteredStudents = students.filter((student: any) => student.studentId !== studentId);
      
      if (students.length === filteredStudents.length) {
        console.log('Student not found in grade sheet');
        return;
      }
      
      await updateDoc(sheetRef, {
        students: filteredStudents,
        updatedAt: Timestamp.now()
      });
      
      console.log(`✅ Removed student ${studentId} from grade sheet`);
      
    } catch (error) {
      console.error('Error removing student from grade sheet:', error);
      throw error;
    }
  },

  // Calcular estadísticas de una hoja de calificaciones
 async getStatistics(sheetId: string): Promise<{
    totalStudents: number;
    gradedStudents: number;
    averageScore: number;
    highestScore: number;
    lowestScore: number;
    completionRate: number;
  }> {
    try {
      const sheet = await this.getById(sheetId);
      if (!sheet) {
        throw new Error('Grade sheet not found');
      }
      
      const students = sheet.students || [];
      const totalStudents = students.length;
      
      const gradedStudents = students.filter(student => 
        student.status === 'completed' || student.status === 'graded'
      ).length;
      
      // Calcular promedios
      let totalScore = 0;
      let scoreCount = 0;
      let highestScore = 0;
      let lowestScore = 100;
      
      students.forEach(student => {
        Object.values(student.grades).forEach((grade: any) => { // Añadir tipo any
          if (grade.value !== null && grade.value !== undefined) {
            const score = grade.value;
            totalScore += score;
            scoreCount++;
            
            if (score > highestScore) highestScore = score;
            if (score < lowestScore) lowestScore = score;
          }
        });
      });
      
      const averageScore = scoreCount > 0 ? totalScore / scoreCount : 0;
      const completionRate = totalStudents > 0 ? (gradedStudents / totalStudents) * 100 : 0;
      
      return {
        totalStudents,
        gradedStudents,
        averageScore,
        highestScore,
        lowestScore,
        completionRate
      };
    } catch (error) {
      console.error('Error calculating statistics:', error);
      throw error;
    }
  },


 async exportToCsv(sheetId: string): Promise<string> {
    try {
      const sheet = await this.getById(sheetId);
      if (!sheet) {
        throw new Error('Grade sheet not found');
      }
      
      const headers = ['Student ID', 'Student Name', ...sheet.activities.map(act => act.name), 'Total', 'Status'];
      const rows: string[] = [];
      
      sheet.students.forEach(student => {
        const studentData = [
          student.studentId,
          student.name,
          ...sheet.activities.map(activity => {
            const grade = student.grades[activity.id];
            return grade?.value !== null && grade?.value !== undefined ? grade.value.toString() : '';
          }),
          student.total?.toString() || '0',
          student.status
        ];
        
        rows.push(studentData.join(','));
      });
      
      return [headers.join(','), ...rows].join('\n');
    } catch (error) {
      console.error('Error exporting to CSV:', error);
      throw error;
    }
  }

};