"use client";

// TasksDrawer — the "Add to Tasks" task list (Figma user-flow: opportunities and
// recommendations can be saved "to a task list for later action or project
// management"). Self-contained: renders its own floating trigger + slide-in
// drawer, persists per-domain in localStorage, and listens for a global
// `dashboard:add-task` event so any card/modal can add a task without coupling.
//
// A task is real, user-owned state (survives reloads, scoped to the site). No
// backend task API exists yet, so localStorage is the source of truth.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ListTodo, X, Check, Trash2, RotateCcw, ClipboardList } from "lucide-react";

const keyFor = (domain) => `df:tasks:v1:${(domain || "default").toLowerCase()}`;

function loadTasks(domain) {
  try {
    const raw = localStorage.getItem(keyFor(domain));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveTasks(domain, tasks) {
  try {
    localStorage.setItem(keyFor(domain), JSON.stringify(tasks));
  } catch {}
}

export default function TasksDrawer({ domain }) {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [justAdded, setJustAdded] = useState(false);

  // Load whenever the domain changes.
  useEffect(() => {
    setTasks(loadTasks(domain));
  }, [domain]);

  const persist = useCallback(
    (next) => {
      setTasks(next);
      saveTasks(domain, next);
    },
    [domain]
  );

  // Add a task from anywhere via a global event.
  useEffect(() => {
    const onAdd = (e) => {
      const d = e?.detail || {};
      const title = String(d.title || "").trim();
      if (!title) return;
      const source = String(d.source || "").trim();
      const detail = String(d.detail || "").trim();
      setTasks((prev) => {
        // De-dupe by title + source.
        if (prev.some((t) => t.title === title && t.source === source)) return prev;
        const next = [
          {
            id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            title,
            detail,
            source,
            status: "open",
            addedAt: Date.now(),
          },
          ...prev,
        ];
        saveTasks(domain, next);
        return next;
      });
      setJustAdded(true);
      window.clearTimeout(onAdd._t);
      onAdd._t = window.setTimeout(() => setJustAdded(false), 2200);
    };
    window.addEventListener("dashboard:add-task", onAdd);
    return () => window.removeEventListener("dashboard:add-task", onAdd);
  }, [domain]);

  const openCount = useMemo(() => tasks.filter((t) => t.status === "open").length, [tasks]);
  const doneCount = tasks.length - openCount;

  const toggle = (id) =>
    persist(
      tasks.map((t) =>
        t.id === id ? { ...t, status: t.status === "done" ? "open" : "done" } : t
      )
    );
  const remove = (id) => persist(tasks.filter((t) => t.id !== id));
  const clearDone = () => persist(tasks.filter((t) => t.status !== "done"));

  // Only show once a site is active.
  if (!domain || domain === "example.com") return null;

  return (
    <>
      {/* Floating trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open tasks"
        className={`fixed right-5 bottom-24 z-[65] inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[13px] font-semibold shadow-lg transition
          ${
            justAdded
              ? "border-[#F0782E] bg-[#FFF3EA] text-[#B4531B]"
              : "border-[var(--border)] bg-[var(--input,#fff)] text-[var(--text)] hover:border-[#F0782E]/50"
          }`}
      >
        <ListTodo size={16} className="text-[#F0782E]" />
        <span>{justAdded ? "Added to Tasks" : "Tasks"}</span>
        {openCount > 0 && (
          <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-[#F0782E] px-1 text-[11px] font-bold text-white">
            {openCount}
          </span>
        )}
      </button>

      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-[70] bg-black/40 transition-opacity ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Drawer */}
      <aside
        className={`fixed right-0 top-0 z-[71] flex h-full w-[min(420px,100vw)] flex-col border-l border-[var(--border)] bg-[var(--bg-panel,#fff)] shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-gradient-to-br from-[#F0782E] to-[#FBA43C] text-white shadow-sm">
            <ClipboardList size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold text-[var(--text)]">Tasks</div>
            <div className="text-[12px] text-[var(--muted)]">
              {openCount} open{doneCount ? `, ${doneCount} done` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--hover,#f3f4f6)] hover:text-[var(--text)]"
          >
            <X size={18} />
          </button>
        </div>

        {/* List */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {tasks.length === 0 ? (
            <div className="mt-10 px-6 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[#FFF3EA] text-[#F0782E]">
                <ListTodo size={22} />
              </div>
              <div className="text-[13px] font-semibold text-[var(--text)]">No tasks yet</div>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">
                Use “Add to Tasks” on an opportunity or a recommendation to save it here for later.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {tasks.map((t) => (
                <li
                  key={t.id}
                  className={`group flex items-start gap-3 rounded-[12px] border border-[var(--border)] p-3 transition ${
                    t.status === "done" ? "bg-[var(--input,#f9fafb)] opacity-70" : "bg-[var(--input,#fff)]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(t.id)}
                    aria-label={t.status === "done" ? "Mark as open" : "Mark as done"}
                    className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition ${
                      t.status === "done"
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-gray-300 text-transparent hover:border-[#F0782E]"
                    }`}
                  >
                    <Check size={13} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`text-[13px] font-medium leading-snug text-[var(--text)] ${
                        t.status === "done" ? "line-through" : ""
                      }`}
                    >
                      {t.title}
                    </div>
                    {t.detail && (
                      <div className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--muted)]">
                        {t.detail}
                      </div>
                    )}
                    {t.source && (
                      <div className="mt-1 inline-flex items-center rounded-full bg-[var(--hover,#f3f4f6)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted)]">
                        {t.source}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(t.id)}
                    aria-label="Remove task"
                    className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[var(--muted)] opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {doneCount > 0 && (
          <div className="border-t border-[var(--border)] px-5 py-3">
            <button
              type="button"
              onClick={clearDone}
              className="inline-flex items-center gap-2 text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)]"
            >
              <RotateCcw size={13} /> Clear {doneCount} completed
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
