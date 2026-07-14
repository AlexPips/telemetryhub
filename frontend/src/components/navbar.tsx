'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

const navLinkClasses =
  'text-sm text-muted-foreground no-underline py-1 border-b-2 border-b-transparent transition-colors duration-150 hover:text-foreground hover:no-underline';
const activeClass = ' text-foreground border-b-accent';
const mobileItemClasses = 'p-3 text-base text-left min-h-11 flex items-center';
const btnClasses =
  'bg-transparent border border-border text-muted-foreground px-3 py-1.5 rounded-md text-[13px] cursor-pointer transition-colors duration-150 hover:text-destructive hover:border-destructive';

export default function Navbar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!user) return null;

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const closeMenu = () => setMenuOpen(false);

  const isDashboard = pathname.startsWith('/dashboard');

  return (
    <nav className="flex items-center justify-between h-14 px-6 bg-card border-b border-border sticky top-0 z-[100]">
      <div className="flex items-center gap-6">
        <Link
          href="/dashboard"
          className="text-lg font-bold text-foreground no-underline hover:no-underline tracking-[-0.5px]"
        >
          TelemetryHub
        </Link>
        <div className="flex items-center gap-4 max-md:hidden">
          <Link
            href="/dashboard"
            className={navLinkClasses + (isDashboard ? activeClass : '')}
          >
            Dashboard
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-4 max-md:hidden">
        <span className="text-[13px] text-muted-foreground">{user.email}</span>
        <span className="text-[11px] text-muted-foreground bg-secondary px-2 rounded capitalize">{user.role}</span>
        <button className={btnClasses} onClick={handleLogout}>
          Logout
        </button>
      </div>

      <button
        className="hidden flex-col gap-1 bg-transparent border-none p-2 cursor-pointer min-h-0 max-md:flex"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Toggle menu"
        aria-expanded={menuOpen}
      >
        <span className="w-[22px] h-0.5 bg-foreground rounded-sm transition-transform duration-200" />
        <span className="w-[22px] h-0.5 bg-foreground rounded-sm transition-transform duration-200" />
        <span className="w-[22px] h-0.5 bg-foreground rounded-sm transition-transform duration-200" />
      </button>

      {menuOpen && (
        <div className="absolute top-14 left-0 right-0 bg-card border-b border-border p-3 flex flex-col gap-2 z-[99]">
          <Link
            href="/dashboard"
            className={`${navLinkClasses} ${mobileItemClasses}${isDashboard ? activeClass : ''}`}
            onClick={closeMenu}
          >
            Dashboard
          </Link>
          <span className="px-3 py-1 text-sm text-muted-foreground">{user.email}</span>
          <span className="px-3 py-1 text-sm text-muted-foreground capitalize">{user.role}</span>
          <button className={`${btnClasses} ${mobileItemClasses}`} onClick={handleLogout}>
            Logout
          </button>
        </div>
      )}
    </nav>
  );
}
