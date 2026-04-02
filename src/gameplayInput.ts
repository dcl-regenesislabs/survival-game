import { inputSystem, InputAction } from '@dcl/sdk/ecs'

let uiPointerCaptureActive = false
let uiPointerCaptureStartedAtMs = 0
const UI_POINTER_CAPTURE_MAX_MS = 500

function syncUiPointerCapture(): void {
  if (!uiPointerCaptureActive) return

  // Release if no button is held anymore
  if (
    !inputSystem.isPressed(InputAction.IA_POINTER) &&
    !inputSystem.isPressed(InputAction.IA_PRIMARY)
  ) {
    uiPointerCaptureActive = false
    return
  }

  // Safety: force-release after max duration so a missed onMouseUp never blocks firing permanently
  if (Date.now() - uiPointerCaptureStartedAtMs > UI_POINTER_CAPTURE_MAX_MS) {
    uiPointerCaptureActive = false
  }
}

export function beginUiPointerCapture(): void {
  uiPointerCaptureActive = true
  uiPointerCaptureStartedAtMs = Date.now()
}

export function endUiPointerCapture(): void {
  uiPointerCaptureActive = false
}

export function isGameplayFireHeld(): boolean {
  syncUiPointerCapture()
  if (uiPointerCaptureActive) return false

  return (
    inputSystem.isPressed(InputAction.IA_POINTER) ||
    inputSystem.isPressed(InputAction.IA_PRIMARY)
  )
}
