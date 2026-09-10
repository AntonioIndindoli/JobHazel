import type { Metadata } from "next";
import "./globals.css";
import "./styles/86-resumes.css";
import "leaflet/dist/leaflet.css";

export const metadata: Metadata = {
  title: "JobHazel",
  description: "Organize job applications, interviews, contacts, and follow-ups in one clear workspace.",
  icons: {
    icon: "/JobHazelIcon.png",
    shortcut: "/JobHazelIcon.png",
    apple: "/JobHazelIcon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const storedTheme = localStorage.getItem("jobhazel-theme");
                const theme = storedTheme === "light" || storedTheme === "dark"
                  ? storedTheme
                  : "light";
                document.documentElement.dataset.theme = theme;
              } catch {
                document.documentElement.dataset.theme = "light";
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
