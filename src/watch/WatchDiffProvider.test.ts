import { describe, expect, it, vi } from 'vitest'
import type { WatchService } from './WatchService'

vi.mock('vscode', () => ({
  TreeItem: class { constructor(public label: string, public collapsibleState: number) {} },
  EventEmitter: class { event = vi.fn(); fire = vi.fn(); dispose = vi.fn() },
  ThemeIcon: class { constructor(public id: string) {} },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1 },
  workspace: { getConfiguration: () => ({ get: (_: string, fallback: unknown) => fallback }) },
  window: { createOutputChannel: () => ({ appendLine: vi.fn() }) },
}))
import { WatchDiffProvider } from './WatchDiffProvider'

it('makes each changed file open its repository canvas with its exact path', async () => {
  const diffs = [
    { repositoryId: 'repo-A', filePath: 'src/new file.ts', name: 'src/new file.ts', resource_type: 'file', change_type: 'added' },
    { repositoryId: 'repo-A', filePath: 'src/old.ts', name: 'src/old.ts', resource_type: 'file', change_type: 'removed' },
  ]
  const provider = new WatchDiffProvider({ onEvent: () => ({ dispose: vi.fn() }), requestDiff: async () => diffs } as unknown as WatchService)
  await provider.refresh()
  const groups = provider.getChildren()
  expect(groups).toHaveLength(2)
  expect(groups.every((group) => !group.command)).toBe(true)
  for (const [index, group] of groups.entries()) {
    const resources = provider.getChildren(group)
    expect(resources).toHaveLength(1)
    const files = provider.getChildren(resources[0])
    expect(files).toHaveLength(1)
    expect(files[0].command).toEqual({
      command: 'tldiagram.openRepositoryChange', title: 'Open Repository Change',
      arguments: [{ repositoryId: 'repo-A', filePath: diffs[index].filePath }],
    })
  }
})
