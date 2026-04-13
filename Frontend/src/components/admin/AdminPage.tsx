import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  LayoutDashboard,
  UserCheck,
  ShieldAlert,
  Bug,
  Search,
  Filter,
  RefreshCw,
  LogOut,
  CheckCircle2,
  XCircle,
  Mail,
  Users as UsersIcon,
  MapPin,
  Globe,
  MonitorSmartphone,
  AlertTriangle,
  HardDrive,
} from 'lucide-react';
import {
  getAllUsers,
  updateUserStatus,
  updateUserRole,
  getLoginHistory,
  getUserSessions,
  revokeSession,
  forceLogoutUserSessions,
  getPendingApprovals,
  getApprovalStatistics,
  getSuspiciousLogins,
  getErrorReports,
  updateErrorStatus,
  addErrorNote,
  getErrorNotes,
  getErrorAttachments,
  retryErrorAction,
  uploadErrorAttachment,
} from '../../lib/api/admin';
import type { Database, UserRole, UserStatus, ErrorStatus } from '../../lib/database.types';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../contexts/ToastContext';
import { ConfirmDialog } from '../common/ConfirmDialog';

// Lazy load admin sub-components to reduce initial load time
const EmailAccountsAdmin = lazy(() => import('./EmailAccountsAdmin').then(m => ({ default: m.EmailAccountsAdmin })));
const SyncDashboard = lazy(() => import('./SyncDashboard').then(m => ({ default: m.SyncDashboard })));
const OfflineCacheSettings = lazy(() => import('./OfflineCacheSettings').then(m => ({ default: m.OfflineCacheSettings })));
const JobExtractionAgentDashboard = lazy(() => import('./JobExtractionAgentDashboard').then(m => ({ default: m.JobExtractionAgentDashboard })));

type User = Database['public']['Tables']['users']['Row'];
type LoginHistory = Database['public']['Tables']['login_history']['Row'];
type ErrorReport = Database['public']['Tables']['error_reports']['Row'];
type ActivityLog = Database['public']['Tables']['activity_logs']['Row'];
type Attachment = Database['public']['Tables']['attachments']['Row'];

// `user_sessions` table type from DB schema
type UserSession = Database['public']['Tables']['user_sessions']['Row'];

type TabType = 'dashboard' | 'approvals' | 'security' | 'errors' | 'email-accounts' | 'offline-sync' | 'cache-settings' | 'job-extraction';

type ApprovalStatistics = {
  pendingApproval: number;
  pendingVerification: number;
  approved: number;
  rejected: number;
  todaySignups: number;
  totalApproved: number;
  totalPending: number;
};

// Constants for magic numbers and configuration
const ADMIN_CONSTANTS = {
  APPROVAL_PAGE_SIZE: 10,
  LOGIN_HISTORY_SLICE_LIMIT: 20,
  ERROR_MESSAGE_PREVIEW_LENGTH: 80,
  SEARCH_DEBOUNCE_MS: 300,
  AUTO_RETRY_DELAY_MS: 1000,
  FILE_UPLOAD_MAX_SIZE_MB: 10,
} as const;

const roleDirectory: { role: UserRole; label: string; description: string }[] = [
  {
    role: 'admin',
    label: 'Administrator',
    description: 'Full access to manage users, approvals, security, and platform settings.',
  },
  {
    role: 'marketing',
    label: 'Marketing',
    description: 'Can access CRM features, campaigns, and user communication tools.',
  },
  {
    role: 'user',
    label: 'Standard User',
    description: 'Default role with access to personal dashboard, documents, and CRM tasks.',
  },
];

const errorStatusStyles: Record<ErrorStatus, string> = {
  new: 'bg-red-100 text-red-700',
  in_progress: 'bg-primary-100 text-primary-800',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-200 text-gray-700',
};

const userStatusOptions: { value: UserStatus; label: string }[] = [
  { value: 'pending_verification', label: 'Pending Verification' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
};

const timeAgo = (value: string | null | undefined) => {
  if (!value) return 'N/A';
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return 'N/A';
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
};

const getInitials = (name: string) => {
  if (!name) return '?';
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 0) return name.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const getUserOriginIp = (user: User) => {
  const record = user as User & { origin_ip?: string | null };
  return record.origin_ip || 'Unknown';
};

export const AdminPage = () => {
  const { user: currentAdmin, isAdmin } = useAuth();
  const adminId = currentAdmin?.id ?? null;
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // --- MOVED: Hooks declared here (before any conditional return) ---

  const tabParam = searchParams.get('tab') as TabType | null;
  const [activeTab, setActiveTab] = useState<TabType>(tabParam || 'dashboard');

  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | UserRole>('all');

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userSessions, setUserSessions] = useState<UserSession[]>([]);
  const [userLoginHistory, setUserLoginHistory] = useState<LoginHistory[]>([]);
  const [userDetailLoading, setUserDetailLoading] = useState(false);
  const [forceLogoutLoading, setForceLogoutLoading] = useState(false);
  const [focusedLoginId, setFocusedLoginId] = useState<string | null>(null);
  const [sessionToRevoke, setSessionToRevoke] = useState<{ id: string; userId?: string } | null>(null);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [showForceLogoutConfirm, setShowForceLogoutConfirm] = useState(false);
  const loginHistoryContainerRef = useRef<HTMLDivElement | null>(null);

  const [approvals, setApprovals] = useState<User[]>([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [approvalsSearchTerm, setApprovalsSearchTerm] = useState('');
  const [selectedApprovals, setSelectedApprovals] = useState<string[]>([]);
  const [approvalStats, setApprovalStats] = useState<ApprovalStatistics | null>(null);
  const [approvalPage, setApprovalPage] = useState(1);

  const [securityEvents, setSecurityEvents] = useState<LoginHistory[]>([]);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityEmailFilter, setSecurityEmailFilter] = useState('');
  const [securityLocationFilter, setSecurityLocationFilter] = useState('');
  const [securityStatusFilter, setSecurityStatusFilter] = useState<'all' | 'suspicious' | 'failed'>(
    'all'
  );

  const [errors, setErrors] = useState<ErrorReport[]>([]);
  const [errorsLoading, setErrorsLoading] = useState(false);
  const [errorsError, setErrorsError] = useState<string | null>(null);
  const [selectedError, setSelectedError] = useState<ErrorReport | null>(null);
  const [errorNotes, setErrorNotes] = useState<ActivityLog[]>([]);
  const [errorAttachments, setErrorAttachments] = useState<Attachment[]>([]);
  const [errorDetailLoading, setErrorDetailLoading] = useState(false);
  const [errorAttachmentError, setErrorAttachmentError] = useState<string | null>(null);
  const [errorNoteDraft, setErrorNoteDraft] = useState('');
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentUploadError, setAttachmentUploadError] = useState<string | null>(null);
  const [bulkActionInProgress, setBulkActionInProgress] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return; // Guard clause added here
    setUsersLoading(true);
    const result = await getAllUsers();
    if (result.success && result.users) {
      setUsers(result.users);
    } else if (result.error) {
      showToast({ type: 'error', title: 'Failed to load users', message: result.error });
    }
    setUsersLoading(false);
  }, [isAdmin, showToast]);

  const loadApprovals = useCallback(async () => {
    if (!isAdmin) return;
    setApprovalsLoading(true);
    const [queueResult, statsResult] = await Promise.all([
      getPendingApprovals(approvalsSearchTerm || undefined),
      getApprovalStatistics(),
    ]);

    if (queueResult.success && queueResult.users) {
      setApprovals(queueResult.users);
    } else if (queueResult.error) {
      showToast({
        type: 'error',
        title: 'Failed to load pending approvals',
        message: queueResult.error,
      });
    }

    if (statsResult.success && statsResult.stats) {
      setApprovalStats(statsResult.stats);
    } else if (statsResult.error) {
      // Use toast instead of alert for consistency
      console.error(`Failed to load approval statistics: ${statsResult.error}`);
    }

    setApprovalsLoading(false);
  }, [approvalsSearchTerm, isAdmin, showToast]);

  const loadSecurityEvents = useCallback(async () => {
    if (!isAdmin) return;
    setSecurityLoading(true);
    const result = await getSuspiciousLogins(100); // Limit to 100 events for performance
    if (result.success && result.events) {
      setSecurityEvents(result.events);
    } else if (result.error) {
      showToast({
        type: 'error',
        title: 'Failed to load security events',
        message: result.error,
      });
    }
    setSecurityLoading(false);
  }, [isAdmin, showToast]);

  const loadErrors = useCallback(async () => {
    if (!isAdmin) return;
    setErrorsLoading(true);
    setErrorsError(null);
    const result = await getErrorReports();
    if (result.success && result.errors) {
      setErrors(result.errors);
    } else if (result.error) {
      setErrors([]);
      setErrorsError(result.error);
      showToast({
        type: 'error',
        title: 'Failed to load error reports',
        message: result.error,
      });
    }
    setErrorsLoading(false);
  }, [isAdmin, showToast]);

  const loadErrorDetails = useCallback(async (errorId: string) => {
    // Cancel previous request if exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setErrorDetailLoading(true);
    setErrorAttachmentError(null);
    setAttachmentUploadError(null);
    try {
      const [notesResult, attachmentsResult] = await Promise.all([
        getErrorNotes(errorId),
        getErrorAttachments(errorId),
      ]);

      // Only update state if this request wasn't aborted
      if (abortControllerRef.current?.signal.aborted) return;

      if (notesResult.success && notesResult.notes) {
        setErrorNotes(notesResult.notes);
      } else if (notesResult.error) {
        setErrorNotes([]);
      }

      if (attachmentsResult.success && attachmentsResult.attachments) {
        setErrorAttachments(attachmentsResult.attachments);
        if (attachmentsResult.error) {
          setErrorAttachmentError(attachmentsResult.error);
        }
      } else if (attachmentsResult.error) {
        setErrorAttachments([]);
        setErrorAttachmentError(attachmentsResult.error);
      }
    } finally {
      setErrorDetailLoading(false);
    }
  }, []);

  const loadUserContext = async (user: User) => {
    setUserDetailLoading(true);
    const [sessionsResult, historyResult] = await Promise.all([
      getUserSessions(user.id),
      getLoginHistory(user.id),
    ]);

    if (sessionsResult.success && sessionsResult.sessions) {
      setUserSessions(sessionsResult.sessions);
    } else if (sessionsResult.error) {
      showToast({
        type: 'error',
        title: 'Failed to load user sessions',
        message: sessionsResult.error,
      });
    }

    if (historyResult.success && historyResult.history) {
      setUserLoginHistory(historyResult.history);
    } else if (historyResult.error) {
      showToast({
        type: 'error',
        title: 'Failed to load user login history',
        message: historyResult.error,
      });
    }

    setUserDetailLoading(false);
  };

  // Sync activeTab with URL search params
  useEffect(() => {
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [tabParam, activeTab]);

  // Update URL when activeTab changes
  useEffect(() => {
    setSearchParams({ tab: activeTab });
  }, [activeTab, setSearchParams]);

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    }
  }, [loadUsers, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    if (activeTab === 'dashboard') {
      loadUsers();
    } else if (activeTab === 'approvals') {
      loadApprovals();
    } else if (activeTab === 'security') {
      loadSecurityEvents();
    } else if (activeTab === 'errors') {
      loadErrors();
    }
  }, [activeTab, loadUsers, loadApprovals, loadSecurityEvents, loadErrors, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    if (activeTab === 'approvals') {
      loadApprovals();
    }
    setApprovalPage(1);
    setSelectedApprovals([]);
  }, [approvalsSearchTerm, activeTab, loadApprovals, isAdmin]);

  const roleCounts = useMemo(() => {
    return users.reduce(
      (acc, user) => {
        acc[user.role] = (acc[user.role] || 0) + 1;
        return acc;
      },
      { admin: 0, marketing: 0, user: 0 } as Record<UserRole, number>
    );
  }, [users]);

  const recentUsersCount = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return users.filter((user) => new Date(user.created_at) >= sevenDaysAgo).length;
  }, [users]);

  const filteredUsers = useMemo(() => {
    const lowerSearch = userSearchTerm.toLowerCase();
    return users.filter((user) => {
      const matchesSearch =
        user.email.toLowerCase().includes(lowerSearch) ||
        user.full_name.toLowerCase().includes(lowerSearch);
      const matchesRole = userRoleFilter === 'all' || user.role === userRoleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, userSearchTerm, userRoleFilter]);

  const filteredApprovals = useMemo(() => {
    const lowerSearch = approvalsSearchTerm.toLowerCase();
    return approvals.filter((user) => {
      return (
        user.email.toLowerCase().includes(lowerSearch) ||
        user.full_name.toLowerCase().includes(lowerSearch)
      );
    });
  }, [approvals, approvalsSearchTerm]);

  const totalApprovalPages = Math.max(1, Math.ceil(filteredApprovals.length / ADMIN_CONSTANTS.APPROVAL_PAGE_SIZE));

  useEffect(() => {
    if (approvalPage > totalApprovalPages) {
      setApprovalPage(totalApprovalPages);
    }
  }, [approvalPage, totalApprovalPages]);

  useEffect(() => {
    if (!focusedLoginId) return;
    const container = loginHistoryContainerRef.current;
    if (!container) {
      // Try again after a short delay if container not yet rendered
      const timer = setTimeout(() => {
        const retryContainer = loginHistoryContainerRef.current;
        if (retryContainer) {
          const target = retryContainer.querySelector<HTMLElement>(`[data-login-entry="${focusedLoginId}"]`);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }, ADMIN_CONSTANTS.AUTO_RETRY_DELAY_MS);
      return () => clearTimeout(timer);
    }
    const target = container.querySelector<HTMLElement>(`[data-login-entry="${focusedLoginId}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusedLoginId, userLoginHistory]);

  const approvalPageSlice = useMemo(() => {
    const start = (approvalPage - 1) * ADMIN_CONSTANTS.APPROVAL_PAGE_SIZE;
    return filteredApprovals.slice(start, start + ADMIN_CONSTANTS.APPROVAL_PAGE_SIZE);
  }, [filteredApprovals, approvalPage]);

  const userMap = useMemo(() => {
    const map = new Map<string, User>();
    users.forEach((user) => map.set(user.id, user));
    return map;
  }, [users]);

  const filteredSecurityEvents = useMemo(() => {
    const emailQuery = securityEmailFilter.toLowerCase();
    const locationQuery = securityLocationFilter.toLowerCase();

    return securityEvents.filter((event) => {
      const user = event.user_id ? userMap.get(event.user_id) : null;
      const emailMatch = emailQuery
        ? (user?.email || '').toLowerCase().includes(emailQuery)
        : true;
      const locationMatch = locationQuery
        ? (event.location || event.country_code || '')
            .toLowerCase()
            .includes(locationQuery)
        : true;
      const statusMatch =
        securityStatusFilter === 'all' ||
        (securityStatusFilter === 'suspicious' && event.suspicious) ||
        (securityStatusFilter === 'failed' && !event.success);

      return emailMatch && locationMatch && statusMatch;
    });
    // Note: Intentionally exclude userMap from dependencies as it's recreated on every user change
    // and would cause unnecessary re-renders. The lookup still works correctly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [securityEvents, securityEmailFilter, securityLocationFilter, securityStatusFilter]);

  const securityStats = useMemo(() => {
    const suspicious = securityEvents.filter((event) => event.suspicious);
    const failed = securityEvents.filter((event) => !event.success);
    const lastHour = securityEvents.filter((event) => {
      const eventTime = new Date(event.created_at).getTime();
      return Date.now() - eventTime <= 60 * 60 * 1000;
    });
    const affectedUsers = new Set(suspicious.map((event) => event.user_id).filter(Boolean));

    return {
      suspiciousCount: suspicious.length,
      failedCount: failed.length,
      affectedUsers: affectedUsers.size,
      alertsLastHour: lastHour.length,
    };
  }, [securityEvents]);

  const approvalsSelectedOnPage = approvalPageSlice.every((user) =>
    selectedApprovals.includes(user.id)
  );

  const handleToggleApprovalSelection = (userId: string) => {
    setSelectedApprovals((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleToggleSelectPage = () => {
    if (approvalsSelectedOnPage) {
      setSelectedApprovals((prev) => prev.filter((id) => !approvalPageSlice.some((user) => user.id === id)));
    } else {
      const newIds = approvalPageSlice.map((user) => user.id);
      setSelectedApprovals((prev) => Array.from(new Set([...prev, ...newIds])));
    }
  };

  const handleUserRoleChange = async (userId: string, role: UserRole) => {
    try {
      const result = await updateUserRole(userId, role, { adminId: adminId ?? undefined });
      if (!result.success && result.error) {
        showToast({ type: 'error', title: 'Failed to update role', message: result.error });
      } else {
        showToast({ type: 'success', title: 'Role updated', message: `User role changed to ${role}` });
      }
    } catch {
      showToast({ type: 'error', title: 'Unexpected error', message: 'Failed to update user role. Please try again.' });
    } finally {
      await loadUsers();
    }
  };

  const handleUserStatusChange = async (userId: string, status: UserStatus, reason?: string) => {
    try {
      const result = await updateUserStatus(userId, status, {
        adminId: adminId ?? undefined,
        reason,
      });
      if (!result.success && result.error) {
        showToast({ type: 'error', title: 'Failed to update user status', message: result.error });
      } else {
        showToast({ type: 'success', title: 'User status updated', message: `Status set to ${status.replace(/_/g, ' ')}` });
      }
    } finally {
      await loadUsers();
      if (activeTab === 'approvals') {
        await loadApprovals();
      }
    }
  };

  const handleApproveUser = async (userId: string) => {
    await handleUserStatusChange(userId, 'approved');
  };

  const handleRejectUser = async (userId: string) => {
    const reason = window.prompt('Optional: provide a rejection reason to include in the email.');
    await handleUserStatusChange(userId, 'rejected', reason || undefined);
  };

  const [bulkActionProgress, setBulkActionProgress] = useState({ current: 0, total: 0, action: '' });

  const handleBulkApprove = async () => {
    if (selectedApprovals.length === 0) return;
    setBulkActionInProgress(true);
    setBulkActionProgress({ current: 0, total: selectedApprovals.length, action: 'Approving' });
    try {
      const batchSize = 5;
      let failures: string[] = [];
      
      for (let i = 0; i < selectedApprovals.length; i += batchSize) {
        const batch = selectedApprovals.slice(i, i + batchSize);
        setBulkActionProgress({ current: i, total: selectedApprovals.length, action: 'Approving' });
        const responses = await Promise.all(
          batch.map((userId) =>
            updateUserStatus(userId, 'approved', { adminId: adminId ?? undefined })
          )
        );
        const batchFailures = responses.filter((res) => !res.success && res.error).map((res) => res.error ?? 'Unknown error');
        failures = [...failures, ...batchFailures];
        setBulkActionProgress({ current: Math.min(i + batchSize, selectedApprovals.length), total: selectedApprovals.length, action: 'Approving' });
        if (i + batchSize < selectedApprovals.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      if (failures.length > 0) {
        showToast({
          type: 'error',
          title: 'Some approvals failed',
          message: failures.length === 1 ? failures[0] : `${failures.length} approvals failed`,
        });
      } else if (selectedApprovals.length > 0) {
        showToast({
          type: 'success',
          title: 'Users approved',
          message: `${selectedApprovals.length} account(s) approved successfully`,
        });
      }
    } finally {
      setSelectedApprovals([]);
      setBulkActionInProgress(false);
      setBulkActionProgress({ current: 0, total: 0, action: '' });
      await loadUsers();
      await loadApprovals();
    }
  };

  const handleBulkReject = async () => {
    if (selectedApprovals.length === 0) return;
    const reason = window.prompt('Optional: provide a rejection reason for the selected users.');
    setBulkActionInProgress(true);
    setBulkActionProgress({ current: 0, total: selectedApprovals.length, action: 'Rejecting' });
    try {
      const batchSize = 5;
      let failures: string[] = [];
      
      for (let i = 0; i < selectedApprovals.length; i += batchSize) {
        const batch = selectedApprovals.slice(i, i + batchSize);
        setBulkActionProgress({ current: i, total: selectedApprovals.length, action: 'Rejecting' });
        const responses = await Promise.all(
          batch.map((userId) =>
            updateUserStatus(userId, 'rejected', {
              adminId: adminId ?? undefined,
              reason: reason || undefined,
            })
          )
        );
        const batchFailures = responses.filter((res) => !res.success && res.error).map((res) => res.error ?? 'Unknown error');
        failures = [...failures, ...batchFailures];
        setBulkActionProgress({ current: Math.min(i + batchSize, selectedApprovals.length), total: selectedApprovals.length, action: 'Rejecting' });
        if (i + batchSize < selectedApprovals.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      if (failures.length > 0) {
        showToast({
          type: 'error',
          title: 'Some rejections failed',
          message: failures.length === 1 ? failures[0] : `${failures.length} rejections failed`,
        });
      } else if (selectedApprovals.length > 0) {
        showToast({
          type: 'success',
          title: 'Users rejected',
          message: `${selectedApprovals.length} account(s) rejected successfully`,
        });
      }
    } finally {
      setSelectedApprovals([]);
      setBulkActionInProgress(false);
      setBulkActionProgress({ current: 0, total: 0, action: '' });
      await loadUsers();
      await loadApprovals();
    }
  };

  const handleOpenUser = async (user: User, loginId?: string) => {
    setSelectedUser(user);
    setFocusedLoginId(loginId ?? null);
    await loadUserContext(user);
  };

  const handleCloseUser = () => {
    setSelectedUser(null);
    setUserSessions([]);
    setUserLoginHistory([]);
    setFocusedLoginId(null);
  };

  const handleRevokeSessionClick = (sessionId: string, userId?: string) => {
    setSessionToRevoke({ id: sessionId, userId });
    setShowRevokeConfirm(true);
  };

  const handleRevokeSession = async () => {
    if (!sessionToRevoke) return;
    const result = await revokeSession(sessionToRevoke.id, {
      adminId: adminId ?? undefined,
      targetUserId: sessionToRevoke.userId,
    });
    if (!result.success && result.error) {
      showToast({ type: 'error', title: 'Failed to revoke session', message: result.error });
    } else {
      showToast({ type: 'success', title: 'Session revoked', message: 'The selected session was revoked.' });
    }
    setShowRevokeConfirm(false);
    setSessionToRevoke(null);
    if (selectedUser) {
      await loadUserContext(selectedUser);
    }
  };

  // handleForceLogoutClick is used in JSX below
  const handleForceLogoutClick = useCallback(() => {
    if (!selectedUser) return;
    setShowForceLogoutConfirm(true);
  }, [selectedUser]);

  const handleForceLogout = async () => {
    if (!selectedUser) return;
    setForceLogoutLoading(true);
    const result = await forceLogoutUserSessions(selectedUser.id, { adminId: adminId ?? undefined });
    if (!result.success && result.error) {
      showToast({ type: 'error', title: 'Failed to force logout', message: result.error });
    } else {
      showToast({ type: 'success', title: 'User logged out', message: 'All active sessions were revoked.' });
    }
    setShowForceLogoutConfirm(false);
    await loadUserContext(selectedUser);
    setForceLogoutLoading(false);
  };

  const handleSecurityOpenUser = async (userId: string | null, loginId?: string) => {
    if (!userId) return;
    const user = userMap.get(userId);
    if (!user) {
      showToast({ type: 'error', title: 'User not found', message: 'User record not available for this event.' });
      return;
    }
    await handleOpenUser(user, loginId);
  };

  const handleOpenError = async (error: ErrorReport) => {
    setSelectedError(error);
    await loadErrorDetails(error.id);
  };

  const handleCloseError = () => {
    setSelectedError(null);
    setErrorNotes([]);
    setErrorAttachments([]);
    setErrorNoteDraft('');
  };

  const handleUpdateErrorStatus = async (errorId: string, status: ErrorStatus) => {
    const result = await updateErrorStatus(errorId, status, { adminId: adminId ?? undefined });
    if (!result.success && result.error) {
      showToast({ type: 'error', title: 'Failed to update error status', message: result.error });
    } else {
      showToast({ type: 'success', title: 'Error status updated', message: `Status set to ${status}` });
    }
    await loadErrors();
    await loadErrorDetails(errorId);
  };

  const handleAddErrorNote = async () => {
    if (!selectedError || !errorNoteDraft.trim()) return;
    const result = await addErrorNote(selectedError.id, errorNoteDraft.trim(), {
      adminId: adminId ?? undefined,
    });
    if (!result.success && result.error) {
      showToast({ type: 'error', title: 'Failed to add note', message: result.error });
    } else {
      showToast({ type: 'success', title: 'Note added', message: 'Your note was added to the error.' });
    }
    setErrorNoteDraft('');
    await loadErrorDetails(selectedError.id);
  };

  const handleRetryError = async () => {
    if (!selectedError) return;
    const result = await retryErrorAction(selectedError.id, { adminId: adminId ?? undefined });
    if (!result.success && result.error) {
      showToast({ type: 'error', title: 'Failed to trigger retry', message: result.error });
    } else {
      showToast({
        type: 'info',
        title: 'Retry triggered',
        message: 'A retry was requested. Monitor logs or error status for updates.',
      });
    }
  };

  const handleAttachmentUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!selectedError) return;
    const file = event.target.files?.[0];
    if (!file) return;

    // Client-side validation
    const maxSizeMB = ADMIN_CONSTANTS.FILE_UPLOAD_MAX_SIZE_MB;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setAttachmentUploadError(`File size exceeds ${maxSizeMB}MB limit. File size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
      event.target.value = '';
      return;
    }

    const allowedTypes = ['image/', 'application/pdf', 'text/plain', 'text/x-log'];
    const isAllowedType = allowedTypes.some(type => file.type.startsWith(type.replace(/\/$/, '')));
    if (!isAllowedType) {
      setAttachmentUploadError(`File type not allowed. Accepted: images, PDF, TXT, LOG files`);
      event.target.value = '';
      return;
    }

    if (!adminId) {
      setAttachmentUploadError('Your admin session is missing. Please sign in again.');
      event.target.value = '';
      return;
    }

    setAttachmentUploading(true);
    setAttachmentUploadError(null);
    try {
      const result = await uploadErrorAttachment(selectedError.id, file, { adminId });
      if (!result.success && result.error) {
        setAttachmentUploadError(result.error);
        showToast({ type: 'error', title: 'Failed to upload attachment', message: result.error });
      } else {
        await loadErrorDetails(selectedError.id);
        showToast({ type: 'success', title: 'Attachment uploaded', message: 'Your file was attached to the error.' });
      }
    } finally {
      setAttachmentUploading(false);
      event.target.value = '';
    }
  };

  const tabs = [
    { id: 'dashboard' as TabType, label: 'Admin Home', icon: LayoutDashboard },
    { id: 'approvals' as TabType, label: 'Pending Approvals', icon: UserCheck },
    { id: 'security' as TabType, label: 'Security Watch', icon: ShieldAlert },
    { id: 'errors' as TabType, label: 'Error Reports', icon: Bug },
    { id: 'email-accounts' as TabType, label: 'Email Accounts', icon: Mail },
    { id: 'offline-sync' as TabType, label: 'Sync Dashboard', icon: RefreshCw },
    { id: 'cache-settings' as TabType, label: 'Cache Management', icon: HardDrive },
    { id: 'job-extraction' as TabType, label: 'Job Extraction Agent', icon: AlertTriangle },
  ];

  // --- MOVED: Conditional check is now AFTER all hooks ---
  if (!isAdmin) {
    return (
      <div className="p-8">
        <div className="max-w-2xl mx-auto card-base p-6 text-center">
          <h2 className="text-xs font-medium text-gray-900">Not authorized</h2>
          <p className="text-gray-600 mt-2 text-xs">You do not have permission to view the Admin Panel.</p>
          <p className="text-gray-500 mt-4 text-xs">Use the sidebar to access available sections for your role.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-xs font-medium text-gray-900">Administration</h1>
        <p className="text-gray-600">
          Monitor users, onboard new accounts, investigate security events, and keep the system healthy.
        </p>
      </header>

      <nav className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center gap-2 p-4 border-b border-gray-200 text-gray-900">
          {(() => {
            const activeConfig = tabs.find((tab) => tab.id === activeTab);
            if (!activeConfig) return null;
            const ActiveIcon = activeConfig.icon;
            return (
              <>
                <ActiveIcon className="w-4 h-4 text-primary-600" aria-hidden="true" />
                <span className="text-xs font-medium">{activeConfig.label}</span>
              </>
            );
          })()}
        </div>

        <div className="p-6">
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-primary-50 border border-primary-100 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-primary-800">Total Users</p>
                      <p className="text-xs font-medium text-primary-900">{users.length}</p>
                    </div>
                    <UsersIcon className="w-8 h-8 text-primary-400" />
                  </div>
                </div>
                <div className="bg-green-50 border border-green-100 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-green-700">Joined (7 days)</p>
                      <p className="text-xs font-medium text-green-900">{recentUsersCount}</p>
                    </div>
                    <CheckCircle2 className="w-8 h-8 text-green-400" />
                  </div>
                </div>
                <div className="bg-purple-50 border border-purple-100 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-purple-700">Admins</p>
                      <p className="text-xs font-medium text-purple-900">{roleCounts.admin}</p>
                    </div>
                    <ShieldAlert className="w-8 h-8 text-purple-400" />
                  </div>
                  <p className="text-xs text-purple-700 mt-2">
                    Safety guard in place – the last admin cannot be removed.
                  </p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-amber-700">Pending Actions</p>
                      <p className="text-xs font-medium text-amber-900">
                        {approvalStats?.totalPending ?? '-'}
                      </p>
                    </div>
                    <AlertTriangle className="w-8 h-8 text-amber-400" />
                  </div>
                  <p className="text-xs text-amber-700 mt-2">
                    Review approvals and flagged events regularly.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <section className="lg:col-span-2 bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-inner">
                  <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                    <div>
                      <h2 className="text-xs font-medium text-gray-900">User Management</h2>
                      <p className="text-gray-600 text-xs">
                        Search, filter, and manage account access. Open a profile for full history and devices.
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                        <input
                          value={userSearchTerm}
                          onChange={(event) => setUserSearchTerm(event.target.value)}
                          placeholder="Search by name or email"
                          className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600"
                        />
                      </div>
                      <div className="relative">
                        <Filter className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                        <select
                          value={userRoleFilter}
                          onChange={(event) => setUserRoleFilter(event.target.value as 'all' | UserRole)}
                          className="pl-9 pr-8 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600"
                        >
                          <option value="all">All roles</option>
                          <option value="admin">Admin</option>
                          <option value="marketing">Marketing</option>
                          <option value="user">User</option>
                        </select>
                      </div>
                    </div>
                  </header>

                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    {usersLoading ? (
                      <div className="py-12 text-center text-gray-500">Loading users…</div>
                    ) : filteredUsers.length === 0 ? (
                      <div className="py-12 text-center text-gray-500">No users match the current filters.</div>
                    ) : filteredUsers.length === 0 ? (
                      <div className="py-12 text-center text-gray-500">No users match the current filters.</div>
                    ) : (
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="overflow-x-auto max-h-96">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50 text-gray-500 uppercase text-xs tracking-wide sticky top-0 z-10">
                              <tr>
                                <th className="px-6 py-3 text-left">User</th>
                                <th className="px-6 py-3 text-left">Role</th>
                                <th className="px-6 py-3 text-left">Status</th>
                                <th className="px-6 py-3 text-left">Joined</th>
                                <th className="px-6 py-3 text-left">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {filteredUsers.map((user) => (
                                <tr key={user.id} className="hover:bg-gray-50">
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-800 flex items-center justify-center font-medium flex-shrink-0">
                                        {getInitials(user.full_name)}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="font-medium text-gray-900 truncate">{user.full_name}</p>
                                        <p className="text-gray-500 text-xs truncate">{user.email}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4">
                                    <select
                                      value={user.role}
                                      onChange={(event) => handleUserRoleChange(user.id, event.target.value as UserRole)}
                                      className="border border-gray-300 rounded-md px-3 py-2 text-xs focus:ring-2 focus:ring-primary-600"
                                    >
                                      <option value="user">User</option>
                                      <option value="marketing">Marketing</option>
                                      <option value="admin">Admin</option>
                                    </select>
                                  </td>
                                  <td className="px-6 py-4">
                                    <select
                                      value={user.status}
                                      onChange={(event) => handleUserStatusChange(user.id, event.target.value as UserStatus)}
                                      className="border border-gray-300 rounded-md px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500"
                                    >
                                      {userStatusOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-6 py-4 text-gray-600 text-xs">{formatDateTime(user.created_at)}</td>
                                  <td className="px-6 py-4">
                                    <button
                                      onClick={() => handleOpenUser(user)}
                                      className="text-primary-700 hover:text-primary-800 font-medium text-xs"
                                    >
                                      View
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                <aside className="space-y-4">
                  <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                    <h3 className="text-xs font-medium text-gray-900 mb-4 flex items-center gap-2">
                      <ShieldAlert className="w-5 h-5 text-primary-500" />
                      Role Directory
                    </h3>
                    <div className="space-y-4">
                      {roleDirectory.map((entry) => (
                        <div key={entry.role} className="border border-gray-200 rounded-lg p-4">
                          <p className="font-medium text-gray-900">{entry.label}</p>
                          <p className="text-xs text-gray-500 mt-1">{entry.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                    <h3 className="text-xs font-medium text-gray-900 mb-2">Approval snapshot</h3>
                    <p className="text-xs text-gray-600 mb-4">
                      Track the onboarding pipeline. Daily signups and approval staging are refreshed automatically.
                    </p>
                    <div className="space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Pending approval</span>
                        <span className="font-medium text-gray-900">
                          {approvalStats?.pendingApproval ?? '-'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Pending verification</span>
                        <span className="font-medium text-gray-900">
                          {approvalStats?.pendingVerification ?? '-'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Approved overall</span>
                        <span className="font-medium text-gray-900">
                          {approvalStats?.totalApproved ?? '-'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">New today</span>
                        <span className="font-medium text-gray-900">
                          {approvalStats?.todaySignups ?? '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          )}

          {activeTab === 'approvals' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-xs font-medium text-gray-900">Pending Approvals</h2>
                  <p className="text-gray-600 text-xs">
                    Review new signups, approve qualified accounts, or provide guidance when rejecting.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  {/* Bulk Action Progress */}
                  {bulkActionInProgress && bulkActionProgress.total > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-blue-900">
                          {bulkActionProgress.action} {bulkActionProgress.current} of {bulkActionProgress.total}
                        </span>
                        <span className="text-xs text-blue-700">
                          {Math.round((bulkActionProgress.current / bulkActionProgress.total) * 100)}%
                        </span>
                      </div>
                      <div className="w-full bg-blue-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(bulkActionProgress.current / bulkActionProgress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={handleBulkApprove}
                      disabled={selectedApprovals.length === 0 || approvalsLoading || bulkActionInProgress}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium ${
                        selectedApprovals.length === 0 || approvalsLoading || bulkActionInProgress
                          ? 'bg-green-100 text-green-400 cursor-not-allowed'
                          : 'bg-green-600 text-white hover:bg-green-700'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {bulkActionInProgress ? 'Processing…' : 'Bulk approve'}
                    </button>
                    <button
                      onClick={handleBulkReject}
                      disabled={selectedApprovals.length === 0 || approvalsLoading || bulkActionInProgress}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium ${
                        selectedApprovals.length === 0 || approvalsLoading || bulkActionInProgress
                          ? 'bg-red-100 text-red-400 cursor-not-allowed'
                          : 'bg-red-600 text-white hover:bg-red-700'
                      }`}
                    >
                      <XCircle className="w-4 h-4" />
                      {bulkActionInProgress ? 'Processing…' : 'Bulk reject'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <input
                    value={approvalsSearchTerm}
                    onChange={(event) => setApprovalsSearchTerm(event.target.value)}
                    placeholder="Search pending accounts"
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={loadApprovals}
                  className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {approvalsLoading ? (
                  <div className="py-12 text-center text-gray-500">Fetching pending approvals…</div>
                ) : filteredApprovals.length === 0 ? (
                  <div className="py-12 text-center text-gray-500">No accounts awaiting action.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 text-gray-500 uppercase text-xs tracking-wide">
                        <tr>
                          <th className="px-6 py-3">
                            <input
                              type="checkbox"
                              checked={approvalsSelectedOnPage}
                              onChange={handleToggleSelectPage}
                              className="rounded"
                            />
                          </th>
                          <th className="px-6 py-3 text-left">User</th>
                          <th className="px-6 py-3 text-left">Verification Status</th>
                          <th className="px-6 py-3 text-left">Origin IP</th>
                          <th className="px-6 py-3 text-left">Signup Date</th>
                          <th className="px-6 py-3 text-left">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {approvalPageSlice.map((user) => (
                          <tr key={user.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4">
                              <input
                                type="checkbox"
                                checked={selectedApprovals.includes(user.id)}
                                onChange={() => handleToggleApprovalSelection(user.id)}
                                className="rounded"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="font-medium text-gray-900">{user.full_name}</span>
                                <span className="text-gray-500">{user.email}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-gray-600 capitalize">{user.status.replace(/_/g, ' ')}</td>
                            <td className="px-6 py-4 text-gray-500">{getUserOriginIp(user)}</td>
                            <td className="px-6 py-4 text-gray-600">{formatDateTime(user.created_at)}</td>
                            <td className="px-6 py-4 flex flex-wrap gap-2">
                              <button
                                onClick={() => handleApproveUser(user.id)}
                                className="text-green-600 hover:text-green-700 font-medium"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleRejectUser(user.id)}
                                className="text-red-600 hover:text-red-700 font-medium"
                              >
                                Reject
                              </button>
                              <button
                                onClick={() => handleOpenUser(user)}
                                className="text-blue-600 hover:text-blue-700 font-medium"
                              >
                                View profile
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-gray-600">
                <p>
                  Showing page {approvalPage} of {totalApprovalPages} ({filteredApprovals.length} records)
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setApprovalPage((page) => Math.max(1, page - 1))}
                    disabled={approvalPage === 1}
                    className={`px-3 py-1.5 border rounded-lg ${
                      approvalPage === 1 ? 'text-gray-400 border-gray-200' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setApprovalPage((page) => Math.min(totalApprovalPages, page + 1))}
                    disabled={approvalPage === totalApprovalPages}
                    className={`px-3 py-1.5 border rounded-lg ${
                      approvalPage === totalApprovalPages
                        ? 'text-gray-400 border-gray-200'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h2 className="text-xs font-medium text-gray-900">Security Watch</h2>
                  <p className="text-gray-600 text-xs">
                    Investigate anomalies quickly. Filter by email, location, or status and open a user’s history.
                  </p>
                </div>
                <button
                  onClick={loadSecurityEvents}
                  className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100"
                >
                  <RefreshCw className="w-4 h-4" /> Refresh now
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <p className="text-xs text-gray-500">Suspicious logins</p>
                  <p className="text-xs font-medium text-gray-900">{securityStats.suspiciousCount}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <p className="text-xs text-gray-500">Failed attempts</p>
                  <p className="text-xs font-medium text-gray-900">{securityStats.failedCount}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <p className="text-xs text-gray-500">Users affected</p>
                  <p className="text-xs font-medium text-gray-900">{securityStats.affectedUsers}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <p className="text-xs text-gray-500">Alerts (last hour)</p>
                  <p className="text-xs font-medium text-gray-900">{securityStats.alertsLastHour}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <input
                    value={securityEmailFilter}
                    onChange={(event) => setSecurityEmailFilter(event.target.value)}
                    placeholder="Filter by user email"
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <input
                    value={securityLocationFilter}
                    onChange={(event) => setSecurityLocationFilter(event.target.value)}
                    placeholder="Filter by location"
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="relative">
                  <Filter className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <select
                    value={securityStatusFilter}
                    onChange={(event) => setSecurityStatusFilter(event.target.value as 'all' | 'suspicious' | 'failed')}
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All statuses</option>
                    <option value="suspicious">Suspicious only</option>
                    <option value="failed">Failed only</option>
                  </select>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {securityLoading ? (
                  <div className="py-12 text-center text-gray-500">Loading security events…</div>
                ) : filteredSecurityEvents.length === 0 ? (
                  <div className="py-12 text-center text-gray-500">No events match the current filters.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 text-gray-500 uppercase text-xs tracking-wide">
                        <tr>
                          <th className="px-6 py-3 text-left">User</th>
                          <th className="px-6 py-3 text-left">Device</th>
                          <th className="px-6 py-3 text-left">IP / Location</th>
                          <th className="px-6 py-3 text-left">Status</th>
                          <th className="px-6 py-3 text-left">Reason</th>
                          <th className="px-6 py-3 text-left">Timestamp</th>
                          <th className="px-6 py-3 text-left">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {filteredSecurityEvents.map((event) => {
                          const user = event.user_id ? userMap.get(event.user_id) : null;
                          return (
                            <tr key={event.id} className={event.suspicious ? 'bg-red-50/40' : ''}>
                              <td className="px-6 py-4">
                                {user ? (
                                  <div className="flex flex-col">
                                    <span className="font-medium text-gray-900">{user.full_name}</span>
                                    <span className="text-gray-500">{user.email}</span>
                                  </div>
                                ) : (
                                  <span className="text-gray-500">Unknown</span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-gray-600">
                                <div className="flex flex-col">
                                  <span className="flex items-center gap-2">
                                    <MonitorSmartphone className="w-4 h-4 text-gray-400" />
                                    {event.device || 'Unknown device'}
                                  </span>
                                  <span className="text-xs text-gray-500">{event.browser} • {event.os}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-gray-600">
                                <div className="flex flex-col">
                                  <span className="flex items-center gap-2">
                                    <Globe className="w-4 h-4 text-gray-400" />
                                    {event.ip_address}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {event.location || event.country_code || 'Unknown location'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span
                                  className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                                    event.success
                                      ? 'bg-green-100 text-green-700'
                                      : event.suspicious
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-yellow-100 text-yellow-700'
                                  }`}
                                >
                                  {event.success ? 'Success' : event.suspicious ? 'Suspicious' : 'Failed'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-gray-600">
                                {event.failure_reason || (event.suspicious ? 'Suspicious pattern detected' : '-')}
                              </td>
                              <td className="px-6 py-4 text-gray-600">
                                <div className="flex flex-col">
                                  <span>{formatDateTime(event.created_at)}</span>
                                  <span className="text-xs text-gray-500">{timeAgo(event.created_at)}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <button
                                  onClick={() => handleSecurityOpenUser(event.user_id, event.id)}
                                  className="text-blue-600 hover:text-blue-700 font-medium"
                                >
                                  View history
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'errors' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h2 className="text-xs font-medium text-gray-900">Error Reports</h2>
                  <p className="text-gray-600 text-xs">
                    Triage issues, inspect stack traces, add notes, and keep everyone aligned.
                  </p>
                </div>
                <button
                  onClick={loadErrors}
                  className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100"
                >
                  <RefreshCw className="w-4 h-4" /> Refresh
                </button>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {errorsLoading ? (
                  <div className="py-12 text-center text-gray-500">Loading error reports…</div>
                ) : errorsError ? (
                  <div className="py-12 flex flex-col items-center gap-3 text-gray-600">
                    <p>Unable to load error reports: {errorsError}</p>
                    <button
                      onClick={loadErrors}
                      className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100"
                    >
                      <RefreshCw className="w-4 h-4" /> Retry
                    </button>
                  </div>
                ) : errors.length === 0 ? (
                  <div className="py-12 text-center text-gray-500">No error reports available.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 text-gray-500 uppercase text-xs tracking-wide">
                        <tr>
                          <th className="px-6 py-3 text-left">Summary</th>
                          <th className="px-6 py-3 text-left">Reporter</th>
                          <th className="px-6 py-3 text-left">Status</th>
                          <th className="px-6 py-3 text-left">Reported</th>
                          <th className="px-6 py-3 text-left">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {errors.map((error) => (
                          <tr key={error.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4">
                              <p className="font-medium text-gray-900">{error.error_message.slice(0, ADMIN_CONSTANTS.ERROR_MESSAGE_PREVIEW_LENGTH)}</p>
                              <p className="text-xs text-gray-500 truncate">{error.error_type || 'Unknown type'}</p>
                            </td>
                            <td className="px-6 py-4 text-gray-600">{error.user_id ? userMap.get(error.user_id)?.email || 'System' : 'System'}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${errorStatusStyles[error.status]}`}>
                                {error.status.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-gray-600">
                              <div className="flex flex-col">
                                <span>{formatDateTime(error.created_at)}</span>
                                <span className="text-xs text-gray-500">{timeAgo(error.created_at)}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <button
                                onClick={() => handleOpenError(error)}
                                className="text-blue-600 hover:text-blue-700 font-medium"
                              >
                                View details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'email-accounts' && (
            <Suspense fallback={<div className="p-8 text-center">Loading email settings...</div>}>
              <EmailAccountsAdmin />
            </Suspense>
          )}

          {activeTab === 'offline-sync' && (
            <Suspense fallback={<div className="p-8 text-center">Loading sync dashboard...</div>}>
              <SyncDashboard />
            </Suspense>
          )}

          {activeTab === 'cache-settings' && (
            <Suspense fallback={<div className="p-8 text-center">Loading cache settings...</div>}>
              <OfflineCacheSettings />
            </Suspense>
          )}

          {activeTab === 'job-extraction' && (
            <Suspense fallback={<div className="p-8 text-center">Loading job extraction agent...</div>}>
              <JobExtractionAgentDashboard />
            </Suspense>
          )}
        </div>
      </nav>

      {selectedUser && (
        <div className="fixed inset-0 bg-black/40 z-40 flex justify-end">
          <div className="w-full max-w-xl h-full bg-white shadow-2xl overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-start justify-between">
              <div>
                <h3 className="text-xs font-medium text-gray-900">{selectedUser.full_name}</h3>
                <p className="text-gray-600">{selectedUser.email}</p>
                <p className="text-xs text-gray-500 mt-1 capitalize">{selectedUser.status.replace(/_/g, ' ')}</p>
              </div>
              <button onClick={handleCloseUser} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>

            <div className="p-6 space-y-6">
              <section className="space-y-3">
                <h4 className="text-lg font-medium text-gray-900">Account controls</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Role</label>
                    <select
                      value={selectedUser.role}
                      onChange={async (event) => {
                        await handleUserRoleChange(selectedUser.id, event.target.value as UserRole);
                        const updated = userMap.get(selectedUser.id);
                        if (updated) setSelectedUser(updated);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="user">User</option>
                      <option value="marketing">Marketing</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Status</label>
                    <select
                      value={selectedUser.status}
                      onChange={async (event) => {
                        await handleUserStatusChange(
                          selectedUser.id,
                          event.target.value as UserStatus
                        );
                        const updated = userMap.get(selectedUser.id);
                        if (updated) setSelectedUser(updated);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      {userStatusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  onClick={handleForceLogoutClick}
                  disabled={forceLogoutLoading}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium ${
                    forceLogoutLoading
                      ? 'bg-red-100 text-red-400 cursor-not-allowed'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  <LogOut className="w-4 h-4" /> Force logout from all devices
                </button>
              </section>

              <section>
                <header className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-medium text-gray-900">Active sessions</h4>
                  <span className="text-xs text-gray-500">{userSessions.length} active</span>
                </header>
                <div className="space-y-3">
                  {userDetailLoading ? (
                    <div className="py-6 text-center text-gray-500">Loading sessions…</div>
                  ) : userSessions.length === 0 ? (
                    <div className="py-6 text-center text-gray-500">No active sessions.</div>
                  ) : (
                    userSessions.map((session) => (
                      <div
                        key={session.id}
                        className="border border-gray-200 rounded-lg p-4 flex flex-col gap-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <MonitorSmartphone className="w-5 h-5 text-gray-400" />
                            <div>
                              <p className="font-medium text-gray-900">
                                {session.browser || 'Unknown browser'} • {session.os || 'Unknown OS'}
                              </p>
                              <p className="text-xs text-gray-500">{session.device || 'Unknown device'}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleRevokeSessionClick(session.id, session.user_id ?? undefined)}
                            className="text-red-600 hover:text-red-700 text-xs font-medium"
                          >
                            Revoke
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                          <span>IP: {session.ip_address}</span>
                          <span>Last activity: {formatDateTime(session.last_activity)}</span>
                          <span>Location: {session.location || 'N/A'}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section>
                <h4 className="text-xs font-medium text-gray-900 mb-3">Login history</h4>
                {userDetailLoading ? (
                  <div className="py-6 text-center text-gray-500">Loading login history…</div>
                ) : userLoginHistory.length === 0 ? (
                  <div className="py-6 text-center text-gray-500">No login history available.</div>
                ) : (
                  <div className="space-y-2 text-xs">
                    {userLoginHistory.slice(0, ADMIN_CONSTANTS.LOGIN_HISTORY_SLICE_LIMIT).map((entry) => (
                      <div
                        key={entry.id}
                        className={`rounded-lg border p-3 flex items-center justify-between ${
                          entry.success ? 'border-green-200 bg-green-50/60' : 'border-red-200 bg-red-50/60'
                        }`}
                      >
                        <div>
                          <p className="font-medium text-gray-900">
                            {entry.success ? 'Successful login' : 'Failed login'} • {formatDateTime(entry.created_at)}
                          </p>
                          <p className="text-xs text-gray-600">
                            {entry.browser} • {entry.os} • {entry.ip_address}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {entry.failure_reason || (entry.suspicious ? 'Marked as suspicious' : 'No issues detected')}
                          </p>
                        </div>
                        <span className="text-xs text-gray-500">{timeAgo(entry.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      {selectedError && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end">
          <div className="w-full max-w-3xl h-full bg-white shadow-2xl overflow-y-auto">
            <div className="sticky top-0 z-10 p-6 border-b border-gray-200 flex items-start justify-between bg-white">
              <div>
                <p className="text-xs uppercase text-gray-500">Error report</p>
                <h3 className="text-xs font-medium text-gray-900">{selectedError.error_message}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {selectedError.url || 'No URL provided'} • {formatDateTime(selectedError.created_at)}
                </p>
              </div>
              <button onClick={handleCloseError} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>

            <div className="p-6 space-y-6">
              <section className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex flex-wrap gap-4 items-center justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${errorStatusStyles[selectedError.status]}`}>
                        {selectedError.status.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-gray-500">Reporter: {selectedError.user_id ? userMap.get(selectedError.user_id)?.email || 'User' : 'System'}</span>
                    </div>
                    <p className="text-xs text-gray-600">{selectedError.error_type || 'Unclassified error'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={selectedError.status}
                      onChange={async (event) => {
                        const status = event.target.value as ErrorStatus;
                        await handleUpdateErrorStatus(selectedError.id, status);
                        const refreshed = errors.find((error) => error.id === selectedError.id);
                        if (refreshed) setSelectedError(refreshed);
                      }}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="new">New</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                    <button
                      onClick={handleRetryError}
                      className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100"
                    >
                      <RefreshCw className="w-4 h-4" /> Trigger retry
                    </button>
                  </div>
                </div>
              </section>

              <section>
                <h4 className="text-xs font-medium text-gray-900 mb-2">Stack trace</h4>
                <pre className="bg-gray-900 text-gray-100 text-xs rounded-lg p-4 overflow-x-auto whitespace-pre-wrap">
{selectedError.error_stack || 'No stack trace captured.'}
                </pre>
              </section>

              <section>
                <h4 className="text-xs font-medium text-gray-900 mb-2">Attachments</h4>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <label className={`inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-xs font-medium cursor-pointer ${
                    attachmentUploading ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-100'
                  }`}>
                    <input
                      type="file"
                      className="hidden"
                      onChange={handleAttachmentUpload}
                      disabled={attachmentUploading}
                      accept="image/*,.pdf,.txt,.log"
                    />
                    Upload attachment
                  </label>
                  {attachmentUploading && <span className="text-xs text-gray-500">Uploading…</span>}
                </div>
                {attachmentUploadError && (
                  <p className="text-xs text-red-600 mb-2">{attachmentUploadError}</p>
                )}
                {errorAttachmentError && (
                  <p className="text-xs text-amber-600 mb-2">{errorAttachmentError}</p>
                )}
                {errorDetailLoading ? (
                  <p className="text-gray-500 text-xs">Loading attachments…</p>
                ) : errorAttachments.length === 0 ? (
                  <p className="text-gray-500 text-xs">No attachments provided.</p>
                ) : (
                  <ul className="space-y-2 text-xs text-blue-600">
                    {errorAttachments.map((attachment) => {
                      const href = (attachment as Attachment & { download_url?: string | null }).download_url ?? null;
                      const sizeKb = Math.max(1, Math.round(attachment.file_size / 1024));
                      return (
                        <li key={attachment.id}>
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline"
                            >
                              {attachment.filename} ({sizeKb} KB)
                            </a>
                          ) : (
                            <span className="text-gray-600">
                              {attachment.filename} ({sizeKb} KB)
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="space-y-3">
                <h4 className="text-xs font-medium text-gray-900">Internal notes</h4>
                <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                  {errorDetailLoading ? (
                    <p className="text-gray-500 text-xs">Loading notes…</p>
                  ) : errorNotes.length === 0 ? (
                    <p className="text-gray-500 text-xs">No notes yet. Use notes to keep admins aligned.</p>
                  ) : (
                    errorNotes.map((note) => (
                      <div key={note.id} className="border border-gray-200 rounded-lg p-3">
                        <p className="text-xs text-gray-900">{String((note.details as Record<string, unknown>)?.note || 'Note added.')}</p>
                        <p className="text-xs text-gray-500 mt-2">
                          {formatDateTime(note.created_at)} ({timeAgo(note.created_at)})
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    value={errorNoteDraft}
                    onChange={(event) => setErrorNoteDraft(event.target.value)}
                    placeholder="Add an internal note"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleAddErrorNote}
                    disabled={!errorNoteDraft.trim()}
                    className={`px-4 py-2 rounded-lg text-xs font-medium ${
                      errorNoteDraft.trim()
                        ? 'bg-primary-800 text-white hover:bg-primary-900'
                        : 'bg-primary-100 text-primary-300 cursor-not-allowed'
                    }`}
                  >
                    Add note
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Session Confirmation */}
      <ConfirmDialog
        isOpen={showRevokeConfirm}
        onClose={() => {
          setShowRevokeConfirm(false);
          setSessionToRevoke(null);
        }}
        onConfirm={handleRevokeSession}
        title="Revoke Session"
        message="Revoke this session? The user will be signed out on that device."
        confirmLabel="Revoke"
        cancelLabel="Cancel"
        variant="warning"
      />

      {/* Force Logout Confirmation */}
      <ConfirmDialog
        isOpen={showForceLogoutConfirm}
        onClose={() => setShowForceLogoutConfirm(false)}
        onConfirm={handleForceLogout}
        title="Force Logout"
        message={selectedUser ? `Force logout all active sessions for ${selectedUser.full_name}?` : 'Force logout all active sessions?'}
        confirmLabel="Force Logout"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={forceLogoutLoading}
      />
    </div>
  );
};