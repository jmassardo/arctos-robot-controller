# Design System & Style Guide
## Arctos Robot Controller - Enterprise UI Design Standards

### Table of Contents
1. [Design Philosophy](#design-philosophy)
2. [Color System](#color-system)
3. [Typography](#typography)
4. [Spacing & Layout](#spacing--layout)
5. [Component Library](#component-library)
6. [Interaction Patterns](#interaction-patterns)
7. [Accessibility Standards](#accessibility-standards)

---

## Design Philosophy

### Core Principles

#### 1. Safety First
All design decisions prioritize user safety and system reliability. Critical controls are prominent, destructive actions require confirmation, and emergency functions are always accessible.

#### 2. Progressive Disclosure
Information and functionality are revealed contextually based on user expertise level and immediate needs. Complexity is managed through intelligent layering.

#### 3. Industrial Precision
The interface reflects the precision and reliability expected in industrial environments while maintaining modern usability standards.

#### 4. Contextual Efficiency
The interface adapts to user context, role, and task at hand, minimizing cognitive load and maximizing operational efficiency.

---

## Color System

### Primary Color Palette

```css
/* Primary Colors - Robotic Blue */
--color-primary-50: #eff6ff;
--color-primary-100: #dbeafe;
--color-primary-200: #bfdbfe;
--color-primary-300: #93c5fd;
--color-primary-400: #60a5fa;
--color-primary-500: #3b82f6;  /* Primary */
--color-primary-600: #2563eb;
--color-primary-700: #1d4ed8;
--color-primary-800: #1e40af;
--color-primary-900: #1e3a8a;

/* Secondary Colors - Steel Gray */
--color-secondary-50: #f8fafc;
--color-secondary-100: #f1f5f9;
--color-secondary-200: #e2e8f0;
--color-secondary-300: #cbd5e1;
--color-secondary-400: #94a3b8;
--color-secondary-500: #64748b;  /* Secondary */
--color-secondary-600: #475569;
--color-secondary-700: #334155;
--color-secondary-800: #1e293b;
--color-secondary-900: #0f172a;
```

### Semantic Colors

```css
/* Status Colors */
--color-success: #10b981;     /* System OK, Successful operations */
--color-warning: #f59e0b;     /* Caution, Needs attention */
--color-danger: #ef4444;      /* Emergency, Critical errors */
--color-info: #06b6d4;        /* Information, Status updates */

/* Safety Colors (High Contrast) */
--color-emergency: #dc2626;   /* Emergency stop */
--color-caution: #fbbf24;     /* Caution zones */
--color-safe: #059669;        /* Safe operations */

/* Industrial Colors */
--color-dro-display: #00ff00; /* Digital readout displays */
--color-dro-background: #000000;
--color-axis-x: #ff4444;      /* X-axis identification */
--color-axis-y: #44ff44;      /* Y-axis identification */
--color-axis-z: #4444ff;      /* Z-axis identification */
```

### Accessibility Compliance

All color combinations meet WCAG 2.1 AA standards with minimum 4.5:1 contrast ratio for normal text and 3:1 for large text.

**High Contrast Mode:**
```css
[data-contrast="high"] {
  --color-primary: #0066cc;
  --color-background: #ffffff;
  --color-text: #000000;
  --color-border: #333333;
}
```

---

## Typography

### Font System

#### Primary Font Stack
```css
--font-primary: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 
                'Oxygen', 'Ubuntu', 'Cantarell', 'Helvetica Neue', sans-serif;
```

#### Monospace Font Stack (Industrial Displays)
```css
--font-mono: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', 
             'Courier New', monospace;
```

### Type Scale

```css
/* Font Sizes */
--text-xs: 0.75rem;    /* 12px - Labels, captions */
--text-sm: 0.875rem;   /* 14px - Body small, secondary text */
--text-base: 1rem;     /* 16px - Body text */
--text-lg: 1.125rem;   /* 18px - Subheadings */
--text-xl: 1.25rem;    /* 20px - Headings */
--text-2xl: 1.5rem;    /* 24px - Section headers */
--text-3xl: 1.875rem;  /* 30px - Page titles */
--text-4xl: 2.25rem;   /* 36px - Display text */

/* Line Heights */
--leading-tight: 1.25;
--leading-normal: 1.5;
--leading-relaxed: 1.75;

/* Font Weights */
--font-light: 300;
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
```

### Typography Usage

#### Headings
```css
.heading-1 { font-size: var(--text-3xl); font-weight: var(--font-bold); }
.heading-2 { font-size: var(--text-2xl); font-weight: var(--font-semibold); }
.heading-3 { font-size: var(--text-xl); font-weight: var(--font-semibold); }
.heading-4 { font-size: var(--text-lg); font-weight: var(--font-medium); }
```

#### Body Text
```css
.body-large { font-size: var(--text-lg); line-height: var(--leading-relaxed); }
.body { font-size: var(--text-base); line-height: var(--leading-normal); }
.body-small { font-size: var(--text-sm); line-height: var(--leading-normal); }
```

#### Industrial Displays
```css
.dro-value {
  font-family: var(--font-mono);
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  color: var(--color-dro-display);
  background: var(--color-dro-background);
  text-shadow: 0 0 8px currentColor;
}
```

---

## Spacing & Layout

### Spacing Scale

```css
/* Base spacing unit: 4px */
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px */
--space-3: 0.75rem;   /* 12px */
--space-4: 1rem;      /* 16px */
--space-5: 1.25rem;   /* 20px */
--space-6: 1.5rem;    /* 24px */
--space-8: 2rem;      /* 32px */
--space-10: 2.5rem;   /* 40px */
--space-12: 3rem;     /* 48px */
--space-16: 4rem;     /* 64px */
--space-20: 5rem;     /* 80px */
--space-24: 6rem;     /* 96px */
```

### Layout Grid

#### Desktop Grid
```css
.container {
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 var(--space-6);
}

.grid {
  display: grid;
  gap: var(--space-6);
  grid-template-columns: repeat(12, 1fr);
}
```

#### Mobile Grid
```css
@media (max-width: 768px) {
  .container { padding: 0 var(--space-4); }
  .grid { 
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-4);
  }
}
```

### Touch Target Sizes

```css
/* Minimum touch target sizes for accessibility */
--touch-target-minimum: 44px;    /* WCAG minimum */
--touch-target-comfortable: 48px; /* Comfortable size */
--touch-target-large: 56px;      /* Large controls */

.touch-target {
  min-height: var(--touch-target-minimum);
  min-width: var(--touch-target-minimum);
}
```

---

## Component Library

### Buttons

#### Primary Button
```css
.btn-primary {
  background: var(--color-primary-500);
  color: white;
  border: 2px solid var(--color-primary-500);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-6);
  font-weight: var(--font-medium);
  transition: all 0.2s ease;
}

.btn-primary:hover {
  background: var(--color-primary-600);
  border-color: var(--color-primary-600);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}
```

#### Emergency Button
```css
.btn-emergency {
  background: var(--color-emergency);
  color: white;
  border: 3px solid var(--color-emergency);
  border-radius: 50%;
  width: 80px;
  height: 80px;
  font-size: var(--text-lg);
  font-weight: var(--font-bold);
  position: fixed;
  top: var(--space-6);
  right: var(--space-6);
  z-index: 1000;
  box-shadow: 0 4px 20px rgba(220, 38, 38, 0.4);
}

.btn-emergency:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 24px rgba(220, 38, 38, 0.6);
}
```

#### Touch-Optimized Buttons
```css
.btn-touch {
  min-height: var(--touch-target-comfortable);
  min-width: var(--touch-target-comfortable);
  border-radius: var(--radius-lg);
  font-size: var(--text-base);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
}

@media (hover: none) {
  .btn-touch:active {
    transform: scale(0.95);
    transition: transform 0.1s ease;
  }
}
```

### Form Controls

#### Input Fields
```css
.form-input {
  border: 2px solid var(--color-secondary-300);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  font-size: var(--text-base);
  background: var(--color-background);
  color: var(--color-text);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--color-primary-500);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-input:invalid {
  border-color: var(--color-danger);
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
}
```

#### Sliders and Range Controls
```css
.range-control {
  -webkit-appearance: none;
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: var(--color-secondary-200);
  outline: none;
}

.range-control::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--color-primary-500);
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(59, 130, 246, 0.3);
}
```

### Cards and Containers

#### Standard Card
```css
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  transform: translateY(-1px);
}
```

#### Industrial Panel
```css
.industrial-panel {
  background: var(--color-secondary-900);
  border: 2px inset var(--color-secondary-600);
  border-radius: var(--radius-sm);
  padding: var(--space-4);
  font-family: var(--font-mono);
  color: var(--color-dro-display);
}
```

### Navigation Components

#### Tab Navigation
```css
.nav-tabs {
  display: flex;
  border-bottom: 2px solid var(--color-border);
  background: var(--color-surface);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}

.nav-tab {
  flex: 1;
  padding: var(--space-4) var(--space-6);
  border: none;
  background: none;
  color: var(--color-text-secondary);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: all 0.2s ease;
  border-bottom: 3px solid transparent;
}

.nav-tab:hover {
  color: var(--color-primary-500);
  background: var(--color-primary-50);
}

.nav-tab.active {
  color: var(--color-primary-600);
  border-bottom-color: var(--color-primary-500);
  background: var(--color-primary-50);
}
```

---

## Interaction Patterns

### Loading States

#### Skeleton Loaders
```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-secondary-200) 25%,
    var(--color-secondary-100) 50%,
    var(--color-secondary-200) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s infinite;
  border-radius: var(--radius-sm);
}

@keyframes skeleton-loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

#### Progress Indicators
```css
.progress-bar {
  width: 100%;
  height: var(--space-2);
  background: var(--color-secondary-200);
  border-radius: var(--space-1);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-primary-500), var(--color-primary-400));
  border-radius: var(--space-1);
  transition: width 0.3s ease;
}
```

### Animation & Transitions

#### Micro-interactions
```css
.interactive {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.interactive:hover {
  transform: translateY(-1px);
}

.interactive:active {
  transform: translateY(0);
  transition-duration: 0.1s;
}
```

#### State Changes
```css
.state-change {
  transition: all 0.3s ease;
}

.fade-in {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
```

### Touch Interactions

#### Touch Feedback
```css
.touch-feedback {
  position: relative;
  overflow: hidden;
}

.touch-feedback::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  transform: translate(-50%, -50%);
  transition: width 0.6s, height 0.6s;
}

.touch-feedback:active::after {
  width: 200px;
  height: 200px;
}
```

---

## Accessibility Standards

### WCAG 2.1 AA Compliance

#### Color Contrast
- **Normal text**: Minimum 4.5:1 contrast ratio
- **Large text**: Minimum 3:1 contrast ratio
- **UI components**: Minimum 3:1 contrast ratio

#### Focus Management
```css
.focusable {
  outline: none;
  position: relative;
}

.focusable:focus {
  outline: 2px solid var(--color-primary-500);
  outline-offset: 2px;
}

.focusable:focus:not(:focus-visible) {
  outline: none;
}
```

#### Screen Reader Support
```css
.sr-only {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  margin: -1px !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  white-space: nowrap !important;
  border: 0 !important;
}
```

### Keyboard Navigation
```css
.keyboard-navigation {
  outline: none;
}

.keyboard-navigation:focus-visible {
  outline: 2px solid var(--color-primary-500);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
```

### Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Component Usage Examples

### Emergency Stop Implementation
```jsx
<button 
  className="btn-emergency"
  aria-label="Emergency Stop - Immediately halt all robot operations"
  onClick={handleEmergencyStop}
>
  <span className="sr-only">Emergency Stop</span>
  🛑
</button>
```

### Progressive Disclosure Example
```jsx
<div className="control-panel">
  {skillLevel === 'beginner' && <BasicControls />}
  {skillLevel === 'intermediate' && (
    <>
      <BasicControls />
      <AdvancedControls />
    </>
  )}
  {skillLevel === 'expert' && <FullControls />}
</div>
```

### Responsive Touch Controls
```jsx
<TouchControl
  minSize="44px"
  feedback="haptic"
  onPress={handleAction}
  aria-label="Jog X-axis positive direction"
>
  X+
</TouchControl>
```

---

*This design system provides a comprehensive foundation for creating a consistent, accessible, and user-friendly interface that meets both modern usability standards and industrial control requirements.*