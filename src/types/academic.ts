// src/types/academic.ts
export type UserRole = 'docente' | 'estudiante' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
}


export interface Course {
  id: string;
  name: string;
  code: string;
  semester: string;
  group: string;
  credits: number;
  teacherId: string;
  teacherName: string;
  description?: string;
  enrolledStudents: string[];
  createdAt: Date;
}

export interface Assessment { 
 
  type: 'exam' | 'quiz' | 'homework' | 'project' | 'participation';
  maxScore?: number; // Agregar si no existe
  weight?: number; // Agregar si no existe
  updatedAt: Date;
  description?: string;
  id: string;
  courseId: string;
  name: string;
  percentage: number;
  dueDate: Date;
  createdAt: Date;
  maxPoints: number; 
  passingScore: number; 
  status: 'draft' | 'published' | 'graded';
  createdBy: string; 
  gradeSheetId?: string;

  assessmentType?: 'announcement' | 'delivery' | 'assessment';
  deliveryType?: 'text';
  startDate?: string;



  
}

export interface Grade {
  id: string;
  assessmentId: string;
  studentId: string;
  courseId: string;
  value: number;
  feedback?: string;
  gradedAt: Date;
  gradedBy: string;
  comments?: string;
  submittedAt?: string; // Cuando el estudiante entregó
}

// Opcional: Si quieres hacer el id opcional (menos recomendado)
interface Activity {
  id: string; // Mantener como string (no hacer opcional es mejor)
  name: string;
  weight: number;
  maxScore: number;
  type: 'exam' | 'quiz' | 'homework' | 'project' | 'participation';
  maxPoints?: number; 
  percentage: number;
  passingScore: number;
  dueDate?: Date;
  status: string;
  createdAt: Date;
}
// Agrega estos tipos a tu archivo types/academic.ts

// En types/academic.ts, agrega estos tipos al final:

export interface GradeCategory {
  id: string;
  courseId: string;
  name: string;
  description: string;
  weight: number;
  order: number;
  createdAt: Date;
}

// src/types/academic.ts
export interface GradeCategory {
  id: string;
  courseId: string;
  name: string;
  description: string;
  weight: number;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface GradeSheet {
  id: string;
  categoryId: string;
  courseId: string;
  title: string;
  description: string;
  maxScore: number;
  weight: number;
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  activities: Activity[]; 
}

export interface GradeEntry {
  id: string;
  sheetId: string;
  categoryId: string;
  courseId: string;
  studentId: string;
  score: number;
  gradedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Slide {
  id: string;
  weekId: string;
  title: string;
  canvaUrl: string;
  order: number;
  createdAt: Date;
  description?: string;

  

}

export interface Week {
  id: string;
  unitId: string;
  number: number;
  topic: string;
  slides: Slide[];

 
  createdAt: Date; 
}

export interface Unit {
  id: string;
  courseId: string;
  name: string;
  order: number;
  weeks: Week[];
  description?: string;
  createdAt: Date;


  

}

export interface Announcement {
  id: string;
  courseId: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: Date;
}

export interface StudentProgress {
  studentId: string;
  courseId: string;
  currentGrade: number;
  evaluatedPercentage: number;
  remainingPercentage: number;
  minGradeToPass: number;
  status: 'passing' | 'at-risk' | 'failing';
  grades: Grade[];
}