import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const manifest = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'),
)

describe('extension manifest cloud feature flag', () => {
  it('defaults cloud features off', () => {
    expect(manifest.contributes.configuration.properties['tldiagram.cloud.enabled'].default).toBe(false)
  })

  it('hides cloud commands from the command palette unless enabled', () => {
    const cloudCommands = [
      'tldiagram.login',
      'tldiagram.logout',
      'tldiagram.exportToCloud',
      'tldiagram.importFromCloud',
      'tldiagram.showSyncStatus',
      'tldiagram.diffWithCloud',
    ]
    const palette = manifest.contributes.menus.commandPalette

    for (const command of cloudCommands) {
      expect(palette).toContainEqual({ command, when: 'tldiagram.cloudEnabled' })
    }
  })
})
