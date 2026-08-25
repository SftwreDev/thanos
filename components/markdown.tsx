"use client";

import { useState, type ReactNode } from "react";

const GITHUB_RAW =
  "https://raw.githubusercontent.com/kodekloudhub/certified-kubernetes-administrator-course/master/";

function githubFallback(src: string): string | null {
  const rel = src.replace(/^\/api\/course-assets\//, "");
  if (rel === src) return null;
  return GITHUB_RAW + rel;
}

function CourseImage({ alt, src }: { alt: string; src: string }) {
  const [current, setCurrent] = useState(src);
  const fallback = githubFallback(src);

  return (
    <img
      alt={alt}
      src={current}
      onError={() => {
        if (fallback && current !== fallback) setCurrent(fallback);
      }}
      className="block h-auto w-full max-w-full border border-[#2b2b2b] bg-[#1a1a1a]"
    />
  );
}

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re =
    /(!\[[^\]]*\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)]+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(text))) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const token = match[0];
    if (token.startsWith("![")) {
      const alt = token.slice(2, token.indexOf("]"));
      const src = token.slice(token.indexOf("(") + 1, -1);
      parts.push(<CourseImage key={key} alt={alt} src={src} />);
    } else if (token.startsWith("`")) {
      parts.push(
        <span key={key} className="font-mono text-[#c9c9c9]">
          {token.slice(1, -1)}
        </span>,
      );
    } else if (token.startsWith("**")) {
      parts.push(
        <strong key={key} className="font-semibold text-[#f3f2f2]">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("[")) {
      const label = token.slice(1, token.indexOf("]"));
      const href = token.slice(token.indexOf("(") + 1, -1);
      parts.push(
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-[#f3f2f2] underline decoration-[#3a3a3a] underline-offset-2 hover:decoration-[#ec3013]"
        >
          {label}
        </a>,
      );
    } else {
      parts.push(
        <a
          key={key}
          href={token}
          target="_blank"
          rel="noreferrer"
          className="break-all text-[#f3f2f2] underline decoration-[#3a3a3a] underline-offset-2 hover:decoration-[#ec3013]"
        >
          {token}
        </a>,
      );
    }
    key += 1;
    last = match.index + token.length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function headingClass(level: number): string {
  if (level <= 1) return "text-xl font-bold leading-snug text-[#f3f2f2]";
  if (level === 2) return "text-lg font-semibold leading-snug text-[#f3f2f2]";
  return "font-semibold leading-snug text-[#f3f2f2]";
}

function renderProse(text: string, keyPrefix: string): ReactNode[] {
  const lines = text.replace(/<br\s*\/?>/gi, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  let key = 0;

  const flushList = () => {
    if (!list || list.items.length === 0) {
      list = null;
      return;
    }
    const Tag = list.ordered ? "ol" : "ul";
    const items = list.items;
    nodes.push(
      <Tag
        key={`${keyPrefix}-list-${key}`}
        className={`flex flex-col gap-1 text-[15px] leading-[1.6] text-[#e2e2e2] ${
          list.ordered ? "list-decimal pl-5" : "list-disc pl-5"
        }`}
      >
        {items.map((item, itemIndex) => (
          <li key={itemIndex}>{inline(item)}</li>
        ))}
      </Tag>,
    );
    key += 1;
    list = null;
  };

  const flushPara = () => {
    if (para.length === 0) return;
    nodes.push(
      <p
        key={`${keyPrefix}-p-${key}`}
        className="text-[15px] leading-[1.6] text-[#e2e2e2]"
      >
        {inline(para.join(" "))}
      </p>,
    );
    key += 1;
    para = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const image = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    const ul = trimmed.match(/^[-*]\s+(.+)$/);
    const ol = trimmed.match(/^\d+[.)]\s+(.+)$/);

    if (image) {
      flushList();
      flushPara();
      nodes.push(
        <CourseImage
          key={`${keyPrefix}-img-${key}`}
          alt={image[1]}
          src={image[2]}
        />,
      );
      key += 1;
      continue;
    }

    if (heading) {
      flushList();
      flushPara();
      nodes.push(
        <p
          key={`${keyPrefix}-h-${key}`}
          className={headingClass(heading[1].length)}
        >
          {inline(heading[2])}
        </p>,
      );
      key += 1;
      continue;
    }

    if (ul) {
      flushPara();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(ul[1]);
      continue;
    }

    if (ol) {
      flushPara();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ol[1]);
      continue;
    }

    if (!trimmed) {
      flushList();
      flushPara();
      continue;
    }

    flushList();
    para.push(trimmed);
  }

  flushList();
  flushPara();
  return nodes;
}

export function Markdown({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/```/);

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, index) => {
        if (index % 2 === 1) {
          const code = block.replace(/^[a-zA-Z]+\n/, "").replace(/\n$/, "");
          return (
            <pre
              key={index}
              className="whitespace-pre-wrap border border-[#2b2b2b] bg-[#1a1a1a] px-4 py-3.5 font-mono text-[13px] leading-[1.7] text-[#c9c9c9]"
            >
              {code.trim()}
            </pre>
          );
        }

        return renderProse(block, String(index));
      })}
    </div>
  );
}
