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
exports.runTests = runTests;
var vscode = __importStar(require("vscode"));
var path = __importStar(require("path"));
var fs = __importStar(require("fs"));
var Table = require('cli-table3');
var ArchitectureAnalyzer_1 = require("../../../vscode-extension/src/lsp/ArchitectureAnalyzer");
function runTests() {
    return __awaiter(this, void 0, void 0, function () {
        var results, rootDir, frontends, backends, allProjects, _loop_1, _i, allProjects_1, project, renderTable;
        var _this = this;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    console.log('Starting Architecture Generation Extension Tests...');
                    results = [];
                    rootDir = path.resolve(__dirname, '../../');
                    frontends = fs.readdirSync(path.join(rootDir, 'frontend')).map(function (f) { return ({ name: f, dir: path.join(rootDir, 'frontend', f), kind: 'frontend' }); });
                    backends = fs.readdirSync(path.join(rootDir, 'backend')).map(function (f) { return ({ name: f, dir: path.join(rootDir, 'backend', f), kind: 'backend' }); });
                    allProjects = __spreadArray(__spreadArray([], frontends, true), backends, true);
                    _loop_1 = function (project) {
                        var folderUri, interceptedPlan, fakeClient, config, analyzer, tokenSource, res, dumpPath, err_1;
                        return __generator(this, function (_f) {
                            switch (_f.label) {
                                case 0:
                                    if (!fs.statSync(project.dir).isDirectory())
                                        return [2 /*return*/, "continue"];
                                    console.log("\n\u001B[36mTesting: ".concat(project.name, " (").concat(project.kind, ")\u001B[0m"));
                                    folderUri = vscode.Uri.file(project.dir);
                                    // Update the workspace folder to trigger LSPs for this directory
                                    vscode.workspace.updateWorkspaceFolders(0, vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0, { uri: folderUri });
                                    // Wait for extension/LSP initialization. Normally LSPs take a few seconds to parse after opening the workspace.
                                    // We'll give it a generous 10 second delay for now, since LSPs boot asynchronously.
                                    console.log('  Waiting 10s for LSP to initialize...', folderUri.fsPath);
                                    return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, 10000); })];
                                case 1:
                                    _f.sent();
                                    interceptedPlan = null;
                                    fakeClient = {
                                        applyPlanFull: function (req) { return __awaiter(_this, void 0, void 0, function () {
                                            return __generator(this, function (_a) {
                                                interceptedPlan = req;
                                                return [2 /*return*/, { arch_root: 99999 }]; // Dummy root diagram ID
                                            });
                                        }); }
                                    };
                                    _f.label = 2;
                                case 2:
                                    _f.trys.push([2, 4, , 5]);
                                    config = (0, ArchitectureAnalyzer_1.resolveConfig)({
                                        abstractionLevel: 'detailed', // we want everything for metrics
                                        customRolePatterns: [],
                                        disablePathHeuristics: true, // enforce strict lsp/tree-sitter testing
                                    });
                                    analyzer = new ArchitectureAnalyzer_1.ArchitectureAnalyzer(fakeClient, 'test-org', config, vscode.Uri.file(path.resolve(__dirname, '../../../vscode-extension')));
                                    tokenSource = new vscode.CancellationTokenSource();
                                    return [4 /*yield*/, analyzer.analyze(folderUri, tokenSource.token, function (msg) {
                                            // Suppress progress output or keep it minimal
                                            // console.log(`    progress: ${msg}`);
                                        })];
                                case 3:
                                    _f.sent();
                                    if (interceptedPlan) {
                                        res = {
                                            projectName: project.name,
                                            kind: project.kind,
                                            diagrams: ((_a = interceptedPlan.diagrams) === null || _a === void 0 ? void 0 : _a.length) || 0,
                                            objects: ((_b = interceptedPlan.objects) === null || _b === void 0 ? void 0 : _b.length) || 0,
                                            edges: ((_c = interceptedPlan.edges) === null || _c === void 0 ? void 0 : _c.length) || 0,
                                            links: ((_d = interceptedPlan.links) === null || _d === void 0 ? void 0 : _d.length) || 0,
                                        };
                                        results.push(res);
                                        console.log("  Success! -> Diagrams: ".concat(res.diagrams, ", Objects: ").concat(res.objects));
                                        dumpPath = path.join(project.dir, "".concat(project.name, "-tld-plan.json"));
                                        fs.writeFileSync(dumpPath, JSON.stringify(interceptedPlan, null, 2));
                                    }
                                    else {
                                        console.log("  Failed! Plan was not sent to client.");
                                        results.push({ projectName: project.name, kind: project.kind, diagrams: 0, objects: 0, edges: 0, links: 0 });
                                    }
                                    return [3 /*break*/, 5];
                                case 4:
                                    err_1 = _f.sent();
                                    console.error("  Error analyzing ".concat(project.name, ":"), (err_1 === null || err_1 === void 0 ? void 0 : err_1.message) || err_1);
                                    results.push({ projectName: project.name, kind: project.kind, diagrams: 0, objects: 0, edges: 0, links: 0 });
                                    return [3 /*break*/, 5];
                                case 5: return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, allProjects_1 = allProjects;
                    _e.label = 1;
                case 1:
                    if (!(_i < allProjects_1.length)) return [3 /*break*/, 4];
                    project = allProjects_1[_i];
                    return [5 /*yield**/, _loop_1(project)];
                case 2:
                    _e.sent();
                    _e.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4:
                    // Print results table
                    console.log('\n\x1b[32m=== RESULTS ===\x1b[0m\n');
                    renderTable = function (kind, title) {
                        var subset = results.filter(function (r) { return r.kind === kind; });
                        var table = new Table({
                            head: ['Tech Stack', 'Diagrams', 'Objects', 'Edges', 'Links'],
                            style: { head: ['cyan'] }
                        });
                        // Calculate averages ignoring zero
                        var getAvg = function (key) {
                            var vals = subset.map(function (r) { return r[key]; }).filter(function (v) { return v > 0; });
                            return vals.length > 0 ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : 0;
                        };
                        var getStdDev = function (key, avg) {
                            var vals = subset.map(function (r) { return r[key]; }).filter(function (v) { return v > 0; });
                            if (vals.length === 0)
                                return 0;
                            var variance = vals.reduce(function (a, b) { return a + Math.pow(b - avg, 2); }, 0) / vals.length;
                            return Math.sqrt(variance);
                        };
                        var avgDiag = getAvg('diagrams');
                        var avgObj = getAvg('objects');
                        var avgEdges = getAvg('edges');
                        var avgLinks = getAvg('links');
                        var stdDiag = getStdDev('diagrams', avgDiag);
                        var stdObj = getStdDev('objects', avgObj);
                        var stdEdges = getStdDev('edges', avgEdges);
                        var stdLinks = getStdDev('links', avgLinks);
                        for (var _i = 0, subset_1 = subset; _i < subset_1.length; _i++) {
                            var r = subset_1[_i];
                            // Color code cells if they differ more than 1 std dev from the average
                            var formatCell = function (val, avg, std) {
                                if (val === 0)
                                    return '\x1b[90m0\x1b[0m'; // gray
                                if (std > 0 && Math.abs(val - avg) > std) {
                                    return val > avg ? "\u001B[32m".concat(val, "\u001B[0m") : "\u001B[31m".concat(val, "\u001B[0m");
                                }
                                return val.toString();
                            };
                            table.push([
                                r.projectName,
                                formatCell(r.diagrams, avgDiag, stdDiag),
                                formatCell(r.objects, avgObj, stdObj),
                                formatCell(r.edges, avgEdges, stdEdges),
                                formatCell(r.links, avgLinks, stdLinks)
                            ]);
                        }
                        table.push([
                            '\x1b[1mAVERAGE (excl 0)\x1b[0m',
                            "\u001B[1m".concat(avgDiag.toFixed(1), "\u001B[0m"),
                            "\u001B[1m".concat(avgObj.toFixed(1), "\u001B[0m"),
                            "\u001B[1m".concat(avgEdges.toFixed(1), "\u001B[0m"),
                            "\u001B[1m".concat(avgLinks.toFixed(1), "\u001B[0m")
                        ]);
                        console.log("\n\u001B[33m--- ".concat(title, " ---\u001B[0m"));
                        console.log(table.toString());
                    };
                    renderTable('frontend', 'Frontend Implementations');
                    renderTable('backend', 'Backend Implementations');
                    return [2 /*return*/];
            }
        });
    });
}
