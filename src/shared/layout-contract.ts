export const CLIENT_WINDOW_LAYOUT = Object.freeze({
  defaultWidth: 1280,
  defaultHeight: 820,
  minWidth: 960,
  minHeight: 640,
  toolbarHeight: 40,
  macOSTrafficLightLeft: 18,
  macOSTrafficLightSize: 14
})

export const MACOS_TRAFFIC_LIGHT_POSITION = Object.freeze({
  x: CLIENT_WINDOW_LAYOUT.macOSTrafficLightLeft,
  y: Math.round((CLIENT_WINDOW_LAYOUT.toolbarHeight - CLIENT_WINDOW_LAYOUT.macOSTrafficLightSize) / 2)
})
