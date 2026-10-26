// Print sample questions:
//   npx tsx shared/math/sample.ts systems 9 medium 10 [seed]
//   npx tsx shared/math/sample.ts mixed 7 auto 5
//   npx tsx shared/math/sample.ts all 9 all 3        (every topic × difficulty)

import { generateQuestion, makeRng, TOPICS, type Difficulty, type Grade, type Question, type TopicId } from './index';

const [topicArg = 'systems', gradeArg = '9', diffArg = 'medium', countArg = '10', seedArg] = process.argv.slice(2);
const grade = Number(gradeArg) as Grade;
const count = Math.max(1, Number(countArg) || 10);
const rng = seedArg !== undefined ? makeRng(Number(seedArg)) : Math.random;

const topics: Array<TopicId | 'mixed'> = topicArg === 'all' ? TOPICS.map((t) => t.id) : [topicArg as TopicId | 'mixed'];
const diffs: Array<Difficulty | 'auto'> = diffArg === 'all' ? ['easy', 'medium', 'hard'] : [diffArg as Difficulty | 'auto'];

function print(q: Question, n: number) {
  const out: string[] = [];
  out.push(`#${n} [${q.topic} · ${q.difficulty} · ${q.grade}-р анги · ${q.timeSuggested} сек]`);
  out.push(`  ${q.text.replace(/\n/g, '\n  ')}`);
  if (q.lines) for (const l of q.lines) out.push(`    ${q.system ? '{ ' : ''}${l}`);
  if (q.graph) out.push(`    [график: ${JSON.stringify(q.graph)}]`);
  q.choices.forEach((c, i) => out.push(`    ${'ABCD'[i]}) ${c}${i === q.answer ? '   ✓' : ''}`));
  out.push(`  Тайлбар: ${q.explanation}`);
  out.push(`  key: ${q.key}`);
  console.log(out.join('\n') + '\n');
}

let n = 1;
const recent: string[] = [];
for (const topic of topics) {
  for (const difficulty of diffs) {
    for (let i = 0; i < count; i++) {
      const q = generateQuestion({ grade, topic, difficulty, rng, avoidKeys: recent });
      recent.push(q.key);
      if (recent.length > 20) recent.shift();
      print(q, n++);
    }
  }
}
