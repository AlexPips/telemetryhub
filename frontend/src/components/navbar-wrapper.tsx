'use client';

import { usePathname } from 'next/navigation';
import Navbar from './navbar';

export default function NavbarWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showNavbar = pathname !== '/login' && pathname !== '/register';

  return (
    <>
      {showNavbar && <Navbar />}
      <main className={showNavbar ? 'min-h-[calc(100svh-56px)] overflow-x-hidden' : ''}>
        {children}
      </main>
    </>
  );
}