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
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
var vscode = __importStar(require("vscode"));
var LEVELS = {
    off: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    trace: 5,
};
/**
 * Singleton logger backed by a VS Code OutputChannel ("tlDiagram").
 * Log level is read from `tldiagram.logLevel` and updated live on config changes.
 *
 * Usage:
 *   import { logger } from './logger'
 *   logger.info('WebviewManager', 'Opening diagram', { id: 42 })
 *   logger.debug('FolderIndexer', 'Batch done', { files: 5, symbols: 12 })
 */
var Logger = /** @class */ (function () {
    function Logger() {
        this.channel = vscode.window.createOutputChannel('tlDiagram');
        this.level = this.readLevel();
    }
    /** Call once from activate() to hook config change events. */
    Logger.prototype.init = function (context) {
        var _this = this;
        context.subscriptions.push(this.channel);
        context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(function (e) {
            if (e.affectsConfiguration('tldiagram.logLevel')) {
                var prev = _this.level;
                _this.level = _this.readLevel();
                if (_this.level !== prev) {
                    _this.info('Logger', "Log level changed to \"".concat(_this.levelName(), "\""));
                }
            }
        }));
        this.info('Logger', "Log level: \"".concat(this.levelName(), "\""));
    };
    Logger.prototype.readLevel = function () {
        var _a;
        var cfg = vscode.workspace
            .getConfiguration('tldiagram')
            .get('logLevel', 'info');
        return (_a = LEVELS[cfg]) !== null && _a !== void 0 ? _a : LEVELS.info;
    };
    Logger.prototype.levelName = function () {
        var _this = this;
        var _a, _b;
        return (_b = (_a = Object.entries(LEVELS).find(function (_a) {
            var v = _a[1];
            return v === _this.level;
        })) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : 'info';
    };
    Logger.prototype.write = function (levelLabel, component, message, data) {
        var ts = new Date().toISOString();
        var dataStr = data !== undefined ? " ".concat(JSON.stringify(data)) : '';
        this.channel.appendLine("[".concat(ts, "] [").concat(levelLabel.padEnd(5), "] [").concat(component, "] ").concat(message).concat(dataStr));
    };
    Logger.prototype.error = function (component, message, data) {
        if (this.level >= LEVELS.error)
            this.write('ERROR', component, message, data);
    };
    Logger.prototype.warn = function (component, message, data) {
        if (this.level >= LEVELS.warn)
            this.write('WARN ', component, message, data);
    };
    Logger.prototype.info = function (component, message, data) {
        if (this.level >= LEVELS.info)
            this.write('INFO ', component, message, data);
    };
    Logger.prototype.debug = function (component, message, data) {
        if (this.level >= LEVELS.debug)
            this.write('DEBUG', component, message, data);
    };
    Logger.prototype.trace = function (component, message, data) {
        if (this.level >= LEVELS.trace)
            this.write('TRACE', component, message, data);
    };
    /** Show the output panel. */
    Logger.prototype.show = function () {
        this.channel.show(true);
    };
    return Logger;
}());
exports.logger = new Logger();
