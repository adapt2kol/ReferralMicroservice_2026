import "./globals.css";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ReferralOS",
  description: "Multi-tenant referral microservice",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
