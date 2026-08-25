import type { ReactNode } from "react";

export const metadata = {
  title: "RouteRide Admin Portal",
  description: "Operations and driver verification management",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
