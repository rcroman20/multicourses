// src/lib/unitService.ts - VERSIÓN CORREGIDA
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc, 
  getDocs, 
  query, 
  where,  
  orderBy, 
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { firebaseDB } from '@/lib/firebase';
import type { Unit, Week, Slide } from '@/types/academic';

// Referencias a colecciones
const unitsCollection = collection(firebaseDB, 'unidades');
const weeksCollection = collection(firebaseDB, 'semanas');
const slidesCollection = collection(firebaseDB, 'diapositivas');
const unitsCache = new Map<string, Unit[]>();

// Helper function to convert Firestore data
const convertTimestamp = (timestamp: any): Date => {
  if (timestamp instanceof Timestamp) {
    return timestamp.toDate();
  } else if (timestamp && typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  } else if (timestamp instanceof Date) {
    return timestamp;
  } else if (timestamp) {
    return new Date(timestamp);
  }
  return new Date();
};

const loadUnitFromDoc = async (unitDoc: any): Promise<Unit> => {
  const unitData = unitDoc.data();
  const weeksSnapshot = await getDocs(
    query(weeksCollection, where('unitId', '==', unitDoc.id)),
  );
  const weeks: Week[] = [];

  for (const weekDoc of weeksSnapshot.docs) {
    const weekData = weekDoc.data();
    const slidesSnapshot = await getDocs(
      query(slidesCollection, where('weekId', '==', weekDoc.id), orderBy('order', 'asc')),
    );

    const slides: Slide[] = slidesSnapshot.docs.map((slideDoc) => {
      const slideData = slideDoc.data();
      return {
        id: slideDoc.id,
        weekId: slideData.weekId || '',
        title: slideData.title || '',
        description: slideData.description || '',
        canvaUrl: slideData.canvaUrl || '',
        order: slideData.order || 0,
        createdAt: convertTimestamp(slideData.createdAt),
      } as Slide;
    });

    weeks.push({
      id: weekDoc.id,
      number: weekData.number || 0,
      topic: weekData.topic || '',
      unitId: weekData.unitId || '',
      slides,
      createdAt: convertTimestamp(weekData.createdAt),
    });
  }

  return {
    id: unitDoc.id,
    name: unitData.name || '',
    courseId: unitData.courseId || '',
    description: unitData.description || '',
    order: unitData.order || 0,
    weeks,
    createdAt: convertTimestamp(unitData.createdAt),
  };
};

export const unitService = {
  getByCourse: async (courseId: string): Promise<Unit[]> => {
    try {
      const q = query(unitsCollection, where('courseId', '==', courseId));
      const snapshot = await getDocs(q);
      const units: Unit[] = [];

      for (const unitDoc of snapshot.docs) {
        units.push(await loadUnitFromDoc(unitDoc));
      }

      if (units.length === 0) {
        const allUnitsSnapshot = await getDocs(unitsCollection);

        for (const unitDoc of allUnitsSnapshot.docs) {
          const unit = await loadUnitFromDoc(unitDoc);
          const belongsToCourse = unit.weeks.some((week) => {
            const weekRecord = week as unknown as Record<string, unknown>;
            const weekCourseId = typeof weekRecord.courseId === 'string' ? weekRecord.courseId : '';
            if (weekCourseId === courseId) return true;

            return week.slides.some((slide) => {
              const slideRecord = slide as unknown as Record<string, unknown>;
              return typeof slideRecord.courseId === 'string' && slideRecord.courseId === courseId;
            });
          });

          if (!belongsToCourse) continue;

          units.push({
            ...unit,
            courseId,
          });

          await updateDoc(doc(unitsCollection, unit.id), {
            courseId,
            updatedAt: serverTimestamp(),
          }).catch(() => undefined);
        }
      }

      units.sort((a, b) => (a.order || 0) - (b.order || 0));
      return units;
    } catch (error) {
      return [];
    }
    
  },

  // Obtener todas las unidades
  getAll: async (): Promise<Unit[]> => {
    try {
      const snapshot = await getDocs(unitsCollection);
      
      const units: Unit[] = [];
      
      for (const unitDoc of snapshot.docs) {
        const unitData = unitDoc.data();
        
        // Obtener semanas de esta unidad
        const weeksQuery = query(
          weeksCollection,
          where('unitId', '==', unitDoc.id),
          orderBy('number', 'asc')
        );
        
        const weeksSnapshot = await getDocs(weeksQuery);
        const weeks: Week[] = [];
        
        for (const weekDoc of weeksSnapshot.docs) {
          const weekData = weekDoc.data();
          
          // Obtener diapositivas de esta semana
          const slidesQuery = query(
            slidesCollection,
            where('weekId', '==', weekDoc.id),
            orderBy('order', 'asc')
          );
          
          const slidesSnapshot = await getDocs(slidesQuery);
          const slides: Slide[] = slidesSnapshot.docs.map(slideDoc => {
            const slideData = slideDoc.data();
            return {
              id: slideDoc.id,
              weekId: slideData.weekId || '',
              title: slideData.title || '',
              description: slideData.description || '',
              canvaUrl: slideData.canvaUrl || '',
              order: slideData.order || 0,
              createdAt: convertTimestamp(slideData.createdAt)
            } as Slide;
          });
          
          weeks.push({
            id: weekDoc.id,
            number: weekData.number || 0,
            topic: weekData.topic || '',
            unitId: weekData.unitId || '',
            slides: slides,
            createdAt: convertTimestamp(weekData.createdAt)
          });
        }
        
        units.push({
          id: unitDoc.id,
          name: unitData.name || '',
          courseId: unitData.courseId || '',
          description: unitData.description || '',
          order: unitData.order || 0,
          weeks: weeks,
          createdAt: convertTimestamp(unitData.createdAt)
        });
      }
      
      return units;
    } catch (error) {
      return [];
    }
  },

  // Crear nueva unidad
  create: async (unitData: Omit<Unit, 'id' | 'weeks' | 'createdAt'>): Promise<string> => {
    try {
      const docRef = await addDoc(unitsCollection, {
        ...unitData,
        createdAt: serverTimestamp(),
        order: unitData.order || 0
      });
      return docRef.id;
    } catch (error) {
      throw error;
    }
  },

  // Actualizar unidad
  update: async (unitId: string, updates: Partial<Omit<Unit, 'id' | 'createdAt'>>): Promise<void> => {
    try {
      const unitRef = doc(unitsCollection, unitId);
      await updateDoc(unitRef, updates);
    } catch (error) {
      throw error;
    }
  },

  // Eliminar unidad
  delete: async (unitId: string): Promise<void> => {
    try {
      // Primero, obtener todas las semanas de esta unidad
      const weeksQuery = query(weeksCollection, where('unitId', '==', unitId));
      const weeksSnapshot = await getDocs(weeksQuery);
      
      // Eliminar todas las semanas y sus diapositivas
      for (const weekDoc of weeksSnapshot.docs) {
        // Eliminar diapositivas de esta semana
        const slidesQuery = query(slidesCollection, where('weekId', '==', weekDoc.id));
        const slidesSnapshot = await getDocs(slidesQuery);
        
        for (const slideDoc of slidesSnapshot.docs) {
          await deleteDoc(doc(slidesCollection, slideDoc.id));
        }
        
        // Eliminar la semana
        await deleteDoc(doc(weeksCollection, weekDoc.id));
      }
      
      // Finalmente, eliminar la unidad
      await deleteDoc(doc(unitsCollection, unitId));
    } catch (error) {
      throw error;
    }
  },

  // Backfill legacy content so weeks/slides always carry courseId.
  backfillCourseContentCourseIds: async (
    courseId: string,
  ): Promise<{ weeksUpdated: number; slidesUpdated: number }> => {
    const normalizedCourseId = typeof courseId === 'string' ? courseId.trim() : '';
    if (!normalizedCourseId) return { weeksUpdated: 0, slidesUpdated: 0 };

    let weeksUpdated = 0;
    let slidesUpdated = 0;
    const updates: Array<{ ref: ReturnType<typeof doc>; data: Record<string, unknown> }> = [];

    const unitsSnapshot = await getDocs(
      query(unitsCollection, where('courseId', '==', normalizedCourseId)),
    );

    for (const unitDocSnap of unitsSnapshot.docs) {
      const weeksSnapshot = await getDocs(
        query(weeksCollection, where('unitId', '==', unitDocSnap.id)),
      );

      for (const weekDocSnap of weeksSnapshot.docs) {
        const weekData = weekDocSnap.data() as Record<string, unknown>;
        const weekCourseId =
          typeof weekData.courseId === 'string' ? weekData.courseId.trim() : '';

        if (weekCourseId !== normalizedCourseId) {
          updates.push({
            ref: doc(weeksCollection, weekDocSnap.id),
            data: {
              courseId: normalizedCourseId,
              updatedAt: serverTimestamp(),
            },
          });
          weeksUpdated += 1;
        }

        const slidesSnapshot = await getDocs(
          query(slidesCollection, where('weekId', '==', weekDocSnap.id)),
        );

        for (const slideDocSnap of slidesSnapshot.docs) {
          const slideData = slideDocSnap.data() as Record<string, unknown>;
          const slideCourseId =
            typeof slideData.courseId === 'string' ? slideData.courseId.trim() : '';

          if (slideCourseId !== normalizedCourseId) {
            updates.push({
              ref: doc(slidesCollection, slideDocSnap.id),
              data: {
                courseId: normalizedCourseId,
                updatedAt: serverTimestamp(),
              },
            });
            slidesUpdated += 1;
          }
        }
      }
    }

    if (updates.length === 0) {
      return { weeksUpdated: 0, slidesUpdated: 0 };
    }

    let batch = writeBatch(firebaseDB);
    let count = 0;
    const batchLimit = 450;

    for (const update of updates) {
      batch.update(update.ref, update.data);
      count += 1;
      if (count >= batchLimit) {
        await batch.commit();
        batch = writeBatch(firebaseDB);
        count = 0;
      }
    }

    if (count > 0) {
      await batch.commit();
    }

    return { weeksUpdated, slidesUpdated };
  }
};

export const weekService = {
  // Crear semana
  create: async (weekData: Omit<Week, 'id' | 'slides' | 'createdAt'>): Promise<string> => {
    try {
      let courseId = '';
      if (weekData.unitId) {
        const unitSnap = await getDoc(doc(unitsCollection, weekData.unitId));
        if (unitSnap.exists()) {
          const unitData = unitSnap.data() as Record<string, unknown>;
          courseId = typeof unitData.courseId === 'string' ? unitData.courseId : '';
        }
      }

      const docRef = await addDoc(weeksCollection, {
        ...weekData,
        ...(courseId ? { courseId } : {}),
        createdAt: serverTimestamp()
      });
      return docRef.id;
    } catch (error) {
      throw error;
    }
  },

  // Actualizar semana
  update: async (weekId: string, updates: Partial<Omit<Week, 'id' | 'createdAt'>>): Promise<void> => {
    try {
      const weekRef = doc(weeksCollection, weekId);
      await updateDoc(weekRef, updates);
    } catch (error) {
      throw error;
    }
  },

  // Eliminar semana
  delete: async (weekId: string): Promise<void> => {
    try {
      // Primero eliminar las diapositivas
      const slidesQuery = query(slidesCollection, where('weekId', '==', weekId));
      const slidesSnapshot = await getDocs(slidesQuery);
      
      for (const slideDoc of slidesSnapshot.docs) {
        await deleteDoc(doc(slidesCollection, slideDoc.id));
      }
      
      // Luego eliminar la semana
      await deleteDoc(doc(weeksCollection, weekId));
    } catch (error) {
      throw error;
    }
  }
};

export const slideService = {
  // Crear diapositiva
  create: async (slideData: Omit<Slide, 'id' | 'createdAt'>): Promise<string> => {
    try {
      let courseId = '';
      if (slideData.weekId) {
        const weekSnap = await getDoc(doc(weeksCollection, slideData.weekId));
        if (weekSnap.exists()) {
          const weekData = weekSnap.data() as Record<string, unknown>;
          if (typeof weekData.courseId === 'string' && weekData.courseId.trim()) {
            courseId = weekData.courseId;
          } else if (typeof weekData.unitId === 'string' && weekData.unitId.trim()) {
            const unitSnap = await getDoc(doc(unitsCollection, weekData.unitId));
            if (unitSnap.exists()) {
              const unitData = unitSnap.data() as Record<string, unknown>;
              courseId = typeof unitData.courseId === 'string' ? unitData.courseId : '';
            }
          }
        }
      }

      const docRef = await addDoc(slidesCollection, {
        ...slideData,
        ...(courseId ? { courseId } : {}),
        createdAt: serverTimestamp(),
        order: slideData.order || 0
      });
      return docRef.id;
    } catch (error) {
      throw error;
    }
  },

  // Actualizar diapositiva
  update: async (slideId: string, updates: Partial<Omit<Slide, 'id' | 'createdAt'>>): Promise<void> => {
    try {
      const slideRef = doc(slidesCollection, slideId);
      await updateDoc(slideRef, updates);
    } catch (error) {
      throw error;
    }
  },

  // Eliminar diapositiva
  delete: async (slideId: string): Promise<void> => {
    try {
      const slideRef = doc(slidesCollection, slideId);
      await deleteDoc(slideRef);
    } catch (error) {
      throw error;
    }
  },

  // Obtener diapositivas por semana
  getByWeek: async (weekId: string): Promise<Slide[]> => {
    try {
      const slidesQuery = query(
        slidesCollection,
        where('weekId', '==', weekId),
        orderBy('order', 'asc')
      );
      const slidesSnapshot = await getDocs(slidesQuery);
      
      return slidesSnapshot.docs.map(slideDoc => {
        const slideData = slideDoc.data();
        return {
          id: slideDoc.id,
          weekId: slideData.weekId || '',
          title: slideData.title || '',
          description: slideData.description || '',
          canvaUrl: slideData.canvaUrl || '',
          order: slideData.order || 0,
          createdAt: convertTimestamp(slideData.createdAt)
        } as Slide;
      });
    } catch (error) {
      return [];
    }
  }
};
