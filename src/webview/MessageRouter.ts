import { logger } from '../logger'
import type { WebviewToExtensionMessage } from '../../../frontend/src/types/vscode-messages'

type MessageHandler = (msg: WebviewToExtensionMessage) => void | Promise<void>

/**
 * Routes typed messages received from a webview to registered handlers.
 * Each message type may have one registered handler.
 */
export class MessageRouter {
  private handlers = new Map<string, MessageHandler>()

  register(type: WebviewToExtensionMessage['type'], handler: MessageHandler): void {
    logger.trace('MessageRouter', 'Registering handler', { type })
    this.handlers.set(type, handler)
  }

  async dispatch(msg: unknown): Promise<void> {
    if (!msg || typeof msg !== 'object' || !('type' in msg)) {
      logger.warn('MessageRouter', 'Received malformed message (no type field)', { msg })
      return
    }
    const typed = msg as WebviewToExtensionMessage
    const handler = this.handlers.get(typed.type)
    if (handler) {
      logger.debug('MessageRouter', 'Dispatching message', { type: typed.type })
      try {
        await handler(typed)
      } catch (e) {
        logger.error('MessageRouter', 'Handler threw', { type: typed.type, error: String(e) })
      }
    } else {
      logger.debug('MessageRouter', 'No handler registered for message type', { type: typed.type })
    }
  }
}
