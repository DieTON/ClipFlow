import React from 'react';
import { LogOut } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';

export function Header() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="container flex items-center justify-between py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">CF</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">ClipFlow</h1>
        </div>

        <div className="flex items-center gap-4">
          {user && (
            <>
              <div className="text-right">
                <p className="text-sm font-medium text-slate-900">{user.name}</p>
                <p className="text-xs text-slate-500">{user.email}</p>
              </div>
              {user.avatar && (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-10 h-10 rounded-full"
                />
              )}
              <button
                onClick={handleLogout}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                title="Logout"
              >
                <LogOut size={20} className="text-slate-600" />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
