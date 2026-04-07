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
exports.TreeSitterQueryLoader = void 0;
var vscode = __importStar(require("vscode"));
var logger_1 = require("../logger");
// Maps VS Code language IDs to tree-sitter grammar names and language ID aliases
var LANG_MAP = {
    typescript: 'typescript',
    typescriptreact: 'typescript',
    javascript: 'javascript',
    javascriptreact: 'javascript',
    go: 'go',
    python: 'python',
    java: 'java',
    csharp: 'csharp',
    rust: 'rust',
};
// Maps query role names to ArchitecturalRole
var QUERY_ROLE_MAP = {
    api_entry: 'api_entry',
    repository: 'repository',
    service: 'service',
};
// The role query files we ship, in priority order
var ROLE_QUERY_FILES = ['api_entry', 'repository', 'service'];
/**
 * Manages tree-sitter parsers and query execution for role classification.
 *
 * Requires `web-tree-sitter` to be installed as a runtime dependency and wasm
 * grammar files to be present in the extension's `out/grammars/` directory.
 * If either is missing, all query methods return null gracefully — the caller
 * falls back to path/import heuristics without error.
 */
var TreeSitterQueryLoader = /** @class */ (function () {
    function TreeSitterQueryLoader(extensionUri, workspaceRoot) {
        this.extensionUri = extensionUri;
        this.workspaceRoot = workspaceRoot;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.TSParser = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.TSLanguage = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.TSQuery = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.parsers = new Map();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.queryCache = new Map(); // `${langId}:${role}` -> compiled Query
        this.rawQueryCache = new Map(); // `${langId}:${role}` -> raw .scm text
        this.initialized = false;
        this.initFailed = false;
        this.initError = null;
    }
    /**
     * Returns true if tree-sitter is available and wasm grammars are loadable.
     * Lazy-initializes on first call.
     */
    TreeSitterQueryLoader.prototype.isAvailable = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.initialized)
                            return [2 /*return*/, this.TSParser !== null];
                        if (this.initFailed)
                            return [2 /*return*/, false];
                        return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, this.TSParser !== null];
                }
            });
        });
    };
    /** Returns the underlying init error message if tree-sitter failed to load. */
    TreeSitterQueryLoader.prototype.getInitError = function () {
        return this.initError;
    };
    /**
     * Extracts import path strings from file content using AST-accurate queries.
     * Returns empty array if tree-sitter is unavailable or language not supported.
     */
    TreeSitterQueryLoader.prototype.extractImports = function (text, vscodeLangId) {
        return __awaiter(this, void 0, void 0, function () {
            var langId, tree, query, matches, paths, _i, matches_1, match, _a, _b, capture, text_1;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        langId = LANG_MAP[vscodeLangId];
                        if (!langId)
                            return [2 /*return*/, []];
                        return [4 /*yield*/, this.isAvailable()];
                    case 1:
                        if (!(_c.sent()))
                            return [2 /*return*/, []];
                        return [4 /*yield*/, this.parseText(text, langId)];
                    case 2:
                        tree = _c.sent();
                        if (!tree)
                            return [2 /*return*/, []];
                        return [4 /*yield*/, this.getQuery(langId, 'imports')];
                    case 3:
                        query = _c.sent();
                        if (!query)
                            return [2 /*return*/, []];
                        try {
                            matches = query.matches(tree.rootNode);
                            paths = [];
                            for (_i = 0, matches_1 = matches; _i < matches_1.length; _i++) {
                                match = matches_1[_i];
                                for (_a = 0, _b = match.captures; _a < _b.length; _a++) {
                                    capture = _b[_a];
                                    if (capture.name === 'import_path') {
                                        text_1 = capture.node.text;
                                        if (text_1)
                                            paths.push(text_1);
                                    }
                                }
                            }
                            return [2 /*return*/, paths];
                        }
                        catch (e) {
                            logger_1.logger.trace('TreeSitterQueryLoader', 'extractImports query failed', { error: String(e) });
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Runs all role queries for the given file, returning the role whose query
     * has a match within ±5 lines of `symbolLine`. Returns null if no match.
     */
    TreeSitterQueryLoader.prototype.runRoleQueries = function (text, vscodeLangId, symbolLine) {
        return __awaiter(this, void 0, void 0, function () {
            var langId, tree, _i, ROLE_QUERY_FILES_1, role, query, matches, _a, matches_2, match, _b, _c, capture, node, nodeStartLine;
            var _d, _e, _f;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        langId = LANG_MAP[vscodeLangId];
                        if (!langId)
                            return [2 /*return*/, null];
                        return [4 /*yield*/, this.isAvailable()];
                    case 1:
                        if (!(_g.sent()))
                            return [2 /*return*/, null];
                        return [4 /*yield*/, this.parseText(text, langId)];
                    case 2:
                        tree = _g.sent();
                        if (!tree)
                            return [2 /*return*/, null];
                        _i = 0, ROLE_QUERY_FILES_1 = ROLE_QUERY_FILES;
                        _g.label = 3;
                    case 3:
                        if (!(_i < ROLE_QUERY_FILES_1.length)) return [3 /*break*/, 6];
                        role = ROLE_QUERY_FILES_1[_i];
                        return [4 /*yield*/, this.getQuery(langId, role)];
                    case 4:
                        query = _g.sent();
                        if (!query)
                            return [3 /*break*/, 5];
                        try {
                            matches = query.matches(tree.rootNode);
                            for (_a = 0, matches_2 = matches; _a < matches_2.length; _a++) {
                                match = matches_2[_a];
                                for (_b = 0, _c = match.captures; _b < _c.length; _b++) {
                                    capture = _c[_b];
                                    node = capture.node;
                                    nodeStartLine = (_e = (_d = node.startPosition) === null || _d === void 0 ? void 0 : _d.row) !== null && _e !== void 0 ? _e : node.startIndex;
                                    if (Math.abs(nodeStartLine - symbolLine) <= 5) {
                                        return [2 /*return*/, (_f = QUERY_ROLE_MAP[role]) !== null && _f !== void 0 ? _f : null];
                                    }
                                }
                            }
                        }
                        catch (e) {
                            logger_1.logger.trace('TreeSitterQueryLoader', 'runRoleQueries match failed', { role: role, error: String(e) });
                        }
                        _g.label = 5;
                    case 5:
                        _i++;
                        return [3 /*break*/, 3];
                    case 6: return [2 /*return*/, null];
                }
            });
        });
    };
    /**
     * Extracts all callee names and their line numbers from a file using the
     * language's callers.scm query. Returns empty array if tree-sitter is
     * unavailable or the language is not supported.
     *
     * The caller identity is NOT determined here — use findOwningSymbol on the
     * returned line numbers to map each call site back to its enclosing symbol.
     */
    TreeSitterQueryLoader.prototype.extractCalleeLines = function (text, vscodeLangId) {
        return __awaiter(this, void 0, void 0, function () {
            var langId, tree, query, matches, results, _i, matches_3, match, _a, _b, capture, name_1;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        langId = LANG_MAP[vscodeLangId];
                        if (!langId)
                            return [2 /*return*/, []];
                        return [4 /*yield*/, this.isAvailable()];
                    case 1:
                        if (!(_c.sent()))
                            return [2 /*return*/, []];
                        return [4 /*yield*/, this.parseText(text, langId)];
                    case 2:
                        tree = _c.sent();
                        if (!tree)
                            return [2 /*return*/, []];
                        return [4 /*yield*/, this.getQuery(langId, 'callers')];
                    case 3:
                        query = _c.sent();
                        if (!query)
                            return [2 /*return*/, []];
                        try {
                            matches = query.matches(tree.rootNode);
                            results = [];
                            for (_i = 0, matches_3 = matches; _i < matches_3.length; _i++) {
                                match = matches_3[_i];
                                for (_a = 0, _b = match.captures; _a < _b.length; _a++) {
                                    capture = _b[_a];
                                    if (capture.name === 'callee') {
                                        name_1 = capture.node.text;
                                        if (name_1) {
                                            results.push({ callee: name_1, line: capture.node.startPosition.row });
                                        }
                                    }
                                }
                            }
                            return [2 /*return*/, results];
                        }
                        catch (e) {
                            logger_1.logger.trace('TreeSitterQueryLoader', 'extractCalleeLines failed', { error: String(e) });
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    TreeSitterQueryLoader.isSupportedLang = function (vscodeLangId) {
        return TreeSitterQueryLoader.SUPPORTED_LANGS.has(vscodeLangId);
    };
    // ── Private ───────────────────────────────────────────────────────────────
    TreeSitterQueryLoader.prototype.init = function () {
        return __awaiter(this, void 0, void 0, function () {
            var mod, _a, Parser, Language, Query, wasmPath_1, e_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        mod = require('web-tree-sitter');
                        _a = mod, Parser = _a.Parser, Language = _a.Language, Query = _a.Query;
                        wasmPath_1 = vscode.Uri.joinPath(this.extensionUri, 'out', 'grammars', 'web-tree-sitter.wasm').fsPath;
                        return [4 /*yield*/, Parser.init({ locateFile: function () { return wasmPath_1; } })];
                    case 1:
                        _b.sent();
                        this.TSParser = Parser;
                        this.TSLanguage = Language;
                        this.TSQuery = Query;
                        this.initialized = true;
                        logger_1.logger.info('TreeSitterQueryLoader', 'tree-sitter initialized', { wasmPath: wasmPath_1 });
                        return [3 /*break*/, 3];
                    case 2:
                        e_1 = _b.sent();
                        this.initFailed = true;
                        this.initialized = true;
                        this.initError = String(e_1);
                        logger_1.logger.warn('TreeSitterQueryLoader', 'tree-sitter init failed', { reason: String(e_1) });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TreeSitterQueryLoader.prototype.getParser = function (langId) {
        return __awaiter(this, void 0, void 0, function () {
            var lang, parser, e_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.parsers.has(langId))
                            return [2 /*return*/, this.parsers.get(langId)];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.TSLanguage.load(vscode.Uri.joinPath(this.extensionUri, 'out', 'grammars', "tree-sitter-".concat(langId, ".wasm")).fsPath)];
                    case 2:
                        lang = _a.sent();
                        parser = new this.TSParser();
                        parser.setLanguage(lang);
                        this.parsers.set(langId, parser);
                        return [2 /*return*/, parser];
                    case 3:
                        e_2 = _a.sent();
                        logger_1.logger.info('TreeSitterQueryLoader', 'grammar not available', { langId: langId, error: String(e_2) });
                        this.parsers.set(langId, null);
                        return [2 /*return*/, null];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TreeSitterQueryLoader.prototype.parseText = function (text, langId) {
        return __awaiter(this, void 0, void 0, function () {
            var parser;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getParser(langId)];
                    case 1:
                        parser = _a.sent();
                        if (!parser)
                            return [2 /*return*/, null];
                        try {
                            return [2 /*return*/, parser.parse(text)];
                        }
                        catch (e) {
                            logger_1.logger.trace('TreeSitterQueryLoader', 'parse failed', { langId: langId, error: String(e) });
                            return [2 /*return*/, null];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TreeSitterQueryLoader.prototype.getQuery = function (langId, queryName) {
        return __awaiter(this, void 0, void 0, function () {
            var cacheKey, queryText, parser, lang, query, e_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        cacheKey = "".concat(langId, ":").concat(queryName);
                        if (this.queryCache.has(cacheKey))
                            return [2 /*return*/, this.queryCache.get(cacheKey)];
                        return [4 /*yield*/, this.loadQueryText(langId, queryName)];
                    case 1:
                        queryText = _a.sent();
                        if (!queryText) {
                            this.queryCache.set(cacheKey, null);
                            return [2 /*return*/, null];
                        }
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.getParser(langId)];
                    case 3:
                        parser = _a.sent();
                        if (!parser)
                            return [2 /*return*/, null];
                        lang = parser.getLanguage();
                        query = new this.TSQuery(lang, queryText);
                        this.queryCache.set(cacheKey, query);
                        return [2 /*return*/, query];
                    case 4:
                        e_3 = _a.sent();
                        logger_1.logger.info('TreeSitterQueryLoader', 'query compile failed', { langId: langId, queryName: queryName, error: String(e_3) });
                        this.queryCache.set(cacheKey, null);
                        return [2 /*return*/, null];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    TreeSitterQueryLoader.prototype.loadQueryText = function (langId, queryName) {
        return __awaiter(this, void 0, void 0, function () {
            var cacheKey, overridePath, bytes, text, _a, builtinPath, bytes, text, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        cacheKey = "".concat(langId, ":").concat(queryName);
                        if (this.rawQueryCache.has(cacheKey))
                            return [2 /*return*/, this.rawQueryCache.get(cacheKey)
                                // Check workspace override first: .tldiagram/queries/<langId>/<queryName>.scm
                            ];
                        if (!this.workspaceRoot) return [3 /*break*/, 4];
                        overridePath = vscode.Uri.joinPath(this.workspaceRoot, '.tldiagram', 'queries', langId, "".concat(queryName, ".scm"));
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, vscode.workspace.fs.readFile(overridePath)];
                    case 2:
                        bytes = _c.sent();
                        text = Buffer.from(bytes).toString('utf8');
                        this.rawQueryCache.set(cacheKey, text);
                        logger_1.logger.debug('TreeSitterQueryLoader', 'loaded workspace query override', { langId: langId, queryName: queryName });
                        return [2 /*return*/, text];
                    case 3:
                        _a = _c.sent();
                        return [3 /*break*/, 4];
                    case 4:
                        builtinPath = vscode.Uri.joinPath(this.extensionUri, 'out', 'queries', langId, "".concat(queryName, ".scm"));
                        _c.label = 5;
                    case 5:
                        _c.trys.push([5, 7, , 8]);
                        return [4 /*yield*/, vscode.workspace.fs.readFile(builtinPath)];
                    case 6:
                        bytes = _c.sent();
                        text = Buffer.from(bytes).toString('utf8');
                        this.rawQueryCache.set(cacheKey, text);
                        return [2 /*return*/, text];
                    case 7:
                        _b = _c.sent();
                        this.rawQueryCache.set(cacheKey, null);
                        return [2 /*return*/, null];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    TreeSitterQueryLoader.SUPPORTED_LANGS = new Set(Object.keys(LANG_MAP));
    return TreeSitterQueryLoader;
}());
exports.TreeSitterQueryLoader = TreeSitterQueryLoader;
