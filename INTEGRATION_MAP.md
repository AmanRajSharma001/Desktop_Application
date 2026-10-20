# Athena Exam Desktop Application — File Integration Map

This document defines the comprehensive file-by-file integration mapping from both reference repositories into the unified Athena Exam Desktop Application.

## Reference Repositories

1. **Repository 1 (Primary Shell & Electron Core):** `onlyaditya/myAthena` (branch `main`, subtree `/electron`)
2. **Repository 2 (MCQ Architecture Reference):** `JACOBIAN01/athena-exam` (branch `main`, subtree `/athena-frontend` & `/athena-backend`)

---

## File-by-File Mapping Table

| Original Repository & Path | Purpose | Planned Action | Destination Path | Reason / Technical Rationale |
| :--- | :--- | :--- | :--- | :--- |
| `myAthena/.gitignore` | Specifies untracked files for Git | Adapt | `.gitignore` | Preserved all original ignores; added `cameraFeed/` output directory to prevent local snapshots from polluting Git. |
| `myAthena/package.json` | Project manifest, dependencies, and scripts | Preserve | `package.json` | Kept original dependency versions and Electron run scripts intact. |
| `myAthena/package-lock.json` | Exact pinned dependency tree | Preserve | `package-lock.json` | Preserved exact original dependency lockfile for deterministic builds. |
| `myAthena/vite.config.js` | Vite bundler configuration | Preserve | `vite.config.js` | Uses `@vitejs/plugin-react` for HMR and compilation. |
| `myAthena/eslint.config.js` | Linting rules for React and JS | Preserve | `eslint.config.js` | Retains project code style and hook rules. |
| `myAthena/index.html` | Root HTML template | Preserve | `index.html` | Mounts `#root` container for React renderer. |
| `myAthena/public/favicon.svg` | Application browser/window favicon | Preserve | `public/favicon.svg` | Kept original visual identity. |
| `myAthena/public/icons.svg` | SVG icons sprite | Preserve | `public/icons.svg` | Required for UI icon rendering. |
| `myAthena/electron/main.cjs` | Electron main process entry point | Adapt | `electron/main.cjs` | Preserved kiosk/fullscreen, timer handlers, rules dialog, and snapshot saving. Added directory safety for `cameraFeed/` and graceful fallback to built `dist/index.html`. |
| `myAthena/electron/preload.cjs` | Secure context bridge | Adapt | `electron/preload.cjs` | Preserved all `window.electronAPI` methods (`setFullScreen`, `getRemainingTime`, `startTest`, `showExamRules`, `savePhoto`) and added `showRules` alias for compatibility. |
| `myAthena/src/main.jsx` | React root mount script | Preserve | `src/main.jsx` | Mounts `<App />` inside React `StrictMode`. |
| `myAthena/src/index.css` | Global typography and design tokens | Preserve | `src/index.css` | Retains full color variables, layout tokens, and typography. |
| `myAthena/src/App.css` | Main permissions and exam stylesheet | Preserve | `src/App.css` | 440+ lines of original styling covering permissions card, buttons, camera preview, exam header, question card, options, and navigation. |
| `myAthena/src/assets/hero.png` | Main banner visual asset | Preserve | `src/assets/hero.png` | Preserved original image asset. |
| `myAthena/src/assets/react.svg` | React logo asset | Preserve | `src/assets/react.svg` | Preserved original asset. |
| `myAthena/src/assets/vite.svg` | Vite logo asset | Preserve | `src/assets/vite.svg` | Preserved original asset. |
| `myAthena/src/App.jsx` | Primary permission and exam setup UI | Adapt | `src/App.jsx` | Preserved camera access, snapshot interval, fullscreen toggle, rules dialog, and wired conditional transition to `MainExam`. |
| `myAthena/electron.zip:src/components/MainExam.jsx` | Original questionnaire component shell | Adapt | `src/components/MainExam.jsx` | Restored from OnlyAditya's `electron.zip`. Added graceful Day 1 placeholder fallback while backend integration is deferred to Day 2+. |
| `athena-exam/athena-frontend/src/App.jsx` | Student identity entry (Name, URN, Session ID) | Reuse (Deferred to Day 2) | `src/components/StudentAuth.jsx` (planned) | To be integrated on Day 2 for student exam registration and session creation. |
| `athena-exam/athena-backend/server.js` | Express mock API with questions & sessions | Reuse (Deferred to Day 2+) | `backend/server.js` (planned) | Reference for MCQ API endpoints (`/exam/start`, `/exam/mcq`, `/exam/answer`, `/exam/submit`). Deferred as per Day 1 boundary rules. |
| `athena-exam/athena-backend/data/questions.json` | Sample MCQ question bank | Reuse (Deferred to Day 2) | `data/questions.json` (planned) | Question bank to be connected to the exam UI on Day 2. |
| `athena-exam/athena-backend/data/sessions.json` | Session storage schema | Reuse (Deferred to Day 2) | `data/sessions.json` (planned) | Exam attempt sessions to be integrated on Day 2. |
| `myAthena/Archive.zip` & `myAthena/electron.zip` | Intermediate snapshot archives | Exclude | None | Archives inspected and relevant code (`MainExam.jsx`) integrated; redundant archives excluded from Git to keep repository lean. |

---

## Architecture Summary

- **Desktop Framework:** Electron 41 (CommonJS main process + context-isolated preload bridge).
- **Frontend Framework:** React 19 + Vite 8 (Modern ESM fast-refresh renderer).
- **Communication Bridge:** Safe IPC via `contextBridge.exposeInMainWorld("electronAPI", ...)`.
- **Styling Architecture:** Pure CSS design system using original Athena design tokens and card layouts.
