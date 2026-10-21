const { BrowserWindow, app, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

let win = null;
let end_time = null;
let examActive = false;
let autoRecoveryAttempts = 0;
const MAX_AUTO_RECOVERY = 1;
let recoveryTimer = null;

function getFullscreenState() {
  if (!win || win.isDestroyed()) {
    return { isFullScreen: false, isKiosk: false, isActive: false };
  }
  const isFullScreen = typeof win.isFullScreen === "function" ? win.isFullScreen() : false;
  const isKiosk = typeof win.isKiosk === "function" ? win.isKiosk() : false;
  return {
    isFullScreen,
    isKiosk,
    isActive: Boolean(isFullScreen || isKiosk),
  };
}

function broadcastFullscreenState() {
  if (win && !win.isDestroyed() && win.webContents) {
    const state = getFullscreenState();
    win.webContents.send("fullscreen-changed", {
      ...state,
      examActive,
    });
  }
}

function enterFullscreenMode() {
  if (!win || win.isDestroyed()) {
    return { success: false, error: "Window unavailable", isFullScreen: false, isKiosk: false, isActive: false };
  }

  try {
    // Evaluate platform capabilities:
    // On macOS (darwin), setFullScreen(true) manages native fullscreen space,
    // while setKiosk(true) locks out macOS menu bar and dock.
    // On Windows/Linux, setKiosk(true) provides the primary kiosk presentation.
    if (process.platform === "darwin") {
      win.setFullScreen(true);
      win.setKiosk(true);
    } else {
      win.setKiosk(true);
      win.setFullScreen(true);
    }

    const state = getFullscreenState();
    return {
      success: state.isActive,
      ...state,
    };
  } catch (err) {
    console.error("Failed to activate native fullscreen/kiosk:", err);
    return {
      success: false,
      error: err.message,
      isFullScreen: false,
      isKiosk: false,
      isActive: false,
    };
  }
}

function exitFullscreenMode() {
  if (!win || win.isDestroyed()) return;
  try {
    if (typeof win.setKiosk === "function") win.setKiosk(false);
    if (typeof win.setFullScreen === "function") win.setFullScreen(false);
  } catch (err) {
    console.error("Failed to exit native fullscreen/kiosk:", err);
  }
}

function handleFullscreenEnter() {
  autoRecoveryAttempts = 0;
  if (recoveryTimer) {
    clearTimeout(recoveryTimer);
    recoveryTimer = null;
  }
  broadcastFullscreenState();
}

function handleFullscreenExit() {
  const state = getFullscreenState();
  if (!state.isActive) {
    if (examActive) {
      if (autoRecoveryAttempts < MAX_AUTO_RECOVERY) {
        autoRecoveryAttempts++;
        console.log(`Fullscreen exit detected during active exam. Attempting controlled recovery (${autoRecoveryAttempts}/${MAX_AUTO_RECOVERY})...`);
        if (recoveryTimer) clearTimeout(recoveryTimer);
        recoveryTimer = setTimeout(() => {
          if (examActive && win && !win.isDestroyed()) {
            enterFullscreenMode();
            const newState = getFullscreenState();
            if (newState.isActive) {
              console.log("Controlled fullscreen recovery succeeded.");
              autoRecoveryAttempts = 0;
              broadcastFullscreenState();
              return;
            }
            console.warn("Controlled recovery failed. Notifying renderer of blocked state.");
            broadcastFullscreenState();
          }
        }, 300);
      } else {
        console.warn("Max automatic recovery attempts reached. Presenting recovery screen.");
        broadcastFullscreenState();
      }
    } else {
      broadcastFullscreenState();
    }
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1000,
    height: 700,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL("http://localhost:5173/").catch(() => {
    const fallbackPath = path.join(__dirname, "../dist/index.html");
    if (fs.existsSync(fallbackPath)) {
      win.loadFile(fallbackPath);
    }
  });

  // Native fullscreen and kiosk event listeners
  win.on("enter-full-screen", handleFullscreenEnter);
  win.on("leave-full-screen", handleFullscreenExit);
  win.on("enter-html-full-screen", handleFullscreenEnter);
  win.on("leave-html-full-screen", handleFullscreenExit);

  // Keyboard intercept: mitigate accidental Escape exit where supported
  win.webContents.on("before-input-event", (event, input) => {
    if (input.key === "Escape" && examActive) {
      // Prevent default Chromium Escape action to minimize accidental exit
      event.preventDefault();
      const state = getFullscreenState();
      if (!state.isActive) {
        handleFullscreenExit();
      }
    }
  });

  win.webContents.openDevTools({ mode: "detach" });
}

// IPC Handlers
ipcMain.handle("full-screen", () => {
  const res = enterFullscreenMode();
  broadcastFullscreenState();
  return res;
});

ipcMain.handle("exit-full-screen", () => {
  exitFullscreenMode();
  broadcastFullscreenState();
  return getFullscreenState();
});

ipcMain.handle("get-fullscreen-status", () => {
  return getFullscreenState();
});

ipcMain.handle("start-test", () => {
  if (!end_time) {
    // 60 minutes exam timer = 60 * 60 * 1000 ms
    end_time = Date.now() + 60 * 60 * 1000;
  }
  examActive = true;
  autoRecoveryAttempts = 0;
  return end_time;
});

ipcMain.handle("end-test", () => {
  examActive = false;
  end_time = null;
  autoRecoveryAttempts = 0;
  exitFullscreenMode();
  broadcastFullscreenState();
  return { success: true };
});

ipcMain.handle("get-time", () => {
  if (!end_time) return 0;
  return Math.max(0, end_time - Date.now());
});

ipcMain.handle("show-rules", async () => {
  if (!win || win.isDestroyed()) return 0;
  const res = await dialog.showMessageBox(win, {
    type: "info",
    title: "Exam rules",
    message: "Please follow these things:",
    detail: `
    1. Do not open any new tab
    2. You will get 0 marks if you cheat
    `,
    buttons: ["Cancel", "Accept"],
    defaultId: 0,
  });

  return res.response;
});

ipcMain.handle("save-photo", async (_, arrayBuffer) => {
  try {
    if (!arrayBuffer || !(arrayBuffer.byteLength > 0)) {
      return { success: false, error: "Empty or invalid buffer" };
    }

    const feedDir = path.join(__dirname, "cameraFeed");
    if (!fs.existsSync(feedDir)) {
      fs.mkdirSync(feedDir, { recursive: true });
    }

    const filePath = path.join(feedDir, `${Date.now()}.jpeg`);
    const buffer = Buffer.from(arrayBuffer);
    await fs.promises.writeFile(filePath, buffer);
    return { success: true, filePath };
  } catch (err) {
    console.error("Error saving photo snapshot:", err);
    return { success: false, error: err.message };
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
