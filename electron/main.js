const { app, BrowserWindow, ipcMain, desktopCapturer, session, systemPreferences } = require("electron")
const path = require("path")

// Enable system audio capture via getDisplayMedia on macOS 13+
app.commandLine.appendSwitch("enable-features", "MacLoopbackAudioForScreenShare")

const DEV_URL = process.env.ELECTRON_DEV_URL || "http://localhost:3000"
const PROD_URL = process.env.ELECTRON_PROD_URL || DEV_URL

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const url = process.env.NODE_ENV === "development" ? DEV_URL : PROD_URL
  win.loadURL(url)

  // Grant media/screen permissions automatically
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ["media", "screen", "audioCapture", "displayCapture"]
    callback(allowed.includes(permission))
  })

  // Required on macOS: without this, getUserMedia silently returns no audio
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    const allowed = ["media", "screen", "audioCapture", "displayCapture"]
    return allowed.includes(permission)
  })

  // useSystemPicker: true → native macOS picker with "Include computer audio" checkbox.
  // callback({}) passes through whatever the user selected (video + audio).
  // Auto-select the first screen source — no picker needed.
  // audio: "loopback" captures system audio via MacLoopbackAudioForScreenShare flag (macOS 13+).
  win.webContents.session.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ["screen"] }).then((sources) => {
      console.log("[main] auto-selecting screen source:", sources[0]?.id)
      callback({ video: sources[0], audio: "loopback" })
    })
  })
}

ipcMain.handle("get-audio-sources", async () => {
  const sources = await desktopCapturer.getSources({ types: ["screen"], fetchWindowIcons: false })
  return sources.map((s) => ({ id: s.id, name: s.name }))
})

app.whenReady().then(async () => {
  if (process.platform === "darwin") {
    const micStatus = systemPreferences.getMediaAccessStatus("microphone")
    if (micStatus !== "granted") {
      await systemPreferences.askForMediaAccess("microphone")
    }
    // Screen recording permission is required for system audio loopback
    const screenStatus = systemPreferences.getMediaAccessStatus("screen")
    console.log("[main] screen recording permission status:", screenStatus)
  }

  createWindow()
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
