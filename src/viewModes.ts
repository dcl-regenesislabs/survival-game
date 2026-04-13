let topViewEnabled = false
let isoViewEnabled = false

export function isTopViewEnabled(): boolean {
  return topViewEnabled
}

export function setTopViewEnabled(value: boolean): void {
  topViewEnabled = value
  if (value) isoViewEnabled = false
}

export function toggleTopView(): void {
  setTopViewEnabled(!topViewEnabled)
}

export function isIsoViewEnabled(): boolean {
  return isoViewEnabled
}

export function setIsoViewEnabled(value: boolean): void {
  isoViewEnabled = value
  if (value) topViewEnabled = false
}

export function toggleIsoView(): void {
  setIsoViewEnabled(!isoViewEnabled)
}
