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
  Timestamp
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

export const unitService = {
  getByCourse: async (courseId: string): Promise<Unit[]> => {
    try {
      // Consulta SIMPLE sin orderBy que necesita índice
      const q = query(
        unitsCollection,
        where('courseId', '==', courseId)
        // QUITAR orderBy temporalmente
        // orderBy('order', 'asc')
      );
      
      const snapshot = await getDocs(q);
      
      const units: Unit[] = [];
      
      for (const unitDoc of snapshot.docs) {
        const unitData = unitDoc.data();
        
        // PARA SEMANAS: También quitar orderBy temporalmente
        const weeksQuery = query(
          weeksCollection,
          where('unitId', '==', unitDoc.id)
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
  }
};

export const weekService = {
  // Crear semana
  create: async (weekData: Omit<Week, 'id' | 'slides' | 'createdAt'>): Promise<string> => {
    try {
      const docRef = await addDoc(weeksCollection, {
        ...weekData,
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
      const docRef = await addDoc(slidesCollection, {
        ...slideData,
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

