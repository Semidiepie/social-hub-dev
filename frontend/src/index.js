import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

if ("serviceWorker" in navigator) {
  const registerSW = () => navigator.serviceWorker.register("/push-sw.js").catch(() => {});
  if (document.readyState === "complete") registerSW();
  else window.addEventListener("load", registerSW);
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
