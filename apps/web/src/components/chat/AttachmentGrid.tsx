/**
 * AttachmentGrid - Container for multiple attachments in a message
 */

import { memo } from 'react';
import type { Attachment } from '@normie/types';
import { AttachmentDisplay } from './AttachmentDisplay';

interface AttachmentGridProps {
  attachments: Attachment[];
}

export const AttachmentGrid = memo(function AttachmentGrid({ 
  attachments 
}: AttachmentGridProps) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {attachments.map((attachment) => (
        <AttachmentDisplay
          key={attachment.id}
          attachment={attachment}
        />
      ))}
    </div>
  );
});