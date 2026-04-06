# Requirements Document: Compact Tool Call Display

## Introduction

This document specifies the UX improvements for tool call display in Normie, an AI chat application targeting non-technical users. The goal is to simplify the visual presentation of tool executions — showing what's happening with minimal cognitive load while preserving the ability to inspect details on demand. Tools should appear **interleaved with text** in stream order, not grouped separately.

---

## Glossary

| Term | Definition |
|------|------------|
| **Tool call** | An action executed by the AI (e.g., read file, run command, search) |
| **Inline tool call** | A tool call displayed within the message stream, mixed with text |
| **Compact mode** | One-to-two line display format showing status, action, and target |
| **Pretty print** | Formatted, syntax-highlighted display of tool results |
| **Interleaved** | Tool calls mixed into text at their execution position, not grouped separately |
| **Blocks** | A message structure where content is an array of text and tool segments |

---

## Requirements

### Requirement 1: Blocks-Based Message Structure

**User Story:** As a developer, I want messages to support interleaved text and tool calls, so that users see tools in the order they were executed.

#### Acceptance Criteria

1. WHEN a message is created THEN the System SHALL use a `blocks` array instead of separate `content` and `inlineToolCalls` fields
2. WHEN a text chunk arrives during streaming THEN the System SHALL append a `{ type: 'text', content: string }` block
3. WHEN a tool_use event arrives THEN the System SHALL append a `{ type: 'tool', toolCall: InlineToolCall }` block
4. WHEN rendering a message THEN the System SHALL render blocks in array order
5. WHEN multiple blocks of the same type are adjacent THEN the System MAY merge them for efficiency

---

### Requirement 2: Compact Tool Call Display

**User Story:** As a non-technical user, I want to see a brief summary of what the AI is doing, so that I understand progress without being overwhelmed by technical details.

#### Acceptance Criteria

1. WHEN a tool call has status `running` THEN the System SHALL display one line: `⏳ {verb} {target}...`
2. WHEN a tool call has status `success` THEN the System SHALL display one line: `✓ {past_tense_verb} {target} {duration}s`
3. WHEN a tool call has status `error` THEN the System SHALL display two lines: `✗ {past_tense_verb} {target}` followed by a one-line error summary
4. WHEN the tool target is a file path THEN the System SHALL display only the filename, not the full path
5. WHEN the tool target exceeds 40 characters THEN the System SHALL truncate with ellipsis
6. WHEN duration is less than 0.1 seconds THEN the System SHALL display `<0.1s` instead of rounding to zero
7. WHEN duration is displayed THEN the System SHALL show one decimal place (e.g., `1.2s`, `0.5s`)

---

### Requirement 3: Tool Result Expansion

**User Story:** As a non-technical user, I want to optionally see the result of a tool execution, so that I can investigate if curious.

#### Acceptance Criteria

1. WHEN a tool call is displayed THEN the result SHALL be hidden by default
2. WHEN the user clicks or taps a tool call THEN the System SHALL expand to show the result inline
3. WHEN the result is expanded THEN the System SHALL display a pretty-printed view with syntax highlighting
4. WHEN the result is JSON THEN the System SHALL format with indentation and appropriate colors
5. WHEN the result exceeds 200px in height THEN the System SHALL limit to 200px and enable vertical scrolling
6. WHEN the result is expanded and the user clicks or taps again THEN the System SHALL collapse the result

---

### Requirement 4: Tool Label Formatting

**User Story:** As a user, I want human-readable labels for tool actions, so that I understand what's happening without knowing technical tool names.

#### Acceptance Criteria

1. WHEN a tool named `read` or `Read` is executed THEN the System SHALL display "Reading" while running and "Read" when complete
2. WHEN a tool named `bash` is executed THEN the System SHALL display "Running command" while running and "Ran command" when complete
3. WHEN a tool named `grep` or `search` is executed THEN the System SHALL display "Searching" while running and "Searched" when complete
4. WHEN a tool named `write` or `edit` is executed THEN the System SHALL display "Writing" while running and "Wrote" when complete
5. WHEN a tool name is not in the known list THEN the System SHALL convert camelCase/PascalCase to spaces and capitalize (e.g., `TodoWrite` → "Todo write")

---

### Requirement 5: Error Message Display

**User Story:** As a non-technical user, I want to see a brief error message when a tool fails, so that I understand what went wrong without technical jargon.

#### Acceptance Criteria

1. WHEN a tool fails with a network error THEN the System SHALL display "Network error, please check your connection"
2. WHEN a tool fails with a timeout THEN the System SHALL display "Operation timed out"
3. WHEN a tool fails with a permission error THEN the System SHALL display "Permission denied"
4. WHEN a tool fails with an unknown error THEN the System SHALL display a truncated error message (max 80 characters)
5. WHEN an error message exceeds 80 characters THEN the System SHALL truncate with ellipsis

---

## Scope Boundaries

### In Scope
- Compact tool call display
- Interleaved rendering with blocks structure
- Pretty-printed result expansion
- Duration display
- Error message formatting

### Out of Scope
- Progress bars
- Live terminal embedding
- Diff views
- Tool call grouping/collapsing
- Tool call cancellation from UI