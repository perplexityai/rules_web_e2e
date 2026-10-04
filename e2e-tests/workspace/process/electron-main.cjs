const {app, BrowserWindow} = require('electron')
app.setPath('userData', process.env.OWNED_PROFILE)
app.whenReady().then(async () => {
  const window = new BrowserWindow({width: 640, height: 480, show: true})
  await window.loadURL('data:text/html,<button onclick="this.textContent=\'Saved\'">Save</button>')
})
app.on('window-all-closed', () => app.quit())
