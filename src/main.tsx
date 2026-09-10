import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import { initializeTeams } from "./teams";
import type { TeamsContextInfo } from "./teams";

function Bootstrap() {
  const [teamsContext, setTeamsContext] = useState<TeamsContextInfo | undefined>(undefined);

  useEffect(() => {
    let active = true;

    // Render the app immediately. Teams initialization happens in the background,
    // so a slow or failed Teams SDK handshake can never leave a blank screen.
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

  return <App teamsContext={teamsContext} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Bootstrap />
  </React.StrictMode>
);
