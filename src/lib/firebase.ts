// src/lib/firebase.ts - ARCHIVO CORREGIDO
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBqs6AOFbqik1M93WO3f3H186SYPGvGZcA",
  authDomain: "historiassinnombre.firebaseapp.com",
  databaseURL: "https://historiassinnombre-default-rtdb.firebaseio.com",
  projectId: "historiassinnombre",
  storageBucket: "historiassinnombre.firebasestorage.app",
  messagingSenderId: "998472548824",
  appId: "1:998472548824:web:8eb865b8167df7e83572ad",
};

// Inicializar Firebase
const firebaseApp = initializeApp(firebaseConfig);

// Obtener servicios
export const firebaseAuth = getAuth(firebaseApp);
export const firebaseDB = initializeFirestore(firebaseApp, {
  // Improves compatibility in Safari / strict privacy environments.
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false,
});
export const firebaseStorage = getStorage(firebaseApp); // <-- AÑADIR ESTO

// Alias para compatibilidad
export const auth = firebaseAuth;
export const db = firebaseDB;

export { firebaseApp };
export default firebaseApp;
