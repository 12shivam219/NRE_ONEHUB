import { supabase } from '../supabase';
import type { Database } from '../database.types';

type Notification = Database['public']['Tables']['notifications']['Row'];

export const getNotifications = async (
  userId: string
): Promise<{ success: boolean; notifications?: Notification[]; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, notifications: data };
  } catch  {
    return { success: false, error: 'Failed to fetch notifications' };
  }
};

export const getUnreadCount = async (
  userId: string
): Promise<{ success: boolean; count?: number; error?: string }> => {
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, count: count || 0 };
  } catch  {
    return { success: false, error: 'Failed to get unread count' };
  }
};

export const markAsRead = async (
  notificationId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch  {
    return { success: false, error: 'Failed to mark as read' };
  }
};

export const markAllAsRead = async (
  userId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch  {
    return { success: false, error: 'Failed to mark all as read' };
  }
};

export const createNotification = async (
  userId: string,
  title: string,
  message: string,
  type: string = 'info',
  link?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: userId,
      title,
      message,
      type,
      link,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch  {
    return { success: false, error: 'Failed to create notification' };
  }
};
