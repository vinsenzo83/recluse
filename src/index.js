#!/usr/bin/env node
// 🕸️ Spider MCP — 거미줄 검증 방법론을 MCP tool/resource로 노출.
// 모델(클라이언트)이 오케스트레이터, 이 서버는 결정론적 지식·계획·기억을 제공한다.
//  - resources: 체크리스트 / 계약쿼리 템플릿 / 자가발전 corpus
//  - tools: weave 플랜 / 등급분류(King·Mid·Baby) / 패턴 기록(corpus 증류) / 패턴 조회
// corpus·checklist는 스킬(~/.claude/skills/spiderweb-qc/references)과 같은 파일을 공유해
// 스킬과 MCP가 같은 기억을 키운다. SPIDER_REF_DIR 로 경로 교체 가능.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const REF_DIR = process.env.SPIDER_REF_DIR
  || join(homedir(), '.claude', 'skills', 'spiderweb-qc', 'references');
const read = (f) => { try { return readFileSync(join(REF_DIR, f), 'utf8'); } catch { return ''; } };

// 공유 corpus(집단 거미 두뇌) — 설정 시 로컬 파일과 함께 원격 기여/조회.
const CORPUS_API = process.env.SPIDER_CORPUS_API || ''; // 예: https://corpus.example.com
const CORPUS_TOKEN = process.env.SPIDER_CORPUS_TOKEN || ''; // 익명 기여자 토큰(신원 아님)
async function corpusFetch(path, init) {
  if (!CORPUS_API) return null;
  try {
    const r = await fetch(`${CORPUS_API}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(CORPUS_TOKEN ? { authorization: `Bearer ${CORPUS_TOKEN}` } : {}), ...(init?.headers || {}) },
    });
    return { ok: r.ok, status: r.status, body: await r.json().catch(() => null) };
  } catch (e) { return { ok: false, error: String(e) }; }
}

// ── 위험도 → 거미 등급 매핑(자원 배분) ─────────────────────────────
const TIERS = {
  king: { spider: '🕷️ 대왕거미 (King)', model: 'opus',   votes: 3, areas: ['payment','billing','auth','authz','grant','entitlement','gdpr','delete','account','secret','migration','money','legal','rls'] },
  mid:  { spider: '🕸️ 중간거미 (Mid)',  model: 'sonnet', votes: 2, areas: ['contract','integration','i18n','locale','content','moderation','aggregate','gating','business'] },
  baby: { spider: '🐜 세끼거미 (Baby)',  model: 'haiku',  votes: 1, areas: ['style','docs','comment','dead-code','lint','string','ui-copy','cleanup'] },
};
function classify({ severity = 'yellow', area = '' } = {}) {
  const a = String(area).toLowerCase();
  if (TIERS.king.areas.some((k) => a.includes(k)) || severity === 'red') return { tier: 'king', ...TIERS.king };
  if (TIERS.baby.areas.some((k) => a.includes(k))) return { tier: 'baby', ...TIERS.baby };
  return { tier: 'mid', ...TIERS.mid };
}

const server = new McpServer({ name: 'recluse', version: '0.1.0' });

// ── Resources: 지식 베이스(스킬과 공유) ───────────────────────────
server.resource('checklist', 'spider://checklist', async (uri) => ({
  contents: [{ uri: uri.href, mimeType: 'text/markdown', text: read('checklist.md') || '# checklist 미발견 — SPIDER_REF_DIR 확인' }],
}));
server.resource('contract-queries', 'spider://queries', async (uri) => ({
  contents: [{ uri: uri.href, mimeType: 'text/x-sql', text: read('contract-queries.sql') || '-- queries 미발견' }],
}));
server.resource('learned-patterns', 'spider://corpus', async (uri) => ({
  contents: [{ uri: uri.href, mimeType: 'text/markdown', text: read('learned-patterns.md') || '# corpus 비어있음' }],
}));
server.resource('live-web', 'spider://blackbox', async (uri) => ({
  contents: [{ uri: uri.href, mimeType: 'text/markdown', text: read('live-web-blackbox.md') || '# 미발견' }],
}));

// ── Tool: weave 플랜 ──────────────────────────────────────────────
server.tool(
  'spider_plan',
  '대상에 대한 거미줄 검증 계획을 반환: 던질 거미(차원·등급·모델), 우선 점검할 학습 패턴, 절대원칙. 라운드 시작 시 호출.',
  { target: z.string().describe('검증 대상(레포/기능/배포 범위)'), thorough: z.boolean().optional().describe('true면 거미 수↑·다수결 강화') },
  async ({ target, thorough }) => {
    const corpus = read('learned-patterns.md');
    const knownTraps = (corpus.match(/^### \[.*$/gm) || []).join('\n') || '(corpus 비어있음 — 첫 라운드)';
    const dims = [
      { key: 'security',    tier: 'king', focus: '인증 게이팅·시크릿·RLS·권한경계·webhook 위조' },
      { key: 'data-payment',tier: 'king', focus: '단위/제약·결제→권한 전경로·집계·계정삭제(GDPR)' },
      { key: 'integration', tier: 'mid',  focus: '생산자→저장소→소비자 계약·끊긴고리·죽은enum·i18n' },
    ];
    if (thorough) dims.push({ key: 'runtime-ux', tier: 'mid', focus: '클라 렌더·깨진링크·콘솔에러·성능' });
    const plan = {
      principle: '⚖️ 사실 왜곡 금지 — 코드 file:line + 라이브 DB 쿼리 + 실제 HTTP/모델 출력으로만 판정.',
      target,
      weave: dims.map((d) => ({ ...d, spider: TIERS[d.tier].spider, model: TIERS[d.tier].model, votes: TIERS[d.tier].votes })),
      known_traps_check_first: knownTraps,
      loop: 'weave(탐지) → catch(걸림) → dispatch(등급매칭 거미 자율수정) → re-weave(재직조) → 🔴 0까지',
      resources: ['spider://checklist', 'spider://queries', 'spider://corpus'],
    };
    return { content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }] };
  },
);

// ── Tool: 등급 분류 ───────────────────────────────────────────────
server.tool(
  'spider_classify_tier',
  'finding을 King/Mid/Baby 거미로 분류하고 모델·검증표수를 반환. 수정 거미 급파 전 호출.',
  { severity: z.enum(['red','yellow','green']).optional(), area: z.string().describe('영역 키워드(payment, i18n, docs 등)') },
  async ({ severity, area }) => {
    const c = classify({ severity, area });
    return { content: [{ type: 'text', text: JSON.stringify({ tier: c.tier, spider: c.spider, model: c.model, verification_votes: c.votes }, null, 2) }] };
  },
);

// ── Tool: 체크리스트 조회 ─────────────────────────────────────────
server.tool(
  'spider_checklist',
  '차원별 전수 체크리스트(증거 없이 PASS 금지)를 반환.',
  { dimension: z.string().optional().describe('인증/데이터/단위/끊긴고리/권한경계/폴백/런타임 등') },
  async ({ dimension }) => {
    const all = read('checklist.md');
    if (!dimension) return { content: [{ type: 'text', text: all }] };
    const block = all.split(/\n(?=## )/).find((s) => s.toLowerCase().includes(dimension.toLowerCase())) || all;
    return { content: [{ type: 'text', text: block }] };
  },
);

// ── Tool: 패턴 기록(자가발전 — corpus 증류) ───────────────────────
server.tool(
  'spider_record_pattern',
  '이번 라운드에 잡은 버그를 학습 corpus에 1줄 패턴으로 증류 추가(다음 라운드에 먼저 점검). 실제로 잡은 것만.',
  {
    klass: z.string().describe('버그 클래스(단위/제약·끊긴고리·권한경계 등)'),
    name: z.string().describe('짧은 이름'),
    signal: z.string().describe('탐지 신호 — 어떤 쿼리/grep/코드위치로 잡는가'),
    fix: z.string().describe('수정 원칙'),
    hit: z.string().describe('적중 예시(프로젝트·날짜·file:line)'),
  },
  async ({ klass, name, signal, fix, hit }) => {
    const f = join(REF_DIR, 'learned-patterns.md');
    if (!existsSync(f)) return { content: [{ type: 'text', text: `corpus 파일 없음: ${f}` }], isError: true };
    const entry = `\n### [${klass}] ${name}\n- 신호: ${signal}\n- 수정: ${fix}\n- 적중: ${hit}\n`;
    try { appendFileSync(f, entry); } catch (e) { return { content: [{ type: 'text', text: `기록 실패: ${e.message}` }], isError: true }; }
    // 공유 corpus에도 기여(설정 시) — 서버가 스크럽·dedup·신뢰도 누적. 코드/시크릿은 서버에서 거부됨.
    let shared = '로컬만(SPIDER_CORPUS_API 미설정)';
    if (CORPUS_API) {
      const r = await corpusFetch('/patterns', { method: 'POST', body: JSON.stringify({ klass, name, signal, fix, severity: 'yellow' }) });
      shared = r?.ok ? `공유됨(${r.body?.action}, hits ${r.body?.hit_count}, verified ${r.body?.verified})`
        : (r?.status === 422 ? `공유 거부(스크럽: ${r.body?.reason})` : `공유 실패(${r?.status || r?.error})`);
    }
    return { content: [{ type: 'text', text: `✅ corpus에 증류됨: [${klass}] ${name}\n   ${shared}` }] };
  },
);

// ── Tool: 집단 corpus pull(다른 거미들이 잡은 패턴) ───────────────
server.tool(
  'spider_pull_corpus',
  '공유 corpus(집단 거미 두뇌)에서 다른 사용자들이 잡은 검증된 패턴을 가져온다. 라운드 시작 시 알려진 함정 우선 점검용. SPIDER_CORPUS_API 필요.',
  { tags: z.string().optional().describe('스택 태그 쉼표(postgres,nextjs,payment 등)'), klass: z.string().optional(), limit: z.number().optional() },
  async ({ tags, klass, limit }) => {
    if (!CORPUS_API) return { content: [{ type: 'text', text: '공유 corpus 미설정(SPIDER_CORPUS_API). 로컬 spider://corpus 사용.' }] };
    const qs = new URLSearchParams();
    if (tags) qs.set('tags', tags); if (klass) qs.set('class', klass); if (limit) qs.set('limit', String(limit));
    const r = await corpusFetch(`/patterns?${qs}`, { method: 'GET' });
    if (!r?.ok) return { content: [{ type: 'text', text: `조회 실패(${r?.status || r?.error})` }], isError: true };
    return { content: [{ type: 'text', text: JSON.stringify(r.body, null, 2) }] };
  },
);

await server.connect(new StdioServerTransport());
