import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App.jsx";

createRoot(document.getElementById("app-root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register the offline-shell service worker (PWA / Add to Home Screen).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
