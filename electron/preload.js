const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  setFullScreen: () => ipcRenderer.invoke("full-screen"),
  exitFullScreen: () => ipcRenderer.invoke("exit-full-screen"),
  getFullscreenStatus: () => ipcRenderer.invoke("get-fullscreen-status"),
  onFullscreenChange: (callback) => {
    if (typeof callback !== "function") return () => {};
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("fullscreen-changed", handler);
    return () => {
      ipcRenderer.removeListener("fullscreen-changed", handler);
    };
  },
  getRemainingTime: () => ipcRenderer.invoke("get-time"),
  startTest: () => ipcRenderer.invoke("start-test"),
  endTest: () => ipcRenderer.invoke("end-test"),
  showExamRules: () => ipcRenderer.invoke("show-rules"),
  showRules: () => ipcRenderer.invoke("show-rules"),
  savePhoto: (arrayBuffer) => ipcRenderer.invoke("save-photo", arrayBuffer),
  screenShare: (options) => ipcRenderer.invoke("screen-share", options),
  saveScreenPhoto: (arrayBuffer) => ipcRenderer.invoke("save-screen-photo", arrayBuffer),
  saveScreenFrame: (arrayBuffer) => ipcRenderer.invoke("save-screen-photo", arrayBuffer),
});
