# Athena Exam Desktop Application — File Integration Map

This document defines the comprehensive file-by-file integration mapping from both reference repositories into the unified Athena Exam Desktop Application.

## Reference Repositories

1. **Repository 1 (Primary Shell & Electron Core):** `onlyaditya/myAthena` (branch `main`, subtree `/electron`)
2. **Repository 2 (MCQ Architecture Reference):** `JACOBIAN01/athena-exam` (branch `main`, subtree `/athena-frontend` & `/athena-backend`)

---

## File-by-File Mapping Table

| Original Repository & Path | Purpose | Planned Action | Destination Path | Reason / Technical Rationale |
| :--- | :--- | :--- | :--- | :--- |
| `myAthena/.gitignore` | Specifies untracked files for Git | Adapt | `.gitignore` | Preserved all original ignores; added `cameraFeed/` and `ScreenFeed/` output directories to prevent local snapshots from polluting Git. |
| `myAthena/package.json` | Project manifest, dependencies, and scripts | Adapt | `package.json` | Kept original dependency versions and Electron run scripts intact; added `npm run server` script for backend execution. |
| `myAthena/package-lock.json` | Exact pinned dependency tree | Preserve | `package-lock.json` | Preserved exact original dependency lockfile for deterministic builds. |
| `myAthena/vite.config.js` | Vite bundler configuration | Preserve | `vite.config.js` | Uses `@vitejs/plugin-react` for HMR and compilation. |
| `myAthena/eslint.config.js` | Linting rules for React and JS | Preserve | `eslint.config.js` | Retains project code style and hook rules. |
| `myAthena/index.html` | Root HTML template | Preserve | `index.html` | Mounts `#root` container for React renderer. |
| `myAthena/public/favicon.svg` | Application browser/window favicon | Preserve | `public/favicon.svg` | Kept original visual identity. |
| `myAthena/public/icons.svg` | SVG icons sprite | Preserve | `public/icons.svg` | Required for UI icon rendering. |
| `myAthena/electron/main.cjs` | Electron main process entry point | Adapt | `electron/main.cjs` | Preserved kiosk/fullscreen, timer handlers, rules dialog, desktopCapturer screen sharing, and snapshot saving to `cameraFeed/` and `ScreenFeed/`. |
| `myAthena/electron/preload.cjs` | Secure context bridge | Adapt | `electron/preload.cjs` | Exposes `electronAPI` methods (`setFullScreen`, `getRemainingTime`, `startTest`, `showExamRules`, `savePhoto`, `screenShare`, `saveScreenPhoto`). |
| `myAthena/src/main.jsx` | React root mount script | Preserve | `src/main.jsx` | Mounts `<App />` inside React `StrictMode`. |
| `myAthena/src/index.css` | Global typography and design tokens | Preserve | `src/index.css` | Retains full color variables, layout tokens, and typography. |
| `myAthena/src/App.css` | Main permissions and exam stylesheet | Adapt | `src/App.css` | Complete stylesheet covering permissions, recovery overlays, source picker, exam cards, question palette, confirmation modals, and results dashboard. |
| `myAthena/src/assets/hero.png` | Main banner visual asset | Preserve | `src/assets/hero.png` | Preserved original image asset. |
| `myAthena/src/assets/react.svg` | React logo asset | Preserve | `src/assets/react.svg` | Preserved original asset. |
| `myAthena/src/assets/vite.svg` | Vite logo asset | Preserve | `src/assets/vite.svg` | Preserved original asset. |
| `myAthena/src/App.jsx` | Primary permission and exam setup UI | Adapt | `src/App.jsx` | 3-way pre-flight checklist (Camera, Fullscreen, Screen Sharing), authoritative timer sync, recovery overlays, and coordinated exam completion. |
| `myAthena/electron.zip:src/components/MainExam.jsx` | Original questionnaire component shell | Adapt | `src/components/MainExam.jsx` | Full exam lifecycle component: dynamic question loading, ID-based answer persistence, question palette, draft auto-save, submission modal, duplicate lock, timer auto-submit, and results transition. |
| `athena-exam/athena-frontend/src/App.jsx` | Post-exam results and score review | Adapt | `src/components/ExamResults.jsx` | Dedicated results screen showing score, percentage, metrics grid (Total, Answered, Unanswered, Correct, Incorrect), question breakdown, and exit actions. |
| `athena-exam/athena-backend/server.js` | Express mock API with questions & sessions | Adapt | `backend/server.js` | Built with Node's native runtime (`node:http`, `node:fs`, `node:path`); implements `/health`, `/exam/mcq/all`, `/exam/mcq/:id`, `/exam/start`, `/exam/submit`, and `/exam/session/:sessionId`. |
| `athena-exam/athena-backend/data/questions.json` | MCQ question bank with answer keys | Adapt | `backend/data/questions.json` | Trusted question bank storing question prompts, option lists, `correctAnswer` indices, and explanations. Sanitized before delivery to frontend. |
| `athena-exam/athena-backend/data/sessions.json` | Persistent exam attempt session storage | Adapt | `backend/data/sessions.json` | Persistent JSON store recording candidate session IDs, timestamps, answers, evaluated scores, and attempt status. |
| `test/day4_lifecycle_submission.test.js` | Day 4 lifecycle & integration test suite | Create | `test/day4_lifecycle_submission.test.js` | 12 automated scenarios verifying question loading, answer persistence, submission validation, duplicate locks, trusted scoring, timer auto-submit, and results generation. |
| `test/day5_e2e_release.test.js` | Day 5 final audit, E2E & release readiness test suite | Create | `test/day5_e2e_release.test.js` | 20 comprehensive end-to-end scenarios covering permissions, lockdown, desktopCapturer, question persistence, trusted scoring, submission error handling, immediate interval cleanup, and regressions. |

---

## Architecture Summary

- **Desktop Framework:** Electron 41 (CommonJS main process + context-isolated preload bridge).
- **Frontend Framework:** React 19 + Vite 8 (Modern ESM fast-refresh renderer).
- **Backend Service:** Node.js HTTP server (`backend/server.js`) on port 3000 with CORS and trusted scoring engine.
- **Communication Bridge:** Safe IPC via `contextBridge.exposeInMainWorld("electronAPI", ...)` and secure HTTP fetch to backend.
- **Styling Architecture:** Pure CSS design system using original Athena design tokens, card layouts, and responsive results view.
