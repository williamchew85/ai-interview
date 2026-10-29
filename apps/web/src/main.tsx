import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { hasSeenOnboarding, markOnboardingSeen } from "@interview-copilot/shared";
import { SetupScreen } from "./SetupScreen.tsx";
import { CallScreen } from "./CallScreen.tsx";
import { Onboarding } from "./Onboarding.tsx";

function App() {
  const [hash, setHash] = useState(location.hash);
  const [seen, setSeen] = useState(() => hasSeenOnboarding(localStorage));
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const callMatch = hash.match(/^#call\/(.+)$/);
  if (callMatch) return <CallScreen room={decodeURIComponent(callMatch[1]!)} />;
  if (!seen) {
    return <Onboarding onDone={() => { markOnboardingSeen(localStorage); setSeen(true); }} />;
  }
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
