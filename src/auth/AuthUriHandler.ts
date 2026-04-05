import * as vscode from 'vscode'
import { logger } from '../logger'

export class AuthUriHandler implements vscode.UriHandler {
  private _onDidAuthenticate = new vscode.EventEmitter<{ token: string; state: string }>()
  public readonly onDidAuthenticate = this._onDidAuthenticate.event

  public handleUri(uri: vscode.Uri) {
    logger.debug('extension', `Received URI: ${uri.toString()}`)
    if (uri.path === '/auth') {
      const query = new URLSearchParams(uri.query)
      const token = query.get('token')
      const state = query.get('state')

      if (token && state) {
        this._onDidAuthenticate.fire({ token, state })
      } else {
        logger.error('extension', 'Received /auth URI without token or state')
        vscode.window.showErrorMessage('Authentication failed: Missing token or state in the redirect URI.')
      }
    }
  }
}
