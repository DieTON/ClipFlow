import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Film, Calendar, BarChart3 } from 'lucide-react';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: Home },
  { path: '/generator', label: 'Generator', icon: Film },
  { path: '/schedule', label: 'Schedule', icon: Calendar },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <aside className="w-64 bg-white border-r border-slate-200 h-[calc(100vh-60px)]">
      <nav className="p-6 space-y-2">
        {navItems.map(({ path, label, icon: Icon }) => {
          const isActive = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
