// contexts/AcademicContext.tsx - VERSIÓN CORREGIDA CON REFRESH COURSES
import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { firebaseDB } from '@/lib/firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  getDocs
} from 'firebase/firestore';
import { unitService, weekService, slideService } from '@/lib/unitService';
import { assessmentService } from '@/lib/services/assessmentService';
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
  selectedCourseId: string;
  selectedCourse: Course | null;
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
  setSelectedCourseId: (courseId: string) => void;
  refreshCourses: () => Promise<void>; 
  
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
  const userId = user?.id ?? '';
  const userRole = user?.role;
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseIdState] = useState<string>('');
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

  const selectedCourseStorageKey = user?.id ? `global:selectedCourse:${user.id}` : null;

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) || null,
    [courses, selectedCourseId],
  );

  const setSelectedCourseId = useCallback((courseId: string) => {
    setSelectedCourseIdState(courseId || '');
  }, []);

  // NUEVA FUNCIÓN: refreshCourses - Recargar cursos manualmente
  const refreshCourses = async (): Promise<void> => {
    if (!user?.id) {
      return;
    }

    setLoading(prev => ({ ...prev, courses: true }));

    try {
      let coursesData: Course[] = [];
      const coursesRef = collection(firebaseDB, 'cursos');

      if (user.role === 'docente') {
        const q = query(
          coursesRef, 
          where('teacherId', '==', user.id),
          orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach((doc) => {
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
      } else {
        // Para estudiantes
        const q = query(
          coursesRef, 
          where('enrolledStudents', 'array-contains', user.id)
        );
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach((doc) => {
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
      }

      setCourses(coursesData);
    } catch (error) {
    } finally {
      setLoading(prev => ({ ...prev, courses: false }));
    }
  };

  // Cargar evaluaciones para todos los cursos del usuario
  useEffect(() => {
    if (!userId || courses.length === 0) {
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
          }
        }
        
        setAssessments(allAssessments);
      } catch (error) {
      } finally {
        setLoading(prev => ({ ...prev, assessments: false }));
      }
    };

    loadAllAssessments();
  }, [userId, courses]);

  // Cargar calificaciones para el usuario
  useEffect(() => {
    if (!userId) {
      setGrades([]);
      setLoading(prev => ({ ...prev, grades: false }));
      return;
    }

    const loadGrades = async () => {
      setLoading(prev => ({ ...prev, grades: true }));
      try {
        let userGrades: Grade[] = [];
        
        if (userRole === 'estudiante') {
          // Para estudiantes, cargar todas sus calificaciones
          for (const course of courses) {
            try {
              const courseGrades = await assessmentService.getStudentGrades(userId, course.id);
              userGrades = [...userGrades, ...courseGrades];
            } catch (error) {
            }
          }
        } else if (userRole === 'docente') {
          // Para docentes, cargar todas las calificaciones de sus cursos
          for (const course of courses) {
            try {
              const courseGrades = await assessmentService.getCourseGrades(course.id);
              userGrades = [...userGrades, ...courseGrades];
            } catch (error) {
            }
          }
        }
        
        setGrades(userGrades);
      } catch (error) {
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
  }, [userId, userRole, courses]);

  // Mantener un curso global seleccionado por usuario y válido para la lista de cursos actual.
  useEffect(() => {
    if (!selectedCourseStorageKey) {
      setSelectedCourseIdState('');
      return;
    }

    if (courses.length === 0) {
      setSelectedCourseIdState('');
      return;
    }

    const savedCourseId = localStorage.getItem(selectedCourseStorageKey);
    const hasCurrent = selectedCourseId
      ? courses.some((course) => course.id === selectedCourseId)
      : false;

    if (hasCurrent) {
      return;
    }

    if (savedCourseId && courses.some((course) => course.id === savedCourseId)) {
      setSelectedCourseIdState(savedCourseId);
      return;
    }

    setSelectedCourseIdState(courses[0].id);
  }, [courses, selectedCourseId, selectedCourseStorageKey]);

  useEffect(() => {
    if (!selectedCourseStorageKey) return;

    if (selectedCourseId) {
      localStorage.setItem(selectedCourseStorageKey, selectedCourseId);
    } else {
      localStorage.removeItem(selectedCourseStorageKey);
    }
  }, [selectedCourseId, selectedCourseStorageKey]);

  // Función para recargar unidades
  const refreshUnits = async (courseId?: string) => {
    setLoading(prev => ({ ...prev, units: true }));
    try {
      let loadedUnits: Unit[] = [];
      
      if (courseId) {
        loadedUnits = await unitService.getByCourse(courseId);
      } else {
        loadedUnits = await unitService.getAll();
      }
      
      setUnits(loadedUnits);
    } catch (error) {
    } finally {
      setLoading(prev => ({ ...prev, units: false }));
    }
  };

  const getStudentGrades = async (studentId: string, courseId: string): Promise<Grade[]> => {
    try {
      return await assessmentService.getStudentGrades(studentId, courseId);
    } catch (error) {
      throw error;
    }
  };

  const getCourseGrades = async (courseId: string): Promise<Grade[]> => {
    try {
      return await assessmentService.getCourseGrades(courseId);
    } catch (error) {
      throw error;
    }
  };

  // Configurar listener en tiempo real para unidades
  useEffect(() => {
    if (!userId || courses.length === 0) {
      setUnits([]);
      setLoading(prev => ({ ...prev, units: false }));
      return;
    }

    
    const loadUnitsForUserCourses = async () => {
      setLoading(prev => ({ ...prev, units: true }));
      
      try {
        let allUserUnits: Unit[] = [];
        
        for (const course of courses) {
          try {
            const courseUnits = await unitService.getByCourse(course.id);
            allUserUnits = [...allUserUnits, ...courseUnits];
          } catch (error) {
          }
        }
        
        setUnits(allUserUnits);
      } catch (error) {
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
        if (error.code === 'failed-precondition') {
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [userId, courses]);

  // Cargar cursos en tiempo real
  useEffect(() => {
    if (!userId) {
      setCourses([]);
      setLoading(prev => ({ ...prev, courses: false }));
      return;
    }

    let unsubscribe: () => void;

    if (userRole === 'docente') {
      try {
        const q = query(
          collection(firebaseDB, 'cursos'), 
          where('teacherId', '==', userId),
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
            
            setCourses(coursesData);
            setLoading(prev => ({ ...prev, courses: false }));
          },
          (error) => {
            setLoading(prev => ({ ...prev, courses: false }));
          }
        );
      } catch (error) {
        setLoading(prev => ({ ...prev, courses: false }));
      }
    } else {
      // Para estudiantes
      try {
        const q = query(
          collection(firebaseDB, 'cursos'), 
          where('enrolledStudents', 'array-contains', userId)
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
            
            setCourses(coursesData);
            setLoading(prev => ({ ...prev, courses: false }));
          },
          (error) => {
            setLoading(prev => ({ ...prev, courses: false }));
          }
        );
      } catch (error) {
        setLoading(prev => ({ ...prev, courses: false }));
      }
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [userId, userRole]);

  // FUNCIONES IMPLEMENTADAS
  const addAssessment = async (assessmentData: Omit<Assessment, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    try {
      const assessmentId = await assessmentService.createAssessment(assessmentData);
      
      // Recargar evaluaciones después de crear
      setTimeout(() => {
        setAssessments(prev => [...prev, { ...assessmentData, id: assessmentId } as Assessment]);
      }, 500);
      
      return assessmentId;
    } catch (error) {
      throw error;
    }
  };

  const updateAssessment = async (assessmentId: string, updates: Partial<Assessment>): Promise<void> => {
    try {
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
      throw error;
    }
  };

  const deleteAssessment = async (assessmentId: string): Promise<void> => {
    try {
      await assessmentService.deleteAssessment(assessmentId);
      
      // Remover localmente
      setAssessments(prev => prev.filter(assessment => assessment.id !== assessmentId));
    } catch (error) {
      throw error;
    }
  };

  const getCourseAssessments = async (courseId: string): Promise<Assessment[]> => {
    try {
      return await assessmentService.getCourseAssessments(courseId);
    } catch (error) {
      throw error;
    }
  };

  const addGrade = async (gradeData: Omit<Grade, 'id' | 'gradedAt' | 'gradedBy'>): Promise<string> => {
    try {
      
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
      throw error;
    }
  };

  const updateGrade = async (gradeId: string, updates: Partial<Grade>): Promise<void> => {
    try {
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
      throw error;
    }
  };

  const addUnit = async (unitData: Omit<Unit, 'id' | 'weeks' | 'createdAt'>): Promise<string> => {
    try {
      const unitId = await unitService.create(unitData);
      
      if (unitData.courseId) {
        setTimeout(() => {
          refreshUnits(unitData.courseId);
        }, 500);
      }
      
      return unitId;
    } catch (error) {
      throw error;
    }
  };

  const updateUnit = async (unitId: string, updates: Partial<Omit<Unit, 'id' | 'createdAt'>>): Promise<void> => {
    try {
      await unitService.update(unitId, updates);
      
      setTimeout(() => {
        refreshUnits();
      }, 500);
    } catch (error) {
      throw error;
    }
  };

  const deleteUnit = async (unitId: string): Promise<void> => {
    try {
      await unitService.delete(unitId);
      
      setTimeout(() => {
        refreshUnits();
      }, 500);
    } catch (error) {
      throw error;
    }
  };

  const addWeek = async (weekData: Omit<Week, 'id' | 'slides' | 'createdAt'>): Promise<string> => {
    try {
      const weekId = await weekService.create(weekData);
      
      setTimeout(() => {
        refreshUnits();
      }, 500);
      
      return weekId;
    } catch (error) {
      throw error;
    }
  };

  const addSlide = async (slideData: Omit<Slide, 'id' | 'createdAt'>): Promise<string> => {
    try {
      const slideId = await slideService.create(slideData);
      
      setTimeout(() => {
        refreshUnits();
      }, 500);
      
      return slideId;
    } catch (error) {
      throw error;
    }
  };

  const deleteSlide = async (slideId: string): Promise<void> => {
    try {
      await slideService.delete(slideId);
      
      setTimeout(() => {
        refreshUnits();
      }, 500);
    } catch (error) {
      throw error;
    }
  };

  // Funciones placeholder para cursos
  const addCourse = async (course: Omit<Course, 'id' | 'createdAt'>) => {
    void course;
  };

  const updateCourse = async (id: string, course: Partial<Course>) => {
    void id;
    void course;
  };

  const deleteCourse = async (id: string) => {
    void id;
  };

  return (
    <AcademicContext.Provider
      value={{
        courses,
        selectedCourseId,
        selectedCourse,
        assessments,
        grades,
        units,
        announcements,
        loading,
        addCourse,
        updateCourse,
        deleteCourse,
        setSelectedCourseId,
        refreshCourses, // ✅ AHORA ESTÁ INCLUIDA
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
