/**
 * Minimal VS Code API mock for unit and integration tests.
 * Reads files from the real filesystem so integration tests work against live repos.
 */
import * as fs from 'node:fs'
import * as nodePath from 'node:path'

export class Uri {
  readonly scheme: string
  readonly fsPath: string
  readonly path: string

  private constructor(scheme: string, fsPath: string) {
    this.scheme = scheme
    this.fsPath = fsPath
    this.path = fsPath
  }

  static file(path: string): Uri {
    return new Uri('file', path)
  }

  static joinPath(base: Uri, ...parts: string[]): Uri {
    const joined = nodePath.join(base.fsPath, ...parts)
    return new Uri(base.scheme, joined)
  }

  toString(): string {
    return `${this.scheme}://${this.fsPath}`
  }
}

export const workspace = {
  workspaceFolders: undefined as Array<{ uri: Uri }> | undefined,

  fs: {
    async readFile(uri: Uri): Promise<Uint8Array> {
      return fs.readFileSync(uri.fsPath)
    },
  },

  getConfiguration(_section?: string) {
    return {
      get<T>(_key: string, defaultValue?: T): T | undefined {
        return defaultValue
      },
    }
  },
}

export const CancellationToken = {
  None: { isCancellationRequested: false },
}

export enum SymbolKind {
  File = 0,
  Module = 1,
  Namespace = 2,
  Package = 3,
  Class = 4,
  Method = 5,
  Property = 6,
  Field = 7,
  Constructor = 8,
  Enum = 9,
  Interface = 10,
  Function = 11,
  Variable = 12,
  Constant = 13,
  String = 14,
  Number = 15,
  Boolean = 16,
  Array = 17,
  Object = 18,
  Key = 19,
  Null = 20,
  EnumMember = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25,
}
