export const CLIENT_WINDOW_LAYOUT = Object.freeze({
  defaultWidth: 1200,
  defaultHeight: 800,
  minWidth: 600,
  minHeight: 400,
  toolbarHeight: 45,
  macOSTrafficLightLeft: 17,
  macOSTrafficLightSize: 12
})

export const MACOS_TRAFFIC_LIGHT_POSITION = Object.freeze({
  x: CLIENT_WINDOW_LAYOUT.macOSTrafficLightLeft,
  y: Math.round((CLIENT_WINDOW_LAYOUT.toolbarHeight - CLIENT_WINDOW_LAYOUT.macOSTrafficLightSize) / 2)
})
