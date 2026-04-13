import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { getNotifications, getUnreadCount, markAsRead, markAllAsRead } from '../lib/api/notifications';
import type { Database } from '../lib/database.types';
import { supabase } from '../lib/supabase';

type Notification = Database['public']['Tables']['notifications']['Row'];

export const useNotifications = () => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    const result = await getNotifications(userId);
    if (result.success && result.notifications) {
      setNotifications(result.notifications);
    }
    setLoading(false);
  }, [userId]);

  const loadUnreadCount = useCallback(async () => {
    if (!userId) return;

    const result = await getUnreadCount(userId);
    if (result.success && result.count !== undefined) {
      setUnreadCount(result.count);
    }
  }, [userId]);

  const handleMarkAsRead = useCallback(async (notificationId: string) => {
    if (!userId) return;
    
    await markAsRead(notificationId);
    
    // Batch both API calls
    const [notificationsResult, unreadResult] = await Promise.all([
      getNotifications(userId),
      getUnreadCount(userId),
    ]);
    
    // Single state update instead of multiple
    if (notificationsResult.success && notificationsResult.notifications) {
      setNotifications(notificationsResult.notifications);
    }
    if (unreadResult.success && unreadResult.count !== undefined) {
      setUnreadCount(unreadResult.count);
    }
  }, [userId]);

  const handleMarkAllAsRead = useCallback(async () => {
    if (!userId) return;
    await markAllAsRead(userId);
    
    // Batch both API calls
    const [notificationsResult, unreadResult] = await Promise.all([
      getNotifications(userId),
      getUnreadCount(userId),
    ]);
    
    if (notificationsResult.success && notificationsResult.notifications) {
      setNotifications(notificationsResult.notifications);
    }
    if (unreadResult.success && unreadResult.count !== undefined) {
      setUnreadCount(unreadResult.count);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      let cancelled = false;

      const run = async () => {
        setLoading(true);
        const [notificationsResult, unreadResult] = await Promise.all([
          getNotifications(userId),
          getUnreadCount(userId),
        ]);

        if (cancelled) return;

        if (notificationsResult.success && notificationsResult.notifications) {
          setNotifications(notificationsResult.notifications);
        }
        if (unreadResult.success && unreadResult.count !== undefined) {
          setUnreadCount(unreadResult.count);
        }
        setLoading(false);
      };

      void run();

      const channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          () => {
            void loadUnreadCount();
            void loadNotifications();
          }
        )
        .subscribe((status: string) => {
          // Only log if there's an actual error during subscription
          if (status === 'CHANNEL_ERROR') {
            console.warn(`Notification channel error for user ${userId}`);
          }
        });

      const maybeRefresh = () => {
        if (cancelled) return;
        void loadUnreadCount();
      };

      const handleFocus = () => maybeRefresh();
      const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
          maybeRefresh();
        }
      };

      window.addEventListener('focus', handleFocus);
      document.addEventListener('visibilitychange', handleVisibility);

      return () => {
        cancelled = true;
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleVisibility);
        supabase.removeChannel(channel);
      };
    }
  }, [userId, loadNotifications, loadUnreadCount]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead: handleMarkAsRead,
    markAllAsRead: handleMarkAllAsRead,
    refresh: loadNotifications,
  };
};
