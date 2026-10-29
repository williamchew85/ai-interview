import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { SetupScreen } from "./SetupScreen.tsx";
import { CallScreen } from "./CallScreen.tsx";

function App() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const callMatch = hash.match(/^#call\/(.+)$/);
  if (callMatch) return <CallScreen room={decodeURIComponent(callMatch[1]!)} />;
  return <SetupScreen />;
}

const el = document.getElementById("root");
if (el) {
  document.body.style.background = "#121316";
  document.body.style.margin = "0";
  createRoot(el).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
