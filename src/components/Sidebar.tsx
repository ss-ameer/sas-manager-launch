import React from 'react';
import { UserProfile, Workspace } from '../types';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { BRAND_CONFIG } from '../config';
import { getUserRoleInWorkspace } from '../utils/permissions';
import {
  LayoutDashboard,
  FileText,
  Building2,
  Users2,
  LogOut,
  ChevronRight,
  Package,
  Settings,
  PhoneCall,
  Phone,
  Layers,
  ChevronDown,
  Trash2,
  X
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  user: UserProfile;
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  onSelectWorkspace: (id: string) => void;
  onOpenWorkspaceManager: () => void;
  onOpenTrashBin?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({
  currentTab,
  onTabChange,
  user,
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
  onOpenWorkspaceManager,
  onOpenTrashBin,
  isOpen = false,
  onClose
}: SidebarProps) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, role: 'Viewer' },
    { id: 'call_log', label: 'Call Center & Logs', icon: Phone, role: 'Viewer' },
    {
      id: 'enquiries',
      label: 'Enquiries & Quotes',
      icon: FileText,
      role: 'Viewer',
      moduleKey: 'enquiriesEnabled'
    },
    { id: 'companies', label: 'Companies & Contacts', icon: Building2, role: 'Viewer' },
    { id: 'salespersons', label: 'Team', icon: Users2, role: 'Viewer' },
    { id: 'products', label: 'Products Catalog', icon: Package, role: 'Viewer' },
    { id: 'settings', label: 'Settings & System', icon: Settings, role: 'Viewer' }
  ];

  const handleLogout = async () => {
    try {
      localStorage.removeItem('omni_local_user');
      localStorage.removeItem('omni_offline_guest_mode');
      await signOut(auth).catch(() => {});
      window.location.reload();
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  const handleTabClick = (tabId: string) => {
    onTabChange(tabId);
    if (onClose) onClose();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-200 flex items-start justify-between">
        <div>
          <div className="flex items-center space-x-2.5 mb-1">
            <span className="text-lg font-black text-slate-900 tracking-wider font-sans uppercase">
              {BRAND_CONFIG.appName}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono uppercase tracking-widest">
            Technical Component Sales Registry
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="md:hidden p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Workspace Switcher Header Block */}
      <div className="p-3 border-b border-slate-200 bg-slate-900 text-white">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest flex items-center space-x-1">
            <Layers className="w-3 h-3 text-blue-400" />
            <span>Active Workspace</span>
          </div>
          <button
            onClick={() => {
              onOpenWorkspaceManager();
              if (onClose) onClose();
            }}
            className="text-[10px] text-blue-400 hover:text-blue-300 font-bold hover:underline"
          >
            Manage
          </button>
        </div>

        <div className="relative">
          <select
            value={activeWorkspace.id}
            onChange={(e) => {
              if (e.target.value === '__manage__') {
                onOpenWorkspaceManager();
              } else {
                onSelectWorkspace(e.target.value);
              }
              if (onClose) onClose();
            }}
            className="w-full bg-slate-800 text-white font-bold text-xs px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer appearance-none truncate pr-8"
          >
            {workspaces.map((ws) => (
              <option key={ws?.id || Math.random().toString()} value={ws?.id || 'ws_default'}>
                {ws?.name || 'Workspace'}
              </option>
            ))}
            <option value="__manage__">+ Manage / New Workspace...</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
        </div>
      </div>

      {/* User Information */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-slate-200 border border-slate-300 rounded-lg flex items-center justify-center text-slate-900 shrink-0 font-extrabold text-xs">
            {(user?.username || user?.full_name || user?.email || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="overflow-hidden">
            <div className="text-xs font-bold text-slate-900 truncate font-sans">
              {user?.full_name || user?.username || user?.email || 'User'}
            </div>
            <div className="flex items-center space-x-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[9px] font-mono text-slate-600 capitalize bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                {getUserRoleInWorkspace(user, activeWorkspace?.id)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const userWsRole = getUserRoleInWorkspace(user, activeWorkspace?.id);
          // Filter tabs based on role permissions
          if (item.role === 'Admin' && userWsRole !== 'Admin') return null;
          if (item.role === 'Member' && userWsRole === 'Viewer') return null;

          // Check if module is disabled in active workspace
          if (
            item.moduleKey === 'enquiriesEnabled' &&
            activeWorkspace.modules?.enquiriesEnabled === false
          ) {
            return null;
          }

          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition duration-150 ${
                isActive
                  ? 'bg-slate-900 text-white shadow'
                  : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span className="font-sans">{item.label}</span>
              </div>
              {isActive && <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            </button>
          );
        })}
      </nav>

      {/* Footer Block */}
      <div className="p-3 border-t border-slate-200 space-y-1">
        {onOpenTrashBin && (
          <button
            onClick={() => {
              onOpenTrashBin();
              if (onClose) onClose();
            }}
            className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition duration-150"
          >
            <Trash2 className="w-4 h-4 text-slate-400" />
            <span className="font-sans">Recycle Bin</span>
          </button>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center space-x-2 p-2.5 rounded-xl text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition duration-150"
        >
          <LogOut className="w-4 h-4" />
          <span className="font-sans">Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside id="sidebar-layout" className="hidden md:flex w-64 border-r border-slate-200 flex-col h-screen shrink-0 sticky top-0 bg-white">
        {sidebarContent}
      </aside>

      {/* Mobile Off-Canvas Drawer */}
      {isOpen && (
        <div
          id="mobile-sidebar-backdrop"
          className="md:hidden fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex"
          onClick={onClose}
        >
          <aside
            id="mobile-sidebar-drawer"
            className="w-72 max-w-[85vw] bg-white h-full flex flex-col shadow-2xl animate-in slide-in-from-left duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}

