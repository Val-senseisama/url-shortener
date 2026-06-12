import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Control Panel",
  description: "Platform-wide link monitoring, user listings, and system statistics.",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
