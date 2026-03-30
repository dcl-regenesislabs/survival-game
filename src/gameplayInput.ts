import { inputSystem, InputAction } from '@dcl/sdk/ecs'

let uiPointerCaptureActive = false

function syncUiPointerCapture(): void {
  if (
    uiPointerCaptureActive &&
    !inputSystem.isPressed(InputAction.IA_POINTER) &&
    !inputSystem.isPressed(InputAction.IA_PRIMARY)
  ) {
    uiPointerCaptureActive = false
  }
}

export function beginUiPointerCapture(): void {
  uiPointerCaptureActive = true
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
