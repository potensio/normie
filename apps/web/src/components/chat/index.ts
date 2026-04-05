/**
 * Chat components index
 * 
 * Re-exports container components for use in App.
 * Presentational components are internal to this module.
 */

// Containers (what App uses)
export { ChatSidebarContainer } from './ChatSidebarContainer';
export { ChatInputContainer } from './ChatInputContainer';

// Presentational (exported for testing)
export { ChatSidebar } from './ChatSidebar';
export { ChatInput } from './ChatInput';

// Message components (already presentational)
export { MessageList } from './MessageList';
export { MessageItem } from './MessageItem';

// UI components
export { ScrollToBottomButton } from './ScrollToBottomButton';

// Streaming components
export { AnimatedStream } from './AnimatedStream';
export { StreamingText } from './StreamingText';

// Markdown rendering
export { MarkdownRenderer } from './MarkdownRenderer';