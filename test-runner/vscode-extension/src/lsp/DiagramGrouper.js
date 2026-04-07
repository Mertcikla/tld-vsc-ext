"use strict";
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
exports.groupSymbols = groupSymbols;
var logger_1 = require("../logger");
// Role-to-display-name mapping for role-based grouping
var ROLE_NAMES = {
    api_entry: 'API Layer',
    service: 'Services',
    repository: 'Data Layer',
    data_exit: 'Data Access',
    model: 'Models',
    utility: 'Utilities',
    external: 'External',
    unknown: 'Other',
};
/**
 * Groups ClassifiedSymbols into diagram-sized DiagramGroups.
 * Enforces min/max density constraints by splitting and merging.
 */
function groupSymbols(symbols, graph, config) {
    // Filter utilities if not included
    var filtered = config.includeUtilities
        ? symbols
        : symbols.filter(function (s) { return s.role !== 'utility'; });
    if (filtered.length === 0)
        return [];
    // Step 1: Primary grouping
    var rawGroups;
    if (config.groupingStrategy === 'role') {
        rawGroups = groupByRole(filtered);
    }
    else if (config.groupingStrategy === 'folder') {
        rawGroups = groupByFolder(filtered);
    }
    else {
        rawGroups = groupByHybrid(filtered);
    }
    // Step 2: Split large groups
    var groups = new Map();
    for (var _i = 0, rawGroups_1 = rawGroups; _i < rawGroups_1.length; _i++) {
        var _a = rawGroups_1[_i], key = _a[0], syms = _a[1];
        if (syms.length > config.maxObjectsPerDiagram) {
            var split = splitGroup(key, syms, config);
            for (var _b = 0, split_1 = split; _b < split_1.length; _b++) {
                var _c = split_1[_b], k = _c[0], v = _c[1];
                groups.set(k, v);
            }
        }
        else {
            groups.set(key, syms);
        }
    }
    // Step 3: Merge small groups
    groups = mergeSmallGroups(groups, graph, config);
    // Step 4: Convert to DiagramGroup with centrality
    var result = [];
    for (var _d = 0, groups_1 = groups; _d < groups_1.length; _d++) {
        var _e = groups_1[_d], key = _e[0], syms = _e[1];
        if (syms.length === 0)
            continue;
        var centrality = computeCentrality(syms, graph);
        var representative = pickRepresentative(syms, centrality);
        result.push({
            ref: sanitizeRef("grp_".concat(key)),
            name: groupDisplayName(key),
            symbols: syms,
            centralityScores: centrality,
            representative: representative,
        });
    }
    logger_1.logger.info('DiagramGrouper', 'grouping complete', {
        groups: result.length,
        counts: result.map(function (g) { return ({ name: g.name, n: g.symbols.length }); }),
    });
    return result;
}
// ── Grouping strategies ────────────────────────────────────────────────────────
function groupByFolder(symbols) {
    var _a;
    var groups = new Map();
    for (var _i = 0, symbols_1 = symbols; _i < symbols_1.length; _i++) {
        var sym = symbols_1[_i];
        var parts = sym.filePath.split('/');
        // Use top-2 directory segments: src/handlers → "src_handlers", handlers/user → "handlers_user"
        var key = parts.length > 2
            ? parts.slice(0, 2).join('_')
            : parts.length > 1
                ? parts[0]
                : 'root';
        var arr = (_a = groups.get(key)) !== null && _a !== void 0 ? _a : [];
        arr.push(sym);
        groups.set(key, arr);
    }
    return groups;
}
function groupByRole(symbols) {
    var _a;
    var groups = new Map();
    for (var _i = 0, symbols_2 = symbols; _i < symbols_2.length; _i++) {
        var sym = symbols_2[_i];
        var key = sym.role;
        var arr = (_a = groups.get(key)) !== null && _a !== void 0 ? _a : [];
        arr.push(sym);
        groups.set(key, arr);
    }
    return groups;
}
function groupByHybrid(symbols) {
    var _a;
    var folderGroups = groupByFolder(symbols);
    // If we only get 1 group from folder grouping, fall back to role grouping
    if (folderGroups.size <= 1) {
        return groupByRole(symbols);
    }
    // If all symbols land in a single top-level dir like "src", go one level deeper
    if (folderGroups.size === 1) {
        var deepGroups = new Map();
        for (var _i = 0, symbols_3 = symbols; _i < symbols_3.length; _i++) {
            var sym = symbols_3[_i];
            var parts = sym.filePath.split('/');
            var key = parts.length > 3 ? parts.slice(0, 3).join('_') : parts.slice(0, 2).join('_');
            var arr = (_a = deepGroups.get(key)) !== null && _a !== void 0 ? _a : [];
            arr.push(sym);
            deepGroups.set(key, arr);
        }
        if (deepGroups.size > 1)
            return deepGroups;
        // Still one group — fall back to role
        return groupByRole(symbols);
    }
    return folderGroups;
}
// ── Split ─────────────────────────────────────────────────────────────────────
function splitGroup(key, symbols, config) {
    var _a;
    if (symbols.length <= config.maxObjectsPerDiagram) {
        return new Map([[key, symbols]]);
    }
    // Attempt 1: sub-directory split
    var subDirMap = new Map();
    for (var _i = 0, symbols_4 = symbols; _i < symbols_4.length; _i++) {
        var sym = symbols_4[_i];
        var parts = sym.filePath.split('/');
        var subKey = parts.length > 3 ? parts[2] : parts.length > 2 ? parts[1] : 'root';
        var arr = (_a = subDirMap.get(subKey)) !== null && _a !== void 0 ? _a : [];
        arr.push(sym);
        subDirMap.set(subKey, arr);
    }
    if (subDirMap.size > 1) {
        var result_1 = new Map();
        for (var _b = 0, subDirMap_1 = subDirMap; _b < subDirMap_1.length; _b++) {
            var _c = subDirMap_1[_b], subKey = _c[0], subSyms = _c[1];
            var subResult = splitGroup("".concat(key, "_").concat(subKey), subSyms, config);
            for (var _d = 0, subResult_1 = subResult; _d < subResult_1.length; _d++) {
                var _e = subResult_1[_d], k = _e[0], v = _e[1];
                result_1.set(k, v);
            }
        }
        return result_1;
    }
    // Attempt 2: role-based split within same directory
    var roleMap = groupByRole(symbols);
    if (roleMap.size > 1) {
        var result_2 = new Map();
        for (var _f = 0, roleMap_1 = roleMap; _f < roleMap_1.length; _f++) {
            var _g = roleMap_1[_f], role = _g[0], roleSyms = _g[1];
            result_2.set("".concat(key, "_").concat(role), roleSyms);
        }
        return result_2;
    }
    // Attempt 3: centrality split (top target N, rest)
    var tempCentrality = computeCentralityRaw(symbols, new Set(), []);
    var sorted = __spreadArray([], symbols, true).sort(function (a, b) { var _a, _b; return ((_a = tempCentrality.get(symbolKey(b))) !== null && _a !== void 0 ? _a : 0) - ((_b = tempCentrality.get(symbolKey(a))) !== null && _b !== void 0 ? _b : 0); });
    var chunk1 = sorted.slice(0, config.targetObjectsPerDiagram);
    var chunk2 = sorted.slice(config.targetObjectsPerDiagram);
    var result = new Map();
    result.set("".concat(key, "_primary"), chunk1);
    if (chunk2.length > 0)
        result.set("".concat(key, "_secondary"), chunk2);
    return result;
}
// ── Merge ─────────────────────────────────────────────────────────────────────
function mergeSmallGroups(groups, graph, config) {
    var changed = true;
    while (changed) {
        changed = false;
        var smallKey = findSmallKey(groups, config.minObjectsPerDiagram);
        if (!smallKey)
            break;
        var smallSyms = groups.get(smallKey);
        var bestKey = null;
        var bestScore = -1;
        for (var _i = 0, groups_2 = groups; _i < groups_2.length; _i++) {
            var _a = groups_2[_i], candidateKey = _a[0], candidateSyms = _a[1];
            if (candidateKey === smallKey)
                continue;
            if (candidateSyms.length + smallSyms.length > config.maxObjectsPerDiagram)
                continue;
            var score = countCrossEdges(smallSyms, candidateSyms, graph);
            if (score > bestScore) {
                bestScore = score;
                bestKey = candidateKey;
            }
        }
        // If no candidate within size budget, find any smallest group
        if (!bestKey) {
            var minSize = Infinity;
            for (var _b = 0, groups_3 = groups; _b < groups_3.length; _b++) {
                var _c = groups_3[_b], candidateKey = _c[0], candidateSyms = _c[1];
                if (candidateKey === smallKey)
                    continue;
                if (candidateSyms.length < minSize) {
                    minSize = candidateSyms.length;
                    bestKey = candidateKey;
                }
            }
        }
        if (bestKey) {
            var merged = __spreadArray(__spreadArray([], groups.get(bestKey), true), smallSyms, true);
            groups.set(bestKey, merged);
            groups.delete(smallKey);
            changed = true;
        }
        else {
            break;
        }
    }
    return groups;
}
function findSmallKey(groups, min) {
    for (var _i = 0, groups_4 = groups; _i < groups_4.length; _i++) {
        var _a = groups_4[_i], key = _a[0], syms = _a[1];
        if (syms.length < min)
            return key;
    }
    return null;
}
function countCrossEdges(a, b, graph) {
    var aRefs = new Set(a.map(symbolKey));
    var bRefs = new Set(b.map(symbolKey));
    var count = 0;
    for (var _i = 0, _a = graph.edges; _i < _a.length; _i++) {
        var edge = _a[_i];
        if ((aRefs.has(edge.srcRef) && bRefs.has(edge.dstRef)) ||
            (bRefs.has(edge.srcRef) && aRefs.has(edge.dstRef))) {
            count++;
        }
    }
    return count;
}
// ── Centrality ────────────────────────────────────────────────────────────────
function computeCentrality(symbols, graph) {
    var refs = new Set(symbols.map(symbolKey));
    var scores = computeCentralityRaw(symbols, refs, graph.edges);
    return scores;
}
function computeCentralityRaw(symbols, refs, edges) {
    var _a, _b, _c;
    var scores = new Map();
    for (var _i = 0, symbols_5 = symbols; _i < symbols_5.length; _i++) {
        var sym = symbols_5[_i];
        scores.set(symbolKey(sym), 0);
    }
    for (var _d = 0, edges_1 = edges; _d < edges_1.length; _d++) {
        var edge = edges_1[_d];
        var srcInGroup = refs.has(edge.srcRef);
        var dstInGroup = refs.has(edge.dstRef);
        if (srcInGroup)
            scores.set(edge.srcRef, ((_a = scores.get(edge.srcRef)) !== null && _a !== void 0 ? _a : 0) + 1);
        if (dstInGroup)
            scores.set(edge.dstRef, ((_b = scores.get(edge.dstRef)) !== null && _b !== void 0 ? _b : 0) + 1);
    }
    // Role bonuses
    for (var _e = 0, symbols_6 = symbols; _e < symbols_6.length; _e++) {
        var sym = symbols_6[_e];
        var key = symbolKey(sym);
        var score = (_c = scores.get(key)) !== null && _c !== void 0 ? _c : 0;
        if (sym.role === 'api_entry')
            score *= 2;
        else if (sym.role === 'repository')
            score = Math.round(score * 1.5);
        scores.set(key, score);
    }
    return scores;
}
function pickRepresentative(symbols, centrality) {
    var ROLE_TIEBREAK = {
        api_entry: 5,
        service: 4,
        repository: 3,
        data_exit: 2,
        model: 1,
        utility: 0,
        external: 0,
        unknown: 0,
    };
    return symbols.reduce(function (best, sym) {
        var _a, _b, _c, _d;
        var bScore = ((_a = centrality.get(symbolKey(best))) !== null && _a !== void 0 ? _a : 0) * 100 + ((_b = ROLE_TIEBREAK[best.role]) !== null && _b !== void 0 ? _b : 0);
        var sScore = ((_c = centrality.get(symbolKey(sym))) !== null && _c !== void 0 ? _c : 0) * 100 + ((_d = ROLE_TIEBREAK[sym.role]) !== null && _d !== void 0 ? _d : 0);
        return sScore > bScore ? sym : best;
    });
}
// ── Helpers ───────────────────────────────────────────────────────────────────
function symbolKey(sym) {
    return "".concat(sym.filePath, "::").concat(sym.name, "::").concat(sym.startLine);
}
function sanitizeRef(s) {
    return s.toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}
function groupDisplayName(key) {
    // Role key → nice name
    if (ROLE_NAMES[key])
        return ROLE_NAMES[key];
    // Path-derived key: src_handlers → "Src / Handlers"
    return key
        .split('_')
        .map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); })
        .join(' / ');
}
