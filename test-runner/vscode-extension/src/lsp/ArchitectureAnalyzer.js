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
exports.ArchitectureAnalyzer = exports.PRESETS = void 0;
exports.resolveConfig = resolveConfig;
var vscode = __importStar(require("vscode"));
var logger_1 = require("../logger");
var FolderIndexer_1 = require("./FolderIndexer");
var ImportParser_1 = require("./ImportParser");
var RoleClassifier_1 = require("./RoleClassifier");
var TreeSitterQueryLoader_1 = require("./TreeSitterQueryLoader");
var RelationshipMapper_1 = require("./RelationshipMapper");
var DiagramGrouper_1 = require("./DiagramGrouper");
var ArchitecturePlanBuilder_1 = require("./ArchitecturePlanBuilder");
var symbolMapping_1 = require("./symbolMapping");
// ── Presets ───────────────────────────────────────────────────────────────────
exports.PRESETS = {
    overview: {
        callHierarchyDepth: 1,
        collapseIntermediates: true,
        includeUtilities: false,
        minSymbolKinds: 'classes',
        targetObjectsPerDiagram: 8,
        maxObjectsPerDiagram: 12,
        minObjectsPerDiagram: 2,
    },
    standard: {
        callHierarchyDepth: 2,
        collapseIntermediates: true,
        includeUtilities: false,
        minSymbolKinds: 'classes',
        targetObjectsPerDiagram: 10,
        maxObjectsPerDiagram: 15,
        minObjectsPerDiagram: 3,
    },
    detailed: {
        callHierarchyDepth: 3,
        collapseIntermediates: false,
        includeUtilities: true,
        minSymbolKinds: 'all',
        targetObjectsPerDiagram: 12,
        maxObjectsPerDiagram: 18,
        minObjectsPerDiagram: 3,
    },
};
var BASE_CONFIG = {
    abstractionLevel: 'standard',
    targetObjectsPerDiagram: 10,
    maxObjectsPerDiagram: 15,
    minObjectsPerDiagram: 3,
    callHierarchyDepth: 2,
    groupingStrategy: 'hybrid',
    collapseIntermediates: true,
    includeExternalLibraries: true,
    includeUtilities: false,
    minSymbolKinds: 'classes',
    importRoleMap: RoleClassifier_1.DEFAULT_IMPORT_ROLE_MAP,
    customRolePatterns: [],
};
function resolveConfig(overrides) {
    var _a, _b;
    var level = (_a = overrides.abstractionLevel) !== null && _a !== void 0 ? _a : BASE_CONFIG.abstractionLevel;
    var preset = (_b = exports.PRESETS[level]) !== null && _b !== void 0 ? _b : {};
    return __assign(__assign(__assign({}, BASE_CONFIG), preset), overrides);
}
// ── Analyzer ──────────────────────────────────────────────────────────────────
var ArchitectureAnalyzer = /** @class */ (function () {
    function ArchitectureAnalyzer(client, orgId, config, extensionUri) {
        this.client = client;
        this.orgId = orgId;
        this.config = config;
        this.extensionUri = extensionUri;
    }
    /**
     * Runs the full analysis pipeline for the given folder URI.
     * Returns the root diagram ID (the top-level "Architecture" diagram).
     * Throws CancellationError if cancelled; cleans up partial diagrams on error.
     */
    ArchitectureAnalyzer.prototype.analyze = function (folderUri, token, onProgress) {
        return __awaiter(this, void 0, void 0, function () {
            var projectName, workspaceRoot, rawSymbols, CLASSES_ONLY, filteredSymbols, externalLibraries, srcUris, fileEntries, goModPath, e_1, loader, importFingerprint, classifier, classified, graph, grouperConfig, groups, plan, refToId, rootDiagramId;
            var _a, _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        projectName = (_b = (_a = folderUri.fsPath.split('/').pop()) === null || _a === void 0 ? void 0 : _a.split('\\').pop()) !== null && _b !== void 0 ? _b : 'Project';
                        workspaceRoot = (_d = (_c = vscode.workspace.workspaceFolders) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.uri;
                        // ── Phase 1: Index symbols ─────────────────────────────────────────────
                        onProgress('Indexing symbols…');
                        logger_1.logger.info('ArchitectureAnalyzer', 'Phase 1: indexing', { folder: folderUri.fsPath });
                        return [4 /*yield*/, (0, FolderIndexer_1.indexFolder)(folderUri, token, function (done, total) {
                                onProgress("Indexing\u2026 ".concat(done, "/").concat(total, " files"));
                            })];
                    case 1:
                        rawSymbols = _e.sent();
                        if (token.isCancellationRequested)
                            throw new vscode.CancellationError();
                        if (rawSymbols.length === 0) {
                            throw new Error('No indexable symbols found in this folder.');
                        }
                        CLASSES_ONLY = new Set([
                            vscode.SymbolKind.Class,
                            vscode.SymbolKind.Struct,
                            vscode.SymbolKind.Interface,
                            vscode.SymbolKind.Module,
                        ]);
                        filteredSymbols = this.config.minSymbolKinds === 'classes'
                            ? rawSymbols.filter(function (s) { return CLASSES_ONLY.has(s.kind); })
                            : rawSymbols;
                        logger_1.logger.info('ArchitectureAnalyzer', 'Phase 1 done', { raw: rawSymbols.length, filtered: filteredSymbols.length });
                        // ── Phase 2: Detect external libraries ───────────────────────────────
                        onProgress('Detecting external libraries…');
                        logger_1.logger.info('ArchitectureAnalyzer', 'Phase 2: import parsing');
                        externalLibraries = new Map();
                        _e.label = 2;
                    case 2:
                        _e.trys.push([2, 6, , 7]);
                        return [4 /*yield*/, vscode.workspace.findFiles(new vscode.RelativePattern(folderUri, symbolMapping_1.SOURCE_GLOB), null)];
                    case 3:
                        srcUris = _e.sent();
                        fileEntries = srcUris.map(function (u) { return ({
                            uri: u,
                            relPath: workspaceRoot && u.fsPath.startsWith(workspaceRoot.fsPath + '/')
                                ? u.fsPath.slice(workspaceRoot.fsPath.length + 1)
                                : u.fsPath,
                        }); });
                        return [4 /*yield*/, (0, ImportParser_1.detectGoModulePath)(folderUri)];
                    case 4:
                        goModPath = _e.sent();
                        return [4 /*yield*/, (0, ImportParser_1.collectExternalLibraries)(fileEntries, goModPath, token)];
                    case 5:
                        externalLibraries = _e.sent();
                        logger_1.logger.info('ArchitectureAnalyzer', 'Phase 2 done', { externalLibs: externalLibraries.size });
                        return [3 /*break*/, 7];
                    case 6:
                        e_1 = _e.sent();
                        logger_1.logger.warn('ArchitectureAnalyzer', 'import parsing failed (non-fatal)', { error: String(e_1) });
                        return [3 /*break*/, 7];
                    case 7:
                        if (token.isCancellationRequested)
                            throw new vscode.CancellationError();
                        // ── Phase 3: Classify symbols ─────────────────────────────────────────
                        onProgress('Classifying architectural roles…');
                        logger_1.logger.info('ArchitectureAnalyzer', 'Phase 3: classification');
                        loader = new TreeSitterQueryLoader_1.TreeSitterQueryLoader(this.extensionUri, workspaceRoot);
                        importFingerprint = RoleClassifier_1.RoleClassifier.buildImportFingerprint(externalLibraries, this.config.importRoleMap);
                        classifier = new RoleClassifier_1.RoleClassifier(loader, this.config.customRolePatterns, importFingerprint, this.config.disablePathHeuristics);
                        return [4 /*yield*/, classifier.classifyAll(filteredSymbols, token)];
                    case 8:
                        classified = _e.sent();
                        logger_1.logger.info('ArchitectureAnalyzer', 'Phase 3 done', {
                            classified: classified.length,
                            roleCounts: countRoles(classified),
                        });
                        if (token.isCancellationRequested)
                            throw new vscode.CancellationError();
                        // ── Phase 4: Build relationship graph ─────────────────────────────────
                        onProgress('Mapping call relationships…');
                        logger_1.logger.info('ArchitectureAnalyzer', 'Phase 4: relationship mapping');
                        return [4 /*yield*/, (0, RelationshipMapper_1.buildRelationshipGraph)(classified, loader, {
                                callHierarchyDepth: this.config.callHierarchyDepth,
                                collapseIntermediates: this.config.collapseIntermediates,
                            }, token)];
                    case 9:
                        graph = _e.sent();
                        logger_1.logger.info('ArchitectureAnalyzer', 'Phase 4 done', { edges: graph.edges.length });
                        if (token.isCancellationRequested)
                            throw new vscode.CancellationError();
                        // ── Phase 5: Group into diagram buckets ───────────────────────────────
                        onProgress('Grouping into diagrams…');
                        logger_1.logger.info('ArchitectureAnalyzer', 'Phase 5: grouping');
                        grouperConfig = {
                            groupingStrategy: this.config.groupingStrategy,
                            targetObjectsPerDiagram: this.config.targetObjectsPerDiagram,
                            maxObjectsPerDiagram: this.config.maxObjectsPerDiagram,
                            minObjectsPerDiagram: this.config.minObjectsPerDiagram,
                            includeUtilities: this.config.includeUtilities,
                        };
                        groups = (0, DiagramGrouper_1.groupSymbols)(classified, graph, grouperConfig);
                        if (groups.length === 0) {
                            throw new Error('No symbol groups found. Try "Detailed" level or a different folder.');
                        }
                        logger_1.logger.info('ArchitectureAnalyzer', 'Phase 5 done', { groups: groups.length });
                        // ── Phase 6: Build plan ───────────────────────────────────────────────
                        onProgress('Assembling plan…');
                        logger_1.logger.info('ArchitectureAnalyzer', 'Phase 6: plan assembly');
                        plan = (0, ArchitecturePlanBuilder_1.buildArchitecturePlan)(groups, graph, externalLibraries, {
                            levelLabel: this.config.abstractionLevel.charAt(0).toUpperCase() + this.config.abstractionLevel.slice(1),
                            includeExternalLibraries: this.config.includeExternalLibraries,
                            projectName: projectName,
                        });
                        logger_1.logger.info('ArchitectureAnalyzer', 'Phase 6 done', {
                            diagrams: plan.diagrams.length,
                            objects: plan.objects.length,
                            edges: plan.edges.length,
                            links: plan.links.length,
                        });
                        // ── Phase 7: Submit ───────────────────────────────────────────────────
                        onProgress("Uploading plan (".concat(plan.diagrams.length, " diagrams, ").concat(plan.objects.length, " objects)\u2026"));
                        logger_1.logger.info('ArchitectureAnalyzer', 'Phase 7: submitting plan');
                        return [4 /*yield*/, this.client.applyPlanFull({
                                orgId: this.orgId,
                                diagrams: plan.diagrams,
                                objects: plan.objects,
                                edges: plan.edges,
                                links: plan.links,
                            })];
                    case 10:
                        refToId = _e.sent();
                        rootDiagramId = refToId['arch_root'];
                        if (!rootDiagramId) {
                            throw new Error('Plan submitted but root diagram ID not returned — check server logs.');
                        }
                        logger_1.logger.info('ArchitectureAnalyzer', 'Analysis complete', { rootDiagramId: rootDiagramId });
                        return [2 /*return*/, rootDiagramId];
                }
            });
        });
    };
    return ArchitectureAnalyzer;
}());
exports.ArchitectureAnalyzer = ArchitectureAnalyzer;
// ── Helpers ───────────────────────────────────────────────────────────────────
function countRoles(symbols) {
    var _a;
    var counts = {};
    for (var _i = 0, symbols_1 = symbols; _i < symbols_1.length; _i++) {
        var s = symbols_1[_i];
        counts[s.role] = ((_a = counts[s.role]) !== null && _a !== void 0 ? _a : 0) + 1;
    }
    return counts;
}
