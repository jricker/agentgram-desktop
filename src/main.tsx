import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Catch unhandled promise rejections (async errors outside React)
window.addEventListener("unhandledrejection", (event) => {
  console.error("[Unhandled Rejection]", event.reason);
  event.preventDefault(); // Prevent crash
});

window.addEventListener("error", (event) => {
  console.error("[Uncaught Error]", event.error);
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
