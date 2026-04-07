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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_IMPORT_ROLE_MAP = exports.RoleClassifier = void 0;
var vscode = __importStar(require("vscode"));
var logger_1 = require("../logger");
// Default path-segment heuristics. Applied only when tree-sitter and import
// fingerprint produce no result. First match wins.
var DEFAULT_PATH_RULES = [
    {
        segments: ['handler', 'controller', 'router', 'route', 'endpoint', 'api', 'rest', 'grpc', 'rpc', 'http', 'server', 'web'],
        role: 'api_entry',
    },
    {
        segments: ['service', 'svc', 'usecase', 'use_case', 'usecases', 'domain', 'application'],
        role: 'service',
    },
    {
        segments: ['repository', 'repositories', 'repo', 'store', 'storage', 'dao', 'db', 'database', 'data', 'persistence'],
        role: 'repository',
    },
    {
        segments: ['migration', 'migrations', 'seed', 'seeds', 'schema', 'schemas', 'query', 'queries'],
        role: 'data_exit',
    },
    {
        segments: ['model', 'models', 'entity', 'entities', 'dto', 'dtos', 'types', 'type', 'struct', 'structs', 'proto'],
        role: 'model',
    },
    {
        segments: ['util', 'utils', 'helper', 'helpers', 'lib', 'common', 'shared', 'pkg', 'tools', 'support'],
        role: 'utility',
    },
    {
        segments: ['middleware', 'middlewares', 'interceptor', 'interceptors', 'filter', 'filters', 'guard', 'guards'],
        role: 'service',
    },
];
/**
 * Classifies IndexedSymbols into ArchitecturalRoles using (in priority order):
 *   1. User custom rules
 *   2. Tree-sitter structural queries (if available)
 *   3. Import fingerprint (which external libs does this file use?)
 *   4. Path segment heuristics
 *   5. SymbolKind fallback
 */
var RoleClassifier = /** @class */ (function () {
    function RoleClassifier(loader, customRules, importFingerprint, disablePathHeuristics) {
        if (disablePathHeuristics === void 0) { disablePathHeuristics = false; }
        this.loader = loader;
        this.customRules = customRules;
        this.disablePathHeuristics = disablePathHeuristics;
        this.importFingerprint = importFingerprint;
    }
    RoleClassifier.prototype.classifyAll = function (symbols, token) {
        return __awaiter(this, void 0, void 0, function () {
            var fileCache, results, _i, symbols_1, sym, langId_1, text_1, _a, text, langId, role;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        fileCache = new Map();
                        results = [];
                        _i = 0, symbols_1 = symbols;
                        _b.label = 1;
                    case 1:
                        if (!(_i < symbols_1.length)) return [3 /*break*/, 6];
                        sym = symbols_1[_i];
                        if (token.isCancellationRequested)
                            return [3 /*break*/, 6];
                        if (!!fileCache.has(sym.filePath)) return [3 /*break*/, 3];
                        langId_1 = langIdFromPath(sym.filePath);
                        return [4 /*yield*/, readFileText(sym.filePath)];
                    case 2:
                        text_1 = _b.sent();
                        fileCache.set(sym.filePath, { text: text_1 !== null && text_1 !== void 0 ? text_1 : '', langId: langId_1 });
                        _b.label = 3;
                    case 3:
                        _a = fileCache.get(sym.filePath), text = _a.text, langId = _a.langId;
                        return [4 /*yield*/, this.classify(sym, text, langId)];
                    case 4:
                        role = _b.sent();
                        results.push(__assign(__assign({}, sym), { role: role, vscodeLangId: langId }));
                        _b.label = 5;
                    case 5:
                        _i++;
                        return [3 /*break*/, 1];
                    case 6: return [2 /*return*/, results];
                }
            });
        });
    };
    RoleClassifier.prototype.classify = function (sym, fileText, langId) {
        return __awaiter(this, void 0, void 0, function () {
            var pathLower, _i, _a, rule, tsRole, fpRole, dirSegments, _loop_1, _b, DEFAULT_PATH_RULES_1, rule, state_1;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        pathLower = sym.filePath.toLowerCase();
                        // 1. Custom rules
                        for (_i = 0, _a = this.customRules; _i < _a.length; _i++) {
                            rule = _a[_i];
                            try {
                                if (new RegExp(rule.pattern, 'i').test(pathLower)) {
                                    logger_1.logger.trace('RoleClassifier', 'custom rule match', { name: sym.name, role: rule.role });
                                    return [2 /*return*/, rule.role];
                                }
                            }
                            catch (_d) {
                                // Invalid regex — skip
                            }
                        }
                        if (!fileText) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.loader.runRoleQueries(fileText, langId, sym.startLine)];
                    case 1:
                        tsRole = _c.sent();
                        if (tsRole) {
                            logger_1.logger.trace('RoleClassifier', 'tree-sitter match', { name: sym.name, role: tsRole });
                            return [2 /*return*/, tsRole];
                        }
                        _c.label = 2;
                    case 2:
                        fpRole = this.importFingerprint.get(sym.filePath);
                        if (fpRole) {
                            logger_1.logger.trace('RoleClassifier', 'import fingerprint match', { name: sym.name, role: fpRole });
                            return [2 /*return*/, fpRole];
                        }
                        // 4. Path segment heuristics (last resort for when tree-sitter is unavailable)
                        if (!this.disablePathHeuristics) {
                            dirSegments = pathLower.split(/[/\\]/);
                            _loop_1 = function (rule) {
                                if (dirSegments.some(function (seg) { return rule.segments.some(function (s) { return seg.includes(s); }); })) {
                                    logger_1.logger.trace('RoleClassifier', 'path heuristic match', { name: sym.name, role: rule.role });
                                    return { value: rule.role };
                                }
                            };
                            for (_b = 0, DEFAULT_PATH_RULES_1 = DEFAULT_PATH_RULES; _b < DEFAULT_PATH_RULES_1.length; _b++) {
                                rule = DEFAULT_PATH_RULES_1[_b];
                                state_1 = _loop_1(rule);
                                if (typeof state_1 === "object")
                                    return [2 /*return*/, state_1.value];
                            }
                        }
                        // 5. SymbolKind fallback
                        if (sym.kind === vscode.SymbolKind.Interface || sym.kind === vscode.SymbolKind.Enum) {
                            return [2 /*return*/, 'model'];
                        }
                        return [2 /*return*/, 'unknown'];
                }
            });
        });
    };
    /**
     * Builds an import fingerprint: for each file, determines a role based on
     * which external libraries it imports. The caller provides an `importRoleMap`
     * (user-configurable key-value store matching import path substrings → role).
     */
    RoleClassifier.buildImportFingerprint = function (externalLibraries, importRoleMap) {
        var fingerprint = new Map();
        for (var _i = 0, externalLibraries_1 = externalLibraries; _i < externalLibraries_1.length; _i++) {
            var _a = externalLibraries_1[_i], libName = _a[0], library = _a[1];
            var role = matchImportRole(libName, importRoleMap);
            if (!role)
                continue;
            for (var _b = 0, _c = library.importedBy; _b < _c.length; _b++) {
                var filePath = _c[_b];
                // Prefer higher-priority role (api_entry > repository > service > data_exit)
                var existing = fingerprint.get(filePath);
                if (!existing || rolePriority(role) > rolePriority(existing)) {
                    fingerprint.set(filePath, role);
                }
            }
        }
        return fingerprint;
    };
    return RoleClassifier;
}());
exports.RoleClassifier = RoleClassifier;
// ── Helpers ──────────────────────────────────────────────────────────────────
function matchImportRole(libName, importRoleMap) {
    var lower = libName.toLowerCase();
    for (var _i = 0, _a = Object.entries(importRoleMap); _i < _a.length; _i++) {
        var _b = _a[_i], pattern = _b[0], role = _b[1];
        if (lower.includes(pattern.toLowerCase()))
            return role;
    }
    return null;
}
function rolePriority(role) {
    var _a;
    var p = {
        api_entry: 6,
        data_exit: 5,
        repository: 4,
        service: 3,
        model: 2,
        utility: 1,
        external: 0,
        unknown: -1,
    };
    return (_a = p[role]) !== null && _a !== void 0 ? _a : -1;
}
function langIdFromPath(filePath) {
    var _a, _b, _c;
    var ext = (_b = (_a = filePath.split('.').pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase()) !== null && _b !== void 0 ? _b : '';
    var map = {
        ts: 'typescript',
        tsx: 'typescript',
        js: 'javascript',
        jsx: 'javascript',
        mjs: 'javascript',
        go: 'go',
        py: 'python',
        rs: 'rust',
        java: 'java',
        cs: 'csharp',
        kt: 'kotlin',
        swift: 'swift',
        cpp: 'cpp',
        cc: 'cpp',
        c: 'c',
        h: 'c',
    };
    return (_c = map[ext]) !== null && _c !== void 0 ? _c : 'plaintext';
}
function readFileText(relPath) {
    return __awaiter(this, void 0, void 0, function () {
        var wsFolders, absUri, bytes, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    wsFolders = vscode.workspace.workspaceFolders;
                    if (!(wsFolders === null || wsFolders === void 0 ? void 0 : wsFolders.length))
                        return [2 /*return*/, null];
                    absUri = vscode.Uri.joinPath(wsFolders[0].uri, relPath);
                    return [4 /*yield*/, vscode.workspace.fs.readFile(absUri)];
                case 1:
                    bytes = _b.sent();
                    return [2 /*return*/, Buffer.from(bytes).toString('utf8')];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Default `importRoleMap` shipped with the extension.
 * This is a starting point — users can replace it entirely via settings.
 * Keys are case-insensitive substrings matched against import paths.
 */
exports.DEFAULT_IMPORT_ROLE_MAP = {
    // Data layer
    'sql': 'repository',
    'postgres': 'repository',
    'mysql': 'repository',
    'sqlite': 'repository',
    'mongodb': 'repository',
    'redis': 'repository',
    'prisma': 'repository',
    'typeorm': 'repository',
    'sequelize': 'repository',
    'mongoose': 'repository',
    'knex': 'repository',
    'drizzle': 'repository',
    'gorm': 'repository',
    'pgx': 'repository',
    'sqlx': 'repository',
    'diesel': 'repository',
    'sqlalchemy': 'repository',
    'pymongo': 'repository',
    'dynamodb': 'repository',
    'cassandra': 'repository',
    'elasticsearch': 'repository',
    'neo4j': 'repository',
    // HTTP / API layer
    'express': 'api_entry',
    'fastify': 'api_entry',
    'koa': 'api_entry',
    'hapi': 'api_entry',
    'restify': 'api_entry',
    'gin': 'api_entry',
    'echo': 'api_entry',
    'fiber': 'api_entry',
    'chi': 'api_entry',
    'mux': 'api_entry',
    'flask': 'api_entry',
    'fastapi': 'api_entry',
    'django': 'api_entry',
    'tornado': 'api_entry',
    'axum': 'api_entry',
    'actix': 'api_entry',
    'rocket': 'api_entry',
    'warp': 'api_entry',
    'spring': 'api_entry',
    'jersey': 'api_entry',
    'grpc': 'api_entry',
    'connectrpc': 'api_entry',
    'connect-go': 'api_entry',
    'twirp': 'api_entry',
};
