// contexts/AcademicContext.tsx - VERSIÓN CORREGIDA
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { firebaseDB } from '@/lib/firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot
} from 'firebase/firestore';
import { unitService, weekService, slideService } from '@/lib/unitService';
import { assessmentService } from '@/lib/services/assessmentService'; // Importar correctamente
import type { 
  Course, 
  Assessment, 
  Grade, 
  Slide, 
  Unit,
  Announcement,
  Week 
} from '@/types/academic';

interface AcademicContextType { 
  courses: Course[];
  assessments: Assessment[];
  grades: Grade[];
  units: Unit[];
  announcements: Announcement[];
  loading: {
    courses: boolean;
    assessments: boolean;
    grades: boolean;
    units: boolean;

    

    
  };
  
  // Course actions
  addCourse: (course: Omit<Course, 'id' | 'createdAt'>) => void;
  updateCourse: (id: string, course: Partial<Course>) => void;
  deleteCourse: (id: string) => void;
  
  // Assessment actions
  addAssessment: (assessment: Omit<Assessment, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateAssessment: (id: string, assessment: Partial<Assessment>) => Promise<void>;
  deleteAssessment: (id: string) => Promise<void>;
  getCourseAssessments: (courseId: string) => Promise<Assessment[]>;
  
  // Grade actions
  addGrade: (grade: Omit<Grade, 'id' | 'gradedAt' | 'gradedBy'>) => Promise<string>;
  updateGrade: (id: string, grade: Partial<Grade>) => Promise<void>;
  getStudentGrades: (studentId: string, courseId: string) => Promise<Grade[]>;
  getCourseGrades: (courseId: string) => Promise<Grade[]>;
  
  // Unit/Slide actions
  addUnit: (unit: Omit<Unit, 'id' | 'weeks' | 'createdAt'>) => Promise<string>;
  updateUnit: (id: string, updates: Partial<Omit<Unit, 'id' | 'createdAt'>>) => Promise<void>;
  deleteUnit: (id: string) => Promise<void>;
  addWeek: (week: Omit<Week, 'id' | 'slides' | 'createdAt'>) => Promise<string>;
  addSlide: (slide: Omit<Slide, 'id' | 'createdAt'>) => Promise<string>;
  deleteSlide: (slideId: string) => Promise<void>;
  refreshUnits: (courseId?: string) => Promise<void>;
}

const AcademicContext = createContext<AcademicContextType | undefined>(undefined);


export function AcademicProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  
  
  const [loading, setLoading] = useState({
    courses: true,
    assessments: true,
    grades: true,
    units: false,
  });

  // Cargar evaluaciones para todos los cursos del usuario
  useEffect(() => {
    if (!user?.id || courses.length === 0) {
      setAssessments([]);
      setLoading(prev => ({ ...prev, assessments: false }));
      return;
    }

    const loadAllAssessments = async () => {
      setLoading(prev => ({ ...prev, assessments: true }));
      try {
        let allAssessments: Assessment[] = [];
        
        for (const course of courses) {
          try {
            const courseAssessments = await assessmentService.getCourseAssessments(course.id);
            allAssessments = [...allAssessments, ...courseAssessments];
          } catch (error) {
            console.error(`Error cargando evaluaciones para curso ${course.id}:`, error);
          }
        }
        
        setAssessments(allAssessments);
        console.log('📝 Evaluaciones cargadas:', allAssessments.length);
      } catch (error) {
        console.error('Error cargando evaluaciones:', error);
      } finally {
        setLoading(prev => ({ ...prev, assessments: false }));
      }
    };

    loadAllAssessments();
  }, [user, courses]);

  // Cargar calificaciones para el usuario
// En el useEffect que carga calificaciones, reemplaza esta parte:
useEffect(() => {
  if (!user?.id) {
    setGrades([]);
    setLoading(prev => ({ ...prev, grades: false }));
    return;
  }

const loadGrades = async () => {
    setLoading(prev => ({ ...prev, grades: true }));
    try {
      let userGrades: Grade[] = [];
      
      if (user.role === 'estudiante') {
        // Para estudiantes, cargar todas sus calificaciones
        for (const course of courses) {
          try {
            const courseGrades = await assessmentService.getStudentGrades(user.id, course.id);
            userGrades = [...userGrades, ...courseGrades];
          } catch (error) {
            console.error(`Error cargando calificaciones para curso ${course.id}:`, error);
          }
        }
      } else if (user.role === 'docente') {
        // Para docentes, cargar todas las calificaciones de sus cursos
        for (const course of courses) {
          try {
            // Usar getCourseGrades en lugar de getStudentGrades
            const courseGrades = await assessmentService.getCourseGrades(course.id);
            userGrades = [...userGrades, ...courseGrades];
          } catch (error) {
            console.error(`Error cargando calificaciones para curso ${course.id}:`, error);
          }
        }
      }
      
      setGrades(userGrades);
      console.log('📊 Calificaciones cargadas:', userGrades.length);
    } catch (error) {
      console.error('Error cargando calificaciones:', error);
    } finally {
      setLoading(prev => ({ ...prev, grades: false }));
    }
  };

  // Solo cargar calificaciones si hay cursos
  if (courses.length > 0) {
    loadGrades();
  } else {
    setGrades([]);
    setLoading(prev => ({ ...prev, grades: false }));
  }
}, [user, courses]);

  // Función para recargar unidades
  const refreshUnits = async (courseId?: string) => {
    setLoading(prev => ({ ...prev, units: true }));
    try {
      let loadedUnits: Unit[] = [];
      
      if (courseId) {
        loadedUnits = await unitService.getByCourse(courseId);
        console.log(`🔄 Unidades recargadas para curso ${courseId}:`, loadedUnits.length);
      } else {
        loadedUnits = await unitService.getAll();
        console.log('🔄 Todas las unidades recargadas:', loadedUnits.length);
      }
      
      setUnits(loadedUnits);
    } catch (error) {
      console.error('Error recargando unidades:', error);
    } finally {
      setLoading(prev => ({ ...prev, units: false }));
    }
  };

  const getStudentGrades = async (studentId: string, courseId: string): Promise<Grade[]> => {
  try {
    return await assessmentService.getStudentGrades(studentId, courseId);
  } catch (error) {
    console.error('Error obteniendo calificaciones del estudiante:', error);
    throw error;
  }
};
const getCourseGrades = async (courseId: string): Promise<Grade[]> => {
  try {
    return await assessmentService.getCourseGrades(courseId);
  } catch (error) {
    console.error('Error obteniendo calificaciones del curso:', error);
    throw error;
  }
};

  // Configurar listener en tiempo real para unidades
  useEffect(() => {
    if (!user?.id || courses.length === 0) {
      setUnits([]);
      setLoading(prev => ({ ...prev, units: false }));
      return;
    }

    console.log('🎯 Configurando listener en tiempo real para unidades del usuario');
    
    const loadUnitsForUserCourses = async () => {
      setLoading(prev => ({ ...prev, units: true }));
      
      try {
        let allUserUnits: Unit[] = [];
        
        for (const course of courses) {
          try {
            const courseUnits = await unitService.getByCourse(course.id);
            allUserUnits = [...allUserUnits, ...courseUnits];
          } catch (error) {
            console.error(`Error cargando unidades para curso ${course.id}:`, error);
          }
        }
        
        setUnits(allUserUnits);
        console.log('📦 Unidades del usuario cargadas:', allUserUnits.length);
      } catch (error) {
        console.error('Error cargando unidades para cursos del usuario:', error);
      } finally {
        setLoading(prev => ({ ...prev, units: false }));
      }
    };

    loadUnitsForUserCourses();
    
    const unsubscribe = onSnapshot(
      collection(firebaseDB, 'unidades'),
      async () => {
        await loadUnitsForUserCourses();
      },
      (error) => {
        console.error('Error en listener de unidades:', error);
        if (error.code === 'failed-precondition') {
          console.log('⚠️ Desactivando listener en tiempo real debido a error de índice');
        }
      }
    );

    return () => {
      console.log('🧹 Limpiando listener de unidades');
      unsubscribe();
    };
  }, [user, courses]);

  // Cargar cursos en tiempo real
  useEffect(() => {
    if (!user?.id) {
      setCourses([]);
      setLoading(prev => ({ ...prev, courses: false }));
      return;
    }

    let unsubscribe: () => void;

    if (user.role === 'docente') {
      try {
        const q = query(
          collection(firebaseDB, 'cursos'), 
          where('teacherId', '==', user.id),
          orderBy('createdAt', 'desc')
        );
        
        unsubscribe = onSnapshot(q, 
          (snapshot) => {
            const coursesData: Course[] = [];
            snapshot.forEach((doc) => {
              const data = doc.data();
              coursesData.push({
                id: doc.id,
                name: data.name || '',
                code: data.code || '',
                semester: data.semester || '',
                group: data.group || '',
                credits: data.credits || 0,
                teacherId: data.teacherId || '',
                teacherName: data.teacherName || '',
                description: data.description || '',
                enrolledStudents: data.enrolledStudents || [],
                createdAt: data.createdAt?.toDate() || new Date(),
              });
            });
            
            console.log('📚 Cursos cargados para docente:', coursesData.length);
            setCourses(coursesData);
            setLoading(prev => ({ ...prev, courses: false }));
          },
          (error) => {
            console.error('Error cargando cursos:', error);
            setLoading(prev => ({ ...prev, courses: false }));
          }
        );
      } catch (error) {
        console.error('Error configurando listener de cursos:', error);
        setLoading(prev => ({ ...prev, courses: false }));
      }
    } else {
      // Para estudiantes
      try {
        const q = query(
          collection(firebaseDB, 'cursos'), 
          where('enrolledStudents', 'array-contains', user.id)
        );
        
        unsubscribe = onSnapshot(q, 
          (snapshot) => {
            const coursesData: Course[] = [];
            snapshot.forEach((doc) => {
              const data = doc.data();
              coursesData.push({
                id: doc.id,
                name: data.name || '',
                code: data.code || '',
                semester: data.semester || '',
                group: data.group || '',
                credits: data.credits || 0,
                teacherId: data.teacherId || '',
                teacherName: data.teacherName || '',
                description: data.description || '',
                enrolledStudents: data.enrolledStudents || [],
                createdAt: data.createdAt?.toDate() || new Date(),
              });
            });
            
            // Ordenar manualmente
            coursesData.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            
            console.log('📚 Cursos cargados para estudiante:', coursesData.length);
            setCourses(coursesData);
            setLoading(prev => ({ ...prev, courses: false }));
          },
          (error) => {
            console.error('Error cargando cursos para estudiante:', error);
            setLoading(prev => ({ ...prev, courses: false }));
          }
        );
      } catch (error) {
        console.error('Error configurando listener de cursos para estudiante:', error);
        setLoading(prev => ({ ...prev, courses: false }));
      }
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user]);

  // FUNCIONES IMPLEMENTADAS
  const addAssessment = async (assessmentData: Omit<Assessment, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    try {
      console.log('➕ Creando nueva evaluación:', assessmentData);
      const assessmentId = await assessmentService.createAssessment(assessmentData);
      
      // Recargar evaluaciones después de crear
      setTimeout(() => {
        setAssessments(prev => [...prev, { ...assessmentData, id: assessmentId } as Assessment]);
      }, 500);
      
      return assessmentId;
    } catch (error) {
      console.error('Error agregando evaluación:', error);
      throw error;
    }
  };

  const updateAssessment = async (assessmentId: string, updates: Partial<Assessment>): Promise<void> => {
    try {
      console.log('✏️ Actualizando evaluación:', assessmentId, updates);
      await assessmentService.updateAssessment(assessmentId, updates);
      
      // Actualizar localmente
      setAssessments(prev => 
        prev.map(assessment => 
          assessment.id === assessmentId 
            ? { ...assessment, ...updates, updatedAt: new Date() }
            : assessment
        )
      );
    } catch (error) {
      console.error('Error actualizando evaluación:', error);
      throw error;
    }
  };

  const deleteAssessment = async (assessmentId: string): Promise<void> => {
    try {
      console.log('🗑️ Eliminando evaluación:', assessmentId);
      await assessmentService.deleteAssessment(assessmentId);
      
      // Remover localmente
      setAssessments(prev => prev.filter(assessment => assessment.id !== assessmentId));
    } catch (error) {
      console.error('Error eliminando evaluación:', error);
      throw error;
    }
  };

  const getCourseAssessments = async (courseId: string): Promise<Assessment[]> => {
    try {
      return await assessmentService.getCourseAssessments(courseId);
    } catch (error) {
      console.error('Error obteniendo evaluaciones del curso:', error);
      throw error;
    }
  };

  const addGrade = async (gradeData: Omit<Grade, 'id' | 'gradedAt' | 'gradedBy'>): Promise<string> => {
    try {
      console.log('➕ Creando nueva calificación:', gradeData);
      
      if (!user) throw new Error('Usuario no autenticado');
      
      const gradeWithGradedBy = {
        ...gradeData,
        gradedBy: user.id
      };
      
      const gradeId = await assessmentService.gradeAssessment(gradeWithGradedBy);
      
      // Recargar calificaciones
      setTimeout(() => {
        setGrades(prev => [...prev, { ...gradeWithGradedBy, id: gradeId } as Grade]);
      }, 500);
      
      return gradeId;
    } catch (error) {
      console.error('Error agregando calificación:', error);
      throw error;
    }
  };

  const updateGrade = async (gradeId: string, updates: Partial<Grade>): Promise<void> => {
    try {
      console.log('✏️ Actualizando calificación:', gradeId, updates);
      await assessmentService.updateGrade(gradeId, updates);
      
      // Actualizar localmente
      setGrades(prev => 
        prev.map(grade => 
          grade.id === gradeId 
            ? { ...grade, ...updates }
            : grade
        )
      );
    } catch (error) {
      console.error('Error actualizando calificación:', error);
      throw error;
    }
  };

  const addUnit = async (unitData: Omit<Unit, 'id' | 'weeks' | 'createdAt'>): Promise<string> => {
    try {
      console.log('➕ Creando nueva unidad:', unitData);
      const unitId = await unitService.create(unitData);
      
      if (unitData.courseId) {
        setTimeout(() => {
          refreshUnits(unitData.courseId);
        }, 500);
      }
      
      return unitId;
    } catch (error) {
      console.error('Error agregando unidad:', error);
      throw error;
    }
  };

  const updateUnit = async (unitId: string, updates: Partial<Omit<Unit, 'id' | 'createdAt'>>): Promise<void> => {
    try {
      console.log('✏️ Actualizando unidad:', unitId, updates);
      await unitService.update(unitId, updates);
      
      setTimeout(() => {
        refreshUnits();
      }, 500);
    } catch (error) {
      console.error('Error actualizando unidad:', error);
      throw error;
    }
  };

  const deleteUnit = async (unitId: string): Promise<void> => {
    try {
      console.log('🗑️ Eliminando unidad:', unitId);
      await unitService.delete(unitId);
      
      setTimeout(() => {
        refreshUnits();
      }, 500);
    } catch (error) {
      console.error('Error eliminando unidad:', error);
      throw error;
    }
  };

  const addWeek = async (weekData: Omit<Week, 'id' | 'slides' | 'createdAt'>): Promise<string> => {
    try {
      console.log('➕ Creando nueva semana:', weekData);
      const weekId = await weekService.create(weekData);
      
      setTimeout(() => {
        refreshUnits();
      }, 500);
      
      return weekId;
    } catch (error) {
      console.error('Error agregando semana:', error);
      throw error;
    }
  };

  const addSlide = async (slideData: Omit<Slide, 'id' | 'createdAt'>): Promise<string> => {
    try {
      console.log('➕ Creando nueva diapositiva:', slideData);
      const slideId = await slideService.create(slideData);
      
      setTimeout(() => {
        refreshUnits();
      }, 500);
      
      return slideId;
    } catch (error) {
      console.error('Error agregando diapositiva:', error);
      throw error;
    }
  };

  const deleteSlide = async (slideId: string): Promise<void> => {
    try {
      console.log('🗑️ Eliminando diapositiva:', slideId);
      await slideService.delete(slideId);
      
      setTimeout(() => {
        refreshUnits();
      }, 500);
    } catch (error) {
      console.error('Error eliminando diapositiva:', error);
      throw error;
    }
  };

  // Funciones placeholder para cursos
  const addCourse = async (course: Omit<Course, 'id' | 'createdAt'>) => {
    console.log('Añadir curso:', course);
  };

  const updateCourse = async (id: string, course: Partial<Course>) => {
    console.log('Actualizar curso:', id, course);
  };

  const deleteCourse = async (id: string) => {
    console.log('Eliminar curso:', id);
  };

  return (
    <AcademicContext.Provider
      value={{
        courses,
        assessments,
        grades,
        units,
        announcements,
        loading,
        addCourse,
        updateCourse,
        deleteCourse,
        addAssessment,
        updateAssessment,
        deleteAssessment,
        getCourseAssessments,
        addGrade,
        updateGrade,
        addUnit,
        updateUnit,
        deleteUnit,
        addWeek,
        addSlide,
        deleteSlide,
        refreshUnits,
        getStudentGrades,
      getCourseGrades,
      }}
    >
      {children}
    </AcademicContext.Provider>
  );
}

export function useAcademic() {
  const context = useContext(AcademicContext);
  if (context === undefined) {
    throw new Error('useAcademic must be used within an AcademicProvider');
  }
  return context;
}