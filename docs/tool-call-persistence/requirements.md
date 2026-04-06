# Requirements Document: Tool Call Persistence & Styling Fixes

## Introduction

This document addresses two issues discovered after implementing the compact tool call display:
1. Tool calls are lost when navigating away from a chat and returning
2. Tool calls have an unnecessary visual wrapper that adds visual noise

---

## Glossary

| Term | Definition |
|------|------------|
| **Tool call persistence** | Saving and restoring tool blocks when chats are loaded from the database |
| **Minimal styling** | Displaying tool calls without surrounding borders or card wrappers |

---

## Requirements

### Requirement 1: Tool Call Persistence

**User Story:** As a user, I want tool calls to remain visible when I navigate away and return to a chat, so that I don't lose context of what the AI did.

#### Acceptance Criteria

1. WHEN a message with tool blocks is saved to the database THEN the System SHALL persist the `blocks` array including `ToolBlock` entries
2. WHEN a chat is loaded from the database THEN the System SHALL restore all message blocks including tool calls
3. WHEN a tool call is restored THEN the System SHALL display it with the same status (success/error) and result as when it was created

---

### Requirement 2: Minimal Tool Call Styling

**User Story:** As a user, I want tool calls to be visually lightweight, so that they don't distract from the main conversation flow.

#### Acceptance Criteria

1. WHEN a tool call is displayed THEN the System SHALL NOT render an outer border or card wrapper around the compact display
2. WHEN a tool call is displayed THEN the System SHALL render only the status icon, text, and duration without a surrounding visual container
3. WHEN a tool call result is expanded THEN the System MAY show a subtle background for the result section only

---

## Scope Boundaries

### In Scope
- Persisting `blocks` field to database
- Loading `blocks` from database on chat open
- Removing visual wrapper from compact tool call display

### Out of Scope
- Retry failed tool calls
- Edit tool call results
- Tool call analytics