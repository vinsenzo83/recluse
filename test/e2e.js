// 🕷️ RECLUSE MCP — E2E 검증. MCP 프로토콜로 서버를 띄워 tool/resource를 실제 호출하고
// spider_record_pattern → 라이브 공유 corpus API → DB 까지 흐르는지 확인한다.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = join(__dirname, '..', 'src', 'index.js');
const CORPUS_API = process.env.SPIDER_CORPUS_API || 'https://eduverse-ai.app/api/corpus';
const UNIQUE = `mcp-e2e marker ${process.env.E2E_NONCE || 'n1'}`;

let pass = 0, fail = 0;
const ok = (c, m) => { (c ? pass++ : fail++); console.log(`  ${c ? '✅' : '❌'} ${m}`); };
const txt = (r) => (r?.content || []).map((b) => b.text || '').join('\n');

const transport = new StdioClientTransport({
  command: 'node', args: [SERVER],
  env: { ...process.env, SPIDER_CORPUS_API: CORPUS_API, SPIDER_CORPUS_TOKEN: 'mcp-e2e-contributor' },
});
const client = new Client({ name: 'recluse-e2e', version: '1.0.0' }, { capabilities: {} });

try {
  await client.connect(transport);
  console.log('1) 핸드셰이크 + tools/list');
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  ok(names.length >= 5, `tools ${tools.length}개: ${names.join(', ')}`);
  for (const n of ['spider_plan', 'spider_classify_tier', 'spider_checklist', 'spider_record_pattern', 'spider_pull_corpus'])
    ok(names.includes(n), `tool 존재: ${n}`);

  console.log('2) spider_classify_tier (red/payment → 대왕거미 Opus)');
  const cls = JSON.parse(txt(await client.callTool({ name: 'spider_classify_tier', arguments: { severity: 'red', area: 'payment' } })));
  ok(cls.tier === 'king' && cls.model === 'opus' && cls.verification_votes === 3, `→ ${cls.tier}/${cls.model}/${cls.verification_votes}표`);
  const cls2 = JSON.parse(txt(await client.callTool({ name: 'spider_classify_tier', arguments: { severity: 'green', area: 'docs' } })));
  ok(cls2.tier === 'baby' && cls2.model === 'haiku', `docs → ${cls2.tier}/${cls2.model}`);

  console.log('3) spider_plan (target=eduverse)');
  const plan = JSON.parse(txt(await client.callTool({ name: 'spider_plan', arguments: { target: 'eduverse' } })));
  ok(Array.isArray(plan.weave) && plan.weave.length >= 3, `weave ${plan.weave?.length} 차원`);
  ok(/사실 왜곡 금지/.test(plan.principle), '제1원칙 포함');

  console.log('4) spider_record_pattern → 로컬 corpus + 라이브 공유(스크럽)');
  const rec = txt(await client.callTool({ name: 'spider_record_pattern', arguments: {
    klass: 'e2e', name: UNIQUE,
    signal: `MCP e2e via server at src/foo/bar.ts:99 with key sk_live_E2EFAKE123abcXYZ`,
    fix: 'verify mcp→corpus pipe end to end', hit: 'recluse mcp e2e',
  } }));
  console.log('   서버응답:', rec.replace(/\n/g, ' '));
  ok(/corpus에 증류/.test(rec), '로컬 corpus 기록');
  ok(/공유됨/.test(rec), '라이브 공유 corpus 기여 성공');

  console.log('5) spider_pull_corpus → 라이브에서 되읽기(스크럽 확인)');
  const pull = JSON.parse(txt(await client.callTool({ name: 'spider_pull_corpus', arguments: { limit: 50 } })));
  const mine = (pull.patterns || []).find((p) => p.name === UNIQUE);
  ok(!!mine, `방금 기여한 패턴 pull됨 (총 ${pull.count}개)`);
  if (mine) {
    ok(/⟨file⟩/.test(mine.signal) && /⟨secret⟩/.test(mine.signal), `스크럽 확인: "${mine.signal}"`);
    ok(!/sk_live_/.test(mine.signal) && !/bar\.ts/.test(mine.signal), '원본 코드·시크릿 미유출');
  }

  console.log('6) resource spider://corpus 읽기');
  const res = await client.readResource({ uri: 'spider://corpus' });
  ok((res.contents?.[0]?.text || '').length > 0, '로컬 corpus 리소스 읽힘');

  await client.close();
} catch (e) {
  fail++; console.log('  ❌ 예외:', e.message);
  try { await client.close(); } catch { /* */ }
}
console.log(`\n=== E2E 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
