export default async function CourseLearning({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Learning — Course {courseId}</h1>
    </div>
  );
}
