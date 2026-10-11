import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if (
  import.meta.env.PROD
  && import.meta.env.BASE_URL === "/"
  && "serviceWorker" in navigator
) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/service-worker.js").catch((error) => {
      console.error("ASTRODODGE app shell could not be cached.", error);
    });
  }, { once: true });
}

createRoot(document.getElementById("root")!).render(<App />);
