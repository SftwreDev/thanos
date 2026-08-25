import raw from "@/data/cka-course.json";
import type { Course, CourseOutline, Lesson, OutlineLesson } from "@/lib/types";

export const course = raw as Course;

const lessonsById = new Map(course.lessons.map((lesson) => [lesson.id, lesson]));
const sectionsById = new Map(course.sections.map((section) => [section.id, section]));

export function getLesson(id: string): Lesson | undefined {
  return lessonsById.get(id);
}

function toOutlineLesson(lesson: Lesson): OutlineLesson {
  return { id: lesson.id, title: lesson.title, kind: lesson.kind };
}

export function getSidebar(): CourseOutline {
  return {
    id: course.id,
    title: course.title,
    shortTitle: course.shortTitle,
    description: course.description,
    source: course.source,
    tracks: course.tracks.map((track) => ({
      id: track.id,
      name: track.name,
      sections: track.sectionIds
        .map((id) => sectionsById.get(id))
        .filter((section): section is NonNullable<typeof section> => Boolean(section))
        .map((section) => ({
          id: section.id,
          name: section.name,
          trackId: section.trackId,
          track: section.track,
          order: section.order,
          lessons: section.lessonIds
            .map((id) => lessonsById.get(id))
            .filter((lesson): lesson is Lesson => Boolean(lesson))
            .map(toOutlineLesson),
        })),
    })),
  };
}
