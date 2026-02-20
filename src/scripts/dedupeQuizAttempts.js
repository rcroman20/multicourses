import { initializeApp } from "firebase/app";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
} from "firebase/firestore";

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

function toDate(value) {
  if (value && typeof value === "object" && "toDate" in value) {
    return value.toDate();
  }
  if (value instanceof Date) return value;
  return new Date(0);
}

function buildAnswerSignature(answers) {
  if (!Array.isArray(answers)) return "";
  return [...answers]
    .map((item) => ({
      questionId: String(item?.questionId || ""),
      selectedOptionIndex: Number(item?.selectedOptionIndex ?? -1),
    }))
    .sort((a, b) => a.questionId.localeCompare(b.questionId))
    .map((item) => `${item.questionId}:${item.selectedOptionIndex}`)
    .join("|");
}

function buildFingerprint(data) {
  const createdAt = toDate(data.createdAt);
  const minuteBucket = Math.floor(createdAt.getTime() / 60000);
  return [
    String(data.courseId || ""),
    String(data.studentId || ""),
    String(data.theme || ""),
    Number(data.total || 0),
    Number(data.correct || 0),
    Number(data.percentage || 0),
    buildAnswerSignature(data.answers),
    minuteBucket,
  ].join("|");
}

async function dedupeQuizAttempts() {
  const snapshot = await getDocs(collection(db, "quizAttempts"));

  const attempts = snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ref: doc(db, "quizAttempts", docSnap.id),
      createdAt: toDate(data.createdAt),
      fingerprint: buildFingerprint(data),
    };
  });

  attempts.sort((a, b) => {
    const byDate = b.createdAt.getTime() - a.createdAt.getTime();
    if (byDate !== 0) return byDate;
    return a.id.localeCompare(b.id);
  });

  const seen = new Set();
  const toDelete = [];

  for (const attempt of attempts) {
    if (seen.has(attempt.fingerprint)) {
      toDelete.push(attempt);
      continue;
    }
    seen.add(attempt.fingerprint);
  }

  console.log(`Total quizAttempts: ${attempts.length}`);
  console.log(`Duplicados detectados: ${toDelete.length}`);

  for (let i = 0; i < toDelete.length; i += 200) {
    const chunk = toDelete.slice(i, i + 200);
    await Promise.all(chunk.map((item) => deleteDoc(item.ref)));
    console.log(
      `Eliminados ${Math.min(i + chunk.length, toDelete.length)} / ${toDelete.length}`,
    );
  }

  console.log("Limpieza finalizada.");
}

dedupeQuizAttempts().catch((error) => {
  console.error("Error al limpiar quizAttempts:", error);
  process.exit(1);
});
