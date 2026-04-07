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
exports.extractLibraryName = extractLibraryName;
exports.detectGoModulePath = detectGoModulePath;
exports.collectExternalLibraries = collectExternalLibraries;
var vscode = __importStar(require("vscode"));
var logger_1 = require("../logger");
function detectLanguage(filePath) {
    var _a, _b;
    var ext = (_b = (_a = filePath.split('.').pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase()) !== null && _b !== void 0 ? _b : '';
    if (ext === 'ts' || ext === 'tsx')
        return 'ts';
    if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs')
        return 'js';
    if (ext === 'go')
        return 'go';
    if (ext === 'py')
        return 'python';
    if (ext === 'rs')
        return 'rust';
    return 'unknown';
}
// TS/JS regexes
var TS_JS_STATIC = /^import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/gm;
var TS_JS_DYNAMIC = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;
var TS_JS_REQUIRE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;
// Go regexes
var GO_IMPORT_BLOCK = /import\s+\(([^)]+)\)/gs;
var GO_IMPORT_QUOTED_IN_BLOCK = /"([^"]+)"/g;
var GO_IMPORT_SINGLE = /^import\s+"([^"]+)"/gm;
// Python regexes
var PY_IMPORT = /^import\s+([\w.]+)/gm;
var PY_FROM = /^from\s+([\w.]+)\s+import/gm;
// Rust regex
var RUST_USE = /^use\s+([\w:]+)/gm;
function extractLibraryName(specifier, lang, goModulePath) {
    if (specifier.startsWith('.') || specifier.startsWith('/'))
        return null;
    if (lang === 'ts' || lang === 'js') {
        if (specifier.startsWith('@')) {
            // Scoped: @scope/pkg/subpath -> @scope/pkg
            var parts = specifier.split('/');
            return parts.slice(0, 2).join('/');
        }
        // lodash/fp -> lodash
        return specifier.split('/')[0];
    }
    if (lang === 'go') {
        if (goModulePath && specifier.startsWith(goModulePath))
            return null; // internal
        if (!specifier.includes('.'))
            return specifier; // stdlib: fmt, encoding/json
        // External: github.com/org/repo(/subpkg) -> github.com/org/repo
        return specifier.split('/').slice(0, 3).join('/');
    }
    if (lang === 'python') {
        if (specifier.startsWith('.'))
            return null; // relative
        return specifier.split('.')[0];
    }
    if (lang === 'rust') {
        if (specifier.startsWith('crate::') ||
            specifier.startsWith('self::') ||
            specifier.startsWith('super::') ||
            specifier.startsWith('std::'))
            return null;
        return specifier.split('::')[0];
    }
    return null;
}
function parseImportsFromFile(uri, relPath, goModulePath) {
    return __awaiter(this, void 0, void 0, function () {
        var lang, content, _a, _b, _c, specifiers, _i, _d, re, m, block, q, single, _e, _f, re, m, m, libraries, _g, specifiers_1, specifier, name_1;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    lang = detectLanguage(relPath);
                    if (lang === 'unknown')
                        return [2 /*return*/, []];
                    _h.label = 1;
                case 1:
                    _h.trys.push([1, 3, , 4]);
                    _b = (_a = Buffer).from;
                    return [4 /*yield*/, vscode.workspace.fs.readFile(uri)];
                case 2:
                    content = _b.apply(_a, [_h.sent()]).toString('utf8');
                    return [3 /*break*/, 4];
                case 3:
                    _c = _h.sent();
                    return [2 /*return*/, []];
                case 4:
                    specifiers = new Set();
                    if (lang === 'ts' || lang === 'js') {
                        for (_i = 0, _d = [TS_JS_STATIC, TS_JS_DYNAMIC, TS_JS_REQUIRE]; _i < _d.length; _i++) {
                            re = _d[_i];
                            re.lastIndex = 0;
                            m = void 0;
                            while ((m = re.exec(content)) !== null)
                                specifiers.add(m[1]);
                        }
                    }
                    else if (lang === 'go') {
                        GO_IMPORT_BLOCK.lastIndex = 0;
                        block = void 0;
                        while ((block = GO_IMPORT_BLOCK.exec(content)) !== null) {
                            GO_IMPORT_QUOTED_IN_BLOCK.lastIndex = 0;
                            q = void 0;
                            while ((q = GO_IMPORT_QUOTED_IN_BLOCK.exec(block[1])) !== null)
                                specifiers.add(q[1]);
                        }
                        GO_IMPORT_SINGLE.lastIndex = 0;
                        single = void 0;
                        while ((single = GO_IMPORT_SINGLE.exec(content)) !== null)
                            specifiers.add(single[1]);
                    }
                    else if (lang === 'python') {
                        for (_e = 0, _f = [PY_IMPORT, PY_FROM]; _e < _f.length; _e++) {
                            re = _f[_e];
                            re.lastIndex = 0;
                            m = void 0;
                            while ((m = re.exec(content)) !== null)
                                specifiers.add(m[1]);
                        }
                    }
                    else if (lang === 'rust') {
                        RUST_USE.lastIndex = 0;
                        m = void 0;
                        while ((m = RUST_USE.exec(content)) !== null)
                            specifiers.add(m[1]);
                    }
                    libraries = [];
                    for (_g = 0, specifiers_1 = specifiers; _g < specifiers_1.length; _g++) {
                        specifier = specifiers_1[_g];
                        name_1 = extractLibraryName(specifier, lang, goModulePath);
                        if (name_1)
                            libraries.push(name_1);
                    }
                    return [2 /*return*/, libraries];
            }
        });
    });
}
function detectGoModulePath(folderUri) {
    return __awaiter(this, void 0, void 0, function () {
        var workspaceRoot, searchRoot, goModFiles, content, _a, _b, match, _c;
        var _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    workspaceRoot = (_e = (_d = vscode.workspace.workspaceFolders) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.uri;
                    searchRoot = workspaceRoot !== null && workspaceRoot !== void 0 ? workspaceRoot : folderUri;
                    _f.label = 1;
                case 1:
                    _f.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, vscode.workspace.findFiles(new vscode.RelativePattern(searchRoot, '**/go.mod'), null, 5)];
                case 2:
                    goModFiles = _f.sent();
                    if (goModFiles.length === 0)
                        return [2 /*return*/, undefined];
                    _b = (_a = Buffer).from;
                    return [4 /*yield*/, vscode.workspace.fs.readFile(goModFiles[0])];
                case 3:
                    content = _b.apply(_a, [_f.sent()]).toString('utf8');
                    match = /^module\s+([\S]+)/m.exec(content);
                    return [2 /*return*/, match === null || match === void 0 ? void 0 : match[1]];
                case 4:
                    _c = _f.sent();
                    return [2 /*return*/, undefined];
                case 5: return [2 /*return*/];
            }
        });
    });
}
var PARSE_BATCH = 10;
function collectExternalLibraries(fileUris, goModulePath, token) {
    return __awaiter(this, void 0, void 0, function () {
        var libraryMap, i, batch, batchResults, b, relPath, _i, _a, libName, existing;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    libraryMap = new Map();
                    i = 0;
                    _b.label = 1;
                case 1:
                    if (!(i < fileUris.length)) return [3 /*break*/, 4];
                    if (token.isCancellationRequested)
                        return [3 /*break*/, 4];
                    batch = fileUris.slice(i, i + PARSE_BATCH);
                    return [4 /*yield*/, Promise.all(batch.map(function (_a) {
                            var uri = _a.uri, relPath = _a.relPath;
                            return parseImportsFromFile(uri, relPath, goModulePath);
                        }))];
                case 2:
                    batchResults = _b.sent();
                    for (b = 0; b < batch.length; b++) {
                        relPath = batch[b].relPath;
                        for (_i = 0, _a = batchResults[b]; _i < _a.length; _i++) {
                            libName = _a[_i];
                            existing = libraryMap.get(libName);
                            if (existing) {
                                if (!existing.importedBy.includes(relPath))
                                    existing.importedBy.push(relPath);
                            }
                            else {
                                libraryMap.set(libName, { name: libName, importedBy: [relPath] });
                            }
                        }
                    }
                    _b.label = 3;
                case 3:
                    i += PARSE_BATCH;
                    return [3 /*break*/, 1];
                case 4:
                    logger_1.logger.debug('ImportParser', 'collectExternalLibraries: done', { count: libraryMap.size });
                    return [2 /*return*/, libraryMap];
            }
        });
    });
}
