import type { ReactNode } from "react";

export const metadata = {
  title: "Clara",
  description: "AI-native Accounting OS for Malaysian accounting firms",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
