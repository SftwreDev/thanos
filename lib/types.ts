export type LessonKind =
  | "lesson"
  | "practice"
  | "mock"
  | "lab"
  | "solution"
  | "intro"
  | "bonus"
  | "resource";

export type Lesson = {
  id: string;
  title: string;
  section: string;
  sectionId: string;
  kind: LessonKind;
  order: number;
  path: string;
  githubUrl: string;
  videoUrl: string | null;
  headings: string[];
  bullets: string[];
  commands: string[];
  references: { label: string; url: string }[];
  content: string;
  searchText: string;
};

export type CourseSection = {
  id: string;
  name: string;
  folder: string;
  trackId: string;
  track: string;
  order: number;
  lessonIds: string[];
};

export type CourseTrack = {
  id: string;
  name: string;
  sectionIds: string[];
};

export type Course = {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  source: { name: string; url: string };
  tracks: CourseTrack[];
  sections: CourseSection[];
  lessons: Lesson[];
};

export type OutlineLesson = {
  id: string;
  title: string;
  kind: LessonKind;
};

export type OutlineSection = {
  id: string;
  name: string;
  trackId: string;
  track: string;
  order: number;
  lessons: OutlineLesson[];
};

export type CourseOutline = {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  source: { name: string; url: string };
  tracks: {
    id: string;
    name: string;
    sections: OutlineSection[];
  }[];
};

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  kind?: "notes";
  source?: "course" | "web";
  citations?: Citation[];
};

export type Citation = {
  title: string;
  url: string;
  detail?: string;
};

export type WebHit = {
  title: string;
  url: string;
  snippet: string;
};
