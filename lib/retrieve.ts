import { course, getLesson } from "@/lib/course";
import type { Lesson } from "@/lib/types";

const STOP = new Set([
  "a",
  "an",
  "the",
  "of",
  "in",
  "on",
  "to",
  "for",
  "and",
  "or",
  "vs",
  "is",
  "are",
  "was",
  "be",
  "how",
  "what",
  "why",
  "when",
  "where",
  "which",
  "who",
  "does",
  "do",
  "can",
  "you",
  "me",
  "i",
  "we",
  "it",
  "this",
  "that",
  "with",
  "from",
  "about",
  "explain",
  "tell",
  "teach",
  "show",
  "walk",
  "please",
  "help",
  "need",
  "want",
  "learn",
  "difference",
  "between",
]);

const SYNONYMS: Record<string, string[]> = {
  k8s: ["kubernetes", "kube"],
  kubernetes: ["k8s", "kube"],
  kube: ["kubernetes", "k8s"],
  pod: ["pods"],
  pods: ["pod"],
  deploy: ["deployment", "deployments"],
  deployment: ["deployments", "deploy"],
  deployments: ["deployment"],
  replicaset: ["replicasets", "rs"],
  replicasets: ["replicaset"],
  rs: ["replicaset", "replicasets"],
  svc: ["service", "services"],
  service: ["services", "svc"],
  services: ["service", "svc"],
  ns: ["namespace", "namespaces"],
  namespace: ["namespaces", "ns"],
  namespaces: ["namespace"],
  pv: ["persistentvolume", "persistent"],
  pvc: ["persistentvolumeclaim", "claim"],
  persistentvolume: ["pv"],
  persistentvolumeclaim: ["pvc"],
  netpol: ["networkpolicy", "network"],
  networkpolicy: ["netpol"],
  rbac: ["role", "rolebinding", "authorization"],
  etcd: ["etcdctl", "backup"],
  etcdctl: ["etcd"],
  ingress: ["ingresses"],
  cni: ["weave", "network"],
  taint: ["taints", "toleration", "tolerations"],
  taints: ["taint", "tolerations"],
  toleration: ["tolerations", "taint"],
  affinity: ["nodeaffinity"],
  scheduler: ["scheduling"],
  scheduling: ["scheduler"],
  apiserver: ["kube-apiserver", "api"],
  kubelet: ["kubelets"],
  secret: ["secrets"],
  secrets: ["secret"],
  configmap: ["configmaps", "cm"],
  sa: ["serviceaccount", "serviceaccounts"],
  serviceaccount: ["sa"],
};

export const COURSE_MATCH_THRESHOLD = 8;

export type ScoredLesson = {
  lesson: Lesson;
  score: number;
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((token) => token.length > 1 && !STOP.has(token));
}

function expand(tokens: string[]): string[] {
  const out = new Set(tokens);
  for (const token of tokens) {
    for (const synonym of SYNONYMS[token] ?? []) out.add(synonym);
  }
  return [...out];
}

export function retrieve(
  query: string,
  options: { lessonId?: string; sectionId?: string; limit?: number } = {},
): { hits: ScoredLesson[]; pinned?: Lesson } {
  const limit = options.limit ?? 3;
  const tokens = expand(tokenize(query));
  const pinned = options.lessonId ? getLesson(options.lessonId) : undefined;
  const section = options.sectionId
    ? course.sections.find((item) => item.id === options.sectionId)
    : undefined;

  if (tokens.length === 0 && !pinned) {
    return { hits: [] };
  }

  const wantsPractice = /\b(practice|lab|exam|mock)\b/i.test(query);
  const scored: ScoredLesson[] = [];

  for (const lesson of course.lessons) {
    let score = 0;
    const titleTokens = tokenize(lesson.title);
    const headingText = lesson.headings.join(" ").toLowerCase();
    const titleLower = lesson.title.toLowerCase();
    const queryLower = query.toLowerCase().trim();

    if (queryLower.length > 3 && titleLower.includes(queryLower)) {
      score += 24;
    }

    for (const token of tokens) {
      if (titleTokens.includes(token) || titleLower.includes(token)) score += 8;
      if (headingText.includes(token)) score += 3;
      if (lesson.section.toLowerCase().includes(token)) score += 1;
      const freq = lesson.searchText.split(token).length - 1;
      if (freq > 0) score += Math.min(freq, 6);
    }

    if (pinned && lesson.id === pinned.id) score += 28;
    if (section && (section.lessonIds.includes(lesson.id) || lesson.sectionId === section.id)) {
      score += 6;
    }
    if (!wantsPractice && lesson.kind === "lesson") score += 2;
    if (
      wantsPractice &&
      (lesson.kind === "practice" || lesson.kind === "lab" || lesson.kind === "mock")
    ) {
      score += 6;
    }

    if (score > 0) scored.push({ lesson, score });
  }

  scored.sort((a, b) => b.score - a.score);
  let hits = scored
    .filter((hit) => hit.score >= COURSE_MATCH_THRESHOLD)
    .slice(0, limit);

  if (pinned && !hits.some((hit) => hit.lesson.id === pinned.id)) {
    hits = [{ lesson: pinned, score: COURSE_MATCH_THRESHOLD }, ...hits].slice(
      0,
      limit,
    );
  }

  return { hits, pinned };
}
