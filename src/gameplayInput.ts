import { engine, inputSystem, InputAction } from '@dcl/sdk/ecs'
import { ZombieComponent } from './zombie'
import { isPlayerDead } from './playerHealth'
import {
  isTopViewEnabled,
  toggleTopView,
  isIsoViewEnabled,
  toggleIsoView
} from './viewModes'

export { isTopViewEnabled, setTopViewEnabled, isIsoViewEnabled, setIsoViewEnabled } from './viewModes'

let uiPointerCaptureActive = false
let autoFireEnabled = false
let prevSecondaryPressed = false
let prevAction3Pressed = false
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

export function updateTopViewToggle(): void {
  const isPressed = inputSystem.isPressed(InputAction.IA_ACTION_3)
  if (isPressed && !prevAction3Pressed) {
    toggleTopView()
  }
  prevAction3Pressed = isPressed
}

export function updateIsoViewToggle(): void {
  const isPressed = inputSystem.isPressed(InputAction.IA_ACTION_4)
  if (isPressed && !prevAction4Pressed) {
    toggleIsoView()
  }
  prevAction4Pressed = isPressed
}

function hasLiveZombies(): boolean {
  for (const _ of engine.getEntitiesWith(ZombieComponent)) return true
  return false
}

export function isGameplayFireHeld(): boolean {
  syncUiPointerCapture()
  if (isPlayerDead()) return false
  if (uiPointerCaptureActive) return false
  if (autoFireEnabled) {
    if (!hasLiveZombies()) return false
    return true
  }

  return (
    inputSystem.isPressed(InputAction.IA_POINTER) ||
    inputSystem.isPressed(InputAction.IA_PRIMARY)
  )
}
