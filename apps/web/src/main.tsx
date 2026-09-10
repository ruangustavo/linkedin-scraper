import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { App } from "./App";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Missing React root element");
}

// Preserve the React root when Bun hot-reloads this entrypoint.
const root: Root = import.meta.hot?.data.root ?? createRoot(container);

if (import.meta.hot) {
  import.meta.hot.data.root = root;
}

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
