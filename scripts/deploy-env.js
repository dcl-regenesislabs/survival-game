#!/usr/bin/env node
const { execSync } = require('child_process')

const envName = process.argv[2]
if (envName !== 'testing' && envName !== 'production') {
  console.error('Usage: node scripts/deploy-env.js <testing|production>')
  process.exit(1)
}

const defaultTarget =
  envName === 'production'
    ? 'https://worlds-content-server.decentraland.org'
    : 'https://worlds-content-server.decentraland.zone'

const envKey = envName === 'production' ? 'DCL_TARGET_CONTENT_PRODUCTION' : 'DCL_TARGET_CONTENT_TESTING'
const targetContent = process.env[envKey] || defaultTarget

console.log(`Deploy env: ${envName} -> target-content: ${targetContent}`)

execSync(`npm run deploy -- --skip-build --skip-validations --programmatic --target-content ${targetContent}`, {
  stdio: 'inherit',
  env: process.env
})
