'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

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

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <Link href="/dashboard" className="navbar-brand">
          TelemetryHub
        </Link>
        <div className="navbar-desktop-links">
          <Link
            href="/dashboard"
            className={`navbar-link${pathname.startsWith('/dashboard') ? ' active' : ''}`}
          >
            Dashboard
          </Link>
        </div>
      </div>

      <div className="navbar-desktop-info">
        <span className="navbar-user">{user.email}</span>
        <span className="navbar-role">{user.role}</span>
        <button className="navbar-logout" onClick={handleLogout}>
          Logout
        </button>
      </div>

      <button
        className="navbar-hamburger"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Toggle menu"
        aria-expanded={menuOpen}
      >
        <span className="hamburger-line" />
        <span className="hamburger-line" />
        <span className="hamburger-line" />
      </button>

      {menuOpen && (
        <div className="navbar-mobile-menu">
          <Link
            href="/dashboard"
            className={`navbar-link${pathname.startsWith('/dashboard') ? ' active' : ''}`}
            onClick={closeMenu}
          >
            Dashboard
          </Link>
          <span className="navbar-mobile-user">{user.email}</span>
          <span className="navbar-mobile-role">{user.role}</span>
          <button className="navbar-logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
      )}
    </nav>
  );
}
