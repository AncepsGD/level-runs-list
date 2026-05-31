const ranges = [
    { name: 'A', range: { start: 33.74, end: 44.45 } },
    { name: 'B', range: { start: 32.93, end: 43.7 } },
    { name: 'C', range: { start: 0, end: 40 } }
];
function canCover(set, tS, tE) {
    let cov = tS;
    const sorted = [...set].sort((a, b) => a.range.start - b.range.start || b.range.end - a.range.end);
    while (cov < tE) {
        const cands = sorted.filter(r => r.range.start <= cov);
        if (!cands.length) return false;
        const best = cands.reduce((a, b) => {
            if (b.range.end > a.range.end) return b;
            if (b.range.end < a.range.end) return a;
            const lenA = a.range.end - a.range.start;
            const lenB = b.range.end - b.range.start;
            if (lenB > lenA) return b;
            if (lenB < lenA) return a;
            return b.range.start > a.range.start ? b : a;
        });
        if (best.range.end <= cov) return false;
        cov = best.range.end;
    }
    return true;
}
function minimize(initial, tS, tE) {
    const working = [...initial];
    while (true) {
        const removable = [];
        for (let i = 0; i < working.length; i++) {
            const without = working.filter((_, j) => j !== i);
            if (canCover(without, tS, tE)) removable.push({ idx: i, range: working[i] });
        }
        if (!removable.length) break;
        removable.sort((a, b) => {
            if (a.range.end !== b.range.end) return a.range.end - b.range.end;
            const lenA = a.range.end - a.range.start;
            const lenB = b.range.end - b.range.start;
            if (lenA !== lenB) return lenA - lenB;
            return a.range.start - b.range.start;
        });
        working.splice(removable[0].idx, 1);
    }
    return working;
}
console.log(minimize(ranges, 0, 100));
