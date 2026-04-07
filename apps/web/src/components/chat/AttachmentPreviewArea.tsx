/**
 * AttachmentPreviewArea - Container for file preview chips
 */

import type { PendingAttachment } from '@/hooks/useAttachments';
import { FilePreviewChip } from './FilePreviewChip';

interface AttachmentPreviewAreaProps {
  attachments: PendingAttachment[];
  onRemoveAttachment: (id: string) => void;
}

export function AttachmentPreviewArea({ 
  attachments, 
  onRemoveAttachment 
}: AttachmentPreviewAreaProps) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {attachments.map((attachment) => (
        <FilePreviewChip
          key={attachment.id}
          attachment={attachment}
          onRemove={onRemoveAttachment}
        />
      ))}
    </div>
  );
}