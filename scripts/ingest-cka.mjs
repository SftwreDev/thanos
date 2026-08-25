import fs from "node:fs";
import path from "node:path";

const COURSE_ROOT = path.resolve("certified-kubernetes-administrator-course");
const README = path.join(COURSE_ROOT, "README.md");
const OUT_FILE = path.resolve("data/cka-course.json");
const SOURCE_REPO =
  "https://github.com/kodekloudhub/certified-kubernetes-administrator-course";
const BLOB_BASE = `${SOURCE_REPO}/blob/master`;

const TRACKS = [
  {
    id: "foundations",
    name: "Foundations",
    folders: ["01-Introduction", "02-Core-Concepts"],
  },
  {
    id: "workloads",
    name: "Workloads",
    folders: ["03-Scheduling", "05-Application-Lifecycle-Management"],
  },
  {
    id: "operations",
    name: "Operations",
    folders: ["04-Logging-and-Monitoring", "06-Cluster-Maintenance"],
  },
  { id: "security", name: "Security", folders: ["07-Security"] },
  { id: "storage", name: "Storage", folders: ["08-Storage"] },
  { id: "networking", name: "Networking", folders: ["09-Networking"] },
  {
    id: "cluster-setup",
    name: "Cluster Setup",
    folders: [
      "10-Design-and-Install-Kubernetes-Cluster",
      "11-Install-Kubernetes-the-kubeadm-way",
      "kubeadm-clusters",
      "managed-clusters",
      "apple-silicon",
    ],
  },
  { id: "troubleshooting", name: "Troubleshooting", folders: ["12-Troubleshooting"] },
  {
    id: "exam-prep",
    name: "Exam Prep",
    folders: [
      "13-Other-Topics",
      "14-Lightning-Labs",
      "15-Mock-Exams",
      "16-Ultimate-Mocks",
      "17-tips-and-tricks",
    ],
  },
];

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function prettyName(label) {
  return label
    .replace(/^\.\/+/, "")
    .replace(/\/$/, "")
    .split("/")
    .pop()
    .replace(/\.md$/i, "")
    .replace(/^\d+[.-]\s*/, "")
    .replace(/^\d+[.-]/, "")
    .replace(/--+/g, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trackForFolder(folder) {
  const hit = TRACKS.find((track) =>
    track.folders.some(
      (name) => folder === name || folder.startsWith(`${name}/`) || folder.startsWith(name),
    ),
  );
  return hit ?? { id: "more", name: "More" };
}

function classify(rel, title) {
  const hay = `${rel} ${title}`.toLowerCase();
  if (/download-presentation|dowload-presentation|attachments|spreadsheet/.test(hay)) {
    return "resource";
  }
  if (hay.includes("bonus") || rel.startsWith("kubeadm-clusters") || rel.startsWith("managed-clusters")) {
    return "bonus";
  }
  if (hay.includes("practice-test") || hay.includes("practice test")) return "practice";
  if (hay.includes("lightning")) return "lab";
  if (hay.includes("solution")) return "solution";
  if (hay.includes("mock")) return "mock";
  if (hay.includes("pre-requisite") || hay.includes("prerequisite")) return "lesson";
  if (hay.includes("introduction") || /(^|\/)readme\.md$/i.test(rel)) return "intro";
  return "lesson";
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "images") continue;
      files.push(...walk(full));
    } else if (entry.name.toLowerCase().endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}

function parseReadme(text) {
  const sections = [];
  let current = null;
  const linkRe = /^(\s*)-\s+\[([^\]]+)\]\(([^)]+)\)/;

  for (const line of text.split("\n")) {
    const match = line.match(linkRe);
    if (!match) continue;
    const indent = match[1].length;
    const label = match[2].trim();
    let href = match[3].trim().replace(/\\ /g, " ");
    href = href.replace(/^\.\//, "").replace(/\/$/, "");

    if (indent < 2) {
      const folder = href.replace(/^docs\//, "").split("/")[0];
      current = {
        folder,
        href,
        name: prettyName(label),
        items: [],
      };
      sections.push(current);
    } else if (current) {
      current.items.push({
        label: prettyName(label),
        href: href.replace(/^docs\//, href.startsWith("docs/") ? "docs/" : ""),
      });
    }
  }
  return sections;
}

function resolveHref(href) {
  const cleaned = href.replace(/^\.\//, "");
  const candidates = [
    path.join(COURSE_ROOT, cleaned),
    path.join(COURSE_ROOT, "docs", cleaned),
    path.join(COURSE_ROOT, cleaned.startsWith("docs/") ? cleaned : `docs/${cleaned}`),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function parseMarkdown(filePath, fallbackTitle) {
  const raw = fs.readFileSync(filePath, "utf8");
  const titleMatch = raw.match(/^#\s+(.+)$/m);
  const title = (titleMatch?.[1] || fallbackTitle).trim();
  const videoMatch = raw.match(
    /\[(?:Video Tutorial|Lecture|Hands on Labs|[^\]]+)\]\((https:\/\/kodekloud\.com[^)]+)\)/i,
  );
  const withoutImages = raw.replace(/!\[[^\]]*\]\([^)]+\)/g, "");
  const headings = [...withoutImages.matchAll(/^#{2,3}\s+(.+)$/gm)].map((m) =>
    m[1].replace(/[*`]/g, "").trim(),
  );
  const commands = [...withoutImages.matchAll(/```[^\n]*\n([\s\S]*?)```/g)]
    .map((m) => m[1].trim())
    .filter((block) => /kubectl|kubeadm|etcdctl|crictl|wget|curl|systemctl/.test(block))
    .slice(0, 8);
  const bullets = [...withoutImages.matchAll(/^\s*[-*]\s+(?:\*\*`?)?(.+)$/gm)]
    .map((m) =>
      m[1]
        .replace(/\*\*`?/g, "")
        .replace(/`/g, "")
        .replace(/\*\*/g, "")
        .trim(),
    )
    .filter((line) => line.length > 12 && !/^take me to/i.test(line))
    .slice(0, 10);

  let content = withoutImages
    .replace(/^#\s+.+$/m, "")
    .replace(/^\s*-\s+Take me to.+$/gim, "")
    .replace(/\[(?:Video Tutorial|Lecture)\]\([^)]+\)/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (content.length < 40) {
    content = videoMatch
      ? `${title} is covered in the KodeKloud CKA lecture. Repo notes are a stub — watch the video, then ask follow-up questions.`
      : `${title} is part of the CKA course outline.`;
  }

  return { title, videoUrl: videoMatch?.[1] ?? null, headings, commands, bullets, content };
}

function buildLesson(absPath, section, fallbackTitle, order) {
  const rel = path.relative(COURSE_ROOT, absPath).replaceAll(path.sep, "/");
  const parsed = parseMarkdown(absPath, fallbackTitle);
  const title = prettyName(fallbackTitle || parsed.title);
  const kind = classify(rel, title);
  const id = slugify(rel.replace(/\.md$/i, ""));

  return {
    id,
    title: title || parsed.title,
    section: section.name,
    sectionId: section.id,
    kind,
    order,
    path: rel,
    githubUrl: `${BLOB_BASE}/${rel}`,
    videoUrl: parsed.videoUrl,
    headings: parsed.headings,
    bullets: parsed.bullets,
    commands: parsed.commands,
    references: [],
    content: parsed.content,
    searchText: `${title} ${section.name} ${parsed.headings.join(" ")} ${parsed.bullets.join(" ")} ${parsed.content}`
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  };
}

const readme = fs.readFileSync(README, "utf8");
const readmeSections = parseReadme(readme);

const sections = readmeSections.map((item, index) => {
  const track = trackForFolder(item.folder);
  return {
    id: slugify(item.name) || slugify(item.folder),
    name: item.name,
    folder: item.folder,
    href: item.href,
    trackId: track.id,
    track: track.name,
    order: index + 1,
    readmeItems: item.items,
    lessonIds: [],
  };
});

const sectionByFolder = new Map(sections.map((section) => [section.folder, section]));

function sectionForRel(rel) {
  const parts = rel.split("/");
  if (parts[0] === "docs" && parts[1]) return sectionByFolder.get(parts[1]);
  return sectionByFolder.get(parts[0]) ?? null;
}

const seenFiles = new Set();
const lessons = [];

function addLesson(absPath, section, fallbackTitle) {
  if (!absPath || !fs.existsSync(absPath)) return;
  const stat = fs.statSync(absPath);
  if (stat.isDirectory()) {
    for (const file of walk(absPath)) {
      addLesson(file, section, prettyName(path.basename(file, ".md")));
    }
    return;
  }
  const rel = path.relative(COURSE_ROOT, absPath);
  if (seenFiles.has(rel)) return;
  if (rel === "README.md") return;
  seenFiles.add(rel);
  const lesson = buildLesson(absPath, section, fallbackTitle, section.lessonIds.length + 1);
  lessons.push(lesson);
  section.lessonIds.push(lesson.id);
}

for (const section of sections) {
  for (const item of section.readmeItems) {
    const resolved = resolveHref(item.href);
    if (resolved && fs.statSync(resolved).isDirectory()) continue;
    addLesson(resolved, section, item.label);
  }
}

for (const file of walk(path.join(COURSE_ROOT, "docs"))) {
  const rel = path.relative(COURSE_ROOT, file).replaceAll(path.sep, "/");
  const section = sectionForRel(rel);
  if (!section) continue;
  addLesson(file, section, prettyName(path.basename(file, ".md")));
}

for (const extra of [
  { folder: "kubeadm-clusters", name: "Kubeadm Cluster Labs" },
  { folder: "managed-clusters", name: "Managed Cluster Labs" },
]) {
  const dir = path.join(COURSE_ROOT, extra.folder);
  if (!fs.existsSync(dir)) continue;
  const track = trackForFolder(extra.folder);
  const section = {
    id: slugify(extra.name),
    name: extra.name,
    folder: extra.folder,
    href: extra.folder,
    trackId: track.id,
    track: track.name,
    order: sections.length + 1,
    readmeItems: [],
    lessonIds: [],
  };
  sections.push(section);
  sectionByFolder.set(extra.folder, section);
  for (const file of walk(dir)) {
    const rel = path.relative(COURSE_ROOT, file).replaceAll(path.sep, "/");
    const parts = rel.split("/");
    const lab = prettyName(parts[1] || extra.name);
    const fileTitle = prettyName(path.basename(file, ".md"));
    const title =
      fileTitle.toLowerCase() === "readme"
        ? `${lab} overview`
        : `${lab} · ${fileTitle}`;
    addLesson(file, section, title);
  }
}

const course = {
  id: "cka",
  title: "Certified Kubernetes Administrator",
  shortTitle: "CKA",
  description:
    "KodeKloud CKA notes, mapped from the course README into searchable modules.",
  source: {
    name: "kodekloudhub/certified-kubernetes-administrator-course",
    url: SOURCE_REPO,
  },
  tracks: TRACKS.map((track) => ({
    id: track.id,
    name: track.name,
    sectionIds: sections.filter((section) => section.trackId === track.id).map((s) => s.id),
  })).filter((track) => track.sectionIds.length > 0),
  sections: sections.map(({ readmeItems, href, ...section }) => section),
  lessons,
};

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(course, null, 2));
console.log(
  `Wrote ${lessons.length} lessons across ${sections.length} modules / ${course.tracks.length} tracks`,
);
console.log(course.tracks.map((t) => `${t.name}: ${t.sectionIds.length} modules`).join("\n"));
