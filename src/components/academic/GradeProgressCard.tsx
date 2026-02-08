// src/components/academic/GradeProgressCard.tsx - VERSIÓN MEJORADA
import { cn } from '@/lib/utils';
import type { StudentProgress } from '@/types/academic';
import { StatusBadge } from './StatusBadge';
import { TrendingUp, Target, Percent } from 'lucide-react';
import { useEffect, useState } from 'react';
import { firebaseDB } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

interface GradeProgressCardProps {
  progress: StudentProgress;
  courseName?: string;
  className?: string;
}

interface GradeSheet {
  id: string;
  activities: Array<{
    id: string;
    name: string;
    maxScore: number;
    weight?: number;
  }>;
  students: Array<{
    studentId: string;
    grades: Record<string, {
      value?: number;
      comment?: string;
    }>;
    total?: number;
  }>;
  isPublished: boolean;
  gradingPeriod?: string;
}

interface CalculatedProgress {
  currentGrade: number;
  evaluatedPercentage: number;
  remainingPercentage: number;
  minGradeToPass: number;
  status: 'passing' | 'at-risk' | 'failing';
  totalActivities: number;
  evaluatedActivities: number;
}

export function GradeProgressCard({ progress, courseName, className }: GradeProgressCardProps) {
  const [dbProgress, setDbProgress] = useState<CalculatedProgress | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Calcular progreso desde la base de datos
  useEffect(() => {
    const calculateProgressFromDB = async () => {
      if (!progress?.studentId || !progress?.courseId) {
        setDbProgress(null);
        return;
      }
      
      setLoading(true);
      try {
        console.log('Buscando hojas para estudiante:', progress.studentId, 'curso:', progress.courseId);
        
        // Obtener todas las hojas de calificaciones del curso
        const gradeSheetsRef = collection(firebaseDB, 'gradeSheets');
        const q = query(
          gradeSheetsRef,
          where('courseId', '==', progress.courseId)
        );
        
        const querySnapshot = await getDocs(q);
        const sheets: GradeSheet[] = [];
        let foundStudent = false;
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          
          console.log('Hoja encontrada:', {
            id: doc.id,
            title: data.title,
            courseId: data.courseId,
            isPublished: data.isPublished,
            studentCount: data.students?.length || 0,
          });
          
          // Solo incluir hojas publicadas
          if (!data.isPublished) {
            console.log('Hoja no publicada, ignorando:', doc.id);
            return;
          }
          
          const activities = (data.activities || []).map((act: any, index: number) => ({
            id: act.id || `activity_${doc.id}_${index}`,
            name: act.name || `Actividad ${index + 1}`,
            maxScore: typeof act.maxScore === 'number' 
              ? Math.max(1, Math.min(5.0, act.maxScore)) 
              : 5.0,
            weight: typeof act.weight === 'number' ? act.weight : undefined,
          }));
          
          // Filtrar estudiantes para incluir solo al estudiante actual
          const filteredStudents = (data.students || []).filter((student: any) => {
            const matches = student.studentId === progress.studentId;
            if (matches) {
              foundStudent = true;
              console.log('Estudiante encontrado en hoja:', {
                studentId: student.studentId,
                gradesCount: Object.keys(student.grades || {}).length,
                total: student.total,
              });
            }
            return matches;
          });
          
          if (filteredStudents.length > 0) {
            sheets.push({
              id: doc.id,
              activities,
              students: filteredStudents,
              isPublished: data.isPublished || false,
              gradingPeriod: data.gradingPeriod,
            });
          }
        });
        
        if (!foundStudent) {
          console.log('No se encontró al estudiante en ninguna hoja publicada');
          setDbProgress(null);
          return;
        }
        
        if (sheets.length === 0) {
          console.log('No hay hojas con el estudiante');
          setDbProgress(null);
          return;
        }
        
        console.log(`Hojas procesadas con el estudiante: ${sheets.length}`);
        
        // Calcular el total de actividades en todas las hojas
        let totalActivities = 0;
        let evaluatedActivities = 0;
        let totalWeightedGrade = 0;
        let totalWeight = 0;
        
        sheets.forEach((sheet, sheetIndex) => {
          const studentData = sheet.students[0];
          if (!studentData) return;
          
          console.log(`Hoja ${sheetIndex + 1}: ${sheet.activities.length} actividades`);
          
          sheet.activities.forEach((activity, actIndex) => {
            totalActivities++;
            
            const grade = studentData.grades?.[activity.id];
            const weight = activity.weight || (100 / sheet.activities.length);
            
            if (grade?.value !== undefined) {
              evaluatedActivities++;
              
              // Normalizar a escala 0-5
              const normalizedValue = (grade.value / activity.maxScore) * 5.0;
              const activityWeight = weight / 100; // Convertir porcentaje a decimal
              
              totalWeightedGrade += normalizedValue * activityWeight;
              totalWeight += activityWeight;
              
              console.log(`  Actividad ${actIndex + 1}:`, {
                name: activity.name,
                value: grade.value,
                maxScore: activity.maxScore,
                normalized: normalizedValue.toFixed(2),
                weight: activityWeight.toFixed(2),
              });
            } else {
              console.log(`  Actividad ${actIndex + 1}: Sin calificación`);
            }
          });
          
          // También considerar el total de la hoja si está disponible
          if (studentData.total !== undefined) {
            console.log('Total de hoja disponible:', studentData.total);
          }
        });
        
        console.log('Resumen cálculo:', {
          totalActivities,
          evaluatedActivities,
          totalWeightedGrade,
          totalWeight,
        });
        
        // Calcular promedio final
        let currentGrade = 0;
        if (totalWeight > 0) {
          currentGrade = totalWeightedGrade / totalWeight;
        } else if (sheets.length > 0 && sheets[0].students[0]?.total !== undefined) {
          // Usar total de la hoja si está disponible
          currentGrade = sheets[0].students[0].total || 0;
        }
        
        // Calcular porcentajes
        const evaluatedPercentage = totalActivities > 0 
          ? (evaluatedActivities / totalActivities) * 100 
          : 0;
        const remainingPercentage = 100 - evaluatedPercentage;
        
        // Redondear a 1 decimal para display
        const roundedCurrentGrade = Math.round(currentGrade * 10) / 10;
        const roundedEvaluatedPercentage = Math.round(evaluatedPercentage);
        const roundedRemainingPercentage = Math.round(remainingPercentage);
        
        // Determinar estado
        let status: 'passing' | 'at-risk' | 'failing';
        if (roundedCurrentGrade >= 3.5) {
          status = 'passing';
        } else if (roundedCurrentGrade >= 2.5) {
          status = 'at-risk';
        } else {
          status = 'failing';
        }
        
        // Calcular nota mínima para aprobar
        let minGradeToPass = 0;
        if (roundedCurrentGrade < 3.0 && evaluatedPercentage < 100) {
          const neededTotalPoints = 3.0 * totalActivities;
          const currentPoints = roundedCurrentGrade * evaluatedActivities;
          const remainingActivities = totalActivities - evaluatedActivities;
          
          if (remainingActivities > 0) {
            const neededAverage = (neededTotalPoints - currentPoints) / remainingActivities;
            minGradeToPass = Math.max(2.5, Math.min(5.0, neededAverage));
          }
        }
        
        const calculatedProgress: CalculatedProgress = {
          currentGrade: roundedCurrentGrade,
          evaluatedPercentage: roundedEvaluatedPercentage,
          remainingPercentage: roundedRemainingPercentage,
          minGradeToPass,
          status,
          totalActivities,
          evaluatedActivities,
        };
        
        console.log('Progreso calculado:', calculatedProgress);
        setDbProgress(calculatedProgress);
        
      } catch (error) {
        console.error('Error calculando progreso desde DB:', error);
        setDbProgress(null);
      } finally {
        setLoading(false);
      }
    };
    
    calculateProgressFromDB();
  }, [progress?.studentId, progress?.courseId]);
  
  // Usar datos de la base de datos o del contexto
  const displayProgress = dbProgress || {
    currentGrade: progress.currentGrade,
    evaluatedPercentage: progress.evaluatedPercentage,
    remainingPercentage: progress.remainingPercentage,
    minGradeToPass: progress.minGradeToPass,
    status: progress.status,
    totalActivities: 0,
    evaluatedActivities: 0,
  };
  
  // Debug info
  console.log('Display progress:', {
    dbProgress: !!dbProgress,
    currentGrade: displayProgress.currentGrade,
    evaluatedPercentage: displayProgress.evaluatedPercentage,
    courseName,
    studentId: progress?.studentId,
    courseId: progress?.courseId,
  });

  if (loading) {
    return (
      <div className={cn('bg-card border rounded-lg p-4 animate-pulse', className)}>
        {courseName && (
          <div className="h-6 bg-muted rounded mb-4"></div>
        )}
        <div className="space-y-4">
          <div className="h-16 bg-muted/30 rounded-lg"></div>
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-muted/20 rounded-md"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('bg-card border rounded-lg p-4', className)}>
      {/* Título del curso */}
      {courseName && (
        <h3 className="font-semibold text-base mb-4">{courseName}</h3>
      )}

      {/* Contenido principal */}
      <div className="space-y-4">
        {/* Nota promedio */}
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Promedio actual</p>
            <div className="flex items-baseline gap-2">
              <span className={cn(
                'text-2xl font-bold',
                displayProgress.status === 'passing' && 'text-green-600',
                displayProgress.status === 'at-risk' && 'text-amber-600',
                displayProgress.status === 'failing' && 'text-red-600',
              )}>
                {displayProgress.currentGrade.toFixed(1)}
              </span>
              <span className="text-sm text-muted-foreground">/5.0</span>
            </div>
          </div>
          <StatusBadge status={displayProgress.status} size="sm" />
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-md bg-muted/20">
            <div className="flex flex-col items-center">
              <Percent className="h-5 w-5 text-primary mb-2" />
              <span className="font-semibold text-lg">
                {displayProgress.evaluatedPercentage}%
              </span>
              <span className="text-xs text-muted-foreground mt-1">Evaluado</span>
              {displayProgress.totalActivities > 0 && (
                <span className="text-[10px] text-muted-foreground mt-1">
                  ({displayProgress.evaluatedActivities}/{displayProgress.totalActivities})
                </span>
              )}
            </div>
          </div>
          
          <div className="text-center p-3 rounded-md bg-muted/20">
            <div className="flex flex-col items-center">
              <Target className="h-5 w-5 text-primary mb-2" />
              <span className="font-semibold text-lg">
                {displayProgress.remainingPercentage}%
              </span>
              <span className="text-xs text-muted-foreground mt-1">Pendiente</span>
            </div>
          </div>
          
          <div className="text-center p-3 rounded-md bg-muted/20">
            <div className="flex flex-col items-center">
              <TrendingUp className="h-5 w-5 text-primary mb-2" />
              <span className={cn(
                'font-semibold text-lg',
                displayProgress.minGradeToPass <= 0 ? 'text-green-600' : 
                displayProgress.minGradeToPass > 3.5 ? 'text-red-600' : 'text-amber-600'
              )}>
                {displayProgress.minGradeToPass <= 0 ? '✓' : displayProgress.minGradeToPass.toFixed(1)}
              </span>
              <span className="text-xs text-muted-foreground mt-1">Para aprobar</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Indicador de origen de datos y debug info */}
      <div className="mt-4 pt-3 border-t border-border">
        <div className="flex justify-between items-center">
          <p className="text-xs text-muted-foreground">
            {dbProgress 
              ? 'Datos desde base de datos' 
              : 'Datos del contexto'}
          </p>
          {dbProgress && displayProgress.totalActivities > 0 && (
            <p className="text-xs text-muted-foreground">
              {displayProgress.evaluatedActivities} de {displayProgress.totalActivities} actividades
            </p>
          )}
        </div>
      </div>
    </div>
  );
}