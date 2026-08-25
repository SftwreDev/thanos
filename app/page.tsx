import { LmsApp } from "@/components/lms-app";
import { getSidebar } from "@/lib/course";

export default function Home() {
  return <LmsApp course={getSidebar()} />;
}
