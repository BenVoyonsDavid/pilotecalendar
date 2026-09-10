import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import PiloteCalendarV111 from "./PiloteCalendarV111";
import "./App.css";
import { initializeTeams } from "./teams";
import type { TeamsContextInfo } from "./teams";

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

  return <PiloteCalendarV111 teamsContext={teamsContext} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Bootstrap />
  </React.StrictMode>
);
