// src/lib/services/fileService.ts
import { 
  collection, 
  doc, 
  getDocs, 
  addDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  serverTimestamp 
} from 'firebase/firestore';
import { firebaseDB } from '@/lib/firebase';

export interface CourseFile {
  id: string;
  name: string;
  url: string;
  size: number;
  type: string;
  uploadedBy: string;
  uploadedAt: Date;
  courseId: string;
  description?: string;
  storagePath: string;
  periodId?: string | null;
  weekId?: string | null;
  order?: number;
}

class FileService {
  async getCourseFiles(courseId: string): Promise<CourseFile[]> {
    try {
      console.log('🔍 Buscando archivos para courseId:', courseId);
      
      const filesRef = collection(firebaseDB, 'course_files'); // AQUÍ EL CAMBIO IMPORTANTE
      const q = query(
        filesRef,
        where('courseId', '==', courseId),
        orderBy('uploadedAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      console.log('📁 Total documentos encontrados:', querySnapshot.docs.length);
      
      const files = querySnapshot.docs.map(doc => {
        const data = doc.data();
        console.log('📄 Archivo encontrado:', {
          id: doc.id,
          name: data.name,
          courseId: data.courseId,
          url: data.url
        });
        
        return {
          id: doc.id,
          ...data,
          uploadedAt: data.uploadedAt?.toDate() || new Date()
        } as CourseFile;
      });
      
      console.log('✅ Archivos procesados:', files.length);
      return files;
    } catch (error) {
      throw error;
    }
  }

  async uploadFile(
    courseId: string,
    file: File,
    userId: string,
    userName: string,
    fileName?: string,
    description?: string
  ): Promise<string> {
    try {
      // Nota: Para archivos externos (links), no necesitas Firebase Storage
      const fileData = {
        name: fileName || file.name,
        url: file.name.startsWith('http') ? file.name : '#', // Si es un link directo
        size: file.size || 0,
        type: file.type || 'application/octet-stream',
        uploadedBy: userName,
        uploadedAt: serverTimestamp(),
        courseId,
        description: description || '',
        storagePath: '',
        periodId: null,
        weekId: null,
        order: 0
      };

      console.log('➕ Subiendo archivo:', fileData);

      const filesRef = collection(firebaseDB, 'course_files'); // AQUÍ TAMBIÉN
      const docRef = await addDoc(filesRef, fileData);

      console.log('✅ Archivo creado con ID:', docRef.id);
      return docRef.id;
    } catch (error) {
      throw error;
    }
  }

  async addExternalLink(
    courseId: string,
    linkData: {
      name: string;
      url: string;
      type: string;
      description?: string;
      size?: number;
      periodId?: string;
      weekId?: string;
    },
    userId: string,
    userName: string
  ): Promise<string> {
    try {
      const fileData = {
        name: linkData.name,
        url: linkData.url,
        size: linkData.size || 0,
        type: linkData.type,
        uploadedBy: userName,
        uploadedAt: serverTimestamp(),
        courseId,
        description: linkData.description || '',
        storagePath: '', // No hay archivo en storage
        periodId: linkData.periodId || null,
        weekId: linkData.weekId || null,
        order: 0
      };

      console.log('➕ Agregando link externo:', fileData);

      const filesRef = collection(firebaseDB, 'course_files'); // AQUÍ TAMBIÉN
      const docRef = await addDoc(filesRef, fileData);

      console.log('✅ Link creado con ID:', docRef.id);
      return docRef.id;
    } catch (error) {
      throw error;
    }
  }

  async deleteFile(fileId: string): Promise<void> {
    try {
      console.log('🗑️ Eliminando archivo con ID:', fileId);
      const fileRef = doc(firebaseDB, 'course_files', fileId); // AQUÍ TAMBIÉN
      await deleteDoc(fileRef);
      console.log('✅ Archivo eliminado');
    } catch (error) {
      throw error;
    }
  }
}

export const fileService = new FileService();