#!/usr/bin/env node
// 🕷️ RECLUSE CLI — CI 게이트. git diff를 집단 corpus(알려진 함정) + 거미줄 검증으로 점검.
//  - ANTHROPIC_API_KEY 있으면: Claude로 diff 실제 검증(계약 추적) → 🔴면 exit 1(PR 차단) + 잡은 패턴 corpus 환류.
//  - 키 없으면: advisory — corpus의 알려진 함정을 체크리스트로 출력(비차단).
// 사실 왜곡 금지: diff에서 실제로 보이는 근거만.
import { execSync } from 'node:child_process';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const CORPUS = process.env.SPIDER_CORPUS_API || 'https://eduverse-ai.app/api/corpus';
const KEY = process.env.ANTHROPIC_API_KEY;
const BASE = arg('--base', process.env.RECLUSE_BASE || 'origin/main');
const CONTRIB = process.env.RECLUSE_CONTRIBUTE !== '0';

function getDiff() {
  for (const cmd of [`git diff ${BASE}...HEAD`, `git diff ${BASE}`, 'git diff HEAD~1']) {
    try { const d = execSync(cmd, { encoding: 'utf8', maxBuffer: 8e6 }); if (d.trim()) return d.slice(0, 70000); } catch { /* try next */ }
  }
  return '';
}

async function pullCorpus() {
  try {
    const r = await fetch(`${CORPUS}/patterns?limit=80`);
    if (r.ok) return (await r.json()).patterns || [];
  } catch { /* offline → empty */ }
  return [];
}

async function contribute(f) {
  if (!CONTRIB) return;
  try {
    await fetch(`${CORPUS}/patterns`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ klass: f.klass, name: f.title, signal: f.evidence, fix: f.fix, severity: f.severity, tags: f.tags || [] }),
    });
  } catch { /* best-effort */ }
}

// 🕸️ 여왕의 눈 — weave 실행을 중앙에 익명 보고(텔레메트리). best-effort.
async function recordRun(source, findingsTotal, redCount, blocked, classes) {
  if (!CONTRIB) return;
  try {
    await fetch(`${CORPUS}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(process.env.RECLUSE_TOKEN ? { authorization: `Bearer ${process.env.RECLUSE_TOKEN}` } : {}) },
      body: JSON.stringify({ source, findings_total: findingsTotal, red_count: redCount, blocked, classes, projectId: process.env.GITHUB_REPOSITORY || process.env.RECLUSE_PROJECT || null }),
    });
  } catch { /* best-effort telemetry */ }
}
const SRC = process.env.GITHUB_ACTIONS ? 'action' : 'cli';

const diff = getDiff();
if (!diff.trim()) { console.log('🕷️ RECLUSE — 변경 없음, 통과.'); process.exit(0); }
const patterns = await pullCorpus();

// ── advisory(키 없음) — corpus 알려진 함정을 체크리스트로 ──
if (!KEY) {
  console.log(`🕷️ RECLUSE advisory — 집단 corpus의 알려진 함정 ${patterns.length}개:`);
  for (const p of patterns.slice(0, 40)) console.log(`  [${p.severity}] ${p.klass}: ${p.name} → ${p.fix}`);
  console.log('\n(ANTHROPIC_API_KEY 설정 시 이 diff를 실제 거미줄 검증하고 🔴면 차단합니다.)');
  await recordRun('advisory', 0, 0, false, []);
  process.exit(0);
}

// ── full weave — Claude로 diff 계약 검증 ──
const { default: Anthropic } = await import('@anthropic-ai/sdk');
const anthropic = new Anthropic({ apiKey: KEY });
const knownTraps = patterns.map((p) => `- [${p.klass}] ${p.name}: ${p.signal}`).join('\n') || '(corpus 비어있음)';
const system =
  `너는 RECLUSE 거미줄 검증기다. 코드 변경(diff)에서 *시스템 이음매*(생산자→저장소→소비자 계약: 컬럼명·타입·enum·단위·권한경계·인증·결제→권한)의 버그를 잡는다. ` +
  `**사실 왜곡 절대 금지** — diff에 실제로 보이는 근거(file·라인 내용)만. 추측은 finding 금지.\n` +
  `아래 *알려진 함정*을 우선 점검(집단 corpus):\n${knownTraps}\n\n` +
  `반드시 JSON 하나만 출력(설명·코드펜스 없이): ` +
  `{"findings":[{"severity":"red|yellow","klass":"버그클래스","title":"짧은제목","file":"경로","evidence":"diff 근거(일반화·시크릿금지)","fix":"수정원칙","tags":["스택태그"]}]}. ` +
  `red=출시블로커(결제·권한·데이터유실·보안), yellow=출시후보완. 확실한 것만. 없으면 findings:[].`;

const msg = await anthropic.messages.create({
  model: 'claude-opus-4-8',
  max_tokens: 4000,
  thinking: { type: 'adaptive' },
  system,
  messages: [{ role: 'user', content: `다음 diff를 거미줄 검증하라:\n\n${diff}` }],
});
const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
let findings = [];
try { const m = text.match(/\{[\s\S]*\}/); if (m) findings = JSON.parse(m[0]).findings || []; } catch { /* parse fail → no findings */ }

const red = findings.filter((f) => f.severity === 'red');
if (!findings.length) { console.log('🕷️ RECLUSE — 거미줄에 걸린 것 없음. ✅ 통과.'); await recordRun(SRC, 0, 0, false, []); process.exit(0); }
console.log(`🕷️ RECLUSE — ${findings.length}건 (🔴 ${red.length} / 🟡 ${findings.length - red.length})\n`);
for (const f of findings) {
  console.log(`${f.severity === 'red' ? '🔴' : '🟡'} [${f.klass}] ${f.title}  (${f.file})`);
  console.log(`   근거: ${f.evidence}`);
  console.log(`   수정: ${f.fix}\n`);
  await contribute(f); // 집단 corpus 환류 — 스크럽은 서버가
}
console.log(red.length ? `❌ 🔴 ${red.length}건 — PR 차단.` : '⚠️ 🟡만 — 통과(권고).');
await recordRun(SRC, findings.length, red.length, red.length > 0, findings.map((f) => f.klass).filter(Boolean));
process.exit(red.length ? 1 : 0);
