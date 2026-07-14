import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth-context';
import NavbarWrapper from '@/components/navbar-wrapper';
import '@/styles/globals.css';
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'TelemetryHub - Real-time MQTT Dashboard',
  description: 'Real-time MQTT sensor data dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("dark font-sans", geist.variable)} suppressHydrationWarning>
      <body className="min-h-svh bg-background antialiased">
        <AuthProvider>
          <NavbarWrapper>{children}</NavbarWrapper>
        </AuthProvider>
      </body>
    </html>
  );
}