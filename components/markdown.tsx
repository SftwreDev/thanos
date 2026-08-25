import type { ReactNode } from "react";

function CourseImage({ alt, src }: { alt: string; src: string }) {
  return (
    <img
      alt={alt}
      src={src}
      className="my-1 max-w-full border border-[#2b2b2b] bg-[#1a1a1a]"
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

function renderBlock(block: string, index: number) {
  return block
    .split(/\n\n+/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para, paraIndex) => {
      const key = `${index}-${paraIndex}`;
      const heading = para.match(/^(#{1,6})\s+([\s\S]+)$/);
      if (heading && !heading[2].includes("![")) {
        const text = heading[2].replace(/\n+/g, " ").trim();
        return (
          <p key={key} className="font-semibold text-[#f3f2f2]">
            {inline(text)}
          </p>
        );
      }

      const imageOnly = para.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imageOnly) {
        return <CourseImage key={key} alt={imageOnly[1]} src={imageOnly[2]} />;
      }

      if (para.includes("![") && para.includes("\n")) {
        return (
          <div key={key} className="flex flex-col gap-3">
            {para.split("\n").map((line, lineIndex) => {
              const trimmed = line.trim();
              if (!trimmed) return null;
              const img = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
              if (img) {
                return <CourseImage key={lineIndex} alt={img[1]} src={img[2]} />;
              }
              const subHeading = trimmed.match(/^(#{1,6})\s+(.+)$/);
              if (subHeading) {
                return (
                  <p key={lineIndex} className="font-semibold text-[#f3f2f2]">
                    {inline(subHeading[2])}
                  </p>
                );
              }
              return (
                <p
                  key={lineIndex}
                  className="text-[15px] leading-[1.6] text-[#e2e2e2]"
                >
                  {inline(trimmed)}
                </p>
              );
            })}
          </div>
        );
      }

      const lines = para.split(/\n/).filter((line) => line.trim());
      const listLike = lines.every((line) => /^[-*]\s+/.test(line.trim()));
      if (listLike) {
        return (
          <ul
            key={key}
            className="flex flex-col gap-1 text-[15px] leading-[1.6] text-[#e2e2e2]"
          >
            {lines.map((item, itemIndex) => (
              <li key={itemIndex}>{inline(item.replace(/^[-*]\s+/, ""))}</li>
            ))}
          </ul>
        );
      }

      return (
        <p key={key} className="text-[15px] leading-[1.6] text-[#e2e2e2]">
          {inline(para)}
        </p>
      );
    });
}

export function Markdown({ text }: { text: string }) {
  const blocks = text.split(/```/);

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

        return renderBlock(block, index);
      })}
    </div>
  );
}
