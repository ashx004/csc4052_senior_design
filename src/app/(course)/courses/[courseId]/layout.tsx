import CourseSidebar from "@/src/components/Sidebar/CourseSidebar";
 
export default async function CourseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
 
  return (
    <div className="flex h-screen">
      <CourseSidebar courseId={courseId} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
 