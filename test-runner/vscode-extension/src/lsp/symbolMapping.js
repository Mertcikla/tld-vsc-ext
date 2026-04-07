"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXCLUDE_GLOB = exports.SOURCE_GLOB = exports.INDEXED_KINDS = void 0;
exports.kindToObjectType = kindToObjectType;
var vscode = __importStar(require("vscode"));
/** Symbol kinds we index as top-level diagram nodes. */
exports.INDEXED_KINDS = new Set([
    vscode.SymbolKind.Function,
    vscode.SymbolKind.Class,
    vscode.SymbolKind.Interface,
    vscode.SymbolKind.Module,
    vscode.SymbolKind.Struct,
    vscode.SymbolKind.Enum,
]);
/** Maps VS Code SymbolKind to the tlDiagram object type string. */
function kindToObjectType(kind) {
    switch (kind) {
        case vscode.SymbolKind.Class:
        case vscode.SymbolKind.Struct:
            return 'component';
        case vscode.SymbolKind.Interface:
            return 'api';
        case vscode.SymbolKind.Module:
            return 'container';
        case vscode.SymbolKind.Enum:
            return 'component';
        default:
            return 'component';
    }
}
/** Glob patterns for source files we scan for symbols. */
exports.SOURCE_GLOB = '**/*.{ts,tsx,js,jsx,go,py,rs,java,kt,swift,cpp,cc,cxx,c,h,cs}';
/** Glob patterns to exclude. */
exports.EXCLUDE_GLOB = '**/node_modules/**,**/dist/**,**/build/**,**/out/**,**/.git/**';
