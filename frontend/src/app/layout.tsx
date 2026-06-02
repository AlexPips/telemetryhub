import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth-context';
import NavbarWrapper from '@/components/navbar-wrapper';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'TelemetryHub - Real-time MQTT Dashboard',
  description: 'Real-time MQTT sensor data dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <NavbarWrapper>{children}</NavbarWrapper>
        </AuthProvider>
      </body>
    </html>
  );
}
