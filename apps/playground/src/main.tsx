import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ToastProvider } from "./ToastProvider";

const root = document.getElementById("root");
if (root === null) throw new Error("index.html is missing the #root element");
createRoot(root).render(
  <ToastProvider>
    <App />
  </ToastProvider>,
);
