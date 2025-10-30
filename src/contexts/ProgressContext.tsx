import React from "react";

type ProgressState = { completed: Record<string, Record<string, true>> };
const STORAGE_KEY = "lensegua:progress:v1";

function loadProgress(): ProgressState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { completed: {} };
  } catch { return { completed: {} }; }
}
function saveProgress(state: ProgressState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

export type ProgressCtx = {
  isDone: (moduleKey: string, lessonKey: string) => boolean;
  setCompleted: (moduleKey: string, lessonKey: string, completed: boolean) => void;
  toggle: (moduleKey: string, lessonKey: string) => void;
  clearModule: (moduleKey: string) => void;
};

const ProgressContext = React.createContext<ProgressCtx | null>(null);

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<ProgressState>(() => loadProgress());
  React.useEffect(() => { saveProgress(state); }, [state]);

  const isDone = (m: string, l: string) => !!state.completed[m]?.[l];

  const setCompleted = (m: string, l: string, completed: boolean) => {
    setState(prev => {
      const byModule = { ...(prev.completed[m] || {}) };
      if (completed) byModule[l] = true; else delete byModule[l];
      return { completed: { ...prev.completed, [m]: byModule } };
    });
  };

  const toggle = (m: string, l: string) => setCompleted(m, l, !isDone(m, l));

  const clearModule = (m: string) => {
    setState(prev => {
      const copy = { ...prev.completed };
      delete copy[m];
      return { completed: copy };
    });
  };

  const value = React.useMemo<ProgressCtx>(() => ({ isDone, setCompleted, toggle, clearModule }), [state]);
  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress() {
  const ctx = React.useContext(ProgressContext);
  if (!ctx) throw new Error("useProgress must be used within ProgressProvider");
  return ctx;
}
