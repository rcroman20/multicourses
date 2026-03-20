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
const UNIT_CACHE_TTL_MS = 60 * 1000;
const unitsCache = new Map<string, { units: Unit[]; expiresAt: number }>();

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

const cloneUnits = (units: Unit[]): Unit[] =>
  units.map((unit) => ({
    ...unit,
    weeks: (unit.weeks || []).map((week) => ({
      ...week,
      slides: (week.slides || []).map((slide) => ({ ...slide })),
    })),
  }));

const getCachedUnits = (courseId: string): Unit[] | null => {
  const normalizedCourseId = typeof courseId === 'string' ? courseId.trim() : '';
  if (!normalizedCourseId) return null;

  const cached = unitsCache.get(normalizedCourseId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    unitsCache.delete(normalizedCourseId);
    return null;
  }

  return cloneUnits(cached.units);
};

const setCachedUnits = (courseId: string, units: Unit[]): void => {
  const normalizedCourseId = typeof courseId === 'string' ? courseId.trim() : '';
  if (!normalizedCourseId) return;

  unitsCache.set(normalizedCourseId, {
    units: cloneUnits(units),
    expiresAt: Date.now() + UNIT_CACHE_TTL_MS,
  });
};

const invalidateUnitsCache = (courseId?: string): void => {
  const normalizedCourseId = typeof courseId === 'string' ? courseId.trim() : '';
  if (!normalizedCourseId) {
    unitsCache.clear();
    return;
  }

  unitsCache.delete(normalizedCourseId);
};

const getUnitCourseId = async (unitId: string): Promise<string> => {
  const normalizedUnitId = typeof unitId === 'string' ? unitId.trim() : '';
  if (!normalizedUnitId) return '';

  const unitSnap = await getDoc(doc(unitsCollection, normalizedUnitId));
  if (!unitSnap.exists()) return '';

  const data = unitSnap.data() as Record<string, unknown>;
  return typeof data.courseId === 'string' ? data.courseId.trim() : '';
};

const getWeekCourseId = async (weekId: string): Promise<string> => {
  const normalizedWeekId = typeof weekId === 'string' ? weekId.trim() : '';
  if (!normalizedWeekId) return '';

  const weekSnap = await getDoc(doc(weeksCollection, normalizedWeekId));
  if (!weekSnap.exists()) return '';

  const weekData = weekSnap.data() as Record<string, unknown>;
  const directCourseId = typeof weekData.courseId === 'string' ? weekData.courseId.trim() : '';
  if (directCourseId) return directCourseId;

  const unitId = typeof weekData.unitId === 'string' ? weekData.unitId.trim() : '';
  if (!unitId) return '';

  return getUnitCourseId(unitId);
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
      const normalizedCourseId = typeof courseId === 'string' ? courseId.trim() : '';
      if (!normalizedCourseId) return [];

      const cachedUnits = getCachedUnits(normalizedCourseId);
      if (cachedUnits) return cachedUnits;

      const q = query(unitsCollection, where('courseId', '==', normalizedCourseId));
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
            if (weekCourseId === normalizedCourseId) return true;

            return week.slides.some((slide) => {
              const slideRecord = slide as unknown as Record<string, unknown>;
              return typeof slideRecord.courseId === 'string' && slideRecord.courseId === normalizedCourseId;
            });
          });

          if (!belongsToCourse) continue;

          units.push({
            ...unit,
            courseId: normalizedCourseId,
          });

          await updateDoc(doc(unitsCollection, unit.id), {
            courseId: normalizedCourseId,
            updatedAt: serverTimestamp(),
          }).catch(() => undefined);
        }
      }

      units.sort((a, b) => (a.order || 0) - (b.order || 0));
      setCachedUnits(normalizedCourseId, units);
      return cloneUnits(units);
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
      invalidateUnitsCache(unitData.courseId);
      return docRef.id;
    } catch (error) {
      throw error;
    }
  },

  // Actualizar unidad
  update: async (unitId: string, updates: Partial<Omit<Unit, 'id' | 'createdAt'>>): Promise<void> => {
    try {
      const unitRef = doc(unitsCollection, unitId);
      const currentCourseId = await getUnitCourseId(unitId);
      await updateDoc(unitRef, updates);
      invalidateUnitsCache(currentCourseId);
      if (typeof updates.courseId === 'string') {
        invalidateUnitsCache(updates.courseId);
      }
    } catch (error) {
      throw error;
    }
  },

  // Eliminar unidad
  delete: async (unitId: string): Promise<void> => {
    try {
      const currentCourseId = await getUnitCourseId(unitId);
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
      invalidateUnitsCache(currentCourseId);
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
    invalidateUnitsCache(normalizedCourseId);

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
      invalidateUnitsCache(courseId);
      return docRef.id;
    } catch (error) {
      throw error;
    }
  },

  // Actualizar semana
  update: async (weekId: string, updates: Partial<Omit<Week, 'id' | 'createdAt'>>): Promise<void> => {
    try {
      const weekRef = doc(weeksCollection, weekId);
      const currentCourseId = await getWeekCourseId(weekId);
      await updateDoc(weekRef, updates);
      invalidateUnitsCache(currentCourseId);
      if (typeof updates.courseId === 'string') {
        invalidateUnitsCache(updates.courseId);
      }
    } catch (error) {
      throw error;
    }
  },

  // Eliminar semana
  delete: async (weekId: string): Promise<void> => {
    try {
      const currentCourseId = await getWeekCourseId(weekId);
      // Primero eliminar las diapositivas
      const slidesQuery = query(slidesCollection, where('weekId', '==', weekId));
      const slidesSnapshot = await getDocs(slidesQuery);
      
      for (const slideDoc of slidesSnapshot.docs) {
        await deleteDoc(doc(slidesCollection, slideDoc.id));
      }
      
      // Luego eliminar la semana
      await deleteDoc(doc(weeksCollection, weekId));
      invalidateUnitsCache(currentCourseId);
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
      invalidateUnitsCache(courseId);
      return docRef.id;
    } catch (error) {
      throw error;
    }
  },

  // Actualizar diapositiva
  update: async (slideId: string, updates: Partial<Omit<Slide, 'id' | 'createdAt'>>): Promise<void> => {
    try {
      const slideRef = doc(slidesCollection, slideId);
      const slideSnap = await getDoc(slideRef);
      const currentData = slideSnap.exists() ? (slideSnap.data() as Record<string, unknown>) : {};
      const currentCourseId =
        typeof currentData.courseId === 'string'
          ? currentData.courseId.trim()
          : typeof currentData.weekId === 'string'
            ? await getWeekCourseId(currentData.weekId)
            : '';
      await updateDoc(slideRef, updates);
      invalidateUnitsCache(currentCourseId);
      if (typeof updates.courseId === 'string') {
        invalidateUnitsCache(updates.courseId);
      } else if (typeof updates.weekId === 'string') {
        invalidateUnitsCache(await getWeekCourseId(updates.weekId));
      }
    } catch (error) {
      throw error;
    }
  },

  // Eliminar diapositiva
  delete: async (slideId: string): Promise<void> => {
    try {
      const slideRef = doc(slidesCollection, slideId);
      const slideSnap = await getDoc(slideRef);
      const slideData = slideSnap.exists() ? (slideSnap.data() as Record<string, unknown>) : {};
      const courseId =
        typeof slideData.courseId === 'string'
          ? slideData.courseId.trim()
          : typeof slideData.weekId === 'string'
            ? await getWeekCourseId(slideData.weekId)
            : '';
      await deleteDoc(slideRef);
      invalidateUnitsCache(courseId);
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
