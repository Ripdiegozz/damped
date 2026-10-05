import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ToastProvider } from "./ToastProvider";
import { MotionProvider } from "./motion-context";

const root = document.getElementById("root");
if (root === null) throw new Error("index.html is missing the #root element");
createRoot(root).render(
  <MotionProvider>
    <ToastProvider>
      <App />
    </ToastProvider>
  </MotionProvider>,
);
