// src/utils/gradeCalculations.ts
import type { Assessment, Grade, StudentProgress } from '@/types/academic';


const PASSING_GRADE = 3.0;
const MAX_GRADE = 5.0;
const MIN_GRADE = 0.0;

/**
 * Calcula la nota acumulada ponderada
 */

// src/utils/gradeCalculations.ts - AÑADIR AL FINAL
// ... tu código existente ...

export function calculateStudentProgress(
  studentId: string,
  courseId: string,
  grades: Grade[],
  assessments: Assessment[]
): StudentProgress {
  const studentGrades = grades.filter(
    g => g.studentId === studentId && g.courseId === courseId
  );

  const currentGrade = calculateWeightedGrade(studentGrades, assessments);
  const evaluatedPercentage = calculateEvaluatedPercentage(studentGrades, assessments);
  const remainingPercentage = 100 - evaluatedPercentage;
  const minGradeToPass = calculateMinGradeToPass(currentGrade, evaluatedPercentage);
  const status = determineAcademicStatus(currentGrade, evaluatedPercentage, minGradeToPass);

  return {
    studentId,
    courseId,
    currentGrade: Math.round(currentGrade * 100) / 100,
    evaluatedPercentage,
    remainingPercentage,
    minGradeToPass: minGradeToPass === Infinity ? 5.1 : minGradeToPass,
    status,
    grades: studentGrades,
  };
}

export function calculateCourseStats(
  courseId: string,
  studentIds: string[],
  grades: Grade[],
  assessments: Assessment[]
): {
  averageGrade: number;
  passingCount: number;
  atRiskCount: number;
  failingCount: number;
  totalStudents: number;
} {
  let totalGrade = 0;
  let passingCount = 0;
  let atRiskCount = 0;
  let failingCount = 0;

  for (const studentId of studentIds) {
    const progress = calculateStudentProgress(studentId, courseId, grades, assessments);
    totalGrade += progress.currentGrade;
    switch (progress.status) {
      case 'passing':
        passingCount++;
        break;
      case 'at-risk':
        atRiskCount++;
        break;
      case 'failing':
        failingCount++;
        break;
    }
  }

  return {
    averageGrade: studentIds.length > 0 
      ? Math.round((totalGrade / studentIds.length) * 100) / 100 
      : 0,
    passingCount,
    atRiskCount,
    failingCount,
    totalStudents: studentIds.length,
  };
}


export function calculateWeightedGrade(
  grades: Grade[],
  assessments: Assessment[]
): number {
  if (grades.length === 0) return 0;

  let totalWeightedGrade = 0;
  let totalWeight = 0;

  for (const grade of grades) {
    const assessment = assessments.find(a => a.id === grade.assessmentId);
    if (assessment) {
      totalWeightedGrade += grade.value * (assessment.percentage / 100);
      totalWeight += assessment.percentage;
    }
  }

  if (totalWeight === 0) return 0;
  
  // Retorna la nota proporcional al porcentaje evaluado
  return totalWeightedGrade;
}

/**
 * Calcula el porcentaje total evaluado
 */
export function calculateEvaluatedPercentage(
  grades: Grade[],
  assessments: Assessment[]
): number {
  const gradedAssessmentIds = new Set(grades.map(g => g.assessmentId));
  
  return assessments
    .filter(a => gradedAssessmentIds.has(a.id))
    .reduce((sum, a) => sum + a.percentage, 0);
}

/**
 * Calcula la nota mínima necesaria en el porcentaje restante para aprobar
 */
export function calculateMinGradeToPass(
  currentWeightedGrade: number,
  evaluatedPercentage: number
): number {
  const remainingPercentage = 100 - evaluatedPercentage;
  
  if (remainingPercentage <= 0) {
    // Ya está todo evaluado, no hay forma de cambiar
    return currentWeightedGrade >= PASSING_GRADE ? 0 : Infinity;
  }

  // Necesitamos: currentWeightedGrade + (minGrade * remainingPercentage/100) >= PASSING_GRADE
  // Entonces: minGrade = (PASSING_GRADE - currentWeightedGrade) / (remainingPercentage/100)
  const minGrade = (PASSING_GRADE - currentWeightedGrade) / (remainingPercentage / 100);

  // Limitar al rango válido
  if (minGrade < MIN_GRADE) return MIN_GRADE;
  if (minGrade > MAX_GRADE) return Infinity; // Imposible aprobar
  
  return Math.round(minGrade * 100) / 100;
}

/**
 * Determina el estado académico del estudiante
 */
export function determineAcademicStatus(
  currentWeightedGrade: number,
  evaluatedPercentage: number,
  minGradeToPass: number
): 'passing' | 'at-risk' | 'failing' {
  if (evaluatedPercentage === 0) return 'passing'; // Sin notas aún

  // Calcular nota proyectada si mantiene el promedio
  const projectedGrade = evaluatedPercentage > 0
    ? (currentWeightedGrade / evaluatedPercentage) * 100
    : 0;

  if (minGradeToPass === Infinity || minGradeToPass > MAX_GRADE) {
    return 'failing'; // Imposible aprobar
  }

  if (projectedGrade >= PASSING_GRADE && minGradeToPass <= 3.5) {
    return 'passing'; // Aprobando cómodamente
  }

  if (minGradeToPass > 4.0) {
    return 'at-risk'; // En riesgo, necesita notas muy altas
  }

  if (projectedGrade < PASSING_GRADE) {
    return 'at-risk';
  }

  return 'passing';
}

// src/utils/gradeCalculations.ts - FUNCIÓN COMPATIBLE
export function calculateCourseRealStats(
  courseId: string,
  enrolledStudents: string[],
  grades: Grade[],
  gradeSheets: any[] = []
): {
  averageGrade: number;
  passingCount: number;
  atRiskCount: number;
  failingCount: number;
  totalStudents: number;
  studentsWithGrades: number;
} {
  if (!enrolledStudents || enrolledStudents.length === 0) {
    return {
      averageGrade: 0,
      passingCount: 0,
      atRiskCount: 0,
      failingCount: 0,
      totalStudents: 0,
      studentsWithGrades: 0
    };
  }

  let totalGrade = 0;
  let passingCount = 0;
  let atRiskCount = 0;
  let failingCount = 0;
  let studentsWithGrades = 0;

  // Combinar calificaciones de ambos sistemas
  for (const studentId of enrolledStudents) {
    let studentGrades: number[] = [];
    
    // 1. Buscar en grades tradicionales
    const traditionalGrades = grades.filter(
      g => g.courseId === courseId && g.studentId === studentId && g.value !== null && g.value !== undefined
    );
    
    if (traditionalGrades.length > 0) {
      studentGrades.push(...traditionalGrades.map(g => g.value));
    }
    
    // 2. Buscar en gradeSheets
    const publishedSheets = gradeSheets.filter(
      sheet => sheet.courseId === courseId && sheet.isPublished
    );
    
    for (const sheet of publishedSheets) {
      const studentInSheet = sheet.students?.find(
        (s: any) => s.studentId === studentId
      );
      
      if (studentInSheet?.total !== undefined && studentInSheet.total !== null) {
        studentGrades.push(studentInSheet.total);
      }
    }
    
    // Calcular promedio si hay calificaciones
    if (studentGrades.length > 0) {
      const studentAverage = studentGrades.reduce((sum, grade) => sum + grade, 0) / studentGrades.length;
      totalGrade += studentAverage;
      studentsWithGrades++;
      
      // Clasificar al estudiante
      if (studentAverage >= 3.5) {
        passingCount++;
      } else if (studentAverage >= 3.0) {
        atRiskCount++;
      } else {
        failingCount++;
      }
    }
  }

  const averageGrade = studentsWithGrades > 0 
    ? Number((totalGrade / studentsWithGrades).toFixed(1))
    : 0;

  return {
    averageGrade,
    passingCount,
    atRiskCount,
    failingCount,
    totalStudents: enrolledStudents.length,
    studentsWithGrades
  };
}