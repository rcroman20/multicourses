// src/lib/firestore.ts - ARCHIVO COMPLETO Y CORREGIDO CON FUNCIONES DE ELIMINACIÓN
import { firebaseDB, db, firebaseStorage } from "@/lib/firebase";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  addDoc,
  onSnapshot,
  QuerySnapshot,
  DocumentData,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";

export { fileService } from "./services/fileService";
export type { CourseFile } from "./services/fileService";


import type { Course, Assessment, Grade, User } from "@/types/academic";

// Referencias a colecciones
export const coursesCollection = collection(firebaseDB, "cursos");
export const assessmentsCollection = collection(firebaseDB, "evaluaciones");
export const gradesCollection = collection(firebaseDB, "notas");
export const studentsCollection = collection(firebaseDB, "estudiantes");
export const usersCollection = collection(firebaseDB, "usuarios");
export const gradeSheetsCollection = collection(firebaseDB, "gradeSheets");
export const unitsCollection = collection(firebaseDB, "units");

// Operaciones CRUD para Cursos - ACTUALIZADO CON FUNCIONES DE ELIMINACIÓN
export const courseService = {
  // Obtener todos los cursos
  getAll: async (): Promise<Course[]> => {
    const q = query(coursesCollection, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || "",
        code: data.code || "",
        semester: data.semester || "",
        group: data.group || "",
        credits: data.credits || 0,
        teacherId: data.teacherId || "",
        teacherName: data.teacherName || "",
        description: data.description || "",
        enrolledStudents: data.enrolledStudents || [],
        createdAt: data.createdAt?.toDate() || new Date(),
      };
    });
  },


    update: async (courseId: string, data: any): Promise<{ success: boolean; message?: string }> => {
    try {
await updateDoc(doc(firebaseDB, "cursos", courseId), data);
      return { success: true };
    } catch (error: any) {
      console.error("Error updating course:", error);
      return { 
        success: false, 
        message: error.message || "Failed to update course" 
      };
    }
  },

  // Obtener cursos por docente
  getByTeacher: async (teacherId: string): Promise<Course[]> => {
    const q = query(
      coursesCollection,
      where("teacherId", "==", teacherId),
      orderBy("createdAt", "desc"),
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || "",
        code: data.code || "",
        semester: data.semester || "",
        group: data.group || "",
        credits: data.credits || 0,
        teacherId: data.teacherId || "",
        teacherName: data.teacherName || "",
        description: data.description || "",
        enrolledStudents: data.enrolledStudents || [],
        createdAt: data.createdAt?.toDate() || new Date(),
      };
    });
  },

  // Obtener cursos por estudiante
  getByStudent: async (studentId: string): Promise<Course[]> => {
    const q = query(
      coursesCollection,
      where("enrolledStudents", "array-contains", studentId),
      orderBy("createdAt", "desc"),
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || "",
        code: data.code || "",
        semester: data.semester || "",
        group: data.group || "",
        credits: data.credits || 0,
        teacherId: data.teacherId || "",
        teacherName: data.teacherName || "",
        description: data.description || "",
        enrolledStudents: data.enrolledStudents || [],
        createdAt: data.createdAt?.toDate() || new Date(),
      };
    });
  },

  // Crear nuevo curso
  create: async (course: Omit<Course, "id" | "createdAt">): Promise<string> => {
    const docRef = await addDoc(coursesCollection, {
      ...course,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  },



  // Eliminar curso simple - solo el documento del curso
  delete: async (id: string): Promise<void> => {
    const docRef = doc(coursesCollection, id);
    await deleteDoc(docRef);
  },

  // Eliminar curso con todos los datos relacionados
  deleteWithRelatedData: async (courseId: string): Promise<{ success: boolean; message: string }> => {
    try {
      // 1. Eliminar evaluaciones relacionadas
      const assessmentsRef = collection(firebaseDB, "evaluaciones");
      const assessmentsQuery = query(
        assessmentsRef,
        where("courseId", "==", courseId)
      );
      const assessmentsSnapshot = await getDocs(assessmentsQuery);
      
      const deleteAssessmentPromises = assessmentsSnapshot.docs.map(async (doc) => {
        await deleteDoc(doc.ref);
      });

      // 2. Eliminar notas relacionadas
      const gradesRef = collection(firebaseDB, "notas");
      const gradesQuery = query(
        gradesRef,
        where("courseId", "==", courseId)
      );
      const gradesSnapshot = await getDocs(gradesQuery);
      
      const deleteGradePromises = gradesSnapshot.docs.map(async (doc) => {
        await deleteDoc(doc.ref);
      });

      // 3. Eliminar hojas de calificaciones relacionadas
      const gradeSheetsRef = collection(firebaseDB, "gradeSheets");
      const gradeSheetsQuery = query(
        gradeSheetsRef,
        where("courseId", "==", courseId)
      );
      const gradeSheetsSnapshot = await getDocs(gradeSheetsQuery);
      
      const deleteGradeSheetPromises = gradeSheetsSnapshot.docs.map(async (doc) => {
        await deleteDoc(doc.ref);
      });

      // 4. Eliminar unidades relacionadas
      const unitsRef = collection(firebaseDB, "units");
      const unitsQuery = query(
        unitsRef,
        where("courseId", "==", courseId)
      );
      const unitsSnapshot = await getDocs(unitsQuery);
      
      const deleteUnitPromises = unitsSnapshot.docs.map(async (unitDoc) => {
        // 4.1 Eliminar slides de cada semana
        const weeks = unitDoc.data().weeks || [];
        const slidePromises = weeks.flatMap((week: any) => 
          week.slides.map(async (slideId: string) => {
            const slideRef = doc(firebaseDB, "slides", slideId);
            await deleteDoc(slideRef);
          })
        );
        
        await Promise.all(slidePromises);
        // 4.2 Eliminar la unidad
        await deleteDoc(unitDoc.ref);
      });

      // 5. Eliminar el curso principal
      const courseRef = doc(coursesCollection, courseId);
      
      // Ejecutar todas las eliminaciones en paralelo
      await Promise.all([
        ...deleteAssessmentPromises,
        ...deleteGradePromises,
        ...deleteGradeSheetPromises,
        ...deleteUnitPromises,
        deleteDoc(courseRef)
      ]);

      return {
        success: true,
        message: "Course deleted successfully with all related data"
      };
    } catch (error: any) {
      console.error("Error deleting course with related data:", error);
      return {
        success: false,
        message: error.message || "Failed to delete course"
      };
    }
  },

  // Eliminar curso simple (solo el documento del curso, no datos relacionados)
  deleteSimple: async (courseId: string): Promise<{ success: boolean; message: string }> => {
    try {
      const courseRef = doc(coursesCollection, courseId);
      await deleteDoc(courseRef);
      
      return {
        success: true,
        message: "Course deleted successfully"
      };
    } catch (error: any) {
      console.error("Error deleting course:", error);
      return {
        success: false,
        message: error.message || "Failed to delete course"
      };
    }
  },

  // Remover curso de los estudiantes
  removeCourseFromStudents: async (courseId: string, studentIds: string[]): Promise<void> => {
    const updatePromises = studentIds.map(async (studentId) => {
      try {
        const studentRef = doc(studentsCollection, studentId);
        await updateDoc(studentRef, {
          courses: arrayRemove(courseId),
        });
      } catch (error) {
        console.error(`Error removing course from student ${studentId}:`, error);
        // Continuar con otros estudiantes incluso si uno falla
      }
    });

    await Promise.all(updatePromises);
  },

  // Inscribir estudiante en curso
  enrollStudent: async (courseId: string, studentId: string): Promise<void> => {
    const docRef = doc(coursesCollection, courseId);
    const courseDoc = await getDoc(docRef);

    if (courseDoc.exists()) {
      const data = courseDoc.data();
      const enrolledStudents = data.enrolledStudents || [];

      if (!enrolledStudents.includes(studentId)) {
        await updateDoc(docRef, {
          enrolledStudents: [...enrolledStudents, studentId],
        });
      }
    }
  },

  // Retirar estudiante de curso
  unenrollStudent: async (
    courseId: string,
    studentId: string,
  ): Promise<void> => {
    const docRef = doc(coursesCollection, courseId);
    const courseDoc = await getDoc(docRef);

    if (courseDoc.exists()) {
      const data = courseDoc.data();
      const enrolledStudents = data.enrolledStudents || [];

      const updatedEnrolledStudents = enrolledStudents.filter(
        (id: string) => id !== studentId,
      );

      await updateDoc(docRef, {
        enrolledStudents: updatedEnrolledStudents,
      });
    }
  },
};

// Operaciones CRUD para Evaluaciones
export const assessmentService = {
  getByCourse: async (courseId: string): Promise<Assessment[]> => {
    const q = query(
      assessmentsCollection,
      where("courseId", "==", courseId),
      orderBy("dueDate", "asc"),
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        courseId: data.courseId || "",
        name: data.name || "",
        description: data.description || "",
        percentage: data.percentage || 0,
        maxPoints: data.maxPoints || 100,
        passingScore: data.passingScore || 60,
        dueDate: data.dueDate?.toDate() || new Date(),
        type: data.type || "evaluacion",
        status: data.status || "active",
        createdBy: data.createdBy || "",
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      };
    });
  },

  create: async (
    assessment: Omit<Assessment, "id" | "createdAt" | "updatedAt">,
  ): Promise<string> => {
    const now = serverTimestamp();
    const docRef = await addDoc(assessmentsCollection, {
      ...assessment,
      type: assessment.type || "evaluacion",
      status: assessment.status || "active",
      createdAt: now,
      updatedAt: now,
    });
    return docRef.id;
  },

  update: async (id: string, updates: Partial<Assessment>): Promise<void> => {
    const docRef = doc(assessmentsCollection, id);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  },

  delete: async (id: string): Promise<void> => {
    const docRef = doc(assessmentsCollection, id);
    await deleteDoc(docRef);
  },

  // Eliminar todas las evaluaciones de un curso
  deleteByCourse: async (courseId: string): Promise<void> => {
    const q = query(
      assessmentsCollection,
      where("courseId", "==", courseId)
    );
    const snapshot = await getDocs(q);

    const deletePromises = snapshot.docs.map(async (doc) => {
      await deleteDoc(doc.ref);
    });

    await Promise.all(deletePromises);
  },
};

// Operaciones CRUD para Notas
export const gradeService = {
  getByStudentAndCourse: async (
    studentId: string,
    courseId: string,
  ): Promise<Grade[]> => {
    const q = query(
      gradesCollection,
      where("studentId", "==", studentId),
      where("courseId", "==", courseId),
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        assessmentId: data.assessmentId || "",
        studentId: data.studentId || "",
        courseId: data.courseId || "",
        value: data.value || 0,
        feedback: data.feedback || "",
        gradedAt: data.gradedAt?.toDate() || new Date(),
        gradedBy: data.gradedBy || "",
      };
    });
  },

  getByCourse: async (courseId: string): Promise<Grade[]> => {
    const q = query(gradesCollection, where("courseId", "==", courseId));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        assessmentId: data.assessmentId || "",
        studentId: data.studentId || "",
        courseId: data.courseId || "",
        value: data.value || 0,
        feedback: data.feedback || "",
        gradedAt: data.gradedAt?.toDate() || new Date(),
        gradedBy: data.gradedBy || "",
      };
    });
  },

  create: async (grade: Omit<Grade, "id" | "gradedAt">): Promise<string> => {
    const docRef = await addDoc(gradesCollection, {
      ...grade,
      gradedAt: serverTimestamp(),
    });
    return docRef.id;
  },

  update: async (id: string, updates: Partial<Grade>): Promise<void> => {
    const docRef = doc(gradesCollection, id);
    await updateDoc(docRef, updates);
  },

  batchCreateOrUpdate: async (
    grades: Omit<Grade, "id" | "gradedAt">[],
  ): Promise<void> => {
    const batchPromises = grades.map((grade) =>
      addDoc(gradesCollection, {
        ...grade,
        gradedAt: serverTimestamp(),
      }),
    );
    await Promise.all(batchPromises);
  },

  // Eliminar todas las notas de un curso
  deleteByCourse: async (courseId: string): Promise<void> => {
    const q = query(gradesCollection, where("courseId", "==", courseId));
    const snapshot = await getDocs(q);

    const deletePromises = snapshot.docs.map(async (doc) => {
      await deleteDoc(doc.ref);
    });

    await Promise.all(deletePromises);
  },
};

// Operaciones para Estudiantes
export const studentService = {
  getAll: async (): Promise<any[]> => {
    const q = query(studentsCollection, orderBy("name", "asc"));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  },

  getEstudiantes: async (): Promise<any[]> => {
    const q = query(
      studentsCollection,
      where("role", "==", "estudiante"),
      orderBy("name", "asc"),
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  },

  getDocentes: async (): Promise<any[]> => {
    const q = query(
      studentsCollection,
      where("role", "==", "docente"),
      orderBy("name", "asc"),
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  },

  getById: async (studentId: string): Promise<any> => {
    const docRef = doc(studentsCollection, studentId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data(),
      };
    }
    return null;
  },

  searchByNameOrEmail: async (searchTerm: string): Promise<any[]> => {
    const allStudents = await studentService.getAll();
    const term = searchTerm.toLowerCase();

    return allStudents.filter(
      (student) =>
        student.name.toLowerCase().includes(term) ||
        student.email.toLowerCase().includes(term) ||
        student.idNumber?.includes(term),
    );
  },
};

// Operaciones para inscripción de estudiantes
export const enrollmentService = {
  // Inscribir estudiante en curso
  enrollStudentInCourse: async (
    courseId: string,
    studentId: string,
  ): Promise<void> => {
    const courseRef = doc(coursesCollection, courseId);
    const courseDoc = await getDoc(courseRef);

    if (!courseDoc.exists()) {
      throw new Error("Curso no encontrado");
    }

    const data = courseDoc.data();
    const enrolledStudents = data.enrolledStudents || [];

    // Verificar si el estudiante ya está inscrito
    if (enrolledStudents.includes(studentId)) {
      throw new Error("El estudiante ya está inscrito en este curso");
    }

    // Agregar estudiante al array
    await updateDoc(courseRef, {
      enrolledStudents: [...enrolledStudents, studentId],
    });

    // También actualizar el documento del estudiante (opcional)
    try {
      const studentRef = doc(studentsCollection, studentId);
      await updateDoc(studentRef, {
        courses: arrayUnion(courseId),
      });
    } catch (error) {
      console.log(
        "Nota: No se pudo actualizar el documento del estudiante, pero se inscribió en el curso",
      );
    }
  },

  getAllStudents: async (): Promise<any[]> => {
    try {
      const q = query(studentsCollection, orderBy("name", "asc"));
      const snapshot = await getDocs(q);

      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error("Error obteniendo todos los estudiantes:", error);
      return [];
    }
  },

  // Retirar estudiante de curso
  unenrollStudentFromCourse: async (
    courseId: string,
    studentId: string,
  ): Promise<void> => {
    const courseRef = doc(coursesCollection, courseId);
    const courseDoc = await getDoc(courseRef);

    if (!courseDoc.exists()) {
      throw new Error("Curso no encontrado");
    }

    const data = courseDoc.data();
    const enrolledStudents = data.enrolledStudents || [];

    // Filtrar el estudiante del array
    const updatedEnrolledStudents = enrolledStudents.filter(
      (id: string) => id !== studentId,
    );

    await updateDoc(courseRef, {
      enrolledStudents: updatedEnrolledStudents,
    });

    // También actualizar el documento del estudiante (opcional)
    try {
      const studentRef = doc(studentsCollection, studentId);
      await updateDoc(studentRef, {
        courses: arrayRemove(courseId),
      });
    } catch (error) {
      console.log("Nota: No se pudo actualizar el documento del estudiante");
    }
  },

  // Obtener estudiantes inscritos en un curso con sus datos completos
  getEnrolledStudents: async (courseId: string): Promise<any[]> => {
    const courseRef = doc(coursesCollection, courseId);
    const courseDoc = await getDoc(courseRef);

    if (!courseDoc.exists()) {
      return [];
    }

    const data = courseDoc.data();
    const enrolledStudentIds = data.enrolledStudents || [];

    if (enrolledStudentIds.length === 0) {
      return [];
    }

    // Obtener datos de cada estudiante
    const studentsData = [];

    for (const studentId of enrolledStudentIds) {
      try {
        const studentDoc = await getDoc(doc(studentsCollection, studentId));
        if (studentDoc.exists()) {
          studentsData.push({
            id: studentDoc.id,
            ...studentDoc.data(),
          });
        } else {
          // Si no existe en estudiantes, crear un objeto básico
          studentsData.push({
            id: studentId,
            name: "Estudiante no encontrado",
            email: "No disponible",
            role: "estudiante",
          });
        }
      } catch (error) {
        console.error(
          `Error obteniendo datos del estudiante ${studentId}:`,
          error,
        );
      }
    }

    return studentsData;
  },

  // Verificar si un estudiante está inscrito en un curso
  isStudentEnrolled: async (
    courseId: string,
    studentId: string,
  ): Promise<boolean> => {
    const courseRef = doc(coursesCollection, courseId);
    const courseDoc = await getDoc(courseRef);

    if (!courseDoc.exists()) {
      return false;
    }

    const data = courseDoc.data();
    const enrolledStudents = data.enrolledStudents || [];

    return enrolledStudents.includes(studentId);
  },

  // Obtener cursos en los que está inscrito un estudiante
  getCoursesByStudent: async (studentId: string): Promise<Course[]> => {
    const q = query(
      coursesCollection,
      where("enrolledStudents", "array-contains", studentId),
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || "",
        code: data.code || "",
        semester: data.semester || "",
        group: data.group || "",
        credits: data.credits || 0,
        teacherId: data.teacherId || "",
        teacherName: data.teacherName || "",
        description: data.description || "",
        enrolledStudents: data.enrolledStudents || [],
        createdAt: data.createdAt?.toDate() || new Date(),
      };
    });
  },
};

// Servicio para hojas de calificaciones
export const gradeSheetService = {
  // Eliminar todas las hojas de calificaciones de un curso
  deleteByCourse: async (courseId: string): Promise<void> => {
    const q = query(gradeSheetsCollection, where("courseId", "==", courseId));
    const snapshot = await getDocs(q);

    const deletePromises = snapshot.docs.map(async (doc) => {
      await deleteDoc(doc.ref);
    });

    await Promise.all(deletePromises);
  },
};

// Servicio para unidades (pero no con el nombre unitService para evitar conflictos)
export const courseUnitService = {
  // Eliminar todas las unidades de un curso
  deleteByCourse: async (courseId: string): Promise<void> => {
    const q = query(unitsCollection, where("courseId", "==", courseId));
    const snapshot = await getDocs(q);

    const deletePromises = snapshot.docs.map(async (unitDoc) => {
      // Eliminar slides de cada semana
      const weeks = unitDoc.data().weeks || [];
      const slidePromises = weeks.flatMap((week: any) => 
        week.slides.map(async (slideId: string) => {
          const slideRef = doc(firebaseDB, "slides", slideId);
          await deleteDoc(slideRef);
        })
      );
      
      await Promise.all(slidePromises);
      // Eliminar la unidad
      await deleteDoc(unitDoc.ref);
    });

    await Promise.all(deletePromises);
  },
};

// Listeners en tiempo real
export const realTimeService = {
  // Escuchar cambios en cursos de un docente
  onTeacherCourses: (
    teacherId: string,
    callback: (courses: Course[]) => void,
  ) => {
    const q = query(
      coursesCollection,
      where("teacherId", "==", teacherId),
      orderBy("createdAt", "desc"),
    );

    return onSnapshot(q, (snapshot) => {
      const courses = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name || "",
          code: data.code || "",
          semester: data.semester || "",
          group: data.group || "",
          credits: data.credits || 0,
          teacherId: data.teacherId || "",
          teacherName: data.teacherName || "",
          description: data.description || "",
          enrolledStudents: data.enrolledStudents || [],
          createdAt: data.createdAt?.toDate() || new Date(),
        };
      });
      callback(courses);
    });
  },

  // Escuchar cambios en evaluaciones de un curso
  onCourseAssessments: (
    courseId: string,
    callback: (assessments: Assessment[]) => void,
  ) => {
    const q = query(
      assessmentsCollection,
      where("courseId", "==", courseId),
      orderBy("dueDate", "asc"),
    );

    return onSnapshot(q, (snapshot) => {
      const assessments = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          courseId: data.courseId || "",
          name: data.name || "",
          description: data.description || "",
          percentage: data.percentage || 0,
          maxPoints: data.maxPoints || 100,
          passingScore: data.passingScore || 60,
          dueDate: data.dueDate?.toDate() || new Date(),
          type: data.type || "evaluacion",
          status: data.status || "active",
          createdBy: data.createdBy || "",
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        };
      });
      callback(assessments);
    });
  },

  // Escuchar cambios en notas
  onGrades: (
    filters: {
      courseId?: string;
      studentId?: string;
    },
    callback: (grades: Grade[]) => void,
  ) => {
    let q = query(gradesCollection);

    if (filters.courseId && filters.studentId) {
      q = query(
        gradesCollection,
        where("courseId", "==", filters.courseId),
        where("studentId", "==", filters.studentId),
      );
    } else if (filters.courseId) {
      q = query(gradesCollection, where("courseId", "==", filters.courseId));
    } else if (filters.studentId) {
      q = query(gradesCollection, where("studentId", "==", filters.studentId));
    }

    return onSnapshot(q, (snapshot) => {
      const grades = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          assessmentId: data.assessmentId || "",
          studentId: data.studentId || "",
          courseId: data.courseId || "",
          value: data.value || 0,
          feedback: data.feedback || "",
          gradedAt: data.gradedAt?.toDate() || new Date(),
          gradedBy: data.gradedBy || "",
        };
      });
      callback(grades);
    });
  },
};

// Función helper para eliminar un curso con todos sus datos relacionados
export const deleteCourseCompletely = async (courseId: string): Promise<{ success: boolean; message: string }> => {
  try {
    // Usar la función deleteWithRelatedData del courseService
    return await courseService.deleteWithRelatedData(courseId);
  } catch (error: any) {
    console.error("Error deleting course completely:", error);
    return {
      success: false,
      message: error.message || "Failed to delete course"
    };
  }
};