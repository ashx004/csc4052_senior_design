export default function CourseLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-gray-200">
        {/* TODO: course navigation (notes, learning, summaries, assignments, due dates) */}
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}
