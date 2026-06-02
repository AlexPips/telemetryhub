'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

export default function Navbar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  if (!user) return null;

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <Link href="/dashboard" className="navbar-brand">
          TelemetryHub
        </Link>
        <Link
          href="/dashboard"
          className={`navbar-link${pathname.startsWith('/dashboard') ? ' active' : ''}`}
        >
          Dashboard
        </Link>
      </div>
      <div className="navbar-right">
        <span className="navbar-user">{user.email}</span>
        <span className="navbar-role">{user.role}</span>
        <button className="navbar-logout" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </nav>
  );
}
