import GeneralSidebar from "@/src/components/Sidebar/GeneralSidebar";
import AIPanel from "@/src/components/aiPanel/AIPanel";
import { AIPageContextProvider } from "@/src/context/AIPageContext";
import { AdvisingCacheProvider } from "@/src/context/AdvisingCacheContext";
import { CalendarCacheProvider } from "@/src/context/CalendarCacheContext";
import NotificationToast from "@/src/components/studyPlan/NotificationToast";

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AIPageContextProvider>
      <AdvisingCacheProvider>
        <CalendarCacheProvider>
          <NotificationToast />
          <div className="flex h-screen">
            <GeneralSidebar />
            {/* pt-16 on phones: clears the fixed menu button (Sidebar.tsx), which
                is always showing there and otherwise sits on the page heading. */}
            <main className="flex-1 overflow-y-auto pt-16 md:pt-0">{children}</main>
            <AIPanel />
          </div>
        </CalendarCacheProvider>
      </AdvisingCacheProvider>
    </AIPageContextProvider>
  );
}
