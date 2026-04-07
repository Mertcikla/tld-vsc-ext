"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRelationshipGraph = buildRelationshipGraph;
exports.symbolRef = symbolRef;
exports.resolveImportPath = resolveImportPath;
exports.isExternalImport = isExternalImport;
exports.posixResolve = posixResolve;
exports.extractImportsWithRegex = extractImportsWithRegex;
var vscode = __importStar(require("vscode"));
var path = __importStar(require("path"));
var logger_1 = require("../logger");
// Roles that cannot be collapsed by the Platonic filter (they have side effects)
var SIDE_EFFECT_ROLES = new Set(['api_entry', 'repository', 'data_exit', 'external']);
/**
 * Builds a symbol-level relationship graph from import dependencies.
 *
 * For each source file: extract its import statements via tree-sitter, resolve
 * each import path to matching files in the symbol index, then create directed
 * edges from every symbol in the importing file to every symbol in the imported
 * file. This captures structural file-level dependencies without relying on
 * call-site name matching (which fails because call sites use method names while
 * the symbol index holds type/class names).
 *
 * Optionally applies the Platonic filter to collapse single-in/single-out
 * pass-through nodes.
 */
function buildRelationshipGraph(symbols, loader, config, token) {
    return __awaiter(this, void 0, void 0, function () {
        var symbolsByRef, symbolsByFile, _i, symbols_1, sym, arr, adjacency, inbound, edgeLabels, edges, edgeSet, _a, adjacency_1, _b, src, dsts, _c, dsts_1, dst, key, label, reachableRefs;
        var _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    symbolsByRef = new Map(symbols.map(function (s) { return [symbolRef(s), s]; }));
                    symbolsByFile = new Map();
                    for (_i = 0, symbols_1 = symbols; _i < symbols_1.length; _i++) {
                        sym = symbols_1[_i];
                        arr = (_d = symbolsByFile.get(sym.filePath)) !== null && _d !== void 0 ? _d : [];
                        arr.push(sym);
                        symbolsByFile.set(sym.filePath, arr);
                    }
                    adjacency = new Map();
                    if (!(config.callHierarchyDepth > 0)) return [3 /*break*/, 2];
                    return [4 /*yield*/, buildEdgesFromImports(symbols, symbolsByFile, adjacency, loader, token)];
                case 1:
                    _e.sent();
                    _e.label = 2;
                case 2:
                    inbound = buildInboundIndex(adjacency);
                    edgeLabels = new Map();
                    if (config.collapseIntermediates) {
                        edgeLabels = applyPlatonicFilter(adjacency, inbound, symbolsByRef);
                    }
                    edges = [];
                    edgeSet = new Set();
                    for (_a = 0, adjacency_1 = adjacency; _a < adjacency_1.length; _a++) {
                        _b = adjacency_1[_a], src = _b[0], dsts = _b[1];
                        for (_c = 0, dsts_1 = dsts; _c < dsts_1.length; _c++) {
                            dst = dsts_1[_c];
                            key = "".concat(src, "::").concat(dst);
                            if (edgeSet.has(key))
                                continue;
                            edgeSet.add(key);
                            label = edgeLabels.get(key);
                            edges.push(__assign({ srcRef: src, dstRef: dst }, (label ? { label: label } : {})));
                        }
                    }
                    reachableRefs = new Set(edges.flatMap(function (e) { return [e.srcRef, e.dstRef]; }));
                    logger_1.logger.info('RelationshipMapper', 'graph built', { edges: edges.length, reachable: reachableRefs.size });
                    return [2 /*return*/, { edges: edges, reachableRefs: reachableRefs }];
            }
        });
    });
}
// ── Symbol ref ────────────────────────────────────────────────────────────────
function symbolRef(sym) {
    return "".concat(sym.filePath, "::").concat(sym.name, "::").concat(sym.startLine);
}
// ── Import-based edge extraction ──────────────────────────────────────────────
/**
 * For each file, extract its imports via tree-sitter, resolve each import path
 * to files present in the symbol index, then add edges from every symbol in the
 * importing file to every symbol in the imported file.
 *
 * Resolution strategy (language-agnostic):
 *   1. Relative paths (start with "." or "/") — resolve against the importing
 *      file's directory, then match with/without extension or as index file.
 *   2. Package/module paths — strip the workspace module prefix if detectable,
 *      then match the remaining path segments as a suffix against known paths.
 *      Fallback: match the last segment as a directory name.
 *
 * Falls back to regex-based import extraction when tree-sitter is unavailable
 * or returns no imports for a file.
 */
function buildEdgesFromImports(symbols, symbolsByFile, adjacency, loader, token) {
    return __awaiter(this, void 0, void 0, function () {
        var wsRoot, allFilePaths, goModPrefix, processedFiles, totalEdges, _i, symbols_2, sym, fileUri, bytes, text, rawImports, srcSymbols, _a, rawImports_1, rawImport, matchedFiles, _b, matchedFiles_1, matchedFile, dstSymbols, _c, srcSymbols_1, srcSym, _d, dstSymbols_1, dstSym, srcRef, dstRef, e_1;
        var _e, _f, _g, _h;
        return __generator(this, function (_j) {
            switch (_j.label) {
                case 0:
                    wsRoot = (_f = (_e = vscode.workspace.workspaceFolders) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.uri;
                    if (!wsRoot)
                        return [2 /*return*/];
                    allFilePaths = __spreadArray([], symbolsByFile.keys(), true);
                    return [4 /*yield*/, detectGoModulePrefix(wsRoot)];
                case 1:
                    goModPrefix = _j.sent();
                    processedFiles = new Set();
                    totalEdges = 0;
                    _i = 0, symbols_2 = symbols;
                    _j.label = 2;
                case 2:
                    if (!(_i < symbols_2.length)) return [3 /*break*/, 8];
                    sym = symbols_2[_i];
                    if (token.isCancellationRequested)
                        return [3 /*break*/, 8];
                    if (processedFiles.has(sym.filePath))
                        return [3 /*break*/, 7];
                    processedFiles.add(sym.filePath);
                    _j.label = 3;
                case 3:
                    _j.trys.push([3, 6, , 7]);
                    fileUri = vscode.Uri.joinPath(wsRoot, sym.filePath);
                    return [4 /*yield*/, vscode.workspace.fs.readFile(fileUri)];
                case 4:
                    bytes = _j.sent();
                    text = Buffer.from(bytes).toString('utf8');
                    return [4 /*yield*/, loader.extractImports(text, sym.vscodeLangId)];
                case 5:
                    rawImports = _j.sent();
                    if (!rawImports.length) {
                        // tree-sitter unavailable or returned nothing — fall back to regex
                        rawImports = extractImportsWithRegex(text, sym.vscodeLangId);
                        if (rawImports.length) {
                            logger_1.logger.debug('RelationshipMapper', 'used regex import fallback', { filePath: sym.filePath });
                        }
                    }
                    if (!rawImports.length)
                        return [3 /*break*/, 7];
                    srcSymbols = (_g = symbolsByFile.get(sym.filePath)) !== null && _g !== void 0 ? _g : [];
                    if (!srcSymbols.length)
                        return [3 /*break*/, 7];
                    for (_a = 0, rawImports_1 = rawImports; _a < rawImports_1.length; _a++) {
                        rawImport = rawImports_1[_a];
                        matchedFiles = resolveImport(rawImport, sym.filePath, allFilePaths, goModPrefix);
                        for (_b = 0, matchedFiles_1 = matchedFiles; _b < matchedFiles_1.length; _b++) {
                            matchedFile = matchedFiles_1[_b];
                            dstSymbols = (_h = symbolsByFile.get(matchedFile)) !== null && _h !== void 0 ? _h : [];
                            for (_c = 0, srcSymbols_1 = srcSymbols; _c < srcSymbols_1.length; _c++) {
                                srcSym = srcSymbols_1[_c];
                                for (_d = 0, dstSymbols_1 = dstSymbols; _d < dstSymbols_1.length; _d++) {
                                    dstSym = dstSymbols_1[_d];
                                    srcRef = symbolRef(srcSym);
                                    dstRef = symbolRef(dstSym);
                                    if (srcRef === dstRef)
                                        continue;
                                    if (!adjacency.has(srcRef))
                                        adjacency.set(srcRef, new Set());
                                    if (!adjacency.get(srcRef).has(dstRef)) {
                                        adjacency.get(srcRef).add(dstRef);
                                        totalEdges++;
                                    }
                                }
                            }
                        }
                    }
                    return [3 /*break*/, 7];
                case 6:
                    e_1 = _j.sent();
                    logger_1.logger.debug('RelationshipMapper', 'import edge extraction failed', {
                        filePath: sym.filePath,
                        error: String(e_1),
                    });
                    return [3 /*break*/, 7];
                case 7:
                    _i++;
                    return [3 /*break*/, 2];
                case 8:
                    logger_1.logger.info('RelationshipMapper', 'import-based edges extracted', {
                        files: processedFiles.size,
                        edges: totalEdges,
                    });
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Resolve a raw import string to matching file paths in the symbol index.
 *
 * @param rawImport   The import path as captured by tree-sitter (may have quotes) or regex (no quotes)
 * @param fromFile    Workspace-relative path of the importing file
 * @param allPaths    All workspace-relative file paths that have symbols
 * @param goModPrefix Optional Go module path prefix to strip
 */
function resolveImport(rawImport, fromFile, allPaths, goModPrefix) {
    // Strip surrounding quotes (Go imports.scm captures the full string literal)
    var importPath = rawImport.replace(/^['"`]|['"`]$/g, '');
    return resolveImportPath(importPath, fromFile, allPaths, goModPrefix);
}
function resolveImportPath(importPath, fromFile, allPaths, goModPrefix) {
    var _a;
    // Skip clearly external imports (stdlib-style or known external prefixes)
    if (isExternalImport(importPath))
        return [];
    var fromDir = fromFile.split('/').slice(0, -1).join('/');
    // ── Relative imports (TypeScript/JavaScript/Python with leading dot) ──────
    if (importPath.startsWith('.')) {
        var resolved_1 = posixResolve(fromDir, importPath);
        return allPaths.filter(function (fp) {
            return fp === resolved_1 ||
                fp.startsWith(resolved_1 + '.') || // ./foo → foo.ts / foo.go
                fp.startsWith(resolved_1 + '/index.');
        });
    }
    // ── Go / absolute module imports ──────────────────────────────────────────
    var importRelPath = importPath;
    // Strip the Go module prefix if we detected one
    if (goModPrefix && importPath.startsWith(goModPrefix)) {
        importRelPath = importPath.slice(goModPrefix.length).replace(/^\//, '');
    }
    // Direct suffix match: importRelPath might be the exact relative dir
    var suffixMatches = allPaths.filter(function (fp) {
        var fpDir = fp.split('/').slice(0, -1).join('/');
        return fpDir === importRelPath ||
            fpDir.startsWith(importRelPath + '/') ||
            fp.startsWith(importRelPath + '/');
    });
    if (suffixMatches.length)
        return suffixMatches;
    // Fallback: match last path segment as directory name
    var lastSegment = (_a = importRelPath.split('/').pop()) !== null && _a !== void 0 ? _a : '';
    if (!lastSegment)
        return [];
    return allPaths.filter(function (fp) {
        var parts = fp.split('/');
        // Must appear as a directory component, not just the filename
        return parts.slice(0, -1).some(function (p) { return p === lastSegment; });
    });
}
/**
 * Returns true for imports that are definitely external / standard-library
 * and will never match a file in the symbol index.
 */
function isExternalImport(importPath) {
    // Go stdlib: single word, no slashes (e.g. "fmt", "os", "context")
    if (!importPath.includes('/') && !importPath.startsWith('.'))
        return true;
    // Common external prefixes
    if (importPath.startsWith('node:') ||
        importPath.startsWith('bun:') ||
        importPath.startsWith('@types/') ||
        importPath.startsWith('std/'))
        return true;
    return false;
}
/**
 * Resolve a POSIX relative path (e.g. "../services/foo") against a base dir.
 * Handles ".." components and normalises the result.
 */
function posixResolve(baseDir, relPath) {
    var parts = baseDir ? baseDir.split('/') : [];
    for (var _i = 0, _a = relPath.split('/'); _i < _a.length; _i++) {
        var seg = _a[_i];
        if (seg === '..')
            parts.pop();
        else if (seg !== '.')
            parts.push(seg);
    }
    return parts.join('/');
}
/**
 * Reads go.mod from the workspace root and extracts the module path.
 * Returns null if go.mod is not found or unreadable.
 */
function detectGoModulePrefix(wsRoot) {
    return __awaiter(this, void 0, void 0, function () {
        var goModUri, bytes, text, match, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    goModUri = vscode.Uri.joinPath(wsRoot, 'go.mod');
                    return [4 /*yield*/, vscode.workspace.fs.readFile(goModUri)];
                case 1:
                    bytes = _b.sent();
                    text = Buffer.from(bytes).toString('utf8');
                    match = text.match(/^module\s+(\S+)/m);
                    return [2 /*return*/, match ? match[1] : null];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// ── Regex-based import extraction (fallback) ──────────────────────────────────
// Go
var GO_IMPORT_BLOCK = /import\s+\(([^)]+)\)/gs;
var GO_IMPORT_QUOTED_IN_BLOCK = /"([^"]+)"/g;
var GO_IMPORT_SINGLE = /^import\s+"([^"]+)"/gm;
// TypeScript / JavaScript
var TS_JS_STATIC = /^import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/gm;
var TS_JS_DYNAMIC = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;
var TS_JS_REQUIRE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;
// Python
var PY_IMPORT = /^import\s+([\w.]+)/gm;
var PY_FROM = /^from\s+([\w.]+)\s+import/gm;
// Rust
var RUST_USE = /^use\s+([\w:]+)/gm;
/**
 * Regex-based import extraction used as fallback when tree-sitter is unavailable.
 * Returns import paths WITHOUT surrounding quotes.
 */
function extractImportsWithRegex(text, vscodeLangId) {
    var paths = [];
    if (vscodeLangId === 'go') {
        // Import blocks: import ( "path1" "path2" )
        GO_IMPORT_BLOCK.lastIndex = 0;
        var block = void 0;
        while ((block = GO_IMPORT_BLOCK.exec(text)) !== null) {
            GO_IMPORT_QUOTED_IN_BLOCK.lastIndex = 0;
            var q = void 0;
            while ((q = GO_IMPORT_QUOTED_IN_BLOCK.exec(block[1])) !== null) {
                paths.push(q[1]);
            }
        }
        // Single imports: import "path"
        GO_IMPORT_SINGLE.lastIndex = 0;
        var single = void 0;
        while ((single = GO_IMPORT_SINGLE.exec(text)) !== null) {
            if (!paths.includes(single[1]))
                paths.push(single[1]);
        }
    }
    else if (vscodeLangId === 'typescript' || vscodeLangId === 'typescriptreact' ||
        vscodeLangId === 'javascript' || vscodeLangId === 'javascriptreact') {
        for (var _i = 0, _a = [TS_JS_STATIC, TS_JS_DYNAMIC, TS_JS_REQUIRE]; _i < _a.length; _i++) {
            var re = _a[_i];
            re.lastIndex = 0;
            var m = void 0;
            while ((m = re.exec(text)) !== null) {
                if (!paths.includes(m[1]))
                    paths.push(m[1]);
            }
        }
    }
    else if (vscodeLangId === 'python') {
        for (var _b = 0, _c = [PY_IMPORT, PY_FROM]; _b < _c.length; _b++) {
            var re = _c[_b];
            re.lastIndex = 0;
            var m = void 0;
            while ((m = re.exec(text)) !== null) {
                if (!paths.includes(m[1]))
                    paths.push(m[1]);
            }
        }
    }
    else if (vscodeLangId === 'rust') {
        RUST_USE.lastIndex = 0;
        var m = void 0;
        while ((m = RUST_USE.exec(text)) !== null) {
            if (!paths.includes(m[1]))
                paths.push(m[1]);
        }
    }
    return paths;
}
// ── Platonic filter ────────────────────────────────────────────────────────────
function applyPlatonicFilter(adjacency, inbound, symbolsByRef) {
    var _a, _b, _c, _d;
    var edgeLabels = new Map();
    var changed = true;
    while (changed) {
        changed = false;
        for (var _i = 0, _e = __spreadArray([], adjacency.entries(), true); _i < _e.length; _i++) {
            var _f = _e[_i], nodeRef = _f[0], dsts = _f[1];
            if (dsts.size !== 1)
                continue;
            var ins = inbound.get(nodeRef);
            if (!ins || ins.size !== 1)
                continue;
            var sym = symbolsByRef.get(nodeRef);
            if (!sym)
                continue;
            if (SIDE_EFFECT_ROLES.has(sym.role))
                continue;
            var callerRef = __spreadArray([], ins, true)[0];
            var calleeRef = __spreadArray([], dsts, true)[0];
            if (callerRef === calleeRef)
                continue;
            (_a = adjacency.get(callerRef)) === null || _a === void 0 ? void 0 : _a.delete(nodeRef);
            (_b = adjacency.get(callerRef)) === null || _b === void 0 ? void 0 : _b.add(calleeRef);
            (_c = inbound.get(calleeRef)) === null || _c === void 0 ? void 0 : _c.delete(nodeRef);
            (_d = inbound.get(calleeRef)) === null || _d === void 0 ? void 0 : _d.add(callerRef);
            adjacency.delete(nodeRef);
            inbound.delete(nodeRef);
            edgeLabels.set("".concat(callerRef, "::").concat(calleeRef), sym.name);
            changed = true;
            break;
        }
    }
    return edgeLabels;
}
// ── Utilities ─────────────────────────────────────────────────────────────────
function buildInboundIndex(adjacency) {
    var inbound = new Map();
    for (var _i = 0, adjacency_2 = adjacency; _i < adjacency_2.length; _i++) {
        var _a = adjacency_2[_i], src = _a[0], dsts = _a[1];
        for (var _b = 0, dsts_2 = dsts; _b < dsts_2.length; _b++) {
            var dst = dsts_2[_b];
            if (!inbound.has(dst))
                inbound.set(dst, new Set());
            inbound.get(dst).add(src);
        }
    }
    return inbound;
}
function findOwningSymbol(symbols, line) {
    if (!(symbols === null || symbols === void 0 ? void 0 : symbols.length))
        return null;
    var best = null;
    for (var _i = 0, symbols_3 = symbols; _i < symbols_3.length; _i++) {
        var sym = symbols_3[_i];
        if (sym.startLine <= line)
            best = sym;
        else
            break;
    }
    return best;
}
// Suppress unused warning — kept for potential future callee-based augmentation
void findOwningSymbol;
void path;
