# Features and Tech Debt to Consider

## Tech Stack Improvements

### 1. Date Formatting
**Current**: Custom `dateUtils.ts` using native `Intl` and `Date` APIs.
**Recommendation**: Adopt [date-fns](https://date-fns.org/).
**Benefit**: More robust parsing, formatting, and manipulation functions. Standardizes date handling across the app.

### 2. State Management
**Current**: React Context (`SettingsContext`, `PopupContext`).
**Recommendation**: Adopt [Zustand](https://github.com/pmndrs/zustand).
**Benefit**: significantly less boilerplate than Context, better performance (prevents unnecessary re-renders), and easier to use outside of components.

## Future Features

- [ ] persistent match details caching
- [ ] offline mode support
