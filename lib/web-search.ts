import type { WebHit } from "@/lib/types";

const UA = "ThanosLMS/0.1 (CKA tutor; +https://localhost)";

async function fetchText(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json, text/html" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function decodeDuckHref(href: string): string {
  try {
    const url = new URL(href, "https://duckduckgo.com");
    const target = url.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : href;
  } catch {
    return href;
  }
}

async function searchDuckDuckGo(query: string): Promise<WebHit[]> {
  const html = await fetchText(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
  );
  if (!html) return [];

  const hits: WebHit[] = [];
  const linkRe =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
  const snippets = [...html.matchAll(snippetRe)].map((match) =>
    stripHtml(match[1]),
  );

  let index = 0;
  for (const match of html.matchAll(linkRe)) {
    const url = decodeDuckHref(match[1]);
    if (!/^https?:\/\//.test(url)) continue;
    if (url.includes("duckduckgo.com")) continue;
    hits.push({
      title: stripHtml(match[2]).slice(0, 140) || url,
      url,
      snippet: snippets[index] ?? "",
    });
    index += 1;
    if (hits.length >= 4) break;
  }
  return hits;
}

async function searchWikipedia(query: string): Promise<WebHit[]> {
  const raw = await fetchText(
    `https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(query)}&limit=3`,
  );
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as {
      pages?: { title: string; description?: string; key?: string; excerpt?: string }[];
    };
    return (data.pages ?? []).slice(0, 3).map((page) => ({
      title: page.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.key || page.title)}`,
      snippet: page.description || stripHtml(page.excerpt || ""),
    }));
  } catch {
    return [];
  }
}

export async function searchWeb(query: string): Promise<WebHit[]> {
  const [ddg, wiki] = await Promise.all([
    searchDuckDuckGo(query),
    searchWikipedia(query),
  ]);

  const seen = new Set<string>();
  const merged: WebHit[] = [];
  for (const hit of [...ddg, ...wiki]) {
    if (seen.has(hit.url)) continue;
    seen.add(hit.url);
    merged.push(hit);
  }
  return merged.slice(0, 5);
}
