import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SetupScreen } from "./SetupScreen.tsx";

const el = document.getElementById("root");
if (el) {
  document.body.style.background = "#121316";
  document.body.style.margin = "0";
  createRoot(el).render(
    <StrictMode>
      <SetupScreen />
    </StrictMode>,
  );
}
