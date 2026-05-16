import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const manifest = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'),
)

describe('extension manifest local CLI mode', () => {
  it('does not contribute cloud commands or settings', () => {
    const commands = manifest.contributes.commands.map((item: { command: string }) => item.command)
    const properties = manifest.contributes.configuration.properties

    expect(commands).not.toContain('tldiagram.login')
    expect(commands).not.toContain('tldiagram.logout')
    expect(commands).not.toContain('tldiagram.exportToCloud')
    expect(commands).not.toContain('tldiagram.importFromCloud')
    expect(commands).not.toContain('tldiagram.showSyncStatus')
    expect(commands).not.toContain('tldiagram.diffWithCloud')
    expect(properties['tldiagram.cloud.enabled']).toBeUndefined()
    expect(properties['tldiagram.serverUrl']).toBeUndefined()
  })

  it('defaults to local mode only', () => {
    const mode = manifest.contributes.configuration.properties['tldiagram.mode']

    expect(mode.default).toBe('local')
    expect(mode.enum).toEqual(['local'])
  })
})

describe('extension walkthrough', () => {
  it('contributes a getting started walkthrough with required CLI setup', () => {
    const walkthrough = manifest.contributes.walkthroughs.find((item: { id: string }) => item.id === 'tldiagram.getStarted')

    expect(walkthrough).toBeTruthy()
    expect(walkthrough.steps).toHaveLength(6)

    const cliStep = walkthrough.steps.find((step: { id: string }) => step.id === 'tldiagram.installCli')
    expect(cliStep).toBeTruthy()
    expect(cliStep.description).toContain('https://github.com/Mertcikla/tld')
    expect(cliStep.completionEvents).toContain('onCommand:tldiagram.verifyCli')
  })

  it('declares walkthrough helper commands', () => {
    const commands = manifest.contributes.commands.map((item: { command: string }) => item.command)

    expect(commands).toContain('tldiagram.installCli')
    expect(commands).toContain('tldiagram.verifyCli')
    expect(commands).toContain('tldiagram.openDocs')
    expect(commands).toContain('tldiagram.focusDiagramsView')
    expect(commands).toContain('tldiagram.focusElementLibraryView')
    expect(commands).toContain('tldiagram.configureColors')
  })

  it('defaults webview colors to VS Code theme import', () => {
    const properties = manifest.contributes.configuration.properties

    expect(properties['tldiagram.uiColorMode'].default).toBe('vscodeTheme')
    expect(properties['tldiagram.uiColorMode'].enum).toEqual(['vscodeTheme', 'palette'])
    expect(properties['tldiagram.paletteAccent'].default).toBe('#63b3ed')
    expect(properties['tldiagram.paletteCanvas'].default).toBe('#10151f')
    expect(properties['tldiagram.paletteElement'].default).toBe('#1f2937')
  })
})
