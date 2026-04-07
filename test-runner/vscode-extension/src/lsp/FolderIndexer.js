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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.indexFolder = indexFolder;
var vscode = __importStar(require("vscode"));
var logger_1 = require("../logger");
var symbolMapping_1 = require("./symbolMapping");
var BATCH_CONCURRENCY = 5;
/**
 * Indexes top-level symbols in a given folder URI by walking source files
 * and calling the LSP document symbol provider per file.
 *
 * @param folderUri  The folder to index (can be a sub-folder of the workspace)
 * @param token      Cancellation token; checked between file batches
 * @param onProgress Called after each batch with running total
 */
function indexFolder(folderUri, token, onProgress) {
    return __awaiter(this, void 0, void 0, function () {
        var workspaceRoot, config, respectWorkspaceExcludes, extraExcludes, uris, excludedUriSet_1, _i, extraExcludes_1, pattern, toExclude, results, seen, filesProcessed, filesSkipped, i, batch, done;
        var _this = this;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    workspaceRoot = (_b = (_a = vscode.workspace.workspaceFolders) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.uri;
                    logger_1.logger.info('FolderIndexer', 'Starting folder index', { folder: folderUri.fsPath });
                    config = vscode.workspace.getConfiguration('tldiagram');
                    respectWorkspaceExcludes = config.get('respectWorkspaceExcludes', true);
                    extraExcludes = config.get('extraExcludes', []);
                    logger_1.logger.debug('FolderIndexer', 'Exclude settings', { respectWorkspaceExcludes: respectWorkspaceExcludes, extraExcludes: extraExcludes });
                    return [4 /*yield*/, vscode.workspace.findFiles(new vscode.RelativePattern(folderUri, symbolMapping_1.SOURCE_GLOB), respectWorkspaceExcludes ? null : "{".concat(symbolMapping_1.EXCLUDE_GLOB, "}"))];
                case 1:
                    uris = _c.sent();
                    if (!(extraExcludes.length > 0)) return [3 /*break*/, 6];
                    excludedUriSet_1 = new Set();
                    _i = 0, extraExcludes_1 = extraExcludes;
                    _c.label = 2;
                case 2:
                    if (!(_i < extraExcludes_1.length)) return [3 /*break*/, 5];
                    pattern = extraExcludes_1[_i];
                    return [4 /*yield*/, vscode.workspace.findFiles(new vscode.RelativePattern(folderUri, pattern), null)];
                case 3:
                    toExclude = _c.sent();
                    toExclude.forEach(function (u) { return excludedUriSet_1.add(u.toString()); });
                    _c.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5:
                    uris = uris.filter(function (u) { return !excludedUriSet_1.has(u.toString()); });
                    _c.label = 6;
                case 6:
                    logger_1.logger.info('FolderIndexer', 'Files to index', { count: uris.length, folder: folderUri.fsPath });
                    results = [];
                    seen = new Set();
                    filesProcessed = 0;
                    filesSkipped = 0;
                    i = 0;
                    _c.label = 7;
                case 7:
                    if (!(i < uris.length)) return [3 /*break*/, 10];
                    if (token.isCancellationRequested) {
                        logger_1.logger.info('FolderIndexer', 'Indexing cancelled', { processedSoFar: filesProcessed });
                        return [3 /*break*/, 10];
                    }
                    batch = uris.slice(i, i + BATCH_CONCURRENCY);
                    logger_1.logger.trace('FolderIndexer', 'Processing batch', {
                        batchStart: i,
                        batchSize: batch.length,
                        total: uris.length,
                    });
                    return [4 /*yield*/, Promise.all(batch.map(function (uri) { return __awaiter(_this, void 0, void 0, function () {
                            var rawSymbols, e_1, relPath, addedFromFile, _i, rawSymbols_1, sym, dedupeKey;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        if (token.isCancellationRequested)
                                            return [2 /*return*/];
                                        _a.label = 1;
                                    case 1:
                                        _a.trys.push([1, 3, , 4]);
                                        return [4 /*yield*/, vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', uri)];
                                    case 2:
                                        rawSymbols = _a.sent();
                                        return [3 /*break*/, 4];
                                    case 3:
                                        e_1 = _a.sent();
                                        logger_1.logger.trace('FolderIndexer', 'Symbol provider failed for file', {
                                            file: uri.fsPath,
                                            error: String(e_1),
                                        });
                                        filesSkipped++;
                                        return [2 /*return*/];
                                    case 4:
                                        if (!rawSymbols) {
                                            logger_1.logger.trace('FolderIndexer', 'No symbols returned for file', { file: uri.fsPath });
                                            filesSkipped++;
                                            return [2 /*return*/];
                                        }
                                        relPath = workspaceRoot
                                            ? uri.fsPath.startsWith(workspaceRoot.fsPath + '/')
                                                ? uri.fsPath.slice(workspaceRoot.fsPath.length + 1)
                                                : uri.fsPath
                                            : uri.fsPath;
                                        addedFromFile = 0;
                                        for (_i = 0, rawSymbols_1 = rawSymbols; _i < rawSymbols_1.length; _i++) {
                                            sym = rawSymbols_1[_i];
                                            if (!symbolMapping_1.INDEXED_KINDS.has(sym.kind))
                                                continue;
                                            dedupeKey = "".concat(sym.name, "::").concat(relPath);
                                            if (seen.has(dedupeKey))
                                                continue;
                                            seen.add(dedupeKey);
                                            results.push({
                                                name: sym.name,
                                                kind: sym.kind,
                                                filePath: relPath,
                                                startLine: sym.range.start.line,
                                            });
                                            addedFromFile++;
                                        }
                                        filesProcessed++;
                                        logger_1.logger.trace('FolderIndexer', 'File indexed', { file: relPath, symbolsAdded: addedFromFile });
                                        return [2 /*return*/];
                                }
                            });
                        }); }))];
                case 8:
                    _c.sent();
                    done = Math.min(i + BATCH_CONCURRENCY, uris.length);
                    logger_1.logger.debug('FolderIndexer', 'Batch complete', {
                        processed: done,
                        total: uris.length,
                        symbolsSoFar: results.length,
                    });
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(done, uris.length);
                    _c.label = 9;
                case 9:
                    i += BATCH_CONCURRENCY;
                    return [3 /*break*/, 7];
                case 10:
                    logger_1.logger.info('FolderIndexer', 'Indexing complete', {
                        filesProcessed: filesProcessed,
                        filesSkipped: filesSkipped,
                        totalSymbols: results.length,
                        cancelled: token.isCancellationRequested,
                    });
                    return [2 /*return*/, results];
            }
        });
    });
}
