export default async function CourseOverview({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Course {courseId}</h1>
    </div>
  );
}
