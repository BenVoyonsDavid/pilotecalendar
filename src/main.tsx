import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import { initializeTeams } from "./teams";

void initializeTeams().then((teamsContext) => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App teamsContext={teamsContext} />
    </React.StrictMode>
  );
});
