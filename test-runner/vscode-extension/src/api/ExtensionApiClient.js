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
exports.ExtensionApiClient = void 0;
var connect_1 = require("@connectrpc/connect");
var connect_web_1 = require("@connectrpc/connect-web");
var protobuf_1 = require("@bufbuild/protobuf");
var logger_1 = require("../logger");
// Using relative imports to the local gen files — no BSR package needed in the extension host.
// esbuild resolves these at build time.
var diagram_service_pb_1 = require("../../../frontend/src/gen/diag/v1/diagram_service_pb");
function j(schema, msg) {
    return (0, protobuf_1.toJson)(schema, msg, { useProtoFieldName: true, emitDefaultValues: true });
}
var ExtensionApiClient = /** @class */ (function () {
    function ExtensionApiClient(serverUrl, apiKey) {
        var transport = (0, connect_web_1.createConnectTransport)({
            baseUrl: serverUrl.replace(/\/$/, '') + '/api',
            fetch: function (input, init) {
                var headers = new Headers(init === null || init === void 0 ? void 0 : init.headers);
                headers.set('Authorization', "Bearer ".concat(apiKey));
                return fetch(input, __assign(__assign({}, init), { headers: headers }));
            },
        });
        this.diagramClient = (0, connect_1.createClient)(diagram_service_pb_1.DiagramService, transport);
        logger_1.logger.debug('ExtensionApiClient', 'Client created', { baseUrl: serverUrl.replace(/\/$/, '') + '/api' });
    }
    ExtensionApiClient.prototype.getMe = function () {
        return __awaiter(this, void 0, void 0, function () {
            var e_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger_1.logger.debug('ExtensionApiClient', 'getMe: validating via listDiagrams');
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.diagramClient.listDiagrams({})];
                    case 2:
                        _a.sent();
                        logger_1.logger.debug('ExtensionApiClient', 'getMe: success');
                        return [2 /*return*/, { username: 'API Key', orgName: '', orgId: '' }];
                    case 3:
                        e_1 = _a.sent();
                        logger_1.logger.error('ExtensionApiClient', 'getMe: failed', { error: String(e_1) });
                        if (e_1 instanceof connect_1.ConnectError)
                            throw new Error(e_1.message);
                        throw e_1;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    ExtensionApiClient.prototype.listDiagrams = function () {
        return __awaiter(this, void 0, void 0, function () {
            var res, diagrams;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        logger_1.logger.debug('ExtensionApiClient', 'listDiagrams');
                        return [4 /*yield*/, this.diagramClient.listDiagrams({})];
                    case 1:
                        res = _b.sent();
                        diagrams = ((_a = res.diagrams) !== null && _a !== void 0 ? _a : []).map(function (d) {
                            var _a, _b, _c;
                            return ({
                                id: d.id,
                                name: d.name,
                                description: (_a = d.description) !== null && _a !== void 0 ? _a : null,
                                level_label: (_b = d.levelLabel) !== null && _b !== void 0 ? _b : null,
                                level: d.level,
                                created_at: d.createdAt ? new Date(Number(d.createdAt.seconds) * 1000).toISOString() : new Date().toISOString(),
                                updated_at: d.updatedAt ? new Date(Number(d.updatedAt.seconds) * 1000).toISOString() : new Date().toISOString(),
                                parent_diagram_id: (_c = d.parentDiagramId) !== null && _c !== void 0 ? _c : null,
                            });
                        });
                        logger_1.logger.debug('ExtensionApiClient', 'listDiagrams: done', { count: diagrams.length });
                        return [2 /*return*/, diagrams];
                }
            });
        });
    };
    ExtensionApiClient.prototype.createDiagram = function (name, parentDiagramId) {
        return __awaiter(this, void 0, void 0, function () {
            var res, json;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger_1.logger.info('ExtensionApiClient', 'createDiagram', { name: name, parentDiagramId: parentDiagramId });
                        return [4 /*yield*/, this.diagramClient.createDiagram({ name: name, parentDiagramId: parentDiagramId })];
                    case 1:
                        res = _a.sent();
                        json = j(diagram_service_pb_1.CreateDiagramResponseSchema, res);
                        logger_1.logger.info('ExtensionApiClient', 'createDiagram: created', { id: json.diagram.id, name: json.diagram.name });
                        return [2 /*return*/, json.diagram];
                }
            });
        });
    };
    ExtensionApiClient.prototype.renameDiagram = function (id, name) {
        return __awaiter(this, void 0, void 0, function () {
            var res, json;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger_1.logger.info('ExtensionApiClient', 'renameDiagram', { id: id, name: name });
                        return [4 /*yield*/, this.diagramClient.renameDiagram({ diagramId: id, name: name })];
                    case 1:
                        res = _a.sent();
                        json = j(diagram_service_pb_1.RenameDiagramResponseSchema, res);
                        logger_1.logger.debug('ExtensionApiClient', 'renameDiagram: done');
                        return [2 /*return*/, json.diagram];
                }
            });
        });
    };
    ExtensionApiClient.prototype.deleteDiagram = function (orgId, id) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger_1.logger.info('ExtensionApiClient', 'deleteDiagram', { orgId: orgId, id: id });
                        return [4 /*yield*/, this.diagramClient.deleteDiagram({ orgId: orgId, diagramId: id })];
                    case 1:
                        _a.sent();
                        logger_1.logger.debug('ExtensionApiClient', 'deleteDiagram: done');
                        return [2 /*return*/];
                }
            });
        });
    };
    ExtensionApiClient.prototype.createObject = function (props) {
        return __awaiter(this, void 0, void 0, function () {
            var res, json;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger_1.logger.debug('ExtensionApiClient', 'createObject', { name: props.name, type: props.type });
                        return [4 /*yield*/, this.diagramClient.createObject({
                                name: props.name,
                                type: props.type,
                                filePath: props.filePath,
                                technologyLinks: [],
                                tags: [],
                            })];
                    case 1:
                        res = _a.sent();
                        json = j(diagram_service_pb_1.CreateObjectResponseSchema, res);
                        logger_1.logger.trace('ExtensionApiClient', 'createObject: created', { id: json.object.id });
                        return [2 /*return*/, { id: json.object.id }];
                }
            });
        });
    };
    ExtensionApiClient.prototype.addObjectToDiagram = function (diagramId, objectId, x, y) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger_1.logger.trace('ExtensionApiClient', 'addObjectToDiagram', { diagramId: diagramId, objectId: objectId, x: x, y: y });
                        return [4 /*yield*/, this.diagramClient.addObjectToDiagram({ diagramId: diagramId, objectId: objectId, positionX: x, positionY: y })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    ExtensionApiClient.prototype.applyPlan = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var res, diagRef, json, meta;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        logger_1.logger.info('ExtensionApiClient', 'applyPlan', {
                            diagrams: params.diagrams.length,
                            objects: params.objects.length,
                            edges: params.edges.length,
                        });
                        return [4 /*yield*/, this.diagramClient.applyPlan({
                                orgId: params.orgId,
                                diagrams: params.diagrams,
                                objects: params.objects,
                                edges: params.edges,
                                links: [],
                            })];
                    case 1:
                        res = _b.sent();
                        diagRef = params.diagrams[0].ref;
                        json = j(diagram_service_pb_1.ApplyPlanResponseSchema, res);
                        meta = (_a = json.metadata) === null || _a === void 0 ? void 0 : _a[diagRef];
                        if (!(meta === null || meta === void 0 ? void 0 : meta.id))
                            throw new Error("applyPlan: no metadata for diagram ref \"".concat(diagRef, "\""));
                        logger_1.logger.info('ExtensionApiClient', 'applyPlan: complete', { diagramId: meta.id });
                        return [2 /*return*/, meta.id];
                }
            });
        });
    };
    /**
     * Like applyPlan but supports PlanLinks (drill-down connections between diagrams)
     * and returns the full metadata map (ref → server-assigned id) for all created resources.
     */
    ExtensionApiClient.prototype.applyPlanFull = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var res, json, refToId, _i, _a, _b, ref, meta;
            var _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        logger_1.logger.info('ExtensionApiClient', 'applyPlanFull', {
                            diagrams: params.diagrams.length,
                            objects: params.objects.length,
                            edges: params.edges.length,
                            links: params.links.length,
                        });
                        return [4 /*yield*/, this.diagramClient.applyPlan({
                                orgId: params.orgId,
                                diagrams: params.diagrams,
                                objects: params.objects,
                                edges: params.edges,
                                links: params.links,
                            })];
                    case 1:
                        res = _d.sent();
                        json = j(diagram_service_pb_1.ApplyPlanResponseSchema, res);
                        refToId = {};
                        for (_i = 0, _a = Object.entries((_c = json.metadata) !== null && _c !== void 0 ? _c : {}); _i < _a.length; _i++) {
                            _b = _a[_i], ref = _b[0], meta = _b[1];
                            if (meta === null || meta === void 0 ? void 0 : meta.id)
                                refToId[ref] = meta.id;
                        }
                        logger_1.logger.info('ExtensionApiClient', 'applyPlanFull: complete', { createdRefs: Object.keys(refToId).length });
                        return [2 /*return*/, refToId];
                }
            });
        });
    };
    return ExtensionApiClient;
}());
exports.ExtensionApiClient = ExtensionApiClient;
