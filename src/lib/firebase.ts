// src/lib/firebase.ts - ARCHIVO CORREGIDO
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
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

const shouldForceLongPolling = (() => {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent || "";
  const isSafari =
    /Safari/i.test(userAgent) &&
    !/Chrome|Chromium|CriOS|Android/i.test(userAgent);
  return isSafari;
})();

// Obtener servicios
export const firebaseAuth = getAuth(firebaseApp);
export const firebaseDB = shouldForceLongPolling
  ? initializeFirestore(firebaseApp, {
      experimentalForceLongPolling: true,
      useFetchStreams: false,
    })
  : getFirestore(firebaseApp);
export const firebaseStorage = getStorage(firebaseApp); // <-- AÑADIR ESTO
export const firebaseFunctions = getFunctions(firebaseApp);

// Alias para compatibilidad
export const auth = firebaseAuth;
export const db = firebaseDB;

export { firebaseApp };
export default firebaseApp;
