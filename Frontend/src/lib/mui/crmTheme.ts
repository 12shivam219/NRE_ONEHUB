import { createTheme } from '@mui/material/styles';

export const crmThemeLight = createTheme({
  cssVariables: true,
  palette: {
    mode: 'light',
    // Primary - Charcoal
    primary: {
      main: '#374151',
      light: '#6b7280',
      dark: '#1f2937',
      contrastText: '#ffffff',
    },
    // Secondary - Gold
    secondary: {
      main: '#d4af37',
      light: '#ffd866',
      dark: '#9c6c00',
      contrastText: '#111827',
    },
    // Background
    background: {
      default: '#f9fafb',
      paper: '#ffffff',
    },
    // Text
    text: {
      primary: '#111827',
      secondary: '#4b5563',
      disabled: '#9ca3af',
    },
    // Divider
    divider: '#e5e7eb',
    // Success
    success: {
      main: '#10b981',
      light: '#6ee7b7',
      dark: '#047857',
      contrastText: '#ffffff',
    },
    // Error
    error: {
      main: '#ef4444',
      light: '#fca5a5',
      dark: '#b91c1c',
      contrastText: '#ffffff',
    },
    // Warning
    warning: {
      main: '#f59e0b',
      light: '#fcd34d',
      dark: '#b45309',
      contrastText: '#111827',
    },
    // Info
    info: {
      main: '#3b82f6',
      light: '#93c5fd',
      dark: '#1d4ed8',
      contrastText: '#ffffff',
    },
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: '"Plus Jakarta Sans", "Spline Sans Mono", "Josefin Sans", sans-serif, monospace',
    fontSize: 12,
    fontWeightRegular: 500,
    fontWeightMedium: 500,
    fontWeightBold: 500,
    h1: { fontWeight: 500, fontSize: '0.75rem' },
    h2: { fontWeight: 500, fontSize: '0.75rem' },
    h3: { fontWeight: 500, fontSize: '0.75rem' },
    h4: { fontWeight: 500, fontSize: '0.75rem' },
    h5: { fontWeight: 500, fontSize: '0.75rem' },
    h6: { fontWeight: 500, fontSize: '0.75rem' },
    subtitle1: { fontWeight: 500, fontSize: '0.75rem' },
    subtitle2: { fontWeight: 500, fontSize: '0.75rem' },
    body1: { fontWeight: 500, fontSize: '0.75rem' },
    body2: { fontWeight: 500, fontSize: '0.75rem' },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 3,
          borderRadius: 3,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          minHeight: 56,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        containedPrimary: ({ theme }) => ({
          backgroundColor: theme.palette.primary.dark,
          color: theme.palette.common.white,
          '&:hover': {
            backgroundColor: theme.palette.primary.dark,
          },
        }),
      },
    },
    // Removed disableEnforceFocus due to React warning. Set on components if needed.
  },
});

export const crmTheme = crmThemeLight;
