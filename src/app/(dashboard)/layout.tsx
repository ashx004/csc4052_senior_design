import GeneralSidebar from "@/src/components/Sidebar/GeneralSidebar";
import AIPanel from "@/src/components/aiPanel/AIPanel";
import TopBar from "@/src/components/search/TopBar";
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
            {/* The top bar (site search) also holds the phones' fixed menu
                button (Sidebar.tsx), so pages no longer need padding to clear it. */}
            <div className="flex min-w-0 flex-1 flex-col">
              <TopBar />
              <main className="min-w-0 flex-1">{children}</main>
            </div>
            <AIPanel />
          </div>
        </CalendarCacheProvider>
      </AdvisingCacheProvider>
    </AIPageContextProvider>
  );
}
