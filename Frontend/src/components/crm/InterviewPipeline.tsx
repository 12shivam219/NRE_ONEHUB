import { memo } from 'react';
import type { Database } from '../../lib/database.types';

type Interview = Database['public']['Tables']['interviews']['Row'];
type Consultant = Database['public']['Tables']['consultants']['Row'];

interface InterviewPipelineProps {
  interviews: Interview[];
  consultants: Consultant[];
  requirementNumber?: number;
  onViewDetails: (interview: Interview) => void;
  onDelete: (interviewId: string) => void;
}

// Helper function to get status pill colors
const getStatusPillStyle = (status: string | null | undefined) => {
  const statusLower = (status || '').toLowerCase();
  
  if (statusLower === 'scheduled') {
    return {
      bg: '#DBEAFE',
      text: '#1E40AF',
      border: '#60A5FA',
    };
  } else if (statusLower === 'completed') {
    return {
      bg: '#DCFCE7',
      text: '#15803D',
      border: '#86EFAC',
    };
  } else if (statusLower === 'cancelled') {
    return {
      bg: '#FEE2E2',
      text: '#991B1B',
      border: '#FCA5A5',
    };
  }
  
  // Default fallback
  return {
    bg: '#EFF6FF',
    text: '#1E3A8A',
    border: '#93C5FD',
  };
};

export const InterviewPipeline = memo(({
  interviews,
  consultants,
  requirementNumber,
  onViewDetails,
  onDelete,
}: InterviewPipelineProps) => {
  return (
    <div
      style={{
        padding: '24px',
        backgroundColor: '#FFFFFF',
        width: '100%',
        boxSizing: 'border-box',
        overflow: 'visible',
      }}
    >
      {/* Section Title */}
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{
          fontSize: '14px',
          fontWeight: 700,
          color: '#0F172A',
          margin: '0 0 4px 0',
          fontFamily: '"Instrument Sans", sans-serif',
          letterSpacing: '0.3px',
        }}>
          Interview Pipeline
        </h3>
        <p style={{
          fontSize: '12px',
          color: '#64748B',
          margin: 0,
          fontFamily: '"Instrument Sans", sans-serif',
        }}>
          {interviews.length} interview{interviews.length !== 1 ? 's' : ''} in pipeline
        </p>
      </div>

      {/* Interviews List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', boxSizing: 'border-box' }}>
        {interviews.map((interview, index) => {
          const consultant = consultants.find(c => c.id === interview.consultant_id);
          const interviewNumber = (interview as any).interview_number || index + 1;
          const roundName = interview.round || `Round ${(interview as any).round_index || 1}`;
          const interviewId = requirementNumber 
            ? `REQ-${String(requirementNumber).padStart(3, '0')}-INT-${String(interviewNumber).padStart(2, '0')}`
            : `INT-${String(interviewNumber).padStart(2, '0')}`;
          const statusPill = getStatusPillStyle(interview.status);
          const scheduledDate = interview.scheduled_date 
            ? new Date(interview.scheduled_date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : '—';
          
          // Format time if available
          const scheduledTime = interview.scheduled_time 
            ? interview.scheduled_time.substring(0, 5) // HH:MM format
            : null;
          
          // Combine date and time for display
          const dateTimeDisplay = scheduledTime 
            ? `${scheduledDate} at ${scheduledTime}`
            : scheduledDate;

          return (
            <div
              key={interview.id}
              onClick={() => onViewDetails(interview)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '14px',
                padding: '14px 16px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #E5E7EB',
                borderRadius: '6px',
                borderLeft: '3px solid #2563EB',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                position: 'relative',
                width: '100%',
                boxSizing: 'border-box',
                minWidth: 0,
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.backgroundColor = '#F9FAFB';
                el.style.borderColor = '#D1D5DB';
                el.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.06)';
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.backgroundColor = '#FFFFFF';
                el.style.borderColor = '#E5E7EB';
                el.style.boxShadow = 'none';
              }}
            >
              {/* Timeline Indicator */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  minWidth: '20px',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: '#2563EB',
                    border: '2px solid #FFFFFF',
                    boxShadow: '0 0 0 1px #2563EB',
                  }}
                />
                {index < interviews.length - 1 && (
                  <div
                    style={{
                      width: '1px',
                      height: '24px',
                      backgroundColor: '#E5E7EB',
                      marginTop: '2px',
                    }}
                  />
                )}
              </div>

              {/* Card Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Top Row: Status Badge FIRST (Left) & Round Name */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '10px',
                  }}
                >
                  {/* Status Badge - Compact & Professional */}
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '4px 10px',
                      backgroundColor: statusPill.bg,
                      color: statusPill.text,
                      border: `1px solid ${statusPill.border}`,
                      borderRadius: '12px',
                      fontSize: '10px',
                      fontWeight: 700,
                      fontFamily: '"Instrument Sans", sans-serif',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      textTransform: 'uppercase',
                      letterSpacing: '0.3px',
                    }}
                  >
                    <span
                      style={{
                        width: '4px',
                        height: '4px',
                        borderRadius: '50%',
                        backgroundColor: statusPill.text,
                      }}
                    />
                    {interview.status || 'Unknown'}
                  </span>

                  {/* Round Name - Clean & Professional */}
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#0F172A',
                      fontFamily: '"Instrument Sans", sans-serif',
                      flex: 1,
                      minWidth: 0,
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                      letterSpacing: '0.2px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    {roundName}
                    {/* Interview ID Badge */}
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '3px 8px',
                        backgroundColor: '#F3F4F6',
                        color: '#374151',
                        border: '1px solid #D1D5DB',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        fontFamily: '"Instrument Sans", monospace',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        letterSpacing: '0.5px',
                      }}
                    >
                      {interviewId}
                    </span>
                  </div>
                </div>

                {/* Bottom Row: Consultant & Date Details */}
                <div
                  style={{
                    display: 'flex',
                    gap: '16px',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: '16px',
                      flexWrap: 'wrap',
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {/* Consultant */}
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#64748B',
                        fontFamily: '"Instrument Sans", sans-serif',
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                        lineHeight: '1.4',
                      }}
                    >
                      <span style={{ color: '#475569', fontWeight: 600 }}>Consultant:</span>{' '}
                      {consultant ? consultant.name : interview.interviewer || '—'}
                    </div>

                    {/* Date & Time */}
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#64748B',
                        fontFamily: '"Instrument Sans", sans-serif',
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                        lineHeight: '1.4',
                      }}
                    >
                      <span style={{ color: '#475569', fontWeight: 600 }}>Date/Time:</span>{' '}
                      {dateTimeDisplay}
                    </div>
                  </div>

                  {/* Delete Icon - Subtle & Professional */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(interview.id);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '24px',
                      height: '24px',
                      padding: 0,
                      backgroundColor: 'transparent',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      color: '#CBD5E1',
                      transition: 'all 0.15s ease',
                      fontSize: '14px',
                      flexShrink: 0,
                      opacity: 0.6,
                    }}
                    onMouseEnter={(e) => {
                      const btn = e.currentTarget as HTMLButtonElement;
                      btn.style.backgroundColor = '#FECACA';
                      btn.style.color = '#DC2626';
                      btn.style.opacity = '1';
                    }}
                    onMouseLeave={(e) => {
                      const btn = e.currentTarget as HTMLButtonElement;
                      btn.style.backgroundColor = 'transparent';
                      btn.style.color = '#CBD5E1';
                      btn.style.opacity = '0.6';
                    }}
                    title="Delete interview"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

InterviewPipeline.displayName = 'InterviewPipeline';
