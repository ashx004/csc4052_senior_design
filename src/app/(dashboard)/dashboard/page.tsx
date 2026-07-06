import DashboardCard from '@/src/components/dashboard/DashboardCard';

export default function Dashboard() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold" style={{ height: '40px', paddingLeft: '40px' }}>
        What Would You Like To Do?
      </h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
        <DashboardCard
          icon="/icons/notebook-pen.png"
          title="Notes"
          description="Create and manage your notes"
          href="/notes"
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
  );
}
