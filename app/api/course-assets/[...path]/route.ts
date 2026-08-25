import { promises as fs } from "node:fs";
import { resolveCourseAsset } from "@/lib/course-files";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path: parts } = await context.params;
  const asset = resolveCourseAsset((parts ?? []).map((part) => decodeURIComponent(part)));
  if (!asset) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const data = await fs.readFile(asset.abs);
    return new Response(data, {
      headers: {
        "Content-Type": asset.contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
