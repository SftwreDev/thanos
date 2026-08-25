import fs from "node:fs";
import path from "node:path";

export const COURSE_ROOT = path.resolve(
  process.cwd(),
  "certified-kubernetes-administrator-course",
);

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"]);

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
};

function isInsideCourse(abs: string): boolean {
  const root = path.resolve(COURSE_ROOT);
  const resolved = path.resolve(abs);
  return resolved === root || resolved.startsWith(root + path.sep);
}

export function resolveCourseAsset(relParts: string[]): {
  abs: string;
  contentType: string;
} | null {
  if (relParts.length === 0) return null;
  const abs = path.resolve(COURSE_ROOT, ...relParts);
  if (!isInsideCourse(abs)) return null;
  const ext = path.extname(abs).toLowerCase();
  if (!IMAGE_EXT.has(ext)) return null;
  return { abs, contentType: MIME[ext] ?? "application/octet-stream" };
}

export function readLessonMarkdown(relPath: string): string | null {
  const abs = path.resolve(COURSE_ROOT, relPath);
  if (!isInsideCourse(abs) || !fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, "utf8");
}

function toCourseAssetUrl(relPosix: string): string {
  const encoded = relPosix
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `/api/course-assets/${encoded}`;
}

export function rewriteCourseImages(markdown: string, mdRelPath: string): string {
  const mdDir = path.posix.dirname(mdRelPath.replaceAll("\\", "/"));
  return markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt: string, href: string) => {
    const src = href.trim().replace(/^<|>$/g, "");
    if (/^https?:\/\//i.test(src) || src.startsWith("/api/course-assets/")) {
      return `![${alt}](${src})`;
    }
    const cleaned = src.split(/[?#]/)[0];
    const joined = path.posix.normalize(`${mdDir}/${cleaned}`);
    if (joined.startsWith("../") || joined === "..") {
      return `![${alt}](${src})`;
    }
    return `![${alt}](${toCourseAssetUrl(joined)})`;
  });
}
