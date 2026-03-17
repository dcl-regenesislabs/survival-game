import { Quaternion } from '@dcl/sdk/math'

export function getLocalRotationFromWorld(parentRotation: Quaternion, worldRotation: Quaternion): Quaternion {
  return Quaternion.multiply(
    Quaternion.create(-parentRotation.x, -parentRotation.y, -parentRotation.z, parentRotation.w),
    worldRotation
  )
}
