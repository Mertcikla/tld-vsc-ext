import * as vscode from 'vscode'

export class GitContextService {
  private gitExtension: vscode.Extension<any> | undefined

  constructor() {
    this.gitExtension = vscode.extensions.getExtension('vscode.git')
  }

  async getRepoInfo(): Promise<{ repo: string; branch: string } | null> {
    if (!this.gitExtension) {
      return null
    }

    if (!this.gitExtension.isActive) {
      await this.gitExtension.activate()
    }

    const gitApi = this.gitExtension.exports.getAPI(1)
    if (!gitApi) {
      return null
    }

    const repositories = gitApi.repositories
    if (!repositories || repositories.length === 0) {
      return null
    }

    // Assuming the first repository is the primary one for the workspace
    const repo = repositories[0]
    
    // Get branch
    const branch = repo.state.HEAD?.name
    if (!branch) {
      return null
    }

    // Get remote URL
    const remotes = repo.state.remotes
    if (!remotes || remotes.length === 0) {
      return null
    }

    // Prefer 'origin', otherwise use the first one
    const originRemote = remotes.find((r: any) => r.name === 'origin') || remotes[0]
    const fetchUrl = originRemote.fetchUrl

    if (!fetchUrl) {
      return null
    }

    const normalizedRepo = this.normalizeGitUrl(fetchUrl)
    if (!normalizedRepo) {
      return null
    }

    return { repo: normalizedRepo, branch }
  }

  private normalizeGitUrl(url: string): string | null {
    // Handle https://github.com/owner/repo.git or https://github.com/owner/repo
    const httpsMatch = url.match(/^https?:\/\/[^\/]+\/([^\/]+)\/([^\/]+?)(?:\.git)?$/)
    if (httpsMatch) {
      return `${httpsMatch[1]}/${httpsMatch[2]}`
    }

    // Handle git@github.com:owner/repo.git or git@github.com:owner/repo
    const sshMatch = url.match(/^git@[^:]+:([^\/]+)\/([^\/]+?)(?:\.git)?$/)
    if (sshMatch) {
      return `${sshMatch[1]}/${sshMatch[2]}`
    }

    return null
  }
}
