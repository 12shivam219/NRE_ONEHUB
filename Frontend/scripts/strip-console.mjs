/**
 * Removes console.* from Frontend/src via TypeScript AST.
 * Merges overlapping ranges; single left-to-right apply on the original string.
 * Run from Frontend: node scripts/strip-console.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, '..', 'src');
const MAX_LEN = 8000;

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(p);
  }
  return acc;
}

function isConsoleCall(expr) {
  if (!ts.isCallExpression(expr)) return false;
  const fn = expr.expression;
  if (!ts.isPropertyAccessExpression(fn)) return false;
  if (!ts.isIdentifier(fn.expression) || fn.expression.text !== 'console') return false;
  return true;
}

function expandEndDelete(text, end) {
  let e = end;
  while (e < text.length && (text[e] === ' ' || text[e] === '\t')) e++;
  if (text[e] === '\r') e++;
  if (text[e] === '\n') e++;
  return e;
}

function pushDelete(text, removals, node) {
  const start = node.getStart();
  let end = node.getEnd();
  if (end - start > MAX_LEN) return;
  end = expandEndDelete(text, end);
  removals.push({ start, end, repl: '' });
}

function scanBlock(text, block, removals) {
  if (!block || !ts.isBlock(block)) return;
  for (const s of block.statements) {
    scanStmt(text, s, removals);
  }
}

function blockOnlyConsoleCalls(block) {
  if (!ts.isBlock(block) || block.statements.length === 0) return false;
  return block.statements.every(
    (s) => ts.isExpressionStatement(s) && isConsoleCall(s.expression)
  );
}

function scanStmt(text, stmt, removals) {
  if (ts.isExpressionStatement(stmt) && isConsoleCall(stmt.expression)) {
    pushDelete(text, removals, stmt);
    return;
  }

  if (ts.isIfStatement(stmt)) {
    const th = stmt.thenStatement;

    if (ts.isExpressionStatement(th) && isConsoleCall(th.expression)) {
      pushDelete(text, removals, stmt);
      return;
    }

    if (ts.isBlock(th) && blockOnlyConsoleCalls(th)) {
      pushDelete(text, removals, stmt);
      return;
    }

    if (ts.isBlock(th)) scanBlock(text, th, removals);
    else scanStmt(text, th, removals);

    if (stmt.elseStatement) {
      if (ts.isBlock(stmt.elseStatement)) scanBlock(text, stmt.elseStatement, removals);
      else scanStmt(text, stmt.elseStatement, removals);
    }
    return;
  }

  if (ts.isTryStatement(stmt)) {
    scanBlock(text, stmt.tryBlock, removals);
    if (stmt.catchClause?.block) scanBlock(text, stmt.catchClause.block, removals);
    if (stmt.finallyBlock) scanBlock(text, stmt.finallyBlock, removals);
    return;
  }

  if (ts.isBlock(stmt)) {
    scanBlock(text, stmt, removals);
    return;
  }

  if (
    ts.isForStatement(stmt) ||
    ts.isForOfStatement(stmt) ||
    ts.isForInStatement(stmt) ||
    ts.isWhileStatement(stmt) ||
    ts.isDoStatement(stmt)
  ) {
    const body = stmt.statement;
    if (ts.isBlock(body)) scanBlock(text, body, removals);
    else scanStmt(text, body, removals);
    return;
  }

  if (ts.isSwitchStatement(stmt)) {
    for (const clause of stmt.caseBlock.clauses) {
      if (ts.isCaseClause(clause) || ts.isDefaultClause(clause)) {
        for (const s of clause.statements) {
          scanStmt(text, s, removals);
        }
      }
    }
    return;
  }

  if (ts.isWithStatement(stmt)) {
    if (ts.isBlock(stmt.statement)) scanBlock(text, stmt.statement, removals);
    else scanStmt(text, stmt.statement, removals);
    return;
  }

  if (ts.isLabeledStatement(stmt)) {
    scanStmt(text, stmt.statement, removals);
  }
}

function mergeOps(ops) {
  if (ops.length === 0) return [];
  const sorted = [...ops].sort((a, b) => a.start - b.start);
  const out = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = out[out.length - 1];
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
      last.repl = '';
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

function applyOps(original, ops) {
  const merged = mergeOps(ops.filter((o) => o.end - o.start <= MAX_LEN));
  let out = '';
  let last = 0;
  for (const op of merged) {
    out += original.slice(last, op.start);
    out += op.repl;
    last = op.end;
  }
  out += original.slice(last);
  return out;
}

function visitAll(text, node, removals) {
  if (node === undefined) return;

  if (ts.isArrowFunction(node) && node.body && !ts.isBlock(node.body) && isConsoleCall(node.body)) {
    const start = node.body.getStart();
    const end = node.body.getEnd();
    if (end - start <= MAX_LEN) {
      removals.push({ start, end, repl: 'void 0' });
    }
  }

  if (ts.isBlock(node)) {
    scanBlock(text, node, removals);
  }

  ts.forEachChild(node, (c) => visitAll(text, c, removals));
}

function processFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const kind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, kind);
  const removals = [];
  visitAll(text, sf, removals);
  const next = applyOps(text, removals);
  if (next !== text) {
    fs.writeFileSync(filePath, next);
    return true;
  }
  return false;
}

let updated = 0;
for (const f of walk(srcRoot)) {
  if (processFile(f)) updated++;
}
process.stdout.write(`strip-console: updated ${updated} files under src/\n`);
