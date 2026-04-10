import { inputSystem, InputAction } from '@dcl/sdk/ecs'

let uiPointerCaptureActive = false
let autoFireEnabled = false
let prevSecondaryPressed = false
let topViewEnabled = false
let prevAction3Pressed = false
let isoViewEnabled = false
let prevAction4Pressed = false

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

export function isAutoFireEnabled(): boolean {
  return autoFireEnabled
}

export function setAutoFireEnabled(value: boolean): void {
  autoFireEnabled = value
}

export function updateAutoFireToggle(): void {
  const isPressed = inputSystem.isPressed(InputAction.IA_SECONDARY)
  if (isPressed && !prevSecondaryPressed) {
    autoFireEnabled = !autoFireEnabled
  }
  prevSecondaryPressed = isPressed
}

export function isTopViewEnabled(): boolean {
  return topViewEnabled
}

export function setTopViewEnabled(value: boolean): void {
  topViewEnabled = value
}

export function updateTopViewToggle(): void {
  const isPressed = inputSystem.isPressed(InputAction.IA_ACTION_3)
  if (isPressed && !prevAction3Pressed) {
    topViewEnabled = !topViewEnabled
    if (topViewEnabled) isoViewEnabled = false
  }
  prevAction3Pressed = isPressed
}

export function isIsoViewEnabled(): boolean {
  return isoViewEnabled
}

export function setIsoViewEnabled(value: boolean): void {
  isoViewEnabled = value
  if (value) topViewEnabled = false
}

export function updateIsoViewToggle(): void {
  const isPressed = inputSystem.isPressed(InputAction.IA_ACTION_4)
  if (isPressed && !prevAction4Pressed) {
    isoViewEnabled = !isoViewEnabled
    if (isoViewEnabled) topViewEnabled = false
  }
  prevAction4Pressed = isPressed
}

export function isGameplayFireHeld(): boolean {
  syncUiPointerCapture()
  if (uiPointerCaptureActive) return false
  if (autoFireEnabled) return true

  return (
    inputSystem.isPressed(InputAction.IA_POINTER) ||
    inputSystem.isPressed(InputAction.IA_PRIMARY)
  )
}
