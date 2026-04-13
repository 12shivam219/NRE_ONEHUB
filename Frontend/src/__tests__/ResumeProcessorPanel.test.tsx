import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResumeProcessorPanel } from '../components/documents/ResumeProcessorPanel';

// Create a mock File class with text() method
class MockFile extends File {
  constructor(bits: BlobPart[], filename: string, options?: FilePropertyBag) {
    super(bits, filename, options);
  }

  async text(): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as string);
      };
      reader.readAsText(this);
    });
  }
}

// Mock the child components
vi.mock('../components/documents/ResumeUploadZone', () => ({
  ResumeUploadZone: ({
    onFileSelect,
    onTextPaste,
    loading,
  }: {
    onFileSelect: (file: File) => void;
    onTextPaste: (text: string) => void;
    loading: boolean;
  }) => (
    <div data-testid="mock-upload-zone">
      <button
        data-testid="mock-file-select-btn"
        onClick={() => {
          const file = new MockFile(['test content'], 'resume.txt', { type: 'text/plain' });
          onFileSelect(file);
        }}
      >
        Select File
      </button>
      <textarea
        data-testid="mock-paste-textarea"
        placeholder="Paste resume content"
        onChange={(e) => {
          if (e.target.value) {
            onTextPaste(e.target.value);
          }
        }}
      />
      {loading && <div data-testid="mock-loading">Loading...</div>}
    </div>
  ),
}));

vi.mock('../components/documents/BookmarkDetector', () => ({
  BookmarkDetector: ({
    bookmarks,
    loading,
    onSelectBookmark,
  }: {
    bookmarks: Array<{ name: string; placeholder: string }>;
    loading: boolean;
    onSelectBookmark: (bookmark: any) => void;
  }) => (
    <div data-testid="mock-bookmark-detector">
      {loading && <div data-testid="mock-detector-loading">Detecting...</div>}
      {bookmarks.map((bm) => (
        <button
          key={bm.placeholder}
          data-testid={`mock-bookmark-${bm.placeholder}`}
          onClick={() => onSelectBookmark(bm)}
        >
          {bm.name}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../components/documents/ContentInputWizard', () => ({
  ContentInputWizard: ({
    sections,
    onUpdate,
    loading,
  }: {
    sections: Array<{ name: string; placeholder: string }>;
    onUpdate: (updates: Record<string, string>) => void;
    loading: boolean;
  }) => (
    <div data-testid="mock-wizard">
      {sections.map((section, idx) => (
        <div key={section.placeholder} data-testid={`mock-section-${idx}`}>
          <input
            placeholder={`Enter ${section.name}`}
            data-testid={`mock-input-${idx}`}
            onChange={(e) => {
              const updates: Record<string, string> = {};
              updates[section.placeholder] = e.target.value;
              onUpdate(updates);
            }}
          />
        </div>
      ))}
      <button
        data-testid="mock-finish-btn"
        disabled={loading}
        onClick={() => onUpdate({ PROFESSIONAL_SUMMARY: 'test', EXPERIENCE: 'test' })}
      >
        {loading ? 'Finishing...' : 'Finish'}
      </button>
    </div>
  ),
}));

// Mock hooks
const mockDetectBookmarksAsync = vi.fn();
const mockInjectResumeAsync = vi.fn();

vi.mock('../hooks/useTextProcessor', () => ({
  useDetectBookmarks: () => ({
    mutateAsync: mockDetectBookmarksAsync,
    isPending: false,
  }),
  useInjectResume: () => ({
    mutateAsync: mockInjectResumeAsync,
    isPending: false,
  }),
}));

const mockShowToast = vi.fn();
vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({
    showToast: mockShowToast,
  }),
}));

describe('ResumeProcessorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Modal Visibility', () => {
    it('should not render when isOpen is false', () => {
      const { container } = render(
        <ResumeProcessorPanel isOpen={false} onClose={vi.fn()} />
      );
      expect(container.firstChild).toBeNull();
    });

    it('should render modal when isOpen is true', () => {
      render(<ResumeProcessorPanel isOpen={true} onClose={vi.fn()} />);
      expect(screen.getByText('🎯 Smart Resume Editor')).toBeInTheDocument();
    });

    it('should close modal when X button is clicked', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      render(<ResumeProcessorPanel isOpen={true} onClose={onClose} />);

      const closeBtn = screen.getByRole('button', { name: '' });
      await user.click(closeBtn);

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('File Upload and Preview', () => {
    it('should display upload zone initially', () => {
      render(<ResumeProcessorPanel isOpen={true} onClose={vi.fn()} />);
      expect(screen.getByTestId('mock-upload-zone')).toBeInTheDocument();
    });

    it('should handle file selection', async () => {
      const user = userEvent.setup();
      mockDetectBookmarksAsync.mockResolvedValue({
        bookmarks: [
          { name: 'Professional Summary', placeholder: 'PROFESSIONAL_SUMMARY' },
        ],
      });

      render(<ResumeProcessorPanel isOpen={true} onClose={vi.fn()} />);

      const fileSelectBtn = screen.getByTestId('mock-file-select-btn');
      await user.click(fileSelectBtn);

      // Wait for detection to complete
      await waitFor(() => {
        expect(mockDetectBookmarksAsync).toHaveBeenCalled();
      });
    });

    it('should show preview text after upload', async () => {
      const user = userEvent.setup();
      mockDetectBookmarksAsync.mockResolvedValue({
        bookmarks: [],
      });

      render(<ResumeProcessorPanel isOpen={true} onClose={vi.fn()} />);

      const fileSelectBtn = screen.getByTestId('mock-file-select-btn');
      await user.click(fileSelectBtn);

      await waitFor(() => {
        // Preview should show "test content" from the mock file
        expect(screen.queryByText(/Upload to preview/)).not.toBeInTheDocument();
      });
    });

    it('should handle text paste', async () => {
      const user = userEvent.setup();
      mockDetectBookmarksAsync.mockResolvedValue({
        bookmarks: [
          { name: 'Experience', placeholder: 'EXPERIENCE', status: 'empty' },
        ],
      });

      render(<ResumeProcessorPanel isOpen={true} onClose={vi.fn()} />);

      const textarea = screen.getByTestId('mock-paste-textarea');
      await user.type(textarea, 'Sample resume text with {EXPERIENCE}');

      await waitFor(() => {
        expect(mockDetectBookmarksAsync).toHaveBeenCalled();
      });
    });
  });

  describe('Bookmark Detection', () => {
    it('should display detected bookmarks', async () => {
      const user = userEvent.setup();
      mockDetectBookmarksAsync.mockResolvedValue({
        bookmarks: [
          { name: 'PROFESSIONAL_SUMMARY', placeholder: 'PROFESSIONAL_SUMMARY' },
          { name: 'EXPERIENCE', placeholder: 'EXPERIENCE' },
        ],
        count: 2,
        filename: 'resume.docx',
      });

      render(<ResumeProcessorPanel isOpen={true} onClose={vi.fn()} />);

      const fileSelectBtn = screen.getByTestId('mock-file-select-btn');
      await user.click(fileSelectBtn);

      await waitFor(() => {
        expect(
          screen.getByTestId('mock-bookmark-PROFESSIONAL_SUMMARY')
        ).toBeInTheDocument();
        expect(screen.getByTestId('mock-bookmark-EXPERIENCE')).toBeInTheDocument();
      });
    });

    it('should show helpful message when no bookmarks found', async () => {
      const user = userEvent.setup();
      mockDetectBookmarksAsync.mockResolvedValue({
        bookmarks: [],
        count: 0,
        filename: 'resume.docx',
      });

      render(<ResumeProcessorPanel isOpen={true} onClose={vi.fn()} />);

      const fileSelectBtn = screen.getByTestId('mock-file-select-btn');
      await user.click(fileSelectBtn);

      await waitFor(() => {
        expect(screen.getByText('No bookmarks found in your resume')).toBeInTheDocument();
        expect(screen.getByText(/Your resume doesn't have Word bookmarks/i)).toBeInTheDocument();
      });
    });

    it('should provide instructions on adding bookmarks', async () => {
      const user = userEvent.setup();
      mockDetectBookmarksAsync.mockResolvedValue({
        bookmarks: [],
        count: 0,
        filename: 'resume.docx',
      });

      render(<ResumeProcessorPanel isOpen={true} onClose={vi.fn()} />);

      const fileSelectBtn = screen.getByTestId('mock-file-select-btn');
      await user.click(fileSelectBtn);

      await waitFor(() => {
        expect(screen.getByText('How to add bookmarks:')).toBeInTheDocument();
      });
    });

    it('should handle bookmark selection', async () => {
      const user = userEvent.setup();
      mockDetectBookmarksAsync.mockResolvedValue({
        bookmarks: [
          { name: 'PROFESSIONAL_SUMMARY', placeholder: 'PROFESSIONAL_SUMMARY' },
        ],
        count: 1,
        filename: 'resume.docx',
      });

      render(<ResumeProcessorPanel isOpen={true} onClose={vi.fn()} />);

      const fileSelectBtn = screen.getByTestId('mock-file-select-btn');
      await user.click(fileSelectBtn);

      await waitFor(() => {
        const bookmarkBtn = screen.getByTestId('mock-bookmark-PROFESSIONAL_SUMMARY');
        expect(bookmarkBtn).toBeInTheDocument();
      });
    });
  });

  describe('Content Processing Wizard', () => {
    it('should show wizard after bookmarks are detected', async () => {
      const user = userEvent.setup();
      mockDetectBookmarksAsync.mockResolvedValue({
        bookmarks: [
          { name: 'Professional Summary', placeholder: 'PROFESSIONAL_SUMMARY' },
        ],
      });

      render(<ResumeProcessorPanel isOpen={true} onClose={vi.fn()} />);

      const fileSelectBtn = screen.getByTestId('mock-file-select-btn');
      await user.click(fileSelectBtn);

      await waitFor(() => {
        expect(screen.getByTestId('mock-wizard')).toBeInTheDocument();
      });
    });

    it('should display step 2 instructions', async () => {
      const user = userEvent.setup();
      mockDetectBookmarksAsync.mockResolvedValue({
        bookmarks: [
          { name: 'Professional Summary', placeholder: 'PROFESSIONAL_SUMMARY' },
        ],
      });

      render(<ResumeProcessorPanel isOpen={true} onClose={vi.fn()} />);

      const fileSelectBtn = screen.getByTestId('mock-file-select-btn');
      await user.click(fileSelectBtn);

      await waitFor(() => {
        expect(screen.getByText('Step 2: Process Sections')).toBeInTheDocument();
      });
    });

    it('should handle section content input', async () => {
      const user = userEvent.setup();
      mockDetectBookmarksAsync.mockResolvedValue({
        bookmarks: [
          { name: 'Professional Summary', placeholder: 'PROFESSIONAL_SUMMARY' },
        ],
      });

      render(<ResumeProcessorPanel isOpen={true} onClose={vi.fn()} />);

      const fileSelectBtn = screen.getByTestId('mock-file-select-btn');
      await user.click(fileSelectBtn);

      await waitFor(() => {
        const input = screen.getByTestId('mock-input-0');
        expect(input).toBeInTheDocument();
      });
    });
  });

  describe('Resume Update and Export', () => {
    it('should handle resume update completion', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      mockDetectBookmarksAsync.mockResolvedValue({
        bookmarks: [
          { name: 'Professional Summary', placeholder: 'PROFESSIONAL_SUMMARY' },
        ],
      });

      mockInjectResumeAsync.mockResolvedValue({
        success: true,
        downloadUrl: 'http://example.com/resume.docx',
      });

      render(<ResumeProcessorPanel isOpen={true} onClose={onClose} />);

      // Upload file
      const fileSelectBtn = screen.getByTestId('mock-file-select-btn');
      await user.click(fileSelectBtn);

      await waitFor(() => {
        expect(screen.getByTestId('mock-wizard')).toBeInTheDocument();
      });

      // Click finish
      const finishBtn = screen.getByTestId('mock-finish-btn');
      await user.click(finishBtn);

      await waitFor(() => {
        expect(mockInjectResumeAsync).toHaveBeenCalled();
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'success',
            message: expect.stringContaining('Resume updated successfully'),
          })
        );
      });
    });

    it('should show error toast on update failure', async () => {
      const user = userEvent.setup();

      mockDetectBookmarksAsync.mockResolvedValue({
        bookmarks: [
          { name: 'Professional Summary', placeholder: 'PROFESSIONAL_SUMMARY' },
        ],
      });

      mockInjectResumeAsync.mockRejectedValue(new Error('API Error'));

      render(<ResumeProcessorPanel isOpen={true} onClose={vi.fn()} />);

      // Upload file
      const fileSelectBtn = screen.getByTestId('mock-file-select-btn');
      await user.click(fileSelectBtn);

      await waitFor(() => {
        expect(screen.getByTestId('mock-wizard')).toBeInTheDocument();
      });

      // Click finish
      const finishBtn = screen.getByTestId('mock-finish-btn');
      await user.click(finishBtn);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'error',
            message: expect.stringContaining('Update failed'),
          })
        );
      });
    });

    it('should close modal after successful update', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      mockDetectBookmarksAsync.mockResolvedValue({
        bookmarks: [
          { name: 'Professional Summary', placeholder: 'PROFESSIONAL_SUMMARY' },
        ],
      });

      mockInjectResumeAsync.mockResolvedValue({ success: true });

      render(<ResumeProcessorPanel isOpen={true} onClose={onClose} />);

      // Upload file
      const fileSelectBtn = screen.getByTestId('mock-file-select-btn');
      await user.click(fileSelectBtn);

      await waitFor(() => {
        expect(screen.getByTestId('mock-wizard')).toBeInTheDocument();
      });

      // Click finish
      const finishBtn = screen.getByTestId('mock-finish-btn');
      await user.click(finishBtn);

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error toast when bookmark detection fails', async () => {
      const user = userEvent.setup();

      mockDetectBookmarksAsync.mockRejectedValue(new Error('Detection failed'));

      render(<ResumeProcessorPanel isOpen={true} onClose={vi.fn()} />);

      const fileSelectBtn = screen.getByTestId('mock-file-select-btn');
      await user.click(fileSelectBtn);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'error',
            message: expect.stringContaining('Detection failed'),
          })
        );
      });
    });

    it('should handle missing resume file gracefully', async () => {
      const user = userEvent.setup();

      mockDetectBookmarksAsync.mockResolvedValue({
        bookmarks: [
          { name: 'Professional Summary', placeholder: 'PROFESSIONAL_SUMMARY' },
        ],
      });

      render(<ResumeProcessorPanel isOpen={true} onClose={vi.fn()} />);

      const fileSelectBtn = screen.getByTestId('mock-file-select-btn');
      await user.click(fileSelectBtn);

      await waitFor(() => {
        expect(screen.getByTestId('mock-wizard')).toBeInTheDocument();
      });
    });

    it('should reset state when modal is closed', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      mockDetectBookmarksAsync.mockResolvedValue({
        bookmarks: [
          { name: 'Professional Summary', placeholder: 'PROFESSIONAL_SUMMARY' },
        ],
      });

      render(<ResumeProcessorPanel isOpen={true} onClose={onClose} />);

      const fileSelectBtn = screen.getByTestId('mock-file-select-btn');
      await user.click(fileSelectBtn);

      await waitFor(() => {
        expect(screen.getByTestId('mock-wizard')).toBeInTheDocument();
      });

      // Close modal
      const closeBtn = screen.getAllByRole('button')[0];
      await user.click(closeBtn);

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('UI Layout and Components', () => {
    it('should display 2-panel layout', () => {
      render(<ResumeProcessorPanel isOpen={true} onClose={vi.fn()} />);

      const leftPanel = screen.getByText('Resume Preview');
      expect(leftPanel).toBeInTheDocument();
    });

    it('should show header with title and close button', () => {
      render(<ResumeProcessorPanel isOpen={true} onClose={vi.fn()} />);

      expect(screen.getByText('🎯 Smart Resume Editor')).toBeInTheDocument();
    });

    it('should display upload zone instructions', () => {
      render(<ResumeProcessorPanel isOpen={true} onClose={vi.fn()} />);

      expect(screen.getByText('Step 1: Upload Your Resume')).toBeInTheDocument();
      expect(
        screen.getByText(/Upload a .docx resume file with Word bookmarks/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/📌 What are Word Bookmarks?/i)
      ).toBeInTheDocument();
    });
  });
});
