import { formatLessonNotes } from "@/lib/compose";
import { getLesson } from "@/lib/course";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const lesson = getLesson(decodeURIComponent(id));
  if (!lesson) {
    return Response.json({ error: "Lesson not found" }, { status: 404 });
  }

  return Response.json({
    id: lesson.id,
    title: lesson.title,
    section: lesson.section,
    sectionId: lesson.sectionId,
    kind: lesson.kind,
    githubUrl: lesson.githubUrl,
    videoUrl: lesson.videoUrl,
    notes: formatLessonNotes(lesson),
  });
}
