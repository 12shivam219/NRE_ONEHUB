import { useState, useCallback, memo } from 'react';
import { Bell, Menu as MenuIcon, LogOut, ChevronDown, FileText, Bot, LayoutDashboard, Briefcase, Users } from 'lucide-react';
import { useSearchParams, useLocation } from 'react-router-dom';
import SyncStatusBadge from '../common/SyncStatusBadge';
import { CreateDropdown } from '../common/CreateDropdown';
import { useCreateForm } from '../../hooks/useCreateForm';
import { useAuth } from '../../hooks/useAuth';
import { useSidebar } from '../../contexts/SidebarContext';
import { useNotifications } from '../../hooks/useNotifications';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Badge from '@mui/material/Badge';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';

interface HeaderProps {
  onMenuClick?: () => void;
}

const getPageTitle = (pathname: string, searchParams?: URLSearchParams) => {
  if (pathname === '/crm' && searchParams) {
    const view = searchParams.get('view');
    switch (view) {
      case 'requirements':
        return 'Requirements';
      case 'consultants':
        return 'Consultants';
      default:
        return 'Marketing & CRM';
    }
  }

  switch (pathname) {
    case '/documents':
      return 'Resume Editor';
    case '/crm':
      return 'Marketing & CRM';
    case '/admin':
      return 'Admin Panel';
    case '/dashboard':
    case '/':
    default:
      return 'Dashboard';
  }
};

const getPageIcon = (pathname: string, searchParams?: URLSearchParams) => {
  if (pathname === '/crm' && searchParams) {
    const view = searchParams.get('view');
    switch (view) {
      case 'requirements':
        return 'briefcase';
      case 'consultants':
        return 'users';
      default:
        return 'briefcase';
    }
  }

  switch (pathname) {
    case '/documents':
      return 'file-text';
    case '/crm':
      return 'briefcase';
    case '/admin':
      return 'bot';
    case '/dashboard':
    case '/':
    default:
      return 'layout-dashboard';
  }
};

export const Header = memo(({ onMenuClick }: HeaderProps) => {
  const { user, logout } = useAuth();
  const { notifications, unreadCount, markAsRead } = useNotifications();
  const { isCollapsed } = useSidebar();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const { openCreateForm } = useCreateForm();
  const [notificationsAnchorEl, setNotificationsAnchorEl] = useState<HTMLElement | null>(null);
  const [showAllNotifications, setShowAllNotifications] = useState(false);
  const [userMenuAnchorEl, setUserMenuAnchorEl] = useState<HTMLElement | null>(null);

  const title = getPageTitle(pathname, searchParams);
  const pageIconName = getPageIcon(pathname, searchParams);

  // Render page icon based on current route
  const renderPageIcon = () => {
    const iconProps = {
      size: 24,
      strokeWidth: 1.5,
      color: '#374151',
    };

    switch (pageIconName) {
      case 'file-text':
        return <FileText {...iconProps} />;
      case 'briefcase':
        return <Briefcase {...iconProps} />;
      case 'users':
        return <Users {...iconProps} />;
      case 'bot':
        return <Bot {...iconProps} />;
      case 'layout-dashboard':
      default:
        return <LayoutDashboard {...iconProps} />;
    }
  };

  // Get user initials
  const getUserInitials = (fullName: string | undefined) => {
    if (!fullName) return '?';
    return fullName
      .split(' ')
      .map(name => name[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const userInitials = getUserInitials(user?.full_name);

  // Create dropdown handlers
  const handleCreateRequirement = useCallback(() => {
    openCreateForm('requirement');
  }, [openCreateForm]);

  const handleCreateInterview = useCallback(() => {
    openCreateForm('interview');
  }, [openCreateForm]);

  const handleCreateConsultant = useCallback(() => {
    openCreateForm('consultant');
  }, [openCreateForm]);

  const createItems = [
    { label: 'Create Requirement', onClick: handleCreateRequirement },
    { label: 'Create Interview', onClick: handleCreateInterview },
    { label: 'Create Consultant', onClick: handleCreateConsultant },
  ];

  // Notification handlers
  const handleNotificationClick = useCallback((notificationId: string, alreadyRead: boolean) => {
    if (!alreadyRead) {
      void markAsRead(notificationId);
    }
  }, [markAsRead]);

  const handleNotificationsOpen = useCallback((e: React.MouseEvent<HTMLElement>) => {
    setNotificationsAnchorEl(e.currentTarget);
  }, []);

  const handleNotificationsClose = useCallback(() => {
    setNotificationsAnchorEl(null);
  }, []);

  // User menu handlers
  const handleUserMenuOpen = useCallback((e: React.MouseEvent<HTMLElement>) => {
    setUserMenuAnchorEl(e.currentTarget);
  }, []);

  const handleUserMenuClose = useCallback(() => {
    setUserMenuAnchorEl(null);
  }, []);

  const handleLogout = useCallback(() => {
    handleUserMenuClose();
    logout();
  }, [handleUserMenuClose, logout]);

  return (
    <AppBar
      position="relative"
      elevation={0}
      sx={{
        borderBottom: '1px solid #E5E7EB',
        backgroundColor: '#FFFFFF',
        boxShadow: 'none',
        marginLeft: { xs: 0, md: isCollapsed ? '64px' : '224px' },
        width: { xs: '100%', md: isCollapsed ? 'calc(100% - 64px)' : 'calc(100% - 224px)' },
        transition: 'margin-left 200ms ease, width 200ms ease',
        position: 'fixed !important',
        top: 0,
        right: 0,
        zIndex: 100,
      }}
    >
      <Toolbar
        sx={{
          px: { xs: 2, sm: 2.5, md: 3 },
          py: 0.75,
          minHeight: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        {/* LEFT SECTION: Menu + Page Icon + Title */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flex: 1,
            minWidth: 0,
          }}
        >
          {/* Mobile Menu Button */}
          {onMenuClick && (
            <IconButton
              onClick={onMenuClick}
              aria-label="Menu"
              sx={{
                display: { xs: 'flex', md: 'none' },
                p: 0.625,
                color: '#6B7280',
                minWidth: 36,
                minHeight: 36,
                borderRadius: '4px',
                transition: 'all 200ms ease',
                '&:hover': {
                  backgroundColor: '#F3F4F6',
                  color: '#1F2937',
                },
              }}
            >
              <MenuIcon size={20} />
            </IconButton>
          )}

          {/* Page Icon */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              p: 0.625,
              borderRadius: '4px',
              backgroundColor: '#F3F4F6',
              color: '#6B7280',
              flexShrink: 0,
              minWidth: 32,
              minHeight: 32,
            }}
          >
            {renderPageIcon()}
          </Box>

          {/* Page Title */}
          <Typography
            sx={{
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: '#0F172A',
              whiteSpace: 'nowrap',
              letterSpacing: '-0.2px',
            }}
          >
            {title}
          </Typography>
        </Box>

        {/* CENTER SECTION: Sync Status */}
        <SyncStatusBadge />

        {/* RIGHT SECTION: Actions + User */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            flexShrink: 0,
          }}
        >
          {/* Create Dropdown */}
          <CreateDropdown items={createItems} variant="header" />

          {/* Notifications */}
          <IconButton
            onClick={handleNotificationsOpen}
            aria-label="Notifications"
            sx={{
              p: 0.625,
              color: '#9CA3AF',
              position: 'relative',
              minWidth: 36,
              minHeight: 36,
              borderRadius: '4px',
              transition: 'all 200ms ease',
              '&:hover': {
                backgroundColor: '#F3F4F6',
                color: '#1F2937',
              },
            }}
          >
            <Badge
              badgeContent={unreadCount > 9 ? '9+' : unreadCount}
              invisible={unreadCount === 0}
              sx={{
                '& .MuiBadge-badge': {
                  backgroundColor: '#EF4444',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '0.65rem',
                  minWidth: 20,
                  height: 20,
                },
              }}
            >
              <Bell size={20} />
            </Badge>
          </IconButton>

          {/* Divider */}
          <Box
            sx={{
              width: '1px',
              height: 16,
              backgroundColor: '#E5E7EB',
              ml: 0.25,
              mr: 0.25,
            }}
          />

          {/* User Profile */}
          {user && (
            <IconButton
              onClick={handleUserMenuOpen}
              sx={{
                p: 0.375,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                borderRadius: '4px',
                transition: 'all 200ms ease',
                '&:hover': {
                  backgroundColor: '#F3F4F6',
                },
              }}
            >
              <Avatar
                sx={{
                  width: 32,
                  height: 32,
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  border: '1px solid #E5E7EB',
                }}
              >
                {userInitials}
              </Avatar>
              <ChevronDown size={18} color="#6B7280" />
            </IconButton>
          )}
        </Box>
      </Toolbar>

      {/* User Menu */}
      {user && (
        <Menu
          anchorEl={userMenuAnchorEl}
          open={Boolean(userMenuAnchorEl)}
          onClose={handleUserMenuClose}
          disableScrollLock={true}
          PaperProps={{
            sx: {
              width: 280,
              backgroundColor: '#FFFFFF',
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
            },
          }}
        >
          <Box sx={{ px: 3, py: 2 }}>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#1F2937' }}>
              {user.full_name}
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#6B7280', mt: 0.25 }}>
              {user.email}
            </Typography>
          </Box>
          <Divider sx={{ borderColor: '#E5E7EB' }} />
          <MenuItem
            onClick={handleLogout}
            sx={{
              py: 1.5,
              px: 3,
              color: '#EF4444',
              '&:hover': {
                backgroundColor: '#FEF2F2',
              },
              fontSize: '0.875rem',
              fontWeight: 500,
            }}
          >
            <LogOut size={18} style={{ marginRight: '12px' }} />
            Sign Out
          </MenuItem>
        </Menu>
      )}

      {/* Notifications Menu */}
      <Menu
        anchorEl={notificationsAnchorEl}
        open={Boolean(notificationsAnchorEl)}
        onClose={handleNotificationsClose}
        disableScrollLock={true}
        PaperProps={{
          sx: {
            width: 360,
            maxWidth: 'calc(100vw - 2rem)',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
          },
        }}
      >
        <Box sx={{ px: 3, py: 2 }}>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#1F2937' }}>
            Notifications
          </Typography>
        </Box>
        <Divider sx={{ borderColor: '#E5E7EB' }} />

        {notifications.length === 0 ? (
          <Box sx={{ px: 3, py: 3, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.875rem', color: '#6B7280' }}>
              No notifications
            </Typography>
          </Box>
        ) : (
          <>
            {notifications.slice(0, showAllNotifications ? notifications.length : 5).map((notification) => (
              <MenuItem
                key={notification.id}
                onClick={() => {
                  handleNotificationClick(notification.id, notification.read);
                  setNotificationsAnchorEl(null);
                }}
                sx={{
                  py: 1.5,
                  px: 3,
                  alignItems: 'flex-start',
                  whiteSpace: 'normal',
                  backgroundColor: !notification.read ? '#F0F9FF' : 'transparent',
                  '&:hover': {
                    backgroundColor: '#F9FAFB',
                  },
                  borderBottom: '1px solid #E5E7EB',
                  '&:last-of-type': {
                    borderBottom: 'none',
                  },
                }}
              >
                <Stack spacing={0.5} sx={{ width: '100%' }}>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#1F2937' }}>
                    {notification.title}
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#6B7280' }}>
                    {notification.message}
                  </Typography>
                  <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>
                    {new Date(notification.created_at).toLocaleString()}
                  </Typography>
                </Stack>
              </MenuItem>
            ))}

            {notifications.length > 5 && (
              <>
                <Divider sx={{ borderColor: '#E5E7EB' }} />
                <MenuItem
                  onClick={() => setShowAllNotifications(!showAllNotifications)}
                  sx={{
                    py: 1.5,
                    px: 3,
                    justifyContent: 'center',
                    color: '#3B82F6',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    '&:hover': {
                      backgroundColor: '#F9FAFB',
                    },
                  }}
                >
                  {showAllNotifications ? 'Show Less' : `View All (${notifications.length})`}
                </MenuItem>
              </>
            )}
          </>
        )}
      </Menu>
    </AppBar>
  );
});

Header.displayName = 'Header';
