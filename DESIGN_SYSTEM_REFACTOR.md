# Design System Refactor Plan

## Overview

Refactor Normie to follow the Syle Digital Marketer design system from Figma.

## Design Tokens

### Colors

```css
--purple-400: #c084fc --purple-500: #a855f7 --purple-600: #9333ea
  --primary-dark: #111111 --background: #fafafa --text-primary: #101828
  --text-secondary: #4a5565 --text-tertiary: #6a7282 --border: #e5e7eb
  --surface: #ffffff --surface-glass: rgba(255, 255, 255, 0.4)
  --surface-gradient: rgba(249, 250, 251, 0.8);
```

### Typography

- **Primary Font**: Inter (body, UI elements)
- **Accent Font**: Playfair Display (headings, decorative)

**Scale:**

- H1: 84px / -5% tracking
- H2: 52.5px / -2.5% tracking
- H3: 42px / -2.5% tracking
- H4: 31.5px / -2.5% tracking
- Body: 17.5px / 1.625 line-height
- Small: 14px / 1.5 line-height
- Tiny: 12.25px / 1.43 line-height

### Spacing

- Base unit: 7px (0.4375rem)
- Scale: 7, 14, 21, 28, 35, 42, 56, 98

### Border Radius

- Cards: 21px
- Buttons: Full rounded (9999px)
- Pills/Badges: Full rounded

### Shadows

- Subtle: 0px 2px 10px rgba(0,0,0,0.02)
- Medium: 0px 8px 30px rgba(0,0,0,0.06)
- Purple: 0px 8px 25px rgba(168,85,247,0.35)
- Glass: 0px 4px 6px -4px rgba(0,0,0,0.1), 0px 10px 15px -3px rgba(0,0,0,0.1)

### Effects

- Glass blur: 80px-128px
- Gradient: 135deg purple gradient
- Border: 1px solid with transparency

## Component Mapping

### Current → New Design System

1. **Chat Interface**
   - Background: #FAFAFA with subtle gradient overlay
   - Message bubbles: Glass cards with blur
   - User messages: Purple gradient background
   - AI messages: White glass surface

2. **Buttons**
   - Primary: Dark (#111111) with glass container
   - Secondary: Purple gradient with glow
   - Ghost: Transparent with border
   - All wrapped in glass container with blur

3. **Input Fields**
   - Glass morphism background
   - Subtle border
   - Focus: Purple glow shadow

4. **Sidebar**
   - Glass surface with blur
   - Subtle borders
   - Hover states with purple accent

5. **Badges/Pills**
   - Model selector: Pill badges with icons
   - Status indicators: Rounded badges with dot

6. **Cards**
   - Chat history: Process card style
   - Settings panels: Gradient cards

## Implementation Steps

### Phase 1: Design Tokens (CSS Variables)

- [ ] Create design-tokens.css with all variables
- [ ] Update index.css to import tokens
- [ ] Remove old Tailwind custom colors

### Phase 2: Typography

- [ ] Import Inter and Playfair Display fonts
- [ ] Create typography utility classes
- [ ] Update all text elements

### Phase 3: Core Components

- [ ] Button component with variants
- [ ] Input component with glass effect
- [ ] Badge/Pill components
- [ ] Card components

### Phase 4: Layout Updates

- [ ] Update App.tsx background
- [ ] Refactor ChatSidebar with glass effect
- [ ] Update MessageList styling
- [ ] Refactor ChatInput with new design

### Phase 5: Polish

- [ ] Add gradient overlays
- [ ] Implement glass morphism effects
- [ ] Add purple accent animations
- [ ] Update hover/focus states

## Files to Modify

1. `apps/web/src/index.css` - Design tokens
2. `apps/web/tailwind.config.js` - Tailwind theme
3. `apps/web/src/App.tsx` - Main layout
4. `apps/web/src/components/chat/*` - All chat components
5. `apps/web/src/components/ui/*` - UI primitives
6. Create new: `apps/web/src/styles/design-tokens.css`
7. Create new: `apps/web/src/components/ui/Button.tsx`
8. Create new: `apps/web/src/components/ui/Badge.tsx`
9. Create new: `apps/web/src/components/ui/Card.tsx`

## Notes

- Maintain accessibility (WCAG AA minimum)
- Ensure glass effects work on different backgrounds
- Test purple gradient readability
- Keep existing functionality intact
