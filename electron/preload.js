const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  getAudioSources: () => ipcRenderer.invoke("get-audio-sources"),
})
