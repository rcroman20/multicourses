import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./app.css";

createRoot(document.getElementById("root")!).render(<App />);

if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Silent fail to avoid affecting app load in unsupported environments.
      });
    });
  } else {
    // Prevent stale production service workers/caches from breaking Vite dev + HMR.
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister();
      });
    });
    if ("caches" in window) {
      caches.keys().then((keys) => {
        keys.forEach((key) => caches.delete(key));
      });
    }
  }
}
