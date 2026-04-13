/**
 * Email Components - Complete Email Suite
 * Exports all email-related components for use across the application
 */

export { RichTextEditor } from './RichTextEditor';
export { RecipientManager } from './RecipientManager';
export { AttachmentManager, type Attachment } from './AttachmentManager';
export { SignatureManager, type EmailSignature } from './SignatureManager';
export { TemplateManager, type EmailTemplate } from './TemplateManager';
export { DraftManager, type EmailDraft } from './DraftManager';
export { ScheduleSend, type ScheduleOptions } from './ScheduleSend';
export { AdvancedOptions, type AdvancedEmailOptions } from './AdvancedOptions';

/**
 * Usage Example:
 * 
 * import {
 *   RichTextEditor,
 *   RecipientManager,
 *   AttachmentManager,
 *   SignatureManager,
 *   TemplateManager,
 *   DraftManager,
 *   ScheduleSend,
 *   AdvancedOptions,
 * } from '@/components/email';
 */
