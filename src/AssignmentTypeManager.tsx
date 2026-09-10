import { useEffect, useMemo, useState } from "react";
import { saveServerState } from "./backend";
import { createBlankCompanyState } from "./sampleData";
import type { AppState, AssignmentDefinition } from "./types";
import "./AssignmentTypeManager.css";

const STORAGE_KEY = "horaireTeams.v1";

type Category = AssignmentDefinition["category"];

type Draft = {
  id?: string;
  labelFr: string;
  labelEn: string;
  shortLabelFr: string;
  shortLabelEn: string;
  timeLabel: string;
  location: string;
  category: Category;
  minimumStaff: number;
  teamId: string;
  activeWeekdays: number[];
};

const WEEKDAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
];

const CATEGORY_LABELS: Record<Category, string> = {
  classes: "Soutien / classes",
  remote: "Télétravail",
  site: "Site / déplacement",
  escalation: "Escalade",
  absence: "Congé / absence",
  other: "Autre",
};

function readState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AppState;
  } catch {
    // Fall through to a blank organization.
  }
  return createBlankCompanyState("fr", "free", "Mon organisation");
}

function emptyDraft(state: AppState): Draft {
  return {
    labelFr: "",
    labelEn: "",
    shortLabelFr: "",
    shortLabelEn: "",
    timeLabel: "",
    location: "",
    category: "other",
    minimumStaff: 0,
    teamId: state.teams[0]?.id ?? "main",
    activeWeekdays: [1, 2, 3, 4, 5],
  };
}

function toDraft(item: AssignmentDefinition): Draft {
  return {
    id: item.id,
    labelFr: item.labelFr,
    labelEn: item.labelEn,
    shortLabelFr: item.shortLabelFr,
    shortLabelEn: item.shortLabelEn,
    timeLabel: item.timeLabel ?? "",
    location: item.location ?? "",
    category: item.category,
    minimumStaff: item.minimumStaff,
    teamId: item.teamId,
    activeWeekdays: item.activeWeekdays?.length ? [...item.activeWeekdays] : [1, 2, 3, 4, 5],
  };
}

function presenceImpact(draft: Draft) {
  const searchable = `${draft.id ?? ""} ${draft.labelFr} ${draft.labelEn} ${draft.shortLabelFr} ${draft.shortLabelEn} ${draft.location}`.toLowerCase();
  if (draft.category === "remote") return { icon: "🏠", text: "Télétravail — ne compte pas comme présentiel" };
  if (draft.category === "absence") return { icon: "🌴", text: "Congé / absence — ne compte pas comme présentiel" };
  if (searchable.includes("erg")) return { icon: "📍", text: "ERG — ne compte pas comme présentiel" };
  return { icon: "🏢", text: "Présentiel — compte dans le minimum présentiel" };
}

function persistState(next: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  void saveServerState(next);
  window.dispatchEvent(new Event("pilotecalendar-state-changed"));
}

export default function AssignmentTypeManager({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [state, setState] = useState<AppState>(() => readState());
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(readState()));
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    const current = readState();
    setState(current);
    setDraft(emptyDraft(current));
    setSearch("");
  }, [open]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return state.assignments;
    return state.assignments.filter((item) =>
      [item.labelFr, item.shortLabelFr, item.location, CATEGORY_LABELS[item.category]]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [search, state.assignments]);

  if (!open) return null;

  const impact = presenceImpact(draft);
  const editing = Boolean(draft.id);

  const resetDraft = () => setDraft(emptyDraft(state));

  const save = () => {
    const labelFr = draft.labelFr.trim();
    if (!labelFr || !draft.teamId) return;

    const labelEn = draft.labelEn.trim() || labelFr;
    const shortFr = draft.shortLabelFr.trim() || labelFr;
    const shortEn = draft.shortLabelEn.trim() || labelEn;
    const id = draft.id ?? `assignment-${Date.now()}`;

    const item: AssignmentDefinition = {
      id,
      labelFr,
      labelEn,
      shortLabelFr: shortFr,
      shortLabelEn: shortEn,
      timeLabel: draft.timeLabel.trim() || undefined,
      location: draft.location.trim() || undefined,
      category: draft.category,
      minimumStaff: Math.max(0, Number(draft.minimumStaff) || 0),
      teamId: draft.teamId,
      activeWeekdays: [...draft.activeWeekdays].sort(),
    };

    const next: AppState = {
      ...state,
      assignments: editing
        ? state.assignments.map((existing) => (existing.id === id ? item : existing))
        : [...state.assignments, item],
    };

    setState(next);
    persistState(next);
    setDraft(emptyDraft(next));
    onChanged();
  };

  const remove = (item: AssignmentDefinition) => {
    const ok = window.confirm(`Supprimer le type d’affectation « ${item.labelFr} » ?\n\nLes affectations planifiées liées à ce type seront également supprimées.`);
    if (!ok) return;

    const next: AppState = {
      ...state,
      assignments: state.assignments.filter((existing) => existing.id !== item.id),
      cycleSlots: state.cycleSlots.filter((slot) => slot.assignmentId !== item.id),
      exceptions: state.exceptions.filter((exception) => exception.assignmentId !== item.id),
    };

    setState(next);
    persistState(next);
    if (draft.id === item.id) setDraft(emptyDraft(next));
    onChanged();
  };

  const toggleWeekday = (day: number) => {
    setDraft((current) => ({
      ...current,
      activeWeekdays: current.activeWeekdays.includes(day)
        ? current.activeWeekdays.filter((value) => value !== day)
        : [...current.activeWeekdays, day],
    }));
  };

  return (
    <div className="atm-backdrop" onMouseDown={onClose}>
      <section className="atm-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header className="atm-header">
          <div>
            <p>Configuration</p>
            <h2>Types d’affectation</h2>
            <span>Créer, modifier ou supprimer les types utilisés dans l’horaire.</span>
          </div>
          <button className="atm-close" onClick={onClose} aria-label="Fermer">×</button>
        </header>

        <div className="atm-layout">
          <aside className="atm-list-panel">
            <div className="atm-list-toolbar">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher…" />
              <button className="atm-primary" onClick={resetDraft}>+ Nouveau</button>
            </div>

            <div className="atm-list">
              {filtered.length ? filtered.map((item) => {
                const itemDraft = toDraft(item);
                const itemImpact = presenceImpact(itemDraft);
                return (
                  <article className={draft.id === item.id ? "selected" : ""} key={item.id}>
                    <button className="atm-item-main" onClick={() => setDraft(itemDraft)}>
                      <span className="atm-item-icon">{itemImpact.icon}</span>
                      <span><strong>{item.labelFr}</strong><small>{CATEGORY_LABELS[item.category]}{item.location ? ` · ${item.location}` : ""}</small></span>
                    </button>
                    <button className="atm-delete" onClick={() => remove(item)} title="Supprimer">🗑</button>
                  </article>
                );
              }) : <div className="atm-empty">Aucun type d’affectation.</div>}
            </div>
          </aside>

          <div className="atm-editor">
            <div className="atm-editor-title">
              <div><p>{editing ? "Modification" : "Nouveau type"}</p><h3>{editing ? draft.labelFr : "Créer un type d’affectation"}</h3></div>
              {editing && <button className="atm-secondary" onClick={resetDraft}>Annuler la modification</button>}
            </div>

            <div className="atm-form-grid">
              <label>Nom
                <input value={draft.labelFr} onChange={(event) => setDraft({ ...draft, labelFr: event.target.value })} placeholder="Ex. Soutien aux classes" />
              </label>
              <label>Nom court
                <input value={draft.shortLabelFr} onChange={(event) => setDraft({ ...draft, shortLabelFr: event.target.value })} placeholder="Ex. Classes" />
              </label>
              <label>Nom anglais <small>(optionnel)</small>
                <input value={draft.labelEn} onChange={(event) => setDraft({ ...draft, labelEn: event.target.value })} />
              </label>
              <label>Nom court anglais <small>(optionnel)</small>
                <input value={draft.shortLabelEn} onChange={(event) => setDraft({ ...draft, shortLabelEn: event.target.value })} />
              </label>
              <label>Catégorie
                <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as Category })}>
                  {(Object.keys(CATEGORY_LABELS) as Category[]).map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>)}
                </select>
              </label>
              <label>Équipe
                <select value={draft.teamId} onChange={(event) => setDraft({ ...draft, teamId: event.target.value })}>
                  {state.teams.filter((team) => team.active).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </label>
              <label>Heure / plage horaire
                <input value={draft.timeLabel} onChange={(event) => setDraft({ ...draft, timeLabel: event.target.value })} placeholder="Ex. 08:00–12:00" />
              </label>
              <label>Lieu
                <input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="Ex. Vandry, ERG…" />
              </label>
              <label>Minimum de personnes pour cette affectation
                <input type="number" min="0" value={draft.minimumStaff} onChange={(event) => setDraft({ ...draft, minimumStaff: Math.max(0, Number(event.target.value) || 0) })} />
              </label>
            </div>

            <div className="atm-weekdays">
              <span>Jours actifs</span>
              <div>{WEEKDAYS.map((day) => <button key={day.value} className={draft.activeWeekdays.includes(day.value) ? "active" : ""} onClick={() => toggleWeekday(day.value)}>{day.label}</button>)}</div>
            </div>

            <div className="atm-presence-impact">
              <span>{impact.icon}</span>
              <div><strong>Impact sur le calcul du présentiel</strong><p>{impact.text}</p></div>
            </div>

            <div className="atm-rule-note">
              <strong>Règle actuelle</strong>
              <span>Un employé est considéré présentiel sauf s’il est en congé/absence, en télétravail ou si son affectation contient « ERG ».</span>
            </div>

            <footer className="atm-footer">
              <button className="atm-secondary" onClick={onClose}>Fermer</button>
              <button className="atm-primary" disabled={!draft.labelFr.trim() || !draft.teamId || draft.activeWeekdays.length === 0} onClick={save}>{editing ? "Enregistrer les modifications" : "Créer le type"}</button>
            </footer>
          </div>
        </div>
      </section>
    </div>
  );
}
