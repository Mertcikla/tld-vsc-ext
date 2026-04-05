import * as vscode from 'vscode'

const SECRET_KEY = 'tldiagram.apiKey'

export interface ValidatedUser {
  username: string
  orgName: string
  orgId: string
}

export class AuthManager {
  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly serverUrl: string,
  ) {}

  async getKey(): Promise<string | undefined> {
    return this.secrets.get(SECRET_KEY)
  }

  async storeKey(apiKey: string): Promise<void> {
    await this.secrets.store(SECRET_KEY, apiKey)
  }

  async clearKey(): Promise<void> {
    await this.secrets.delete(SECRET_KEY)
  }

  /**
   * Validates the key by calling the me() endpoint. Returns the user info on
   * success or throws on failure.
   */
  async validateKey(apiKey: string, client: { getMe: () => Promise<ValidatedUser> }): Promise<ValidatedUser> {
    return client.getMe()
  }
}
