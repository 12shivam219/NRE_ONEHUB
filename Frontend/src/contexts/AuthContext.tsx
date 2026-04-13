import { createContext } from 'react';
import type { User } from '../lib/auth';

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAdmin: boolean;
  isMarketing: boolean;
  logout: () => Promise<void>;
  refreshUser: () => void;
  refreshUserData: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
