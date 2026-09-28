import PageTutorial from '@/src/components/tutorial/PageTutorial';
import dashboardSteps from '@/src/library/tutorials/steps/dashboard';
import DashboardHome from '@/src/components/dashboard/DashboardHome';

export default function Dashboard() {
  return (
    <>
      <PageTutorial id="dashboard" steps={dashboardSteps} />
      <DashboardHome />
    </>
  );
}
