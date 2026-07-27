---
name: training-ui-patterns
description: Use when building UI components for training modules, progress bars, or lesson screens.
---

# Training UI Design & Component Patterns

When building or updating UI components for training modules, progress indicators, or lesson screens, adhere to the following design conventions:

1. **Inspect Existing UI Patterns**: Inspect `@src/app/components` and existing modal/card layouts to copy established button styles, dark/light theme tokens, micro-animations, and Tailwind CSS utility patterns.
2. **Modular & Reusable Components**: Export all new UI components as modular, standalone units with clear TypeScript prop interfaces.
3. **Design Aesthetics**:
   - Support dark mode and light mode seamlessly.
   - Use glassmorphism background blurs (`backdrop-blur-md`), smooth rounded corners (`rounded-2xl`), and subtle micro-animations for interactive elements.
   - Ensure high visual polish and responsive typography.
