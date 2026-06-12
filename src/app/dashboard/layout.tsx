import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Workspace",
  description: "Manage your links, review real-time visitor traffic and analytics.",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
