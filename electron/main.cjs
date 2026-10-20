const { BrowserWindow, app, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

let win = null;

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

  win.webContents.openDevTools({ mode: "detach" });
}

ipcMain.handle("full-screen", () => {
  if (win) {
    win.kiosk = true;
  }
});

let end_time = null;

ipcMain.handle("start-test", () => {
  // 60 minutes exam timer = 60 * 60 * 1000 ms
  end_time = Date.now() + 60 * 60 * 1000;
  return end_time;
});

ipcMain.handle("get-time", () => {
  if (!end_time) return 0;
  return Math.max(0, end_time - Date.now());
});

ipcMain.handle("show-rules", async () => {
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

ipcMain.handle("save-photo", (_, arrayBuffer) => {
  const feedDir = path.join(__dirname, "cameraFeed");
  if (!fs.existsSync(feedDir)) {
    fs.mkdirSync(feedDir, { recursive: true });
  }

  const filePath = path.join(feedDir, `${Date.now()}.jpeg`);
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(filePath, buffer);
  return { success: true, filePath };
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
