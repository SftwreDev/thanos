"use client";

import { Markdown } from "@/components/markdown";
import type {
  ChatMessage,
  CourseOutline,
  LessonKind,
  OutlineLesson,
} from "@/lib/types";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";

type Thread = {
  id: string;
  title: string;
  moduleId: string;
  lessonId?: string | null;
  updatedAt: number;
  messages: ChatMessage[];
};

const STORAGE_CHATS = "thanos.chats";
const STORAGE_ACTIVE = "thanos.activeChat";
const STORAGE_MODULE = "thanos.activeModule";
const STORAGE_LESSON = "thanos.activeLesson";
const STORAGE_EXPANDED = "thanos.expandedModules";
const STORAGE_LESSONS = "thanos.seenLessons";

function uid(): string {
  return crypto.randomUUID();
}

function timeAgo(ts: number): string {
  const delta = Date.now() - ts;
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

type Persist = {
  threads: Thread[];
  activeId: string | null;
  moduleId: string;
  lessonId: string | null;
  expanded: Record<string, boolean>;
  seenLessons: string[];
};

const persistListeners = new Set<() => void>();
let persistCache: Persist | null = null;
const EMPTY_MESSAGES: ChatMessage[] = [];
const KIND_GROUPS: { id: LessonKind; label: string }[] = [
  { id: "intro", label: "Overview" },
  { id: "lesson", label: "Lessons" },
  { id: "practice", label: "Practice" },
  { id: "lab", label: "Labs" },
  { id: "solution", label: "Solutions" },
  { id: "mock", label: "Mocks" },
  { id: "bonus", label: "Bonus" },
  { id: "resource", label: "Resources" },
];

function groupedLessons(lessons: OutlineLesson[]) {
  const groups = KIND_GROUPS.map((group) => ({
    ...group,
    lessons: lessons.filter((lesson) => lesson.kind === group.id),
  })).filter((group) => group.lessons.length > 0);
  return groups;
}
const SERVER_SNAPSHOT: Persist = {
  threads: [],
  activeId: null,
  moduleId: "",
  lessonId: null,
  expanded: {},
  seenLessons: [],
};

function readPersist(defaultModule: string): Persist {
  if (persistCache?.expanded) return persistCache;
  const storedExpanded = loadJson<Record<string, boolean>>(STORAGE_EXPANDED, {
    [defaultModule]: true,
  });
  persistCache = {
    threads: loadJson<Thread[]>(STORAGE_CHATS, []),
    activeId: loadJson<string | null>(STORAGE_ACTIVE, null),
    moduleId: loadJson<string>(STORAGE_MODULE, defaultModule),
    lessonId: loadJson<string | null>(STORAGE_LESSON, null),
    expanded:
      Object.keys(storedExpanded).length > 0
        ? storedExpanded
        : { [defaultModule]: true },
    seenLessons: loadJson<string[]>(STORAGE_LESSONS, []),
  };
  return persistCache;
}

function getClientSnapshot(): Persist {
  return readPersist("");
}

function getServerSnapshot(): Persist {
  return SERVER_SNAPSHOT;
}

function writePersist(next: Persist) {
  persistCache = next;
  localStorage.setItem(STORAGE_CHATS, JSON.stringify(next.threads.slice(0, 20)));
  localStorage.setItem(STORAGE_ACTIVE, JSON.stringify(next.activeId));
  localStorage.setItem(STORAGE_MODULE, JSON.stringify(next.moduleId));
  localStorage.setItem(STORAGE_LESSON, JSON.stringify(next.lessonId));
  localStorage.setItem(STORAGE_EXPANDED, JSON.stringify(next.expanded));
  localStorage.setItem(STORAGE_LESSONS, JSON.stringify(next.seenLessons));
  persistListeners.forEach((listener) => listener());
}

function subscribePersist(listener: () => void) {
  persistListeners.add(listener);
  return () => persistListeners.delete(listener);
}

export function LmsApp({ course }: { course: CourseOutline }) {
  const allSections = useMemo(
    () => course.tracks.flatMap((track) => track.sections),
    [course.tracks],
  );
  const defaultModule =
    allSections.find((section) => section.id === "core-concepts")?.id ??
    allSections[0]?.id ??
    "";
  const persist = useSyncExternalStore(
    subscribePersist,
    getClientSnapshot,
    getServerSnapshot,
  );
  const { threads, activeId, moduleId, lessonId, expanded, seenLessons } = persist;
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const openAbort = useRef<AbortController | null>(null);

  const patch = (partial: Partial<Persist>) => {
    writePersist({ ...readPersist(defaultModule), ...partial });
  };

  const active = threads.find((thread) => thread.id === activeId) ?? null;
  const messages = active?.messages;
  const section =
    allSections.find((item) => item.id === moduleId) ??
    allSections.find((item) => item.id === defaultModule);

  const visibleMessages = messages ?? EMPTY_MESSAGES;
  const lastContent = visibleMessages.at(-1)?.content ?? "";

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [visibleMessages.length, lastContent, busy]);

  const progressBySection = useMemo(() => {
    const seen = new Set(seenLessons);
    const map: Record<string, number> = {};
    for (const item of allSections) {
      if (item.lessons.length === 0) {
        map[item.id] = 0;
        continue;
      }
      const done = item.lessons.filter((lesson) => seen.has(lesson.id)).length;
      map[item.id] = Math.round((done / item.lessons.length) * 100);
    }
    return map;
  }, [allSections, seenLessons]);

  const activeLesson = section?.lessons.find((lesson) => lesson.id === lessonId);
  const lessonPool = section?.lessons.filter((lesson) => lesson.kind === "lesson") ?? [];
  const unseen = lessonPool.find((lesson) => !seenLessons.includes(lesson.id));
  const chips = activeLesson
    ? [
        `Quiz me on ${activeLesson.title}`,
        `What kubectl commands are in this lesson?`,
        "What's next in this course?",
      ]
    : [
        `Quiz me on ${section?.name ?? "this module"}`,
        unseen ? `Explain ${unseen.title}` : "Explain ReplicaSets",
        "What's next in this course?",
      ];

  function newChat() {
    patch({ activeId: null, lessonId: null });
    setDraft("");
    setSidebarOpen(false);
    inputRef.current?.focus();
  }

  function deleteThread(id: string) {
    const current = readPersist(defaultModule);
    const nextThreads = current.threads.filter((thread) => thread.id !== id);
    const deletingActive = current.activeId === id;
    patch({
      threads: nextThreads,
      activeId: deletingActive ? null : current.activeId,
      lessonId: deletingActive ? null : current.lessonId,
    });
    if (deletingActive) {
      setDraft("");
      inputRef.current?.focus();
    }
  }

  function clearChats() {
    const current = readPersist(defaultModule);
    if (current.threads.length === 0) return;
    patch({
      threads: [],
      activeId: null,
      lessonId: null,
    });
    setDraft("");
    inputRef.current?.focus();
  }

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busy) return;

      const userMessage: ChatMessage = { id: uid(), role: "user", content };
      const current = readPersist(defaultModule);
      let threadId = current.activeId;
      let nextThreads = current.threads;

      if (!threadId) {
        threadId = uid();
        nextThreads = [
          {
            id: threadId,
            title: content.slice(0, 48),
            moduleId: current.moduleId,
            lessonId: current.lessonId,
            updatedAt: Date.now(),
            messages: [userMessage],
          },
          ...current.threads,
        ];
      } else {
        nextThreads = current.threads.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                updatedAt: Date.now(),
                messages: [...thread.messages, userMessage],
              }
            : thread,
        );
      }

      writePersist({
        ...current,
        threads: nextThreads,
        activeId: threadId,
      });
      setDraft("");
      setBusy(true);

      const activeThread = nextThreads.find((thread) => thread.id === threadId);
      const history = (activeThread?.messages ?? [])
        .filter((message) => message.kind !== "notes")
        .map((message) => ({
          role: message.role,
          content: message.content,
          kind: message.kind,
        }));

      const assistantId = uid();
      writePersist({
        ...readPersist(defaultModule),
        threads: readPersist(defaultModule).threads.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                messages: [
                  ...thread.messages,
                  { id: assistantId, role: "assistant", content: "" },
                ],
              }
            : thread,
        ),
      });

      const updateAssistant = (mutate: (message: ChatMessage) => ChatMessage) => {
        const snapshot = readPersist(defaultModule);
        writePersist({
          ...snapshot,
          threads: snapshot.threads.map((thread) =>
            thread.id === threadId
              ? {
                  ...thread,
                  messages: thread.messages.map((message) =>
                    message.id === assistantId ? mutate(message) : message,
                  ),
                }
              : thread,
          ),
        });
      };

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history,
            moduleId: current.moduleId,
            lessonId: activeThread?.lessonId ?? current.lessonId ?? undefined,
          }),
        });

        if (!response.ok || !response.body) {
          throw new Error("Chat request failed");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let source: ChatMessage["source"];
        let citations: ChatMessage["citations"] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as {
              type: string;
              source?: "course" | "web";
              citations?: ChatMessage["citations"];
              lessonIds?: string[];
              text?: string;
            };
            if (event.type === "meta") {
              source = event.source;
              citations = event.citations ?? [];
              if (event.lessonIds?.length) {
                const snapshot = readPersist(defaultModule);
                writePersist({
                  ...snapshot,
                  seenLessons: [
                    ...new Set([...snapshot.seenLessons, ...event.lessonIds]),
                  ],
                });
              }
            }
            if (event.type === "delta" && event.text) {
              const chunk = event.text;
              updateAssistant((message) => ({
                ...message,
                content: message.content + chunk,
              }));
            }
          }
        }

        updateAssistant((message) => ({
          ...message,
          source,
          citations,
          content: message.content || "No answer came back. Try again.",
        }));
      } catch {
        updateAssistant((message) => ({
          ...message,
          content: "The tutor could not reach the notes right now. Try again.",
        }));
      } finally {
        setBusy(false);
      }
    },
    [busy, defaultModule],
  );

  function toggleModule(id: string) {
    const current = readPersist(defaultModule);
    patch({
      moduleId: id,
      lessonId: current.moduleId === id ? current.lessonId : null,
      expanded: { ...current.expanded, [id]: !current.expanded[id] },
    });
  }

  async function openLesson(sectionId: string, id: string) {
    const current = readPersist(defaultModule);
    const existing = current.threads.find(
      (thread) =>
        thread.lessonId === id &&
        thread.messages.some((message) => message.kind === "notes"),
    );

    patch({
      moduleId: sectionId,
      lessonId: id,
      activeId: existing?.id ?? null,
      expanded: { ...current.expanded, [sectionId]: true },
      seenLessons: [...new Set([...current.seenLessons, id])],
    });
    setSidebarOpen(false);

    openAbort.current?.abort();
    const ac = new AbortController();
    openAbort.current = ac;
    if (!existing) setBusy(true);

    try {
      const response = await fetch(`/api/lessons/${encodeURIComponent(id)}`, {
        signal: ac.signal,
      });
      if (!response.ok) throw new Error("Lesson request failed");
      const data = (await response.json()) as {
        title: string;
        section: string;
        githubUrl: string;
        notes: string;
      };

      const snapshot = readPersist(defaultModule);
      const notesMessage: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: data.notes,
        kind: "notes",
        source: "course",
        citations: [
          {
            title: data.title,
            url: data.githubUrl,
            detail: data.section,
          },
        ],
      };

      if (existing) {
        let replaced = false;
        writePersist({
          ...snapshot,
          threads: snapshot.threads.map((thread) =>
            thread.id === existing.id
              ? {
                  ...thread,
                  updatedAt: Date.now(),
                  messages: thread.messages.map((message) => {
                    if (replaced || message.kind !== "notes") return message;
                    replaced = true;
                    return { ...notesMessage, id: message.id };
                  }),
                }
              : thread,
          ),
          activeId: existing.id,
          moduleId: sectionId,
          lessonId: id,
        });
        inputRef.current?.focus();
        return;
      }

      const emptyActive = snapshot.threads.find(
        (thread) => thread.id === snapshot.activeId && thread.messages.length === 0,
      );
      const threadId = emptyActive?.id ?? uid();
      const nextThread: Thread = {
        id: threadId,
        title: data.title,
        moduleId: sectionId,
        lessonId: id,
        updatedAt: Date.now(),
        messages: [notesMessage],
      };
      const nextThreads = emptyActive
        ? snapshot.threads.map((thread) =>
            thread.id === threadId ? nextThread : thread,
          )
        : [nextThread, ...snapshot.threads];

      writePersist({
        ...snapshot,
        threads: nextThreads,
        activeId: threadId,
        moduleId: sectionId,
        lessonId: id,
      });
      inputRef.current?.focus();
    } catch (error) {
      if (ac.signal.aborted || existing) return;
      const snapshot = readPersist(defaultModule);
      const threadId = uid();
      writePersist({
        ...snapshot,
        activeId: threadId,
        threads: [
          {
            id: threadId,
            title: "Lesson notes",
            moduleId: sectionId,
            lessonId: id,
            updatedAt: Date.now(),
            messages: [
              {
                id: uid(),
                role: "assistant",
                content:
                  "Could not load those lesson notes. Pick the topic again.",
              },
            ],
          },
          ...snapshot.threads,
        ],
      });
      void error;
    } finally {
      if (openAbort.current === ac) setBusy(false);
    }
  }

  function selectThread(thread: Thread) {
    const current = readPersist(defaultModule);
    patch({
      activeId: thread.id,
      moduleId: thread.moduleId,
      lessonId: thread.lessonId ?? current.lessonId,
      expanded: { ...current.expanded, [thread.moduleId]: true },
    });
    setSidebarOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(draft);
    }
  }

  const recent = threads.slice(0, 8);

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#141414] text-[#f3f2f2]">
      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex h-full w-[300px] min-w-[300px] flex-col border-r border-[#2b2b2b] bg-[#171717] transition-transform md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex items-center gap-2 border-b border-[#2b2b2b] px-6 py-5">
          <div className="h-3.5 w-3.5 bg-[#ec3013]" />
          <div className="text-sm font-semibold tracking-[0.02em]">Tutor</div>
        </div>

        <div className="px-6 pb-3 pt-5">
          <div className="mb-2 text-[11px] uppercase tracking-[0.08em] text-[#7a7a7a]">
            Course
          </div>
          <div className="text-xl font-bold">Kubernetes</div>
        </div>

        <div className="px-6 pb-4">
          <button
            type="button"
            onClick={newChat}
            className="flex w-full cursor-pointer items-center gap-2 border border-[#3a3a3a] px-3.5 py-2.5 text-sm font-medium text-[#f3f2f2] hover:border-[#ec3013]"
          >
            <span className="text-base leading-none">+</span>
            <span>New chat</span>
          </button>
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter modules…"
            className="mt-3 w-full border border-[#3a3a3a] bg-[#1a1a1a] px-3.5 py-2 text-[13px] text-[#f3f2f2] outline-none placeholder:text-[#6b6b6b]"
          />
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex flex-col">
            {course.tracks.map((track) => {
              const needle = filter.trim().toLowerCase();
              const trackSections = track.sections
                .map((item) => {
                  const lessons = needle
                    ? item.lessons.filter(
                        (lesson) =>
                          lesson.title.toLowerCase().includes(needle) ||
                          item.name.toLowerCase().includes(needle),
                      )
                    : item.lessons;
                  if (needle && lessons.length === 0 && !item.name.toLowerCase().includes(needle)) {
                    return null;
                  }
                  return { ...item, lessons: needle ? lessons : item.lessons };
                })
                .filter((item): item is NonNullable<typeof item> => Boolean(item));

              if (trackSections.length === 0) return null;

              return (
                <div key={track.id} className="flex flex-col">
                  <div className="px-6 pb-1 pt-3 text-[11px] uppercase tracking-[0.08em] text-[#7a7a7a]">
                    {track.name}
                  </div>
                  {trackSections.map((item) => {
                    const percent = progressBySection[item.id] ?? 0;
                    const activeModule = item.id === moduleId;
                    const isOpen = Boolean(expanded[item.id]) || Boolean(needle);
                    const groups = groupedLessons(item.lessons);
                    const showGroupLabels = groups.length > 1;

                    return (
                      <div key={item.id} className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => toggleModule(item.id)}
                          className="flex cursor-pointer flex-col gap-1.5 px-6 py-2.5 text-left"
                        >
                          <div className="flex items-center justify-between text-sm">
                            <span
                              className={
                                activeModule
                                  ? "font-semibold text-[#f3f2f2]"
                                  : percent > 0
                                    ? "text-[#c9c9c9]"
                                    : "text-[#8a8a8a]"
                              }
                            >
                              {item.name}
                            </span>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-xs ${
                                  activeModule ? "text-[#ec3013]" : "text-[#6b6b6b]"
                                }`}
                              >
                                {percent}%
                              </span>
                              <span
                                className="inline-block text-[11px] text-[#6b6b6b] transition-transform duration-150"
                                style={{
                                  transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                                }}
                              >
                                ▸
                              </span>
                            </div>
                          </div>
                          <div className="h-0.5 bg-[#2b2b2b]">
                            <div
                              className="h-full"
                              style={{
                                width: `${percent}%`,
                                background: activeModule
                                  ? "#ec3013"
                                  : percent > 0
                                    ? "#5a5a5a"
                                    : "#2b2b2b",
                              }}
                            />
                          </div>
                        </button>

                        {isOpen ? (
                          <div className="flex flex-col px-6 pb-2 pt-0.5">
                            {groups.map((group) => (
                              <div key={group.id} className="flex flex-col">
                                {showGroupLabels ? (
                                  <div className="px-0 pb-1 pt-2 text-[10px] uppercase tracking-[0.08em] text-[#6b6b6b]">
                                    {group.label}
                                  </div>
                                ) : null}
                                {group.lessons.map((lesson) => {
                                  const isActive = lesson.id === lessonId;
                                  return (
                                    <button
                                      key={lesson.id}
                                      type="button"
                                      onClick={() => void openLesson(item.id, lesson.id)}
                                      className="flex cursor-pointer items-center gap-2 border-l-2 py-[7px] pl-3.5 text-left text-[13.5px]"
                                      style={{
                                        borderLeftColor: isActive ? "#ec3013" : "transparent",
                                        background: isActive ? "#1e1e1e" : "transparent",
                                      }}
                                    >
                                      <span
                                        className={
                                          isActive
                                            ? "font-semibold text-[#f3f2f2]"
                                            : "font-normal text-[#8a8a8a]"
                                        }
                                      >
                                        {lesson.title}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="mx-6 mb-1 mt-3 h-px bg-[#2b2b2b]" />
          <div className="flex items-center justify-between px-6 pb-2 pt-3">
            <div className="text-[11px] uppercase tracking-[0.08em] text-[#7a7a7a]">
              Recent chats
            </div>
            {recent.length > 0 ? (
              <button
                type="button"
                onClick={clearChats}
                className="cursor-pointer text-[11px] uppercase tracking-[0.08em] text-[#6b6b6b] hover:text-[#ec3013]"
              >
                Clear
              </button>
            ) : null}
          </div>
          <div className="flex flex-col">
            {recent.length === 0 ? (
              <div className="px-6 py-2.5 text-sm text-[#6b6b6b]">No chats yet</div>
            ) : (
              recent.map((thread) => (
                <div
                  key={thread.id}
                  className={`group flex items-stretch ${
                    thread.id === activeId ? "bg-[#1e1e1e]" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectThread(thread)}
                    className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 py-2.5 pr-2 pl-6 text-left"
                  >
                    <span className="truncate text-sm text-[#c9c9c9]">
                      {thread.title}
                    </span>
                    <span className="text-xs text-[#6b6b6b]">
                      {timeAgo(thread.updatedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${thread.title}`}
                    onClick={() => deleteThread(thread.id)}
                    className="mr-3 mt-2.5 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center text-[#6b6b6b] hover:bg-[#2b2b2b] hover:text-[#ec3013] md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      aria-hidden="true"
                    >
                      <path d="M2 2l8 8M10 2L2 10" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 border-t border-[#2b2b2b] px-6 py-4">
          <div className="flex h-7 w-7 items-center justify-center bg-[#2b2b2b] text-xs font-semibold text-[#f3f2f2]">
            YO
          </div>
          <div className="text-[13px] text-[#c9c9c9]">You</div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 min-h-14 items-center gap-3 border-b border-[#2b2b2b] px-4 text-sm md:px-8">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center border border-[#3a3a3a] md:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open modules"
          >
            <span className="block h-3.5 w-3.5 bg-[#ec3013]" />
          </button>
          <span className="text-[#6b6b6b]">Kubernetes</span>
          <span className="text-[#4a4a4a]">/</span>
          <span className="text-[#f3f2f2]">{section?.name ?? "Course"}</span>
        </div>

        <div ref={scroller} className="flex flex-1 justify-center overflow-y-auto">
          <div className="flex w-full max-w-[720px] flex-col gap-9 px-8 py-10">
            {visibleMessages.length === 0 && !busy ? (
              <EmptyState
                moduleName={section?.name ?? "this module"}
                lessons={section?.lessons ?? []}
              />
            ) : null}
            {visibleMessages.length === 0 && busy ? (
              <div className="flex flex-col gap-3">
                <div className="text-xs uppercase tracking-[0.08em] text-[#ec3013]">
                  Assistant
                </div>
                <div className="text-[15px] text-[#6b6b6b]">Loading notes…</div>
              </div>
            ) : null}
            {visibleMessages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="flex flex-col gap-2">
                  <div className="text-xs uppercase tracking-[0.08em] text-[#7a7a7a]">
                    You
                  </div>
                  <div className="text-[15px] leading-[1.6] text-[#f3f2f2]">
                    {message.content}
                  </div>
                </div>
              ) : (
                <div key={message.id} className="flex flex-col gap-3">
                  <div className="text-xs uppercase tracking-[0.08em] text-[#ec3013]">
                    Assistant
                    {message.source ? (
                      <span className="ml-2 tracking-[0.08em] text-[#6b6b6b]">
                        · {message.kind === "notes" ? "Lesson" : message.source === "course" ? "CKA notes" : "Web"}
                      </span>
                    ) : null}
                  </div>
                  {message.content ? (
                    <Markdown text={message.content} />
                  ) : (
                    <div className="text-[15px] text-[#6b6b6b]">Thinking…</div>
                  )}
                  {message.citations && message.citations.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {message.citations.map((citation) => (
                        <a
                          key={citation.url}
                          href={citation.url}
                          target="_blank"
                          rel="noreferrer"
                          className="border border-[#3a3a3a] px-2.5 py-1 text-xs text-[#a8a8a8] hover:border-[#ec3013] hover:text-[#f3f2f2]"
                        >
                          {citation.title}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ),
            )}
          </div>
        </div>

        <div className="flex justify-center border-t border-[#2b2b2b]">
          <div className="flex w-full max-w-[720px] flex-col gap-3 px-8 pb-6 pt-4">
            <div className="flex flex-wrap gap-2">
              {chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => void send(chip)}
                  className="cursor-pointer border border-[#3a3a3a] px-3.5 py-[7px] text-[13px] text-[#a8a8a8] hover:border-[#ec3013] hover:text-[#f3f2f2]"
                >
                  {chip}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 border border-[#3a3a3a] bg-[#1a1a1a] py-1.5 pr-1.5 pl-4">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder={
                  activeLesson
                    ? `Ask about ${activeLesson.title}…`
                    : "Ask about this module…"
                }
                className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent text-[15px] text-[#f3f2f2] outline-none placeholder:text-[#7a7a7a]"
              />
              <button
                type="button"
                onClick={() => void send(draft)}
                disabled={busy || !draft.trim()}
                className="flex h-9 w-9 min-w-9 items-center justify-center bg-[#3a3a3a] disabled:opacity-50"
                aria-label="Send"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={draft.trim() ? "#f3f2f2" : "#8a8a8a"}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </button>
            </div>

            <div className="text-xs text-[#5f5f5f]">
              AI answers may reference course material inaccurately. Verify important
              details.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function EmptyState({
  moduleName,
  lessons,
}: {
  moduleName: string;
  lessons: OutlineLesson[];
}) {
  const preview = lessons.slice(0, 6);

  return (
    <div className="flex flex-col gap-6 pt-6">
      <div className="flex flex-col gap-3">
        <div className="text-xs uppercase tracking-[0.08em] text-[#ec3013]">
          Assistant
        </div>
        <p className="text-[15px] leading-[1.6] text-[#e2e2e2]">
          Pick a lesson in the sidebar. I will show the CKA notes here. After you
          read, ask a question about that topic.
        </p>
        {preview.length > 0 ? (
          <p className="text-[15px] leading-[1.6] text-[#e2e2e2]">
            In {moduleName}: {preview.map((lesson) => lesson.title).join(", ")}
            {lessons.length > preview.length ? "…" : "."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
