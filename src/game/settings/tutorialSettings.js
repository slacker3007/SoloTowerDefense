const STORAGE_KEY = "soloTd.tutorial.v1";

/** @returns {{ completed: boolean, step: number }} */
export function getTutorialState() {
  if (typeof localStorage === "undefined") {
    return { completed: false, step: 0 };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { completed: false, step: 0 };
    }
    const o = JSON.parse(raw);
    return {
      completed: Boolean(o?.completed),
      step: Math.max(0, Number(o?.step) || 0),
    };
  } catch {
    return { completed: false, step: 0 };
  }
}

/** @param {{ completed?: boolean, step?: number }} patch */
export function setTutorialState(patch) {
  const cur = getTutorialState();
  const next = {
    completed: patch.completed != null ? Boolean(patch.completed) : cur.completed,
    step: patch.step != null ? Math.max(0, Number(patch.step) || 0) : cur.step,
  };
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  return next;
}

export function markTutorialCompleted() {
  return setTutorialState({ completed: true, step: 999 });
}

export function resetTutorialState() {
  return setTutorialState({ completed: false, step: 0 });
}
