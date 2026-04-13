import React, { useState, useMemo, memo, useRef, useCallback, useEffect } from 'react';
import { 
  Eye, 
  Calendar, 
  Trash2, 
  CheckSquare, 
  Square,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Database, RequirementStatus } from '../../lib/database.types';
import { useAuth } from '../../hooks/useAuth';
import { getInterviewsByRequirementGrouped, deleteInterview } from '../../lib/api/interviews';
import { getConsultants } from '../../lib/api/consultants';
import { subscribeToInterviews, type RealtimeUpdate } from '../../lib/api/realtimeSync';
import { InterviewDetailModal } from './InterviewDetailModal';
import { InterviewPipeline } from './InterviewPipeline';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';


type Requirement = Database['public']['Tables']['requirements']['Row'];
type RequirementWithLogs = Requirement & { logs?: { action: string; timestamp: string }[] };
type Interview = Database['public']['Tables']['interviews']['Row'];

type SortField = 'title' | 'company' | 'status' | 'created_at' | 'rate';
type SortOrder = 'asc' | 'desc';

interface RequirementsTableProps {
  requirements: RequirementWithLogs[];
  onViewDetails: (req: Requirement) => void;
  onCreateInterview?: (id: string) => void;
  onDelete: (id: string) => void;
  isAdmin: boolean;
  serverSortField?: string;
  serverSortOrder?: 'asc' | 'desc';
  onSortChange?: (field: SortField, order: 'asc' | 'desc') => void;
  page: number;
  hasNextPage: boolean;
  isFetchingPage: boolean;
  onPageChange: (page: number) => void;
  headerSearch?: JSX.Element | null;
  selectedStatusFilter?: RequirementStatus | 'ALL';
  onStatusFilterChange?: (status: RequirementStatus | 'ALL') => void;
}

// Status color map with compact styling
const enhancedStatusColors: Record<RequirementStatus, { bg: string; text: string }> = {
  'NEW': { bg: 'bg-blue-100', text: 'text-blue-700' },
  'IN_PROGRESS': { bg: 'bg-amber-100', text: 'text-amber-700' },
  'INTERVIEW': { bg: 'bg-purple-100', text: 'text-purple-700' },
  'OFFER': { bg: 'bg-green-100', text: 'text-green-700' },
  'CLOSED': { bg: 'bg-gray-100', text: 'text-gray-700' },
  'REJECTED': { bg: 'bg-red-100', text: 'text-red-700' },
  'SUBMITTED': { bg: 'bg-indigo-100', text: 'text-indigo-700' },
};

const TableRow = memo(({
  req,
  isSelected,
  toggleRowSelected,
  onViewDetails,
  onCreateInterview,
  onDelete,
  isAdmin,
  rowIndex,
  rowRef,
  dataIndex,
  selectedStatusFilter,
  onStatusFilterChange,
  toggleExpandRequirement,
  isExpanded,
  isLoadingInterviews,
}: {
  req: RequirementWithLogs;
  isSelected: boolean;
  toggleRowSelected: (id: string) => void;
  onViewDetails: (req: Requirement) => void;
  onCreateInterview?: (id: string) => void;
  onDelete: (id: string) => void;
  isAdmin: boolean;
  rowIndex: number;
  rowRef?: (el: HTMLTableRowElement | null) => void;
  dataIndex?: number;
  selectedStatusFilter?: RequirementStatus | 'ALL';
  onStatusFilterChange?: (status: RequirementStatus | 'ALL') => void;
  toggleExpandRequirement: (reqId: string) => void;
  isExpanded: boolean;
  isLoadingInterviews: boolean;
}) => {
  const isAlternate = rowIndex % 2 === 1;
  const statusColor = enhancedStatusColors[req.status as RequirementStatus];
  const rowBgColor = isAlternate ? '#FAFBFC' : '#ffffff';
  const [actionMenuAnchorEl, setActionMenuAnchorEl] = useState<HTMLElement | null>(null);
  const actionMenuOpen = Boolean(actionMenuAnchorEl);
  
  const handleActionMenuOpen = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    setActionMenuAnchorEl(e.currentTarget);
  };
  
  const handleActionMenuClose = () => {
    setActionMenuAnchorEl(null);
  };
  
  const handleView = () => {
    handleActionMenuClose();
    onViewDetails(req);
  };
  
  const handleCreateInterview = () => {
    handleActionMenuClose();
    onCreateInterview?.(req.id);
  };
  
  const handleDelete = () => {
    handleActionMenuClose();
    onDelete(req.id);
  };
  
  return (
    <tr
      ref={rowRef}
      data-index={dataIndex}
      data-req-id={req.id}
      className={`
        transition-colors duration-150
        border-b border-[#EAECEF]
        ${isExpanded ? 'border-l-2 border-l-[#2563EB] bg-[#F0F7FF]' : `${isAlternate ? 'bg-[#FAFBFC]' : 'bg-white'}`}
        hover:bg-[#F5F7FA]
        h-14
      `}
      style={isExpanded ? { backgroundColor: '#F0F7FF' } : undefined}
    >
      {/* Checkbox */}
      <td className="px-4 py-0 text-center align-middle" style={{ width: '44px', position: 'sticky', left: 0, zIndex: 30, backgroundColor: rowBgColor }}>
        <div className="flex items-center justify-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleRowSelected(req.id);
            }}
            className="p-1.5 hover:bg-gray-200 hover:bg-opacity-50 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
            aria-pressed={isSelected}
            title={isSelected ? 'Deselect requirement' : 'Select requirement'}
            aria-label={isSelected ? `Deselect ${req.title}` : `Select ${req.title}`}
          >
            {isSelected ? (
              <CheckSquare className="w-4 h-4 text-blue-600" />
            ) : (
              <Square className="w-4 h-4 text-[#9CA3AF] hover:text-gray-600" />
            )}
          </button>
        </div>
      </td>
      
      {/* Requirement ID */}
      <td className="px-4 py-0 text-left align-middle" style={{ width: '60px', position: 'sticky', left: '44px', zIndex: 29, backgroundColor: rowBgColor }}>
        <span className="font-mono font-medium text-[#6B7280]" style={{ fontSize: '0.8125rem' }}>
          {String(req.requirement_number || 1).padStart(3, '0')}
        </span>
      </td>
      
      {/* Title & Company */}
      <td className="px-4 py-0 text-left align-middle" style={{ width: '24%' }}>
        <div className="w-full text-left flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpandRequirement(req.id);
            }}
            className="p-1 hover:bg-gray-200 hover:bg-opacity-50 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors flex-shrink-0"
            aria-expanded={isExpanded}
            title={isExpanded ? 'Collapse interviews' : 'Expand to see interviews'}
            aria-label={isExpanded ? `Collapse interviews for ${req.title}` : `Expand to see interviews for ${req.title}`}
          >
            {isLoadingInterviews ? (
              <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
            ) : isExpanded ? (
              <ChevronDown className="w-4 h-4 text-[#6B7280]" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[#6B7280]" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[#0F172A] leading-tight truncate" style={{ fontSize: '0.8125rem' }}>
              {req.title}
            </div>
            {req.implementation_partner && (
              <div className="font-normal text-[#64748B] mt-1 truncate" style={{ fontSize: '0.75rem' }}>
                {req.implementation_partner}
              </div>
            )}
          </div>
        </div>
      </td>
      
      {/* Status Badge */}
      <td className="px-4 py-0 text-left align-middle" style={{ width: '15%' }}>
        <div className="flex items-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onStatusFilterChange) {
                onStatusFilterChange(req.status === selectedStatusFilter ? 'ALL' : req.status);
              }
            }}
            className={`
              inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
              font-semibold transition-all duration-150 uppercase
              ${statusColor.bg} ${statusColor.text}
              hover:shadow-sm hover:opacity-80
              ${req.status === selectedStatusFilter ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
            `}
            style={{ fontSize: '0.6875rem' }}
            title={`Click to filter by ${req.status} status`}
            aria-label={`Filter by ${req.status} status`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
            <span className="whitespace-nowrap">{req.status}</span>
          </button>
        </div>
      </td>
      
      {/* Vendor Company */}
      <td className="px-4 py-0 text-left align-middle" style={{ width: '18%' }}>
        <div className="font-normal text-[#475569] truncate" style={{ fontSize: '0.8125rem' }}>
          {req.vendor_company ? (
            <span title={req.vendor_company}>{req.vendor_company}</span>
          ) : (
            <span className="text-[#9CA3AF] italic">—</span>
          )}
        </div>
      </td>
      
      {/* Vendor Person */}
      <td className="px-4 py-0 text-left align-middle" style={{ width: '15%' }}>
        <div className="font-normal text-[#475569] truncate" style={{ fontSize: '0.8125rem' }}>
          {req.vendor_person_name ? (
            <span title={req.vendor_person_name}>{req.vendor_person_name}</span>
          ) : (
            <span className="text-[#9CA3AF] italic">—</span>
          )}
        </div>
      </td>
      
      {/* Vendor Phone */}
      <td className="px-4 py-0 text-left align-middle" style={{ width: '15%' }}>
        <div className="font-mono text-[#475569] truncate" style={{ fontSize: '0.8125rem' }}>
          {req.vendor_phone ? (
            <a 
              href={`tel:${req.vendor_phone}`}
              className="text-blue-600 hover:text-blue-700 hover:underline transition-colors"
              title={`Call ${req.vendor_phone}`}
              onClick={(e) => e.stopPropagation()}
            >
              {req.vendor_phone}
            </a>
          ) : (
            <span className="text-[#9CA3AF] italic">—</span>
          )}
        </div>
      </td>
      
      {/* Vendor Email */}
      <td className="px-4 py-0 text-left align-middle" style={{ width: '18%' }}>
        <div className="font-normal text-[#475569] truncate" style={{ fontSize: '0.8125rem' }}>
          {req.vendor_email ? (
            <a 
              href={`mailto:${req.vendor_email}`}
              className="text-blue-600 hover:text-blue-700 hover:underline transition-colors"
              title={`Email ${req.vendor_email}`}
              onClick={(e) => e.stopPropagation()}
            >
              {req.vendor_email}
            </a>
          ) : (
            <span className="text-[#9CA3AF] italic">—</span>
          )}
        </div>
      </td>
      
      {/* Actions */}
      <td className="px-4 py-0 text-center align-middle" style={{ width: '56px', position: 'sticky', right: 0, zIndex: 30, backgroundColor: rowBgColor }}>
        <div className="flex items-center justify-center h-14">
          <Tooltip title="Actions">
            <button
              onClick={handleActionMenuOpen}
              className="p-0 w-8 h-8 text-[#475569] bg-white border border-[#E5E7EB] rounded-lg hover:bg-[#F8FAFC] hover:border-[#CBD5E1] transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-opacity-30 flex items-center justify-center"
              aria-label={`Actions for ${req.title}`}
              aria-haspopup="true"
              aria-expanded={actionMenuOpen}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>
        
        <Menu
          anchorEl={actionMenuAnchorEl}
          open={actionMenuOpen}
          onClose={handleActionMenuClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{
            paper: {
              sx: {
                backgroundColor: '#FFFFFF',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                border: '1px solid #E5E7EB',
                minWidth: '180px',
              },
            },
          }}
        >
          <MenuItem
            onClick={handleView}
            sx={{
              py: 1.25,
              px: 2,
              fontSize: '0.8125rem',
              color: '#1F2937',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              '&:hover': {
                backgroundColor: '#F1F5F9',
              },
            }}
          >
            <Eye className="w-4 h-4" />
            View
          </MenuItem>
          
          <MenuItem
            onClick={handleCreateInterview}
            sx={{
              py: 1.25,
              px: 2,
              fontSize: '0.8125rem',
              color: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              '&:hover': {
                backgroundColor: '#F1F5F9',
              },
            }}
          >
            <Calendar className="w-4 h-4" />
            Create Interview
          </MenuItem>
          
          {isAdmin && (
            <MenuItem
              onClick={handleDelete}
              sx={{
                py: 1.25,
                px: 2,
                fontSize: '0.8125rem',
                color: '#DC2626',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                '&:hover': {
                  backgroundColor: '#F1F5F9',
                },
              }}
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </MenuItem>
          )}
        </Menu>
      </td>
    </tr>
  );
});


export const RequirementsTable = memo(({
  requirements,
  onViewDetails,
  onCreateInterview,
  onDelete,
  isAdmin,
  serverSortField,
  serverSortOrder,
  onSortChange,
  page,
  hasNextPage,
  isFetchingPage,
  onPageChange,
  headerSearch,
  selectedStatusFilter,
  onStatusFilterChange,
}: RequirementsTableProps) => {
  // State for table functionality
  const { user } = useAuth();
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [expandedReqs, setExpandedReqs] = useState<Set<string>>(new Set());
  const [reqInterviews, setReqInterviews] = useState<Record<string, Interview[]>>({});
  const [loadingInterviews, setLoadingInterviews] = useState<Set<string>>(new Set());
  const [consultants, setConsultants] = useState<Database['public']['Tables']['consultants']['Row'][]>([]);
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);

  const parentRef = useRef<HTMLDivElement | null>(null);
  const lastScrollYRef = useRef<number>(0);

  const effectiveSortField = (onSortChange ? (serverSortField as SortField | undefined) : undefined) ?? 'created_at';
  const effectiveSortOrder = (onSortChange ? (serverSortOrder as SortOrder | undefined) : undefined) ?? 'desc';

  // Sorting logic (client-side when not using server sorting)
  const sortedRequirements = useMemo(() => {
    if (onSortChange) return requirements;

    const sorted = [...requirements].sort((a, b) => {
      let aVal: string | number | Date = '';
      let bVal: string | number | Date = '';
      const sortField = effectiveSortField as SortField;
      switch (sortField) {
        case 'title':
          aVal = (a.title || '').toLowerCase();
          bVal = (b.title || '').toLowerCase();
          break;
        case 'company':
          aVal = (a.implementation_partner || '').toLowerCase();
          bVal = (b.implementation_partner || '').toLowerCase();
          break;
        case 'status':
          aVal = a.status || '';
          bVal = b.status || '';
          break;
        case 'rate':
          aVal = a.rate ? parseInt(a.rate.match(/\d+/)?.[0] || '0') : 0;
          bVal = b.rate ? parseInt(b.rate.match(/\d+/)?.[0] || '0') : 0;
          break;
        case 'created_at':
        default:
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
      }
      if (aVal < bVal) return effectiveSortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return effectiveSortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [requirements, effectiveSortField, effectiveSortOrder, onSortChange])

  const toggleRowSelected = (id: string) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRows(newSelected);
  };

  const toggleExpandRequirement = useCallback(async (reqId: string) => {
    const newExpanded = new Set(expandedReqs);
    
    if (newExpanded.has(reqId)) {
      // Collapse
      newExpanded.delete(reqId);
      setExpandedReqs(newExpanded);
    } else {
      // Expand and fetch interviews if not already loaded
      if (!reqInterviews[reqId]) {
        setLoadingInterviews(prev => new Set([...prev, reqId]));
        try {
          const result = await getInterviewsByRequirementGrouped(reqId);
          if (result.success && result.grouped) {
            // Flatten grouped interviews into a single array
            const flattenedInterviews: Interview[] = [];
            Object.values(result.grouped).forEach(interviews => {
              flattenedInterviews.push(...interviews);
            });
            setReqInterviews(prev => ({
              ...prev,
              [reqId]: flattenedInterviews,
            }));
          }
        } catch {
          // Silently handle interview loading error
        } finally {
          setLoadingInterviews(prev => {
            const newSet = new Set(prev);
            newSet.delete(reqId);
            return newSet;
          });
        }
      }
      newExpanded.add(reqId);
      setExpandedReqs(newExpanded);
    }
  }, [expandedReqs, reqInterviews]);

  // Helper to (re)fetch interviews for a requirement and update cache
  const fetchInterviewsForRequirement = useCallback(async (reqId: string) => {
    setLoadingInterviews(prev => new Set([...prev, reqId]));
    try {
      const result = await getInterviewsByRequirementGrouped(reqId);
      if (result.success && result.grouped) {
        const flattenedInterviews: Interview[] = [];
        Object.values(result.grouped).forEach(interviews => {
          flattenedInterviews.push(...interviews);
        });
        setReqInterviews(prev => ({
          ...prev,
          [reqId]: flattenedInterviews,
        }));
      }
    } catch {
      // Silently handle interview refresh error
    } finally {
      setLoadingInterviews(prev => {
        const newSet = new Set(prev);
        newSet.delete(reqId);
        return newSet;
      });
    }
  }, []);

  // Load consultants for display
  useEffect(() => {
    const loadConsultants = async () => {
      try {
        const result = await getConsultants(isAdmin ? undefined : user?.id);
        if (result.success && result.consultants) {
          setConsultants(result.consultants);
        }
      } catch {
        // Silently handle consultant loading error
      }
    };
    loadConsultants();
  }, [isAdmin, user?.id]);

  // BUG FIX: Subscribe to real-time interview updates to keep expanded lists fresh
  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeToInterviews(user.id, (update: RealtimeUpdate<Interview>) => {
      setReqInterviews(prev => {
        const updated = { ...prev };
        
        // For each requirement that has interviews loaded
        Object.keys(updated).forEach(reqId => {
          const interviews = updated[reqId];
          
          if (update.type === 'INSERT') {
            // Add new interview if it belongs to this requirement
            if (update.record.requirement_id === reqId) {
              // Avoid duplicates
              if (!interviews.some(i => i.id === update.record.id)) {
                updated[reqId] = [...interviews, update.record];
              }
            }
          } else if (update.type === 'UPDATE') {
            // Update existing interview
            const index = interviews.findIndex(i => i.id === update.record.id);
            if (index !== -1) {
              updated[reqId] = [
                ...interviews.slice(0, index),
                update.record,
                ...interviews.slice(index + 1),
              ];
            } else if (update.record.requirement_id === reqId) {
              // Interview moved to this requirement
              updated[reqId] = [...interviews, update.record];
            }
          } else if (update.type === 'DELETE') {
            // Remove deleted interview
            updated[reqId] = interviews.filter(i => i.id !== update.record.id);
          }
        });
        
        return updated;
      });
    });

    return () => {
      unsubscribe?.();
    };
  }, [user]);

  const handleViewInterview = (interview: Interview) => {
    setSelectedInterview(interview);
  };

  const handleDeleteInterview = async (interviewId: string) => {
    try {
      const result = await deleteInterview(interviewId);
      if (result.success) {
        // Refresh the expanded requirement
        const reqId = Object.keys(reqInterviews).find(key => 
          reqInterviews[key]?.some(i => i.id === interviewId)
        );
        if (reqId) {
          const newInterviews = reqInterviews[reqId].filter(i => i.id !== interviewId);
          setReqInterviews(prev => ({
            ...prev,
            [reqId]: newInterviews,
          }));
        }
      }
    } catch {
      // Silently handle interview deletion error
    }
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === sortedRequirements.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(sortedRequirements.map(r => r.id)));
    }
  };

  // Listen for interview creation events to refresh cached interviews
  useEffect(() => {
    const handleInterviewCreated = (event: Event) => {
      const customEvent = event as CustomEvent;
      const detail: any = customEvent.detail || {};

      // Support multiple shapes: { requirementId } or { requirement_id } or full interview object
      const reqId = detail.requirementId ?? detail.requirement_id ?? detail.requirement?.id ?? detail.requirement_id?.toString();

      if (reqId) {
        // If the requirement is currently expanded, refresh its interviews in-place
        if (expandedReqs.has(reqId)) {
          fetchInterviewsForRequirement(reqId);
        }
      }
    };

    window.addEventListener('interview-created', handleInterviewCreated);
    return () => {
      window.removeEventListener('interview-created', handleInterviewCreated);
    };
  }, [expandedReqs, fetchInterviewsForRequirement]);

  // Collapse expanded requirements when user scrolls vertically away from them
  useEffect(() => {
    const scrollContainer = parentRef.current;
    if (!scrollContainer) return;

    const handleVerticalScroll = () => {
      const currentScrollY = scrollContainer.scrollTop;
      const scrollDelta = Math.abs(currentScrollY - lastScrollYRef.current);

      // Only collapse if user scrolled significantly (>5px) AND there are expanded requirements
      if (scrollDelta > 5 && expandedReqs.size > 0) {
        // Check if any expanded requirement row is still visible in viewport
        let shouldCollapse = true;
        
        for (const reqId of expandedReqs) {
          // Try to find the row element for this expanded requirement
          const rowElement = scrollContainer.querySelector(`[data-req-id="${reqId}"]`);
          if (rowElement) {
            const rect = rowElement.getBoundingClientRect();
            const containerRect = scrollContainer.getBoundingClientRect();
            
            // If the expanded row is still visible in the container, don't collapse
            if (rect.top < containerRect.bottom && rect.bottom > containerRect.top) {
              shouldCollapse = false;
              break;
            }
          }
        }
        
        if (shouldCollapse) {
          setExpandedReqs(new Set());
        }
      }

      lastScrollYRef.current = currentScrollY;
    };

    scrollContainer.addEventListener('scroll', handleVerticalScroll);
    return () => {
      scrollContainer.removeEventListener('scroll', handleVerticalScroll);
    };
  }, [expandedReqs]);

  const rowVirtualizer = useVirtualizer({
    count: sortedRequirements.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 10,
    measureElement: typeof window !== 'undefined' && navigator.userAgent.indexOf('jsdom') === -1 ? element => element?.getBoundingClientRect().height : undefined,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0;

  return (
    <div className="w-full bg-white rounded-lg border border-[#E5E7EB] pt-0">
      {/* Toolbar - Search & Filters */}
      <div className="px-6 py-4 border-b border-[#EAECEF] bg-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-[16px] font-semibold text-[#0F172A]">Requirements</h3>
            <p className="text-[12px] text-[#64748B] mt-1">{sortedRequirements.length} requirements total</p>
          </div>
          
          {/* Search Bar */}
          <div className="w-full sm:w-auto">
            {headerSearch ?? null}
          </div>
        </div>
      </div>

      {/* Table */}
      <Box
        ref={parentRef}
        sx={{
          overflow: 'auto',
          overflowX: { xs: 'auto', sm: 'auto', md: 'auto' },
          overflowY: 'auto',
          maxHeight: { xs: '60vh', sm: '65vh', md: '70vh' },
          pb: 0,
          scrollbarGutter: 'stable',
          width: '100%',
          willChange: 'transform',
          contain: 'content',
          fontFamily: '"Instrument Sans", sans-serif',
          '& table': {
            width: '100%',
            minWidth: { xs: '1200px', sm: '1200px', md: '100%' },
            tableLayout: 'auto',
            borderCollapse: 'collapse',
            fontFamily: '"Instrument Sans", sans-serif',
          },
          '& thead': {
            position: 'sticky',
            top: 0,
            zIndex: 40,
          },
        }}
      >
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: '#F3F4F6', borderBottom: '1px solid #E5E7EB' }}>
              {/* Checkbox Header */}
              <th className="px-4 py-3 text-center align-middle" style={{ width: '44px', position: 'sticky', left: 0, zIndex: 30, backgroundColor: '#F3F4F6', borderBottom: '1px solid #E5E7EB' }}>
                <button
                  onClick={toggleSelectAll}
                  className="p-1.5 hover:bg-gray-200 hover:bg-opacity-50 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
                  title={selectedRows.size === sortedRequirements.length ? 'Deselect all' : 'Select all'}
                  aria-label={selectedRows.size === sortedRequirements.length ? 'Deselect all' : 'Select all'}
                  style={{ fontSize: '0.75rem' }}
                >
                  {selectedRows.size === sortedRequirements.length && sortedRequirements.length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-blue-600" />
                  ) : (
                    <Square className="w-4 h-4 text-[#9CA3AF] hover:text-gray-600" />
                  )}
                </button>
              </th>
              
              <th className="px-4 py-3 text-left align-middle" style={{ width: '60px', position: 'sticky', left: '44px', zIndex: 30, backgroundColor: '#F3F4F6', color: '#374151', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #E5E7EB' }}>
                REQ ID
              </th>
              
              <th className="px-4 py-3 text-left align-middle" style={{ width: '24%', backgroundColor: '#F3F4F6', color: '#374151', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #E5E7EB' }}>
                Title
              </th>
              
              <th className="px-4 py-3 text-left align-middle" style={{ width: '15%', backgroundColor: '#F3F4F6', color: '#374151', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #E5E7EB' }}>
                Status
              </th>
              
              <th className="px-4 py-3 text-left align-middle" style={{ width: '18%', backgroundColor: '#F3F4F6', color: '#374151', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #E5E7EB' }}>
                Vendor Company
              </th>
              
              <th className="px-4 py-3 text-left align-middle" style={{ width: '15%', backgroundColor: '#F3F4F6', color: '#374151', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #E5E7EB' }}>
                Contact
              </th>
              
              <th className="px-4 py-3 text-left align-middle" style={{ width: '15%', backgroundColor: '#F3F4F6', color: '#374151', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #E5E7EB' }}>
                Phone
              </th>
              
              <th className="px-4 py-3 text-left align-middle" style={{ width: '18%', backgroundColor: '#F3F4F6', color: '#374151', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #E5E7EB' }}>
                Email
              </th>
              
              <th className="px-4 py-3 text-center align-middle" style={{ width: '56px', position: 'sticky', right: 0, zIndex: 30, backgroundColor: '#F3F4F6', color: '#374151', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #E5E7EB' }}>
                Actions
              </th>
            </tr>
          </thead>
          
          <tbody>
            {sortedRequirements.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
                      <Calendar className="w-7 h-7 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-[#0F172A]">No requirements found</p>
                      <p className="text-[13px] text-[#64748B] mt-1">Try adjusting your filters or create a new requirement</p>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              <>
                {paddingTop > 0 ? (
                  <tr aria-hidden="true">
                    <td colSpan={9} style={{ height: paddingTop }} />
                  </tr>
                ) : null}

                {virtualItems.map(virtualRow => {
                  const req = sortedRequirements[virtualRow.index];
                  const isSelected = selectedRows.has(req.id);
                  const isExpanded = expandedReqs.has(req.id);
                  const isLoading = loadingInterviews.has(req.id);
                  const interviews = reqInterviews[req.id];
                  
                  return (
                    <React.Fragment key={req.id}>
                      <TableRow
                        req={req}
                        isSelected={isSelected}
                        toggleRowSelected={toggleRowSelected}
                        onViewDetails={onViewDetails}
                        onCreateInterview={onCreateInterview}
                        onDelete={onDelete}
                        isAdmin={isAdmin}
                        rowIndex={virtualRow.index}
                        dataIndex={virtualRow.index}
                        selectedStatusFilter={selectedStatusFilter}
                        onStatusFilterChange={onStatusFilterChange}
                        toggleExpandRequirement={toggleExpandRequirement}
                        isExpanded={isExpanded}
                        isLoadingInterviews={isLoading}
                      />
                      
                      {/* Interview Details Row - Contained Panel */}
                      {isExpanded && (
                        <tr key={`interviews-${req.id}`} className="border-b border-[#EAECEF]" style={{ width: '100%', display: 'table-row', backgroundColor: '#FFFFFF', borderLeft: '3px solid #2563EB', position: 'relative' }}>
                          <td colSpan={9} className="px-0 py-0" style={{ width: '100%', boxSizing: 'border-box', overflow: 'hidden', backgroundColor: '#FFFFFF' }}>
                            {/* Constrained Detail Panel Container - Fixed width, anchored to left */}
                            <div style={{
                              padding: '20px 24px',
                              backgroundColor: '#FFFFFF',
                              maxWidth: '800px',
                              width: 'calc(100vw - 80px)',
                              boxSizing: 'border-box',
                              position: 'relative',
                            }}>
                              {/* Detail Panel Content Card */}
                              <div style={{
                                backgroundColor: '#F9FAFB',
                                border: '1px solid #E5E7EB',
                                borderRadius: '8px',
                                borderLeft: '4px solid #2563EB',
                                overflow: 'hidden',
                              }}>
                                {isLoading ? (
                                  <div className="flex items-center justify-center py-12">
                                    <div className="w-6 h-6 border-3 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                                  </div>
                                ) : interviews && interviews.length > 0 ? (
                                  <InterviewPipeline
                                    interviews={interviews}
                                    consultants={consultants}
                                    requirementNumber={req.requirement_number ?? undefined}
                                    onViewDetails={handleViewInterview}
                                    onDelete={handleDeleteInterview}
                                  />
                                ) : (
                                  <div style={{
                                    padding: '24px',
                                    textAlign: 'left',
                                  }}>
                                    <h3 style={{
                                      fontSize: '14px',
                                      fontWeight: 600,
                                      color: '#0F172A',
                                      margin: '0 0 8px 0',
                                      fontFamily: '"Instrument Sans", sans-serif',
                                    }}>
                                      Interview Pipeline
                                    </h3>
                                    <p style={{
                                      fontSize: '13px',
                                      color: '#64748B',
                                      margin: 0,
                                      fontFamily: '"Instrument Sans", sans-serif',
                                    }}>
                                      No interviews found for this requirement
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

                {paddingBottom > 0 ? (
                  <tr aria-hidden="true">
                    <td colSpan={9} style={{ height: paddingBottom }} />
                  </tr>
                ) : null}
              </>
            )}
          </tbody>
        </table>
      </Box>

      {/* Footer - Pagination */}
      <div className="px-6 py-4 border-t border-[#EAECEF] bg-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 text-[13px] text-[#64748B]">
          <span>
            Page: <span className="font-semibold text-[#0F172A]">{page + 1}</span>
          </span>
          <span className="w-px h-4 bg-[#E5E7EB]" />
          <span>
            Rows: <span className="font-semibold text-[#0F172A]">{sortedRequirements.length}</span>
          </span>
          <span className="w-px h-4 bg-[#E5E7EB]" />
          <span>
            Selected: <span className="font-semibold text-[#0F172A]">{selectedRows.size}</span>
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page === 0 || isFetchingPage}
            className="px-4 py-2 text-[13px] font-medium text-[#475569] bg-white border border-[#D1D5DB] rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white transition-all"
          >
            ← Previous
          </button>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={!hasNextPage || isFetchingPage}
            className="px-4 py-2 text-[13px] font-medium text-[#475569] bg-white border border-[#D1D5DB] rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white transition-all"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Interview Detail Modal */}
      {selectedInterview && (
        <InterviewDetailModal
          interview={selectedInterview}
          isOpen={!!selectedInterview}
          onClose={() => setSelectedInterview(null)}
          onUpdate={() => {
            // Refresh the interviews for the expanded requirement
            const reqId = selectedInterview.requirement_id;
            if (reqId && expandedReqs.has(reqId)) {
              toggleExpandRequirement(reqId);
            }
          }}
        />
      )}
    </div>
  );
});
