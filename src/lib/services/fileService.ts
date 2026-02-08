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
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { firebaseDB, firebaseStorage } from '@/lib/firebase';

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
}

class FileService {
  async getCourseFiles(courseId: string): Promise<CourseFile[]> {
    try {
      const filesRef = collection(firebaseDB, 'courseFiles');
      const q = query(
        filesRef,
        where('courseId', '==', courseId),
        orderBy('uploadedAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        uploadedAt: doc.data().uploadedAt?.toDate() || new Date()
      } as CourseFile));
    } catch (error) {
      console.error('Error getting course files:', error);
      throw error;
    }
  }

  async uploadFile(
    courseId: string,
    file: File,
    userId: string,
    fileName?: string,
    description?: string
  ): Promise<string> {
    try {
      // Subir archivo a Firebase Storage
      const storageRef = ref(firebaseStorage, `courses/${courseId}/files/${Date.now()}_${file.name}`);
      const uploadResult = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(uploadResult.ref);

      // Guardar metadata en Firestore
      const fileData = {
        name: fileName || file.name,
        url: downloadURL,
        size: file.size,
        type: file.type,
        uploadedBy: userId,
        uploadedAt: serverTimestamp(),
        courseId,
        description,
        storagePath: uploadResult.ref.fullPath
      };

      const filesRef = collection(firebaseDB, 'courseFiles');
      const docRef = await addDoc(filesRef, fileData);

      return docRef.id;
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  }

  async deleteFile(courseId: string, fileId: string): Promise<void> {
    try {
      // Obtener información del archivo primero
      const fileRef = doc(firebaseDB, 'courseFiles', fileId);
      const fileDoc = await getDocs(query(collection(firebaseDB, 'courseFiles'), where('__name__', '==', fileId)));
      
      if (!fileDoc.empty) {
        const fileData = fileDoc.docs[0].data();
        
        // Eliminar de Firebase Storage
        if (fileData.storagePath) {
          const storageRef = ref(firebaseStorage, fileData.storagePath);
          await deleteObject(storageRef);
        }

        // Eliminar de Firestore
        await deleteDoc(fileRef);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  }

  async getFileMetadata(fileId: string): Promise<CourseFile | null> {
    try {
      const filesRef = collection(firebaseDB, 'courseFiles');
      const q = query(filesRef, where('__name__', '==', fileId));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        return {
          id: doc.id,
          ...doc.data(),
          uploadedAt: doc.data().uploadedAt?.toDate() || new Date()
        } as CourseFile;
      }
      return null;
    } catch (error) {
      console.error('Error getting file metadata:', error);
      throw error;
    }
  }
}

export const fileService = new FileService();