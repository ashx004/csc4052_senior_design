import GeneralSidebar from "@/src/components/Sidebar/GeneralSidebar";
import AIPanel from "@/src/components/aiPanel/AIPanel";
import { AIPageContextProvider } from "@/src/context/AIPageContext";
import { AdvisingCacheProvider } from "@/src/context/AdvisingCacheContext";
import { CalendarCacheProvider } from "@/src/context/CalendarCacheContext";

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AIPageContextProvider>
      <AdvisingCacheProvider>
        <CalendarCacheProvider>
          <div className="flex min-h-screen">
            <GeneralSidebar />
            {/* pt-16 on phones: clears the fixed menu button (Sidebar.tsx), which
                is always showing there and otherwise sits on the page heading. */}
            <main className="min-w-0 flex-1 pt-16 md:pt-0">{children}</main>
            <AIPanel />
          </div>
        </CalendarCacheProvider>
      </AdvisingCacheProvider>
    </AIPageContextProvider>
  );
}
