# Athena Exam Desktop Application

A proctored exam desktop application built with Electron, React, and Vite, integrating real-time camera proctoring, kiosk/fullscreen lockdown, system dialog alerts, and MCQ questionnaire examination workflows.

---

## Project Overview & 5-Day Roadmap

This project unites two open-source foundational repositories:
1. **Primary Desktop Architecture & UI:** [`onlyaditya/myAthena`](https://github.com/onlyaditya/myAthena) (Electron process architecture, permission checks, proctoring camera feed, kiosk lockdown, and Athena design system).
2. **MCQ Questionnaire & Session Architecture:** [`JACOBIAN01/athena-exam`](https://github.com/JACOBIAN01/athena-exam) (Student session creation, question bank delivery, answer verification, and exam submission).

### 5-Day Plan Summary
- **Day 1 (Completed):** Repository analysis, environment inspection, Electron architecture setup, security isolation, main permissions interface integration, and questionnaire placeholder shell.
- **Day 2:** MCQ questionnaire integration, student identity onboarding (Name/URN), session management, and questions state handling.
- **Day 3:** Proctoring features, webcam snapshot stream verification, countdown timer synchronization, and fullscreen kiosk enforcement.
- **Day 4:** Answer scoring engine, submission handling, local persistence / backend API synchronization, and results overview.
- **Day 5:** Application packaging, cross-platform build verification, end-to-end testing, and production distribution.

---

## Day 1 Architecture & Implementation Status

### Architecture Breakdown
- **Runtime Environment:** Electron 41.7.1
- **Renderer Process:** React 19.2.8 + Vite 8.3.0
- **Process Communication:** Electron IPC (`ipcMain.handle` ↔ `ipcRenderer.invoke`) through a secured `contextBridge` (`window.electronAPI`).
- **Security Guarantees:**
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - Controlled preload surface exposing only explicitly declared methods.

### Preserved Features & Capabilities
1. **Camera Permissions & Preview:** Requests webcam permission via `navigator.mediaDevices.getUserMedia` and renders fixed floating preview.
2. **Automated Proctoring Snapshots:** Takes periodic photo snapshots via `ImageCapture` / array buffers and streams them via IPC to `electron/cameraFeed/`.
3. **Fullscreen / Kiosk Lockdown:** Electron main process handles `full-screen` IPC call by toggling kiosk lockdown (`win.kiosk = true`).
4. **Native Dialog Exam Rules:** `dialog.showMessageBox` prompts candidate with exam code of conduct before test initialization.
5. **Exam Countdown Timer:** Main process manages examination duration timestamp and provides synchronized remaining time via `get-time` IPC.
6. **Questionnaire Shell:** Restored `MainExam` component shell with responsive question card, radio options, and previous/next navigation buttons.

---

## Prerequisites

- **Node.js:** v18.x or later (developed and verified on Node.js `v25.8.2`)
- **npm:** v9.x or later (tested on npm `11.11.1`)
- **Operating System:** macOS, Windows 10/11, or Linux

---

## Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/AmanRajSharma001/Desktop_Application.git
   cd Desktop_Application
   ```

2. **Install exact dependencies:**
   ```bash
   npm install
   ```

3. **Build the React renderer:**
   ```bash
   npm run build
   ```

---

## Running the Application

### Option A: Development Mode (Vite HMR + Electron)
Open two terminal tabs:

**Terminal 1 (Start Vite Dev Server on port 5173):**
```bash
npm run dev
```

**Terminal 2 (Launch Electron Desktop Window):**
```bash
npm start
```

### Option B: Production / Built Mode
If the Vite dev server is not running, Electron automatically falls back to loading the compiled production bundle at `dist/index.html`.
```bash
npm run build
npm start
```

---

## Electron IPC API Reference (`window.electronAPI`)

| Method | IPC Channel | Parameters | Return Type | Description |
| :--- | :--- | :--- | :--- | :--- |
| `setFullScreen()` | `full-screen` | None | `Promise<void>` | Sets the BrowserWindow to kiosk / fullscreen mode. |
| `showExamRules()` | `show-rules` | None | `Promise<number>` | Displays native modal dialog with exam guidelines (returns 0 or 1). |
| `startTest()` | `start-test` | None | `Promise<number>` | Initializes the exam timer on the main process. |
| `getRemainingTime()` | `get-time` | None | `Promise<number>` | Returns remaining exam time in milliseconds. |
| `savePhoto(buffer)` | `save-photo` | `ArrayBuffer` | `Promise<Object>` | Saves proctoring camera snapshot to `electron/cameraFeed/`. |

---

## Verification & Checks Performed

| Check / Test | Command | Result | Notes |
| :--- | :--- | :--- | :--- |
| Dependency Installation | `npm install` | Passed | 210 packages installed from lockfile without conflict. |
| Production Build | `npm run build` | Passed | Built in ~130ms (`dist/index.html`, CSS, and JS chunks). |
| Code Quality / Linting | `npm run lint` | Passed | 0 errors, 0 warnings across all React and Electron files. |
| Electron Main Architecture | `node -c electron/main.cjs` | Passed | Valid syntax, correct IPC handler registration. |
| Preload Bridge Syntax | `node -c electron/preload.cjs` | Passed | Valid syntax, correct context bridge isolation. |

---

## Attribution & Licenses

- Primary Electron implementation, layout, and styling derived from [`onlyaditya/myAthena`](https://github.com/onlyaditya/myAthena) by Aditya Kumar.
- MCQ questionnaire architecture and schema derived from [`JACOBIAN01/athena-exam`](https://github.com/JACOBIAN01/athena-exam).
- All original code, assets, and design structure are preserved with attribution.
