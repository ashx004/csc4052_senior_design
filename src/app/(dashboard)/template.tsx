// A template (unlike a layout) mounts fresh on every navigation inside the
// dashboard, which is what lets each page ease in instead of snapping.
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-fade">{children}</div>;
}
