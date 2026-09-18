from pathlib import Path
import json

root = Path("launcher-src/raku-launcher-v0.1.1")

pkg_path = root / "package.json"
pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
pkg["version"] = "0.1.3"
pkg_path.write_text(json.dumps(pkg, indent=2) + "\n", encoding="utf-8")

config_path = root / "electron.vite.config.mjs"
config_path.write_text("""import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: 'src/main/index.js'
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: 'src/preload/index.js',
        output: {
          format: 'cjs',
          entryFileNames: 'index.js'
        }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()]
  }
})
""", encoding="utf-8")

renderer_path = root / "src/renderer/src/main.jsx"
s = renderer_path.read_text(encoding="utf-8")

old = """  useEffect(() => {
    refresh().catch((e) => showToast(e.message, 'error'))
"""
new = """  useEffect(() => {
    if (!window.raku) return undefined
    refresh().catch((e) => showToast(e.message, 'error'))
"""
if old not in s:
    raise SystemExit("preload guard marker not found")
s = s.replace(old, new, 1)

old = """      else if (event.type === 'progress') {
        const task = event.payload?.task || event.payload?.type || 'Download'
        const total = Number(event.payload?.total || 0)
        const current = Number(event.payload?.current || 0)
        const progress = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : null
        setLaunchState((s) => ({ ...s, text: task, progress }))
      }
"""
new = """      else if (event.type === 'progress') {
        const type = String(event.payload?.type || '')
        const done = Number(event.payload?.task ?? event.payload?.current ?? 0)
        const total = Number(event.payload?.total || 0)
        const labels = {
          assets: 'Spieldateien werden geprüft',
          'assets-copy': 'Spieldateien werden kopiert',
          natives: 'Native Bibliotheken werden vorbereitet',
          classes: 'Bibliotheken werden geprüft',
          'classes-custom': 'Mod-Bibliotheken werden geprüft',
          'classes-maven-custom': 'Mod-Bibliotheken werden geladen'
        }
        const label = labels[type] || 'Minecraft wird vorbereitet'
        const progress = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : null
        const detail = total > 0 ? label + ' · ' + done + '/' + total : label
        setLaunchState((s) => ({ ...s, text: detail, progress }))
      }
"""
if old not in s:
    raise SystemExit("progress marker not found")
s = s.replace(old, new, 1)

old = """  async function launch(instance) {
    setLaunchState({ running: false, text: 'Minecraft wird vorbereitet…', progress: null })
    try {
      await window.raku.launch(instance.id)
    } catch (error) {
      showToast(error.message, 'error')
    }
  }
"""
new = """  async function launch(instance) {
    if (launchState.running) return
    setLaunchState({ running: true, text: 'Minecraft wird vorbereitet…', progress: 0 })
    try {
      await window.raku.launch(instance.id)
    } catch (error) {
      setLaunchState({ running: false, text: 'Start fehlgeschlagen', progress: null })
      showToast(error.message, 'error')
    }
  }
"""
if old not in s:
    raise SystemExit("launch handler marker not found")
s = s.replace(old, new, 1)

old = '<button className="play-button" onClick={() => onLaunch(instance)}><span className="play-icon">▶</span><span><strong>SPIELEN</strong><small>{launchState.text}</small></span></button>'
new = '<button className="play-button" disabled={launchState.running} onClick={() => onLaunch(instance)}><span className="play-icon">{launchState.running ? "…" : "▶"}</span><span><strong>{launchState.running ? "STARTET…" : "SPIELEN"}</strong><small>{launchState.text}</small></span></button>'
if old not in s:
    raise SystemExit("play button marker not found")
s = s.replace(old, new, 1)

old = '  if (!state) return <div className="boot"><div className="boot-mark">R</div><span>RAKU Launcher startet</span></div>'
new = '  if (!window.raku) return <div className="boot boot-error"><div className="boot-mark">!</div><strong>Launcher-Fehler</strong><span>Launcher-Bridge konnte nicht geladen werden.</span><small>Fehlercode: PRELOAD_BRIDGE</small></div>\n' + old
if old not in s:
    raise SystemExit("boot marker not found")
s = s.replace(old, new, 1)

renderer_path.write_text(s, encoding="utf-8")

main_path = root / "src/main/index.js"
m = main_path.read_text(encoding="utf-8")
old = """    javaPath: instance.javaPath || state.settings.defaultJavaPath || undefined,
    window: { width: '1280', height: '720', fullscreen: false }
"""
new = """    javaPath: instance.javaPath || state.settings.defaultJavaPath || undefined,
    customArgs: ['--enable-native-access=ALL-UNNAMED'],
    window: { width: '1280', height: '720', fullscreen: false }
"""
if old not in m:
    raise SystemExit("java options marker not found")
m = m.replace(old, new, 1)
main_path.write_text(m, encoding="utf-8")

print("RAKU Launcher v0.1.3 patches applied")
