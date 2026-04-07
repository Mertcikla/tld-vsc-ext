#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Table = require('cli-table3');

const ROOT_DIR = path.resolve(__dirname, '..');
const REALWORLD_DIR = path.join(ROOT_DIR, 'test-data', 'realworld');
const RESULTS_PATH = path.join(os.tmpdir(), 'tldiagram-benchmark-results.json');
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function collectProjects(kind) {
    const kindDir = path.join(REALWORLD_DIR, kind);
    return fs.readdirSync(kindDir)
        .filter(name => !name.startsWith('.'))
        .filter(name => fs.statSync(path.join(kindDir, name)).isDirectory())
        .map(name => ({
            projectName: name,
            kind,
            dir: path.join(kindDir, name),
        }));
}

function parseBenchmarkResult(output) {
    const trimmed = output.trim();
    if (!trimmed) {
        throw new Error('Local analyzer produced no output.');
    }

    try {
        return JSON.parse(trimmed);
    } catch {
        const jsonStart = trimmed.lastIndexOf('\n{');
        const candidate = jsonStart >= 0 ? trimmed.slice(jsonStart + 1) : trimmed.slice(trimmed.indexOf('{'));
        return JSON.parse(candidate);
    }
}

function runLocalAnalysis(projectDir) {
    const startedAt = Date.now();
    const child = spawnSync(
        NPM_COMMAND,
        ['run', '-s', 'arch:parse-local', '--', '--repo', projectDir, '--level', 'detailed'],
        {
            cwd: ROOT_DIR,
            encoding: 'utf8',
            env: process.env,
            maxBuffer: 20 * 1024 * 1024,
        },
    );
    const durationMs = Date.now() - startedAt;

    if (child.error) {
        throw child.error;
    }

    if (child.status !== 0) {
        const stderr = child.stderr?.trim();
        const stdout = child.stdout?.trim();
        throw new Error(stderr || stdout || `Local analyzer exited with code ${child.status}.`);
    }

    return {
        ...parseBenchmarkResult(child.stdout),
        durationMs,
    };
}

function averageNonZero(values) {
    const filtered = values.filter(value => value > 0);
    if (filtered.length === 0) {
        return 0;
    }

    return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function renderTable(results, kind, title) {
    const subset = results.filter(result => result.kind === kind);
    const table = new Table({
        head: ['Tech Stack', 'Diagrams', 'Objects', 'Edges', 'Links'],
        style: { head: ['cyan'] },
    });

    for (const result of subset) {
        table.push([
            result.projectName,
            result.diagrams,
            result.objects,
            result.edges,
            result.links,
        ]);
    }

    table.push([
        'AVERAGE (excl 0)',
        averageNonZero(subset.map(result => result.diagrams)).toFixed(1),
        averageNonZero(subset.map(result => result.objects)).toFixed(1),
        averageNonZero(subset.map(result => result.edges)).toFixed(1),
        averageNonZero(subset.map(result => result.links)).toFixed(1),
    ]);

    console.log(`\n\x1b[33m--- ${title} ---\x1b[0m`);
    console.log(table.toString());
}

async function main() {
    console.log('\x1b[36mStarting Local Architecture Benchmark...\x1b[0m');
    console.log(`Workspace: ${ROOT_DIR}`);
    console.log(`Corpus: ${REALWORLD_DIR}`);
    console.log('Runner: npm run -s arch:parse-local\n');

    if (fs.existsSync(RESULTS_PATH)) {
        fs.unlinkSync(RESULTS_PATH);
    }

    const projects = [
        ...collectProjects('frontend'),
        ...collectProjects('backend'),
    ];

    const results = [];
    for (const project of projects) {
        console.log(`\n\x1b[36mTesting: ${project.projectName} (${project.kind})\x1b[0m`);
        try {
            const result = runLocalAnalysis(project.dir);
            results.push({
                projectName: project.projectName,
                kind: project.kind,
                ...result,
            });
            console.log(
                `  Success -> Diagrams: ${result.diagrams}, Objects: ${result.objects}, Edges: ${result.edges}, Links: ${result.links}, Duration: ${(result.durationMs / 1000).toFixed(1)}s`,
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            results.push({
                projectName: project.projectName,
                kind: project.kind,
                repo: project.dir,
                level: 'detailed',
                filesScanned: 0,
                indexedSymbols: 0,
                classifiedSymbols: 0,
                groups: 0,
                diagrams: 0,
                objects: 0,
                edges: 0,
                links: 0,
                durationMs: 0,
                error: message,
            });
            console.error(`  Failed -> ${message}`);
        }
    }

    const summary = { results };
    fs.writeFileSync(RESULTS_PATH, JSON.stringify(summary, null, 2));

    console.log('\n\x1b[32m=== RESULTS ===\x1b[0m');
    renderTable(results, 'frontend', 'Frontend Implementations');
    renderTable(results, 'backend', 'Backend Implementations');

    console.log(`\nBenchmark summary written to ${RESULTS_PATH}`);
    console.log(`Projects analyzed: ${results.length}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
