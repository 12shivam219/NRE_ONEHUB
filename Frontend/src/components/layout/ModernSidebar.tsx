import {
  LayoutDashboard,
  FileText,
  Briefcase,
  Users,
  Menu,
  X,
  ChevronDown,
  Shield,
  Zap,
} from 'lucide-react';
import { useState, useMemo, useCallback } from 'react';
import MuiMenu from '@mui/material/Menu';
import MuiMenuItem from '@mui/material/MenuItem';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useSidebar } from '../../contexts/SidebarContext';
import { Logo } from '../common/Logo';
import { 
  preloadDashboard, 
  preloadDocumentsPage, 
  preloadCRMPage, 
  preloadAdminPage
} from '../../lib/lazyLoader';

interface MenuItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path: string;
  roles: string[];
  children?: MenuItem[];
  section?: string;
}

const MENU_ITEMS: MenuItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    path: '/dashboard',
    roles: ['user', 'marketing', 'admin'],
    section: 'main',
  },
  {
    id: 'crm',
    label: 'Marketing & CRM',
    icon: Briefcase,
    path: '/crm',
    roles: ['user', 'marketing', 'admin'],
    section: 'marketing',
    children: [
      {
        id: 'requirements',
        label: 'Requirements',
        icon: FileText,
        path: '/crm?view=requirements',
        roles: ['user', 'marketing', 'admin'],
      },
      {
        id: 'consultants',
        label: 'Consultants',
        icon: Users,
        path: '/crm?view=consultants',
        roles: ['user', 'marketing', 'admin'],
      },
    ],
  },
  {
    id: 'documents',
    label: 'Resume Editor',
    icon: FileText,
    path: '/documents',
    roles: ['user', 'admin'],
    section: 'tools',
  },
  {
    id: 'automation',
    label: 'Automation',
    icon: Zap,
    path: '/automation',
    roles: ['user', 'admin'],
    section: 'tools',
  },
  {
    id: 'admin',
    label: 'Admin Panel',
    icon: Shield,
    path: '/admin',
    roles: ['admin'],
    section: 'system',
    children: [
      {
        id: 'admin-home',
        label: 'Admin Home',
        icon: Shield,
        path: '/admin?tab=dashboard',
        roles: ['admin'],
      },
      {
        id: 'pending-approvals',
        label: 'Pending Approvals',
        icon: Users,
        path: '/admin?tab=approvals',
        roles: ['admin'],
      },
      {
        id: 'security-watch',
        label: 'Security Watch',
        icon: Shield,
        path: '/admin?tab=security',
        roles: ['admin'],
      },
      {
        id: 'error-reports',
        label: 'Error Reports',
        icon: FileText,
        path: '/admin?tab=errors',
        roles: ['admin'],
      },
      {
        id: 'email-accounts',
        label: 'Email Accounts',
        icon: FileText,
        path: '/admin?tab=email-accounts',
        roles: ['admin'],
      },
      {
        id: 'sync-dashboard',
        label: 'Sync Dashboard',
        icon: FileText,
        path: '/admin?tab=offline-sync',
        roles: ['admin'],
      },
      {
        id: 'cache-management',
        label: 'Cache Management',
        icon: FileText,
        path: '/admin?tab=cache-settings',
        roles: ['admin'],
      },
    ],
  },
];

const SECTION_LABELS: Record<string, string> = {
  main: 'Main',
  marketing: '',
  tools: 'Tools',
  system: 'System',
};

export const ModernSidebar = () => {
  const { user } = useAuth();
  const { isCollapsed, toggleCollapsed } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set(['crm']));
  
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);
  const [menuChildren, setMenuChildren] = useState<MenuItem[] | null>(null);

  // Filter menu items based on user role
  const filteredItems = useMemo(() => {
    if (!user?.role) return [];
    return MENU_ITEMS.filter((item) => item.roles.includes(user.role));
  }, [user]);

  // Group items by section
  const groupedItems = useMemo(() => {
    const groups: Record<string, MenuItem[]> = {};
    filteredItems.forEach((item) => {
      const section = item.section || 'other';
      if (!groups[section]) {
        groups[section] = [];
      }
      groups[section].push(item);
    });
    return groups;
  }, [filteredItems]);

  const isItemActive = (path: string) => {
    const currentPath = location.pathname;
    const currentSearch = location.search;

    if (path.includes('?')) {
      return currentPath === path.split('?')[0] && currentSearch === '?' + path.split('?')[1];
    }
    return currentPath === path;
  };

  const toggleExpanded = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    setIsMobileOpen(false);
  };

  const handleMouseEnter = useCallback((path: string) => {
    // Preload chunks when user hovers over menu items
    if (path === '/dashboard' || path.startsWith('/dashboard')) {
      preloadDashboard();
    } else if (path === '/documents' || path.startsWith('/documents')) {
      preloadDocumentsPage();
    } else if (path === '/crm' || path.startsWith('/crm')) {
      preloadCRMPage();
    } else if (path === '/admin' || path.startsWith('/admin')) {
      preloadAdminPage();
    }
  }, []);

  // Desktop sidebar - Enterprise grade navigation
  const desktopSidebar = (
    <div className={`flex flex-col h-screen bg-white border-r border-gray-200 overflow-visible transition-all duration-300 ${
      isCollapsed ? 'w-16' : 'w-56'
    }`}>
      {/* Logo Header */}
      <div className={`${isCollapsed ? 'px-2 py-3 flex flex-col items-center gap-3' : 'px-6 py-4 flex items-center justify-between'} border-b border-gray-200`}>
        {isCollapsed ? (
          <>
            <Logo
              variant="icon"
              style="enterprise"
              className="w-10 h-10 flex-shrink-0"
              showTagline={false}
              isDark={false}
              animate={false}
              colorMode="slate"
            />
            <button
              onClick={() => toggleCollapsed()}
              className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-all duration-300 flex-shrink-0"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <ChevronDown
                className="w-4 h-4 text-gray-400 transition-transform duration-300 -rotate-90"
                strokeWidth={2}
              />
            </button>
          </>
        ) : (
          <>
            <Logo
              variant="horizontal"
              style="enterprise"
              className="flex-1"
              showTagline={false}
              isDark={false}
              animate={false}
              colorMode="slate"
            />
            <button
              onClick={() => toggleCollapsed()}
              className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-all duration-300 flex-shrink-0 ml-2"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <ChevronDown
                className="w-4 h-4 text-gray-400 transition-transform duration-300 rotate-90"
                strokeWidth={2}
              />
            </button>
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className={`flex-1 overflow-y-auto transition-all duration-300 ${
        isCollapsed ? 'px-2 py-4 space-y-6' : 'px-3 py-4 space-y-6'
      }`}>
        {Object.entries(groupedItems).map(([section, items]) => (
          <div key={section}>
            {/* Section Header */}
            {!isCollapsed && (
              <h3 className="px-3 py-2 text-xs font-medium text-gray-900 uppercase tracking-wider mb-2.5 opacity-70">
                {SECTION_LABELS[section] || section}
              </h3>
            )}

            {/* Section Items */}
            <div className="space-y-0.5">
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = isItemActive(item.path);
                const isExpanded = expandedItems.has(item.id);
                const hasChildren = item.children && item.children.length > 0;

                return (
                  <div key={item.id} className="relative group">
                    {/* Main Item */}
                    <button
                      onClick={(e) => {
                        if (hasChildren) {
                          if (isCollapsed) {
                            // When collapsed with children, open a MUI menu anchored to the button
                            setMenuAnchorEl(e.currentTarget as HTMLElement);
                            setMenuChildren(item.children!);
                          } else {
                            // When expanded, toggle the submenu
                            toggleExpanded(item.id);
                          }
                        } else {
                          handleNavigation(item.path);
                        }
                      }}
                      onMouseEnter={() => handleMouseEnter(item.path)}
                      className={`${
                        isCollapsed
                          ? 'w-10 h-10 flex items-center justify-center rounded-md'
                          : 'w-full flex items-center gap-3 px-3 py-2 rounded-md h-9'
                      } text-sm transition-colors duration-100 relative ${
                        isActive
                          ? isCollapsed
                            ? 'text-blue-600 bg-blue-50'
                            : 'text-gray-900 bg-blue-50'
                          : isCollapsed
                          ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                          : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                      }`}
                      title={isCollapsed ? item.label : undefined}
                    >
                      {/* Side indicator for active - only when expanded */}
                      {isActive && !isCollapsed && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 rounded-r-sm" />
                      )}

                      <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={1.5} />
                      {!isCollapsed && (
                        <>
                          <span className="flex-1 text-left text-sm font-medium">{item.label}</span>
                          {hasChildren && (
                            <ChevronDown
                              className={`w-4 h-4 flex-shrink-0 text-gray-400 transition-transform duration-150 ${
                                isExpanded ? 'rotate-180' : ''
                              }`}
                              strokeWidth={2}
                            />
                          )}
                        </>
                      )}
                    </button>

                    {/* Hover menu for collapsed sidebar with children */}
                    {isCollapsed && hasChildren && (
                      <>
                        <MuiMenu
                          anchorEl={menuAnchorEl}
                          open={Boolean(menuAnchorEl && menuChildren && menuChildren.length > 0)}
                          onClose={() => {
                            setMenuAnchorEl(null);
                            setMenuChildren(null);
                          }}
                          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                        >
                          {menuChildren?.map((child) => (
                            <MuiMenuItem
                              key={child.id}
                              onClick={() => {
                                handleNavigation(child.path);
                                setMenuAnchorEl(null);
                                setMenuChildren(null);
                              }}
                            >
                              <div className="flex items-center gap-3">
                                <child.icon className="w-4 h-4" strokeWidth={1.5} />
                                <span>{child.label}</span>
                              </div>
                            </MuiMenuItem>
                          ))}
                        </MuiMenu>
                      </>
                    )}
                    {!isCollapsed && hasChildren && isExpanded && (
                      <div className="mt-0.5 ml-4 space-y-0.5 border-l border-gray-200 pl-3">
                        {item.children!.map((child) => {
                          const ChildIcon = child.icon;
                          const isChildActive = isItemActive(child.path);

                          return (
                            <button
                              key={child.id}
                              onClick={() => handleNavigation(child.path)}
                              onMouseEnter={() => handleMouseEnter(child.path)}
                              className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-md text-xs transition-colors duration-100 relative h-8 ${
                                isChildActive
                                  ? 'text-blue-600 font-medium bg-blue-50'
                                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                              }`}
                            >
                              {isChildActive && (
                                <div className="absolute -left-3.5 w-1 h-1 bg-blue-600 rounded-full" />
                              )}
                              <ChildIcon className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
                              <span className="text-xs">{child.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );

  // Mobile sidebar
  const mobileSidebarContent = (
    <div className="flex flex-col h-full bg-white">
      {/* Mobile header with close button */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-900">Navigation</h2>
        <button
          onClick={() => setIsMobileOpen(false)}
          className="p-1 hover:bg-gray-100 rounded-md transition-colors"
          aria-label="Close menu"
        >
          <X className="w-5 h-5 text-gray-700" strokeWidth={1.5} />
        </button>
      </div>

      {/* Logo Section */}
      <div className="px-6 py-4 border-b border-gray-200">
        <Logo
          variant="horizontal"
          style="enterprise"
          className="w-full"
          showTagline={false}
          isDark={false}
          animate={false}
          colorMode="slate"
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-8">
        {Object.entries(groupedItems).map(([section, items]) => (
          <div key={section}>
            {/* Section Header */}
            <h3 className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              {SECTION_LABELS[section] || section}
            </h3>

            {/* Section Items */}
            <div className="space-y-1">
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = isItemActive(item.path);
                const isExpanded = expandedItems.has(item.id);
                const hasChildren = item.children && item.children.length > 0;

                return (
                  <div key={item.id}>
                    {/* Main Item */}
                    <button
                      onClick={() => {
                        if (hasChildren) {
                          toggleExpanded(item.id);
                        } else {
                          handleNavigation(item.path);
                        }
                      }}
                      onMouseEnter={() => handleMouseEnter(item.path)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-100 relative ${
                        isActive
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      {/* Left accent bar - only on active */}
                      {isActive && (
                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-600 rounded-r-sm" />
                      )}

                      <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={1.5} />
                      <span className="flex-1 text-left">{item.label}</span>

                      {hasChildren && (
                        <ChevronDown
                          className={`w-4 h-4 flex-shrink-0 transition-transform duration-150 ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                          strokeWidth={1.5}
                        />
                      )}
                    </button>

                    {/* Submenu */}
                    {hasChildren && isExpanded && (
                      <div className="mt-1 ml-2 space-y-1 border-l border-gray-200 pl-3">
                        {item.children!.map((child) => {
                          const ChildIcon = child.icon;
                          const isChildActive = isItemActive(child.path);

                          return (
                            <button
                              key={child.id}
                              onClick={() => handleNavigation(child.path)}
                              onMouseEnter={() => handleMouseEnter(child.path)}
                              className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-100 ${
                                isChildActive
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                              }`}
                            >
                              <ChildIcon className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
                              <span>{child.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:fixed md:left-0 md:top-0 md:h-screen md:z-40">
        {desktopSidebar}
      </aside>

      {/* Mobile Header Menu Button */}
      <div className="md:hidden fixed top-5 left-4 z-40">
        <button
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="p-2 hover:bg-slate-100 rounded-md transition-colors"
          aria-label="Toggle menu"
        >
          {isMobileOpen ? (
            <X className="w-6 h-6 text-slate-700" strokeWidth={1.5} />
          ) : (
            <Menu className="w-6 h-6 text-slate-700" strokeWidth={1.5} />
          )}
        </button>
      </div>

      {/* Mobile Sidebar */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-30 md:hidden mt-[72px]">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsMobileOpen(false)}
            aria-hidden="true"
          />

          {/* Sidebar */}
          <div className="absolute left-0 top-0 h-screen w-72 overflow-y-auto bg-white shadow-lg">
            {mobileSidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
