export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-gray-200">
        {/* TODO: dashboard navigation */}
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}
