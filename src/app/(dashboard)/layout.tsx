import GeneralSidebar from "@/src/components/Sidebar/GeneralSidebar";
import AIPanel from "@/src/components/aiPanel/AIPanel";
import { AIPageContextProvider } from "@/src/context/AIPageContext";
import { AdvisingCacheProvider } from "@/src/context/AdvisingCacheContext";

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AIPageContextProvider>
      <AdvisingCacheProvider>
        <div className="flex h-screen">
          <GeneralSidebar />
          <main className="flex-1 overflow-y-auto">{children}</main>
          <AIPanel />
        </div>
      </AdvisingCacheProvider>
    </AIPageContextProvider>
  );
}
 