import { AuthProvider } from "../src/context/auth-context";

export const metadata = {
  title: "DCFlow",
  description: "DCFlow foundation build",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}