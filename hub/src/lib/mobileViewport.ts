export function mobileViewportState({ layoutHeight, height, top, scale, editable, compact }: {
  layoutHeight: number; height: number; top: number; scale: number; editable: boolean; compact: boolean
}) {
  const keyboard = compact && editable && scale <= 1.05 && layoutHeight - height > 150
  return { keyboard, height: Math.max(1, Math.round(height)), top: Math.max(0, Math.round(top)) }
}
