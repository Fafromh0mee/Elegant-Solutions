export default function GateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Gate layout - no navbar, full screen kiosk mode
  return <div className="min-h-screen">{children}</div>;
}
