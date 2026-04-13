import { useState, useRef, useCallback, ReactNode, memo } from 'react';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { ChevronUp } from 'lucide-react';
import Popover from '@mui/material/Popover';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Box from '@mui/material/Box';

interface CreateDropdownItem {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
}

interface CreateDropdownProps {
  items: CreateDropdownItem[];
  label?: string;
  disabled?: boolean;
  className?: string;
  variant?: 'header' | 'standalone';
}

const CreateDropdownComponent = ({
  items,
  label = '',
  disabled = false,
  className = '',
  variant = 'standalone',
}: CreateDropdownProps) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleItemClick = useCallback((callback: () => void) => {
    // 1. Close the popover immediately
    setAnchorEl(null);

    // 2. Return focus to the trigger button safely
    // This prevents the "aria-hidden" error by ensuring focus is NOT 
    // inside the unmounting/hiding Popover when the new Modal opens.
    if (buttonRef.current) {
      buttonRef.current.focus();
    }

    // 3. Execute the action (e.g., opening the Requirement Modal)
    // We use a microtask/timeout to allow the focus shift to register
    requestAnimationFrame(() => {
        callback();
    });
  }, []);

  // Handle keyboard navigation for the trigger
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setAnchorEl(event.currentTarget);
    }
    if (event.key === 'Escape') {
      handleClose();
    }
  }, [handleClose]);

  // Styles for the header variant to match original design
  const headerPaperSx = {
    minWidth: 200,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
    borderRadius: '0.5rem',
    bgcolor: '#FFFFFF',
    border: '1px solid #E5E7EB',
    mt: 1, 
  };

  // Styles for the standalone variant to match original design
  const standalonePaperSx = {
    minWidth: 200,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
    borderRadius: '0.75rem',
    bgcolor: '#FFFFFF',
    border: '1px solid #E5E7EB',
    mt: 1,
  };

  const isHeader = variant === 'header';

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? 'create-popover' : undefined}
        className={isHeader ? `
          flex flex-shrink-0 items-center justify-center gap-0.5
          w-11 h-9
          rounded-sm
          bg-transparent
          border border-gray-300
          text-gray-600
          transition-all duration-200 ease-in-out
          hover:bg-gray-100
          hover:border-gray-400
          hover:text-gray-700
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-0
          active:bg-gray-200
          disabled:opacity-50
          disabled:cursor-not-allowed
          ${className}
        ` : `
          flex items-center justify-center gap-1
          px-3 py-2
          bg-blue-600
          hover:bg-blue-700
          text-white
          rounded-lg
          font-medium font-body
          transition-all duration-200
          hover:shadow-[0_0_12px_rgba(37,99,235,0.3)]
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-400
          ${className}
        `}
        title={`${label || 'Create'} menu`}
      >
        <AddIcon
          sx={{
            fontSize: isHeader ? 18 : 20,
            width: isHeader ? 18 : 20,
            height: isHeader ? 18 : 20,
            transition: 'transform 200ms ease-in-out',
            transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
          }}
        />
        {isHeader && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'transform 200ms ease-in-out',
              transform: open ? 'rotate(0deg)' : 'rotate(180deg)',
              marginLeft: '1px',
            }}
          >
            <ChevronUp size={14} strokeWidth={2.5} />
          </div>
        )}
        {!isHeader && (
          <Box
            component="span"
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'transform 200ms ease-in-out',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          >
            <ExpandMoreRoundedIcon
              sx={{
                fontSize: 'small',
                transition: 'color 200ms ease-in-out',
              }}
            />
          </Box>
        )}
        {!isHeader && label && <span className="text-sm font-heading">{label}</span>}
      </button>

      <Popover
        id="create-popover"
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        slotProps={{
          paper: {
            sx: isHeader ? headerPaperSx : standalonePaperSx,
          },
        }}
        // Disable scroll lock to prevent layout shifts
        disableScrollLock
      >
        <List disablePadding>
          {items.map((item, index) => (
            <ListItem key={index} disablePadding>
              <ListItemButton
                onClick={() => handleItemClick(item.onClick)}
                sx={{
                  py: 1,
                  px: 2,
                  transition: 'all 150ms ease-in-out',
                  ...(isHeader ? {
                    color: '#0F172A',
                    '&:hover': {
                      bgcolor: '#F1F5F9',
                      color: '#2563EB',
                    },
                  } : {
                    color: '#64748B',
                    '&:hover': {
                      bgcolor: '#F1F5F9',
                      color: '#2563EB',
                    },
                  }),
                }}
              >
                {item.icon && (
                  <ListItemIcon sx={{ 
                    minWidth: 32,
                    color: 'inherit',
                    mr: 0.5
                  }}>
                    {item.icon}
                  </ListItemIcon>
                )}
                <ListItemText 
                  primary={item.label} 
                  primaryTypographyProps={{
                    fontSize: '0.875rem',
                    fontFamily: isHeader ? '"Inter", sans-serif' : 'var(--font-body)',
                    fontWeight: 500,
                  }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Popover>
    </>
  );
};

export const CreateDropdown = memo(CreateDropdownComponent, (prevProps, nextProps) => {
  return (
    prevProps.label === nextProps.label &&
    prevProps.disabled === nextProps.disabled &&
    prevProps.className === nextProps.className &&
    prevProps.variant === nextProps.variant &&
    prevProps.items.length === nextProps.items.length &&
    prevProps.items.every((item, index) => item.label === nextProps.items[index]?.label)
  );
});

CreateDropdown.displayName = 'CreateDropdown';