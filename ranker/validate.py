import csv, re

with open('../submission.csv', newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

print(f'Total rows: {len(rows)}')
ranks = [int(r['rank']) for r in rows]
scores = [float(r['score']) for r in rows]
ids = [r['candidate_id'] for r in rows]
reasonings = [r['reasoning'].strip() for r in rows]

# Validations
assert len(rows) == 100, f'Expected 100, got {len(rows)}'
assert sorted(ranks) == list(range(1, 101)), 'Ranks not 1-100 unique'
assert len(set(ids)) == 100, 'Duplicate candidate IDs'
for i in range(1, len(scores)):
    assert scores[i] <= scores[i-1] + 1e-9, f'Score not monotonic at row {i}'
for cid in ids:
    assert re.match(r'^CAND_\d{7}$', cid), f'Bad format: {cid}'

print('All validations PASSED:')
print('  OK 100 rows')
print('  OK Unique ranks 1-100')
print('  OK Unique candidate IDs')
print('  OK Monotonically non-increasing scores')
print('  OK CAND_XXXXXXX format')
print(f'  Score range: {scores[-1]:.4f} - {scores[0]:.4f}')
print(f'  Top candidate: {ids[0]} ({scores[0]:.4f})')
print(f'  Reasoning present: {sum(1 for r in reasonings if r)} / 100')
print()
print('Top 5:')
for r in rows[:5]:
    print(f"  #{r['rank']} {r['candidate_id']} score={r['score']} - {r['reasoning'][:80]}...")
