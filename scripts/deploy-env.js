#!/usr/bin/env node
const fs = require('fs')
const { execSync } = require('child_process')

const envName = process.argv[2]
if (envName !== 'testing' && envName !== 'production') {
  console.error('Usage: node scripts/deploy-env.js <testing|production>')
  process.exit(1)
}

const scenePath = './scene.json'
const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'))
const currentWorld = scene?.worldConfiguration?.name || ''
if (!currentWorld) {
  console.error('scene.json is missing worldConfiguration.name')
  process.exit(1)
}

const envOverrideKey = envName === 'production' ? 'DCL_WORLD_PRODUCTION' : 'DCL_WORLD_TESTING'
const overrideWorld = process.env[envOverrideKey] || ''

let targetWorld = ''
if (overrideWorld) {
  targetWorld = overrideWorld
} else if (envName === 'production') {
  if (currentWorld.endsWith('.zone')) targetWorld = `${currentWorld.slice(0, -5)}.org`
  else if (currentWorld.endsWith('.org')) targetWorld = currentWorld
  else {
    console.error(`Cannot derive production world from "${currentWorld}". Set ${envOverrideKey}.`)
    process.exit(1)
  }
} else {
  if (currentWorld.endsWith('.org')) targetWorld = `${currentWorld.slice(0, -4)}.zone`
  else if (currentWorld.endsWith('.zone')) targetWorld = currentWorld
  else {
    console.error(`Cannot derive testing world from "${currentWorld}". Set ${envOverrideKey}.`)
    process.exit(1)
  }
}

scene.worldConfiguration = scene.worldConfiguration || {}
scene.worldConfiguration.name = targetWorld
fs.writeFileSync(scenePath, JSON.stringify(scene, null, 2) + '\n')
console.log(`Deploy env: ${envName} -> world: ${targetWorld}`)

execSync('npm run deploy -- --skip-build --skip-validations --programmatic', {
  stdio: 'inherit',
  env: process.env
})
