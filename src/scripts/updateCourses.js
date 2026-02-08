// scripts/updateCourses.js
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';

// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBqs6AOFbqik1M93WO3f3H186SYPGvGZcA",
  authDomain: "historiassinnombre.firebaseapp.com",
  databaseURL: "https://historiassinnombre-default-rtdb.firebaseio.com",
  projectId: "historiassinnombre",
  storageBucket: "historiassinnombre.firebasestorage.app",
  messagingSenderId: "998472548824",
  appId: "1:998472548824:web:8eb865b8167df7e83572ad",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function updateCoursesWithTeacherId() {
  try {
    // Obtener todos los cursos
    const coursesSnapshot = await getDocs(collection(db, 'cursos'));
    
    const updates = [];
    coursesSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      
      // Verificar si falta teacherId o es incorrecto
      if (!data.teacherId || data.teacherId !== "1103121408") {
        console.log(`Actualizando curso: ${docSnap.id}`);
        
        updates.push(updateDoc(doc(db, 'cursos', docSnap.id), {
          teacherId: "1103121408", // Reemplazar con tu ID real
          enrolledStudents: data.enrolledStudents || [], // Asegurar que sea array
        }));
      }
    });
    
    await Promise.all(updates);
    console.log(`${updates.length} cursos actualizados correctamente`);
    
  } catch (error) {
    console.error('Error actualizando cursos:', error);
  }
}

updateCoursesWithTeacherId();