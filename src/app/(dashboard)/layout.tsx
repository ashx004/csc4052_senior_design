import GeneralSidebar from "@/src/components/GeneralSidebar";
 
export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex h-screen">
      <GeneralSidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
 