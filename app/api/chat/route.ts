import { composeCourseAnswer, composeWebAnswer, courseContext, webContext } from "@/lib/compose";
import { COURSE_MATCH_THRESHOLD, retrieve } from "@/lib/retrieve";
import { hasLlm, streamLlm } from "@/lib/llm";
import { searchWeb } from "@/lib/web-search";

export const runtime = "nodejs";

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
  kind?: "notes";
};

export async function POST(request: Request) {
  const body = (await request.json()) as {
    messages?: IncomingMessage[];
    moduleId?: string;
    lessonId?: string;
  };

  const messages = body.messages ?? [];
  const query = [...messages].reverse().find((message) => message.role === "user")
    ?.content;

  if (!query?.trim()) {
    return Response.json({ error: "Missing question" }, { status: 400 });
  }

  const retrieved = retrieve(query, {
    lessonId: body.lessonId,
    sectionId: body.moduleId,
  });

  const pinned = retrieved.pinned;
  let hits = retrieved.hits;
  if (pinned && hits[0]?.lesson.id !== pinned.id) {
    hits = [
      { lesson: pinned, score: 99 },
      ...hits.filter((hit) => hit.lesson.id !== pinned.id),
    ].slice(0, 3);
  }

  const useCourse =
    Boolean(pinned) ||
    (hits.length > 0 && hits[0].score >= COURSE_MATCH_THRESHOLD);

  const source: "course" | "web" = useCourse ? "course" : "web";
  const webHits = useCourse ? [] : await searchWeb(query);
  const composed = useCourse
    ? composeCourseAnswer(query, hits)
    : composeWebAnswer(webHits);
  const context = useCourse
    ? courseContext(hits, pinned?.id)
    : webContext(webHits);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      send({
        type: "meta",
        source,
        citations: composed.citations,
        lessonIds: useCourse ? hits.map((hit) => hit.lesson.id) : [],
      });

      try {
        if (hasLlm() && context.trim()) {
          const history = messages
            .filter((message) => message.kind !== "notes")
            .slice(0, -1)
            .map((message) => ({
              role: message.role,
              content: message.content,
            }));
          let streamed = false;
          for await (const delta of streamLlm({
            query,
            history,
            source,
            context,
            openLesson: pinned?.title,
          })) {
            streamed = true;
            send({ type: "delta", text: delta });
          }
          if (!streamed) send({ type: "delta", text: composed.text });
        } else {
          send({ type: "delta", text: composed.text });
        }
      } catch (error) {
        console.error("Tutor LLM failed, using notes/web compose:", error);
        send({ type: "delta", text: composed.text });
      }

      send({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
