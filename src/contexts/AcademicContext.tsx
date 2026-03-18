// contexts/AcademicContext.tsx - VERSIÓN CORREGIDA CON REFRESH COURSES
import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { firebaseDB } from '@/lib/firebase';
import { 
  collection, 
  doc,
  getDoc,
  query, 
  where, 
  orderBy, 
  onSnapshot,
  getDocs,
  limit
} from 'firebase/firestore';
import { unitService, weekService, slideService } from '@/lib/unitService';
import { assessmentService } from '@/lib/services/assessmentService';
import { TEACHER_ONBOARDING_COURSE_CODE } from '@/lib/services/teacherOnboardingService';
import type { 
  Course, 
  Assessment, 
  Grade, 
  Slide, 
  Unit,
  Announcement,
  CourseClassSchedule,
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

type LoadingState = {
  courses: boolean;
  assessments: boolean;
  grades: boolean;
  units: boolean;
};

const toTimestamp = (value: unknown): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return 0;
};

const normalizeEnrollmentEntry = (entry: unknown): string => {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object' && 'id' in entry) {
    const maybeId = (entry as { id?: unknown }).id;
    return typeof maybeId === 'string' ? maybeId : '';
  }
  return '';
};

const normalizeClassSchedule = (value: unknown): CourseClassSchedule[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;

      const row = entry as {
        dayOfWeek?: unknown;
        startTime?: unknown;
        endTime?: unknown;
        location?: unknown;
      };
      const dayOfWeek = Number(row.dayOfWeek);
      const startTime = typeof row.startTime === 'string' ? row.startTime.trim() : '';
      const endTime = typeof row.endTime === 'string' ? row.endTime.trim() : '';
      const location = typeof row.location === 'string' ? row.location.trim() : '';

      if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return null;
      if (!startTime || !endTime) return null;

      return {
        dayOfWeek,
        startTime,
        endTime,
        ...(location ? { location } : {}),
      } satisfies CourseClassSchedule;
    })
    .filter((item): item is CourseClassSchedule => Boolean(item))
    .sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
      if (a.endTime !== b.endTime) return a.endTime.localeCompare(b.endTime);
      return (a.location || '').localeCompare(b.location || '');
    });
};

const areCoursesEqual = (prev: Course[], next: Course[]): boolean => {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;

  for (let index = 0; index < prev.length; index += 1) {
    const prevCourse = prev[index];
    const nextCourse = next[index];

    if (
      prevCourse.id !== nextCourse.id ||
      prevCourse.name !== nextCourse.name ||
      prevCourse.code !== nextCourse.code ||
      prevCourse.semester !== nextCourse.semester ||
      prevCourse.group !== nextCourse.group ||
      prevCourse.credits !== nextCourse.credits ||
      prevCourse.teacherId !== nextCourse.teacherId ||
      prevCourse.teacherName !== nextCourse.teacherName ||
      (prevCourse.institutionId || '') !== (nextCourse.institutionId || '') ||
      (prevCourse.institutionName || '') !== (nextCourse.institutionName || '') ||
      (prevCourse.createdByInstitutionId || '') !== (nextCourse.createdByInstitutionId || '') ||
      (prevCourse.createdByInstitutionName || '') !== (nextCourse.createdByInstitutionName || '') ||
      prevCourse.description !== nextCourse.description ||
      (prevCourse.coverUrl || '') !== (nextCourse.coverUrl || '') ||
      toTimestamp(prevCourse.createdAt) !== toTimestamp(nextCourse.createdAt)
    ) {
      return false;
    }

    const prevSchedule = normalizeClassSchedule(prevCourse.classSchedule);
    const nextSchedule = normalizeClassSchedule(nextCourse.classSchedule);
    if (prevSchedule.length !== nextSchedule.length) return false;
    for (let scheduleIndex = 0; scheduleIndex < prevSchedule.length; scheduleIndex += 1) {
      if (
        prevSchedule[scheduleIndex].dayOfWeek !== nextSchedule[scheduleIndex].dayOfWeek ||
        prevSchedule[scheduleIndex].startTime !== nextSchedule[scheduleIndex].startTime ||
        prevSchedule[scheduleIndex].endTime !== nextSchedule[scheduleIndex].endTime ||
        (prevSchedule[scheduleIndex].location || '') !== (nextSchedule[scheduleIndex].location || '')
      ) {
        return false;
      }
    }

    const prevStudents = (prevCourse.enrolledStudents || [])
      .map(normalizeEnrollmentEntry)
      .filter(Boolean);
    const nextStudents = (nextCourse.enrolledStudents || [])
      .map(normalizeEnrollmentEntry)
      .filter(Boolean);

    if (prevStudents.length !== nextStudents.length) return false;
    for (let studentIndex = 0; studentIndex < prevStudents.length; studentIndex += 1) {
      if (prevStudents[studentIndex] !== nextStudents[studentIndex]) return false;
    }
  }

  return true;
};

export function AcademicProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const userRole = user?.role;
  const institutionId = user?.institutionId ?? '';
  const [courses, setCourses] = useState<Course[]>([]);
  const [teacherOnboardingCourse, setTeacherOnboardingCourse] = useState<Course | null>(null);
  const [selectedCourseId, setSelectedCourseIdState] = useState<string>('');
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  
  const [loading, setLoading] = useState<LoadingState>({
    courses: true,
    assessments: true,
    grades: true,
    units: false,
  });

  const selectedCourseStorageKey =
    userId && userRole ? `global:selectedCourse:${userRole}:${userId}` : null;

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) || null,
    [courses, selectedCourseId],
  );

  const setSelectedCourseId = useCallback((courseId: string) => {
    const next = courseId || '';
    if (selectedCourseStorageKey) {
      if (next) {
        localStorage.setItem(selectedCourseStorageKey, next);
      } else {
        localStorage.removeItem(selectedCourseStorageKey);
      }
    }
    setSelectedCourseIdState((prev) => (prev === next ? prev : next));
  }, [selectedCourseStorageKey]);

  const setLoadingFlag = useCallback((key: keyof LoadingState, value: boolean) => {
    setLoading((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

  const setCoursesSafely = useCallback((nextCourses: Course[]) => {
    setCourses((prevCourses) => (areCoursesEqual(prevCourses, nextCourses) ? prevCourses : nextCourses));
  }, []);

  const buildCourseFromSnapshot = useCallback((docSnap: { id: string; data: () => any }): Course => {
    const data = docSnap.data();
    return {
      ...(data as Record<string, unknown>),
      id: docSnap.id,
      name: data.name || '',
      code: data.code || '',
      semester: data.semester || '',
      group: data.group || '',
      credits: data.credits || 0,
      teacherId: data.teacherId || '',
      teacherName: data.teacherName || '',
      institutionId: data.institutionId || '',
      institutionName: data.institutionName || '',
      createdByInstitutionId: data.createdByInstitutionId || '',
      createdByInstitutionName: data.createdByInstitutionName || '',
      description: data.description || '',
      coverUrl: data.coverUrl || '',
      classSchedule: normalizeClassSchedule(data.classSchedule),
      enrolledStudents: data.enrolledStudents || [],
      createdAt: data.createdAt?.toDate() || new Date(),
    } as Course;
  }, []);

  // NUEVA FUNCIÓN: refreshCourses - Recargar cursos manualmente
  const refreshCourses = useCallback(async (): Promise<void> => {
    if (!userId) {
      return;
    }

    setLoadingFlag('courses', true);

    try {
      const coursesData: Course[] = [];
      const coursesRef = collection(firebaseDB, 'cursos');

      if (userRole === 'docente') {
        const q = query(
          coursesRef, 
          where('teacherId', '==', userId),
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
            institutionId: data.institutionId || '',
            institutionName: data.institutionName || '',
            createdByInstitutionId: data.createdByInstitutionId || '',
            createdByInstitutionName: data.createdByInstitutionName || '',
            description: data.description || '',
            coverUrl: data.coverUrl || '',
            classSchedule: normalizeClassSchedule(data.classSchedule),
            enrolledStudents: data.enrolledStudents || [],
            createdAt: data.createdAt?.toDate() || new Date(),
          });
        });
        if (teacherOnboardingCourse && !coursesData.some((course) => course.id === teacherOnboardingCourse.id)) {
          coursesData.unshift(teacherOnboardingCourse);
        }
        const enrolledQuery = query(
          coursesRef,
          where('enrolledStudents', 'array-contains', userId),
        );
        const enrolledSnapshot = await getDocs(enrolledQuery);
        enrolledSnapshot.forEach((doc) => {
          const data = doc.data();
          const courseEntry: Course = {
            id: doc.id,
            name: data.name || '',
            code: data.code || '',
            semester: data.semester || '',
            group: data.group || '',
            credits: data.credits || 0,
            teacherId: data.teacherId || '',
            teacherName: data.teacherName || '',
            institutionId: data.institutionId || '',
            institutionName: data.institutionName || '',
            createdByInstitutionId: data.createdByInstitutionId || '',
            createdByInstitutionName: data.createdByInstitutionName || '',
            description: data.description || '',
            coverUrl: data.coverUrl || '',
            classSchedule: normalizeClassSchedule(data.classSchedule),
            enrolledStudents: data.enrolledStudents || [],
            createdAt: data.createdAt?.toDate() || new Date(),
          };
          if (!coursesData.some((course) => course.id === courseEntry.id)) {
            coursesData.push(courseEntry);
          }
        });
        coursesData.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      } else if (userRole === 'estudiante') {
        // Para estudiantes
        const q = query(
          coursesRef, 
          where('enrolledStudents', 'array-contains', userId)
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
            institutionId: data.institutionId || '',
            institutionName: data.institutionName || '',
            createdByInstitutionId: data.createdByInstitutionId || '',
            createdByInstitutionName: data.createdByInstitutionName || '',
            description: data.description || '',
            coverUrl: data.coverUrl || '',
            classSchedule: normalizeClassSchedule(data.classSchedule),
            enrolledStudents: data.enrolledStudents || [],
            createdAt: data.createdAt?.toDate() || new Date(),
          });
        });
        
        // Ordenar manualmente
        coursesData.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      } else if (userRole === 'admin') {
        const q = query(
          coursesRef,
          orderBy('createdAt', 'desc'),
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
            institutionId: data.institutionId || '',
            institutionName: data.institutionName || '',
            createdByInstitutionId: data.createdByInstitutionId || '',
            createdByInstitutionName: data.createdByInstitutionName || '',
            description: data.description || '',
            coverUrl: data.coverUrl || '',
            classSchedule: normalizeClassSchedule(data.classSchedule),
            enrolledStudents: data.enrolledStudents || [],
            createdAt: data.createdAt?.toDate() || new Date(),
          });
        });
      } else if (userRole === 'institucion' && institutionId) {
        const q = query(
          coursesRef,
          where('institutionId', '==', institutionId),
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
            institutionId: data.institutionId || '',
            institutionName: data.institutionName || '',
            createdByInstitutionId: data.createdByInstitutionId || '',
            createdByInstitutionName: data.createdByInstitutionName || '',
            description: data.description || '',
            coverUrl: data.coverUrl || '',
            classSchedule: normalizeClassSchedule(data.classSchedule),
            enrolledStudents: data.enrolledStudents || [],
            createdAt: data.createdAt?.toDate() || new Date(),
          });
        });

        coursesData.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      } else {
        setCoursesSafely([]);
        setLoadingFlag('courses', false);
        return;
      }

      setCoursesSafely(coursesData);
    } catch (error) {
    } finally {
      setLoadingFlag('courses', false);
    }
  }, [institutionId, setCoursesSafely, setLoadingFlag, teacherOnboardingCourse, userId, userRole]);

  // Cargar evaluaciones para todos los cursos del usuario
  useEffect(() => {
    if (!userId || courses.length === 0) {
      setAssessments([]);
      setLoadingFlag('assessments', false);
      return;
    }

    const loadAllAssessments = async () => {
      setLoadingFlag('assessments', true);
      try {
        const assessmentsById = new Map<string, Assessment>();
        
        for (const course of courses) {
          try {
            const courseAssessments = await assessmentService.getCourseAssessments(course.id, {
              courseCode: course.code,
              courseName: course.name,
            });
            courseAssessments.forEach((assessment) => {
              assessmentsById.set(assessment.id, assessment);
            });
          } catch (error) {
          }
        }

        setAssessments(
          Array.from(assessmentsById.values()).sort(
            (a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt),
          ),
        );
      } catch (error) {
      } finally {
        setLoadingFlag('assessments', false);
      }
    };

    loadAllAssessments();
  }, [courses, setLoadingFlag, userId]);

  // Cargar calificaciones para el usuario
  useEffect(() => {
    if (!userId) {
      setGrades([]);
      setLoadingFlag('grades', false);
      return;
    }

    const loadGrades = async () => {
      setLoadingFlag('grades', true);
      try {
        let userGrades: Grade[] = [];
        
        if (userRole === 'estudiante') {
          // Para estudiantes, cargar todas sus calificaciones
          for (const course of courses) {
            try {
              const courseGrades = await assessmentService.getStudentGrades(userId, course.id, {
                courseCode: course.code,
                courseName: course.name,
              });
              userGrades = [...userGrades, ...courseGrades];
            } catch (error) {
            }
          }
        } else if (userRole === 'docente' || userRole === 'admin' || userRole === 'institucion') {
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
        setLoadingFlag('grades', false);
      }
    };

    // Solo cargar calificaciones si hay cursos
    if (courses.length > 0) {
      loadGrades();
    } else {
      setGrades([]);
      setLoadingFlag('grades', false);
    }
  }, [courses, setLoadingFlag, userId, userRole]);

  // Mantener un curso global seleccionado por usuario y válido para la lista de cursos actual.
  useEffect(() => {
    setSelectedCourseIdState((currentSelected) => {
      if (!selectedCourseStorageKey) {
        return currentSelected ? '' : currentSelected;
      }

      if (courses.length === 0) {
        if (loading.courses) return currentSelected;
        return currentSelected ? '' : currentSelected;
      }

      if (currentSelected && courses.some((course) => course.id === currentSelected)) {
        return currentSelected;
      }

      const savedCourseId = localStorage.getItem(selectedCourseStorageKey);
      if (savedCourseId && courses.some((course) => course.id === savedCourseId)) {
        return savedCourseId;
      }

      const fallbackCourseId = courses[0]?.id || '';
      return fallbackCourseId || currentSelected;
    });
  }, [courses, loading.courses, selectedCourseStorageKey]);

  useEffect(() => {
    if (!selectedCourseStorageKey) return;
    if (loading.courses) return;

    if (selectedCourseId) {
      localStorage.setItem(selectedCourseStorageKey, selectedCourseId);
    }
  }, [loading.courses, selectedCourseId, selectedCourseStorageKey]);

  // Función para recargar unidades
  const refreshUnits = async (courseId?: string) => {
    setLoadingFlag('units', true);
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
      setLoadingFlag('units', false);
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
      setLoadingFlag('units', false);
      return;
    }

    
    const loadUnitsForUserCourses = async () => {
      setLoadingFlag('units', true);
      
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
        setLoadingFlag('units', false);
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
  }, [courses, setLoadingFlag, userId]);

  useEffect(() => {
    if (!userId || userRole !== 'docente') {
      setTeacherOnboardingCourse(null);
      return;
    }

    let cancelled = false;

    const loadTeacherOnboardingCourse = async () => {
      try {
        const studentSnap = await getDoc(doc(firebaseDB, 'estudiantes', userId));
        const data = (studentSnap.exists() ? studentSnap.data() : {}) as Record<string, unknown>;
        const status = String(data.teacherOnboardingStatus || '').trim().toLowerCase();

        if (!status || status === 'completed' || status === 'closed') {
          if (!cancelled) setTeacherOnboardingCourse(null);
          return;
        }

        const courseIdRaw = data.teacherOnboardingCourseId;
        const courseId = typeof courseIdRaw === 'string' ? courseIdRaw.trim() : '';
        let courseSnap: { id: string; data: () => any } | undefined;

        if (courseId) {
          const directSnap = await getDoc(doc(firebaseDB, 'cursos', courseId));
          if (directSnap.exists()) {
            courseSnap = directSnap as unknown as { id: string; data: () => any };
          }
        }

        if (!courseSnap) {
          const onboardingSnap = await getDocs(
            query(
              collection(firebaseDB, 'cursos'),
              where('code', '==', TEACHER_ONBOARDING_COURSE_CODE),
              limit(1),
            ),
          );
          courseSnap = onboardingSnap.docs[0] as unknown as { id: string; data: () => any } | undefined;
        }

        if (!courseSnap) {
          if (!cancelled) setTeacherOnboardingCourse(null);
          return;
        }

        if (!cancelled) {
          setTeacherOnboardingCourse(buildCourseFromSnapshot(courseSnap));
        }
      } catch {
        if (!cancelled) setTeacherOnboardingCourse(null);
      }
    };

    void loadTeacherOnboardingCourse();

    return () => {
      cancelled = true;
    };
  }, [buildCourseFromSnapshot, userId, userRole]);

  // Cargar cursos en tiempo real
  useEffect(() => {
    if (!userId) {
      setCoursesSafely([]);
      setLoadingFlag('courses', false);
      return;
    }

    let unsubscribe: () => void;

    if (userRole === 'docente') {
      try {
        const coursesRef = collection(firebaseDB, 'cursos');
        let teacherCourses: Course[] = [];
        let enrolledCourses: Course[] = [];

        const mergeAndSetCourses = () => {
          const mergedMap = new Map<string, Course>();
          teacherCourses.forEach((course) => mergedMap.set(course.id, course));
          enrolledCourses.forEach((course) => mergedMap.set(course.id, course));

          if (teacherOnboardingCourse && !mergedMap.has(teacherOnboardingCourse.id)) {
            mergedMap.set(teacherOnboardingCourse.id, teacherOnboardingCourse);
          }

          const mergedCourses = Array.from(mergedMap.values()).sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
          );

          setCoursesSafely(mergedCourses);
          setLoadingFlag('courses', false);
        };

        const teacherQuery = query(
          coursesRef,
          where('teacherId', '==', userId),
          orderBy('createdAt', 'desc'),
        );
        const enrolledQuery = query(
          coursesRef,
          where('enrolledStudents', 'array-contains', userId),
        );

        const unsubscribeTeacher = onSnapshot(
          teacherQuery,
          (snapshot) => {
            teacherCourses = snapshot.docs.map(buildCourseFromSnapshot);
            mergeAndSetCourses();
          },
          () => {
            setLoadingFlag('courses', false);
          },
        );

        const unsubscribeEnrolled = onSnapshot(
          enrolledQuery,
          (snapshot) => {
            enrolledCourses = snapshot.docs.map(buildCourseFromSnapshot);
            mergeAndSetCourses();
          },
          () => {
            setLoadingFlag('courses', false);
          },
        );

        unsubscribe = () => {
          unsubscribeTeacher();
          unsubscribeEnrolled();
        };
      } catch (error) {
        setLoadingFlag('courses', false);
      }
    } else if (userRole === 'estudiante') {
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
                coverUrl: data.coverUrl || '',
                classSchedule: normalizeClassSchedule(data.classSchedule),
                enrolledStudents: data.enrolledStudents || [],
                createdAt: data.createdAt?.toDate() || new Date(),
              });
            });
            
            // Ordenar manualmente
            coursesData.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            
            setCoursesSafely(coursesData);
            setLoadingFlag('courses', false);
          },
          (error) => {
            setLoadingFlag('courses', false);
          }
        );
      } catch (error) {
        setLoadingFlag('courses', false);
      }
    } else if (userRole === 'admin') {
      try {
        const q = query(
          collection(firebaseDB, 'cursos'),
          orderBy('createdAt', 'desc'),
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
                coverUrl: data.coverUrl || '',
                classSchedule: normalizeClassSchedule(data.classSchedule),
                enrolledStudents: data.enrolledStudents || [],
                createdAt: data.createdAt?.toDate() || new Date(),
              });
            });

            setCoursesSafely(coursesData);
            setLoadingFlag('courses', false);
          },
          () => {
            setLoadingFlag('courses', false);
          }
        );
      } catch (error) {
        setLoadingFlag('courses', false);
      }
    } else if (userRole === 'institucion' && institutionId) {
      try {
        const q = query(
          collection(firebaseDB, 'cursos'),
          where('institutionId', '==', institutionId),
        );

        unsubscribe = onSnapshot(q,
          (snapshot) => {
            const coursesData = snapshot.docs
              .map(buildCourseFromSnapshot)
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

            setCoursesSafely(coursesData);
            setLoadingFlag('courses', false);
          },
          () => {
            setLoadingFlag('courses', false);
          }
        );
      } catch (error) {
        setLoadingFlag('courses', false);
      }
    } else {
      setCoursesSafely([]);
      setLoadingFlag('courses', false);
      unsubscribe = () => undefined;
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [buildCourseFromSnapshot, institutionId, setCoursesSafely, setLoadingFlag, teacherOnboardingCourse, userId, userRole]);

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
      const course = courses.find((entry) => entry.id === courseId);
      return await assessmentService.getCourseAssessments(courseId, {
        courseCode: course?.code,
        courseName: course?.name,
      });
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
