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
exports.buildArchitecturePlan = buildArchitecturePlan;
var symbolMapping_1 = require("./symbolMapping");
var ROOT_REF = 'arch_root';
var EXTERNAL_REF = 'grp_external';
var GRID_COL_W = 240;
var GRID_ROW_H = 160;
var GRID_COLS = 5;
/**
 * Converts DiagramGroups + relationship graph into an ArchitecturePlan
 * ready to submit via applyPlanFull.
 */
function buildArchitecturePlan(groups, graph, externalLibraries, config) {
    var _a, _b, _c, _d;
    var hasExternal = config.includeExternalLibraries && externalLibraries.size > 0;
    // ── Diagrams ────────────────────────────────────────────────────────────────
    var diagrams = __spreadArray([
        {
            ref: ROOT_REF,
            name: "".concat(config.projectName, " Architecture"),
            levelLabel: config.levelLabel,
        }
    ], groups.map(function (g) { return ({
        ref: g.ref,
        name: g.name,
        parentDiagramRef: ROOT_REF,
    }); }), true);
    if (hasExternal) {
        diagrams.push({
            ref: EXTERNAL_REF,
            name: 'External Dependencies',
            parentDiagramRef: ROOT_REF,
        });
    }
    // ── Layouts ─────────────────────────────────────────────────────────────────
    var rootLayout = computeRootLayout(groups, hasExternal);
    var groupLayouts = new Map();
    for (var _i = 0, groups_1 = groups; _i < groups_1.length; _i++) {
        var group = groups_1[_i];
        groupLayouts.set(group.ref, computeGroupLayout(group.symbols));
    }
    // ── Objects ─────────────────────────────────────────────────────────────────
    var objects = [];
    var clusterRefs = new Map(); // groupRef → clusterObjectRef
    // 1. Cluster objects on root diagram (one per group)
    for (var _e = 0, groups_2 = groups; _e < groups_2.length; _e++) {
        var group = groups_2[_e];
        var clusterRef = "cluster_".concat(group.ref);
        clusterRefs.set(group.ref, clusterRef);
        var pos = (_a = rootLayout.get(group.ref)) !== null && _a !== void 0 ? _a : { x: 0, y: 0 };
        objects.push({
            ref: clusterRef,
            name: group.name,
            type: 'container',
            tags: ['cluster'],
            technologyLinks: [],
            placements: [{ diagramRef: ROOT_REF, positionX: pos.x, positionY: pos.y }],
        });
    }
    // 2. Detail objects on each group's diagram
    for (var _f = 0, groups_3 = groups; _f < groups_3.length; _f++) {
        var group = groups_3[_f];
        var layout = (_b = groupLayouts.get(group.ref)) !== null && _b !== void 0 ? _b : new Map();
        for (var _g = 0, _h = group.symbols; _g < _h.length; _g++) {
            var sym = _h[_g];
            var symRef = "".concat(sym.filePath.replace(/[^a-z0-9]/gi, '_'), "__").concat(sym.name);
            var pos = (_c = layout.get(symbolKey(sym))) !== null && _c !== void 0 ? _c : { x: 0, y: 0 };
            objects.push({
                ref: sanitizeRef(symRef),
                name: sym.name,
                type: (0, symbolMapping_1.kindToObjectType)(sym.kind),
                filePath: sym.filePath,
                tags: [sym.role],
                technologyLinks: [],
                placements: [{ diagramRef: group.ref, positionX: pos.x, positionY: pos.y }],
            });
        }
    }
    // 3. External cluster object on root diagram
    if (hasExternal) {
        var extPos = (_d = rootLayout.get(EXTERNAL_REF)) !== null && _d !== void 0 ? _d : { x: (groups.length % GRID_COLS) * GRID_COL_W, y: Math.floor(groups.length / GRID_COLS) * GRID_ROW_H };
        objects.push({
            ref: "cluster_".concat(EXTERNAL_REF),
            name: 'External Dependencies',
            type: 'external_system',
            tags: ['cluster', 'external'],
            technologyLinks: [],
            placements: [{ diagramRef: ROOT_REF, positionX: extPos.x, positionY: extPos.y }],
        });
        // 4. Individual external library objects on the external diagram
        var libEntries = __spreadArray([], externalLibraries.values(), true);
        libEntries.forEach(function (lib, i) {
            var x = (i % GRID_COLS) * GRID_COL_W;
            var y = Math.floor(i / GRID_COLS) * GRID_ROW_H;
            objects.push({
                ref: sanitizeRef("ext_".concat(lib.name)),
                name: lib.name,
                type: 'external_system',
                tags: ['external'],
                technologyLinks: [],
                placements: [{ diagramRef: EXTERNAL_REF, positionX: x, positionY: y }],
            });
        });
    }
    // ── Edges ───────────────────────────────────────────────────────────────────
    // Build symbol-ref → group + object-ref lookup
    var symRefToGroupRef = new Map();
    var symRefToObjRef = new Map();
    for (var _j = 0, groups_4 = groups; _j < groups_4.length; _j++) {
        var group = groups_4[_j];
        for (var _k = 0, _l = group.symbols; _k < _l.length; _k++) {
            var sym = _l[_k];
            var key = symbolKey(sym);
            var objRef = sanitizeRef("".concat(sym.filePath.replace(/[^a-z0-9]/gi, '_'), "__").concat(sym.name));
            symRefToGroupRef.set(key, group.ref);
            symRefToObjRef.set(key, objRef);
        }
    }
    var edges = [];
    // Root-level edges: between cluster objects for cross-group dependencies
    var rootEdgeSet = new Set();
    for (var _m = 0, _o = graph.edges; _m < _o.length; _m++) {
        var edge = _o[_m];
        var srcGroupRef = symRefToGroupRef.get(edge.srcRef);
        var dstGroupRef = symRefToGroupRef.get(edge.dstRef);
        if (srcGroupRef && dstGroupRef && srcGroupRef !== dstGroupRef) {
            var srcCluster = clusterRefs.get(srcGroupRef);
            var dstCluster = clusterRefs.get(dstGroupRef);
            var edgeKey = "".concat(srcCluster, "::").concat(dstCluster);
            if (!rootEdgeSet.has(edgeKey)) {
                rootEdgeSet.add(edgeKey);
                edges.push(__assign({ diagramRef: ROOT_REF, sourceObjectRef: srcCluster, targetObjectRef: dstCluster }, (edge.label ? { label: edge.label } : {})));
            }
        }
    }
    // Cross-group → external cluster edge
    if (hasExternal) {
        var extClusterRef = "cluster_".concat(EXTERNAL_REF);
        var externalLibNames = new Set(__spreadArray([], externalLibraries.keys(), true).map(function (n) { return sanitizeRef("ext_".concat(n)); }));
        var groupsWithExternalDeps = new Set();
        for (var _p = 0, _q = graph.edges; _p < _q.length; _p++) {
            var edge = _q[_p];
            var dstObjRef = symRefToObjRef.get(edge.dstRef);
            if (dstObjRef && externalLibNames.has(dstObjRef)) {
                var srcGroupRef = symRefToGroupRef.get(edge.srcRef);
                if (srcGroupRef)
                    groupsWithExternalDeps.add(srcGroupRef);
            }
        }
        for (var _r = 0, groupsWithExternalDeps_1 = groupsWithExternalDeps; _r < groupsWithExternalDeps_1.length; _r++) {
            var groupRef = groupsWithExternalDeps_1[_r];
            var srcCluster = clusterRefs.get(groupRef);
            if (!srcCluster)
                continue;
            var edgeKey = "".concat(srcCluster, "::").concat(extClusterRef);
            if (!rootEdgeSet.has(edgeKey)) {
                rootEdgeSet.add(edgeKey);
                edges.push({
                    diagramRef: ROOT_REF,
                    sourceObjectRef: srcCluster,
                    targetObjectRef: extClusterRef,
                });
            }
        }
    }
    // Within-group edges: between detail objects on the group's diagram
    for (var _s = 0, groups_5 = groups; _s < groups_5.length; _s++) {
        var group = groups_5[_s];
        var groupSymRefs = new Set(group.symbols.map(symbolKey));
        var groupEdgeSet = new Set();
        for (var _t = 0, _u = graph.edges; _t < _u.length; _t++) {
            var edge = _u[_t];
            var srcInGroup = groupSymRefs.has(edge.srcRef);
            var dstInGroup = groupSymRefs.has(edge.dstRef);
            if (srcInGroup && dstInGroup) {
                var srcObjRef = symRefToObjRef.get(edge.srcRef);
                var dstObjRef = symRefToObjRef.get(edge.dstRef);
                if (!srcObjRef || !dstObjRef)
                    continue;
                var edgeKey = "".concat(srcObjRef, "::").concat(dstObjRef);
                if (!groupEdgeSet.has(edgeKey)) {
                    groupEdgeSet.add(edgeKey);
                    edges.push(__assign({ diagramRef: group.ref, sourceObjectRef: srcObjRef, targetObjectRef: dstObjRef }, (edge.label ? { label: edge.label } : {})));
                }
            }
        }
    }
    // ── Links (drill-down) ──────────────────────────────────────────────────────
    var links = groups.map(function (g) { return ({
        objectRef: clusterRefs.get(g.ref),
        fromDiagramRef: ROOT_REF,
        toDiagramRef: g.ref,
    }); });
    if (hasExternal) {
        links.push({
            objectRef: "cluster_".concat(EXTERNAL_REF),
            fromDiagramRef: ROOT_REF,
            toDiagramRef: EXTERNAL_REF,
        });
    }
    return { diagrams: diagrams, objects: objects, edges: edges, links: links };
}
// ── Layout ────────────────────────────────────────────────────────────────────
/**
 * Role-based lane layout for a group diagram:
 * api_entry → top lane, service → middle, repository/data_exit → bottom.
 * Other roles fill in between.
 */
function computeGroupLayout(symbols) {
    var _a, _b;
    var LANE_ORDER = {
        api_entry: 0,
        service: 1,
        model: 2,
        repository: 3,
        data_exit: 3,
        utility: 4,
        external: 5,
        unknown: 6,
    };
    var lanes = new Map();
    for (var _i = 0, symbols_1 = symbols; _i < symbols_1.length; _i++) {
        var sym = symbols_1[_i];
        var lane = (_a = LANE_ORDER[sym.role]) !== null && _a !== void 0 ? _a : 6;
        var arr = (_b = lanes.get(lane)) !== null && _b !== void 0 ? _b : [];
        arr.push(sym);
        lanes.set(lane, arr);
    }
    var layout = new Map();
    var sortedLanes = __spreadArray([], lanes.entries(), true).sort(function (_a, _b) {
        var a = _a[0];
        var b = _b[0];
        return a - b;
    });
    var y = 0;
    for (var _c = 0, sortedLanes_1 = sortedLanes; _c < sortedLanes_1.length; _c++) {
        var _d = sortedLanes_1[_c], syms = _d[1];
        syms.forEach(function (sym, i) {
            layout.set(symbolKey(sym), { x: i * GRID_COL_W, y: y });
        });
        y += GRID_ROW_H;
    }
    return layout;
}
/** Square-ish grid layout for the root diagram cluster objects */
function computeRootLayout(groups, hasExternal) {
    var layout = new Map();
    groups.forEach(function (g, i) {
        layout.set(g.ref, {
            x: (i % GRID_COLS) * GRID_COL_W,
            y: Math.floor(i / GRID_COLS) * GRID_ROW_H,
        });
    });
    if (hasExternal) {
        // Pin external to bottom-right
        var cols = GRID_COLS;
        var totalRows = Math.ceil(groups.length / cols);
        layout.set(EXTERNAL_REF, {
            x: (cols - 1) * GRID_COL_W,
            y: (totalRows + 1) * GRID_ROW_H,
        });
    }
    return layout;
}
// ── Helpers ───────────────────────────────────────────────────────────────────
function symbolKey(sym) {
    return "".concat(sym.filePath, "::").concat(sym.name, "::").concat(sym.startLine);
}
function sanitizeRef(s) {
    return s.toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}
