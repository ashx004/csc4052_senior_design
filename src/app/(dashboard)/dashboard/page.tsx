import DashboardCard from '@/src/components/dashboard/DashboardCard';

export default function Dashboard() {
  return (
    <div className="flex min-h-screen flex-col items-center bg-[#FAF7F0] px-8 py-12">
      <div className="w-full max-w-4xl">
        <h1 className="text-center text-2xl font-bold text-[#3D3A34]">
          What Would You Like To Do?
        </h1>

        <div className="mt-8 grid grid-cols-1 place-items-center gap-6 sm:grid-cols-2 md:grid-cols-3">
          {/* TODO: Route to /notes when Notes feature is implemented */}
          <DashboardCard
            icon="/icons/notebook-pen.png"
            title="Notes"
            description="Create and manage your notes"
            href="/dashboard"
          />
          <DashboardCard
            icon="/icons/book-open.png"
            title="Learning"
            description="Access learning materials here"
            href="/learning"
          />
          <DashboardCard
            icon="/icons/user-pen.png"
            title="Advising"
            description="Discuss your academic plans"
            href="/advising"
          />
          <DashboardCard
            icon="/icons/calendar-days.png"
            title="Schedule"
            description="Manage your academic and personal calendar"
            href="/calendar"
          />
          <DashboardCard
            icon="/icons/summary.png"
            title="Summary"
            description="View your class resources"
            href="/summary"
          />
          <DashboardCard
            icon="/icons/bot-message-square.png"
            title="AI Chat"
            description="Chat with our AI assistant"
            href="/ai-assistant"
          />
        </div>
      </div>
    </div>
  );
}