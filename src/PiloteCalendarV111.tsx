import { useState } from "react";
import AssignmentTypeManager from "./AssignmentTypeManager";
import PiloteCalendarV11 from "./PiloteCalendarV11";
import type { TeamsContextInfo } from "./teams";

export default function PiloteCalendarV111({ teamsContext }: { teamsContext?: TeamsContextInfo }) {
  const [managerOpen, setManagerOpen] = useState(false);
  const [revision, setRevision] = useState(0);

  return (
    <>
      <PiloteCalendarV11 key={revision} teamsContext={teamsContext} />
      <button className="atm-launcher" onClick={() => setManagerOpen(true)}>
        ⚙️ Types d’affectation
      </button>
      <AssignmentTypeManager
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        onChanged={() => setRevision((value) => value + 1)}
      />
    </>
  );
}
