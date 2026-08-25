import type { ScoredLesson } from "@/lib/retrieve";
import type { Citation, Lesson, WebHit } from "@/lib/types";
import { readLessonMarkdown, rewriteCourseImages } from "@/lib/course-files";

function keepMarkdown(content: string): string {
  return content
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/^#\s+.+$/m, "")
    .replace(/^\s*-\s+Take me to.+$/gim, "")
    .replace(/\[(?:Video Tutorial|Lecture)\]\([^)]+\)/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/^(#{1,6}\s+.+)$/gm, "\n$1\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatLessonNotes(lesson: Lesson): string {
  const raw = readLessonMarkdown(lesson.path) ?? lesson.content;
  const body = keepMarkdown(rewriteCourseImages(raw, lesson.path));
  const parts = [`**${lesson.title}** — ${lesson.section}`];
  if (body) parts.push(body);
  if (lesson.videoUrl) {
    parts.push(`Lecture: [${lesson.videoUrl}](${lesson.videoUrl})`);
  }
  parts.push(`Source: [${lesson.path}](${lesson.githubUrl})`);
  parts.push("Ask a question about this lesson below.");
  return parts.join("\n\n");
}

function tidy(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*#+\s+/gm, "")
    .replace(/\*\*`?/g, "")
    .replace(/`+/g, "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstParagraphs(text: string, maxChars = 1200): string {
  const blocks = tidy(text)
    .split(/\n+/)
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter((line) => line.length > 20 && !/^k8s reference/i.test(line));

  const out: string[] = [];
  let used = 0;
  for (const block of blocks) {
    if (used >= maxChars) break;
    out.push(block);
    used += block.length;
  }
  return out.join("\n\n");
}

export function composeCourseAnswer(
  query: string,
  hits: ScoredLesson[],
): { text: string; citations: Citation[] } {
  const primary = hits[0]?.lesson;
  if (!primary) {
    return { text: "No matching CKA notes for that question.", citations: [] };
  }

  const parts: string[] = [
    `This is in the CKA notes — ${primary.section} → ${primary.title}.`,
  ];

  const body = firstParagraphs(primary.content);
  if (body) parts.push(body);

  if (primary.commands[0]) {
    const command = primary.commands[0].replace(/^\$\s*/gm, "").trim();
    parts.push("```\n" + command + "\n```");
  }

  if (hits.length > 1) {
    const related = hits
      .slice(1)
      .map((hit) => hit.lesson.title)
      .join(", ");
    parts.push(`Related lessons: ${related}.`);
  }

  if (primary.videoUrl) {
    parts.push(`Lecture: ${primary.videoUrl}`);
  }

  void query;

  return {
    text: parts.join("\n\n"),
    citations: hits.map((hit) => ({
      title: hit.lesson.title,
      url: hit.lesson.githubUrl,
      detail: hit.lesson.section,
    })),
  };
}

export function composeWebAnswer(
  hits: WebHit[],
): { text: string; citations: Citation[] } {
  if (hits.length === 0) {
    return {
      text: "This is not in the CKA notes, and the web lookup returned nothing useful. Try a more specific Kubernetes topic.",
      citations: [],
    };
  }

  const primary = hits[0];
  const extra = hits
    .slice(1, 3)
    .map((hit) => `- ${hit.title}: ${hit.snippet || hit.url}`)
    .join("\n");

  const parts = [
    "This is not in the CKA notes, so I looked it up.",
    primary.snippet
      ? `${primary.title}. ${primary.snippet}`
      : `${primary.title}: ${primary.url}`,
  ];
  if (extra) parts.push(extra);

  return {
    text: parts.join("\n\n"),
    citations: hits.map((hit) => ({
      title: hit.title,
      url: hit.url,
      detail: "Web",
    })),
  };
}

export function courseContext(hits: ScoredLesson[], pinnedId?: string): string {
  return hits
    .map((hit) => {
      const lesson = hit.lesson;
      const max = lesson.id === pinnedId ? 12000 : 3500;
      return [
        `# ${lesson.section} / ${lesson.title}`,
        lesson.content.slice(0, max),
        lesson.commands.length ? `Commands:\n${lesson.commands.join("\n\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
    })
    .join("\n\n---\n\n");
}

export function webContext(hits: WebHit[]): string {
  return hits
    .map((hit) => `${hit.title}\n${hit.url}\n${hit.snippet}`)
    .join("\n\n");
}
