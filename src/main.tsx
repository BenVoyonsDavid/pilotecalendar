import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import PiloteCalendarV140 from "./PiloteCalendarV140";
import "./App.css";
import { initializeTeams } from "./teams";
import type { TeamsContextInfo } from "./teams";

// Teams embeds PiloteCalendar in an iframe. Native browser confirm dialogs can be
// suppressed by the Teams WebView, which made destructive buttons appear to do
// nothing. In Teams, accept the app's existing confirmation call so the action
// can complete. Outside Teams, keep the normal browser confirmation dialog.
try {
  if (window.self !== window.top) {
    Object.defineProperty(window, "confirm", {
      configurable: true,
      value: () => true,
    });
  }
} catch {
  Object.defineProperty(window, "confirm", {
    configurable: true,
    value: () => true,
  });
}

function Bootstrap() {
  const [teamsContext, setTeamsContext] = useState<TeamsContextInfo | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void initializeTeams()
      .then((context) => {
        if (active) setTeamsContext(context);
      })
      .catch(() => {
        if (active) setTeamsContext({ inTeams: false });
      });

    return () => {
      active = false;
    };
  }, []);

  return <PiloteCalendarV140 teamsContext={teamsContext} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Bootstrap />
  </React.StrictMode>
);
