import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const Table = require('cli-table3');
// @ts-ignore
import { globSync } from 'glob';

import { ArchitectureAnalyzer, resolveConfig } from '../src/lsp/ArchitectureAnalyzer';

interface TestResult {
  projectName: string;
  kind: 'frontend' | 'backend';
  diagrams: number;
  objects: number;
  edges: number;
  links: number;
}

interface BenchmarkSummary {
  results: TestResult[];
}

export async function runTests() {
  console.log('Starting Architecture Generation Extension Tests...');

  // __dirname is now nested inside vscode-extension/out
  const rootDir = path.resolve(__dirname, '../test-data/realworld');
  const frontendDir = path.join(rootDir, 'frontend');
  const backendDir = path.join(rootDir, 'backend');
  const frontends = fs.readdirSync(frontendDir).filter(f => !f.startsWith('.')).map(f => ({ name: f, dir: path.join(frontendDir, f), kind: 'frontend' as const }));
  const backends = fs.readdirSync(backendDir).filter(f => !f.startsWith('.')).map(f => ({ name: f, dir: path.join(backendDir, f), kind: 'backend' as const }));

  const allProjects = [...frontends, ...backends];
  const results: TestResult[] = [];

  // Disable regex fallbacks in tldiagram settings if possible.
  // Wait, we don't have a specific setting for regex fallbacks exposed inside `tldiagram` config,
  // but if the user wants strictly LSP parsing, we are relying on VS Code's `executeDocumentSymbolProvider`.
  // If LSP fails to provide symbols, `executeDocumentSymbolProvider` returns undefined, which means no fallback inside our indexFolder (it skips).

  for (const project of allProjects) {
    if (!fs.statSync(project.dir).isDirectory()) continue;

    console.log(`\n\x1b[36mTesting: ${project.name} (${project.kind})\x1b[0m`);

    // Convert to URI
    const folderUri = vscode.Uri.file(project.dir);

    // Update the workspace folder to trigger LSPs for this directory
    vscode.workspace.updateWorkspaceFolders(0, vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0, { uri: folderUri });

    // Find a source file and open it to ensure the relevant language extension activates
    const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folderUri, '**/*.{go,py,cpp,java,rs,rb,ts,js,vue}'), '**/node_modules/**', 1);
    if (files.length > 0) {
      try {
        const doc = await vscode.workspace.openTextDocument(files[0]);
        await vscode.window.showTextDocument(doc);
      } catch (e) {
        console.log('Failed to open test document:', e);
      }
    }

    // Wait for extension/LSP initialization. Normally LSPs take a few seconds to parse after opening the workspace.
    // We'll give it a generous 15 second delay for now, since LSPs boot asynchronously.
    console.log('  Waiting 15s for LSP to initialize...', folderUri.fsPath);
    await new Promise(r => setTimeout(r, 15000));

    // We will invoke the architecture analyzer directly
    let interceptedPlan: any = null;
    const fakeClient = {
      applyPlanFull: async (req: any) => {
        interceptedPlan = req;
        return { arch_root: 99999 }; // Dummy root diagram ID
      }
    } as any;

    try {
      const config = resolveConfig({
        abstractionLevel: 'detailed', // we want everything for metrics
        parserMode: 'lsp',
        showParserWarnings: false,
        customRolePatterns: [],
        disablePathHeuristics: true,  // enforce strict lsp/tree-sitter testing
      });

      const analyzer = new ArchitectureAnalyzer(
        fakeClient,
        'test-org',
        config,
        vscode.Uri.file(path.resolve(__dirname, '..'))
      );

      const tokenSource = new vscode.CancellationTokenSource();
      await analyzer.analyze(folderUri, tokenSource.token, (msg: string) => {
        // Silencing progress updates to keep the console clean
      });

      if (interceptedPlan) {
        const res: TestResult = {
          projectName: project.name,
          kind: project.kind,
          diagrams: interceptedPlan.diagrams?.length || 0,
          objects: interceptedPlan.objects?.length || 0,
          edges: interceptedPlan.edges?.length || 0,
          links: interceptedPlan.links?.length || 0,
        };
        results.push(res);
        console.log(`  Success! -> Diagrams: ${res.diagrams}, Objects: ${res.objects}`);

        // Dump the intercepted plan
        const dumpPath = path.join(project.dir, `${project.name}-tld-plan.json`);
        fs.writeFileSync(dumpPath, JSON.stringify(interceptedPlan, null, 2));
      } else {
        console.log(`  Failed! Plan was not sent to client.`);
        results.push({ projectName: project.name, kind: project.kind, diagrams: 0, objects: 0, edges: 0, links: 0 });
      }

    } catch (err: any) {
      console.error(`  Error analyzing ${project.name}:`, err?.message || err);
      results.push({ projectName: project.name, kind: project.kind, diagrams: 0, objects: 0, edges: 0, links: 0 });
    }
  }

  // Print results table
  console.log('\n\x1b[32m=== RESULTS ===\x1b[0m\n');

  const renderTable = (kind: 'frontend' | 'backend', title: string) => {
    const subset = results.filter(r => r.kind === kind);
    const table = new Table({
      head: ['Tech Stack', 'Diagrams', 'Objects', 'Edges', 'Links'],
      style: { head: ['cyan'] }
    });

    // Calculate averages ignoring zero
    const getAvg = (key: keyof TestResult) => {
      const vals = subset.map(r => r[key] as number).filter(v => v > 0);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };

    const getStdDev = (key: keyof TestResult, avg: number) => {
      const vals = subset.map(r => r[key] as number).filter(v => v > 0);
      if (vals.length === 0) return 0;
      const variance = vals.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / vals.length;
      return Math.sqrt(variance);
    };

    const avgDiag = getAvg('diagrams');
    const avgObj = getAvg('objects');
    const avgEdges = getAvg('edges');
    const avgLinks = getAvg('links');

    const stdDiag = getStdDev('diagrams', avgDiag);
    const stdObj = getStdDev('objects', avgObj);
    const stdEdges = getStdDev('edges', avgEdges);
    const stdLinks = getStdDev('links', avgLinks);

    for (const r of subset) {
      // Color code cells if they differ more than 1 std dev from the average
      const formatCell = (val: number, avg: number, std: number) => {
        if (val === 0) return '\x1b[90m0\x1b[0m'; // gray
        if (std > 0 && Math.abs(val - avg) > std) {
          return val > avg ? `\x1b[32m${val}\x1b[0m` : `\x1b[31m${val}\x1b[0m`;
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
      `\x1b[1m${avgDiag.toFixed(1)}\x1b[0m`,
      `\x1b[1m${avgObj.toFixed(1)}\x1b[0m`,
      `\x1b[1m${avgEdges.toFixed(1)}\x1b[0m`,
      `\x1b[1m${avgLinks.toFixed(1)}\x1b[0m`
    ]);

    console.log(`\n\x1b[33m--- ${title} ---\x1b[0m`);
    console.log(table.toString());
  };

  renderTable('frontend', 'Frontend Implementations');
  renderTable('backend', 'Backend Implementations');

  if (process.env.TLD_BENCHMARK_RESULTS_PATH) {
    const summary: BenchmarkSummary = { results };
    fs.writeFileSync(process.env.TLD_BENCHMARK_RESULTS_PATH, JSON.stringify(summary, null, 2));
  }
}
