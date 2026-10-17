function getPlayerColor(player) {
    return playerColors.get(player) || interpolateHue(330, 120, 0);
}

function initializePlayerColors() {
    const leaderboard = getPlayerLeaderboard();
    leaderboard.forEach((player, index) => {
        const progress = leaderboard.length <= 1 ? 0 : index / (leaderboard.length - 1);
        playerColors.set(player.name, interpolateHue(0, 330, progress));
    });
}

function escapeHtml(value) {
    return String(value).replace(/[&<>\"]/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;"
    })[character]);
}

function formatSegment(segment) {
    if (/^(TBA|wtf)$/i.test(segment.range)) {
        return segment.range;
    }

    const range = segment.range.includes("-")
        ? segment.range.replace(/\s*-\s*/, " – ")
        : `0 – ${segment.range}`;
    return `${range}%`;
}

function getSegmentBounds(segment) {
    const bounds = segment.range.split("-");
    const start = bounds.length > 1 ? parseFloat(bounds[0]) : 0;
    const end = parseFloat(bounds[bounds.length - 1]);
    return Number.isFinite(start) && Number.isFinite(end) ? { start, end } : null;
}

function getRangeColor(segment) {
    const bounds = getSegmentBounds(segment);
    if (bounds === null) {
        return interpolateHue(330, 0, 0);
    }

    const start = Math.max(0, bounds.start);
    const end = Math.min(100, bounds.end);
    const width = Math.max(0, end - start);
    const progress = Math.min(Math.max(width / 100, 0), 1);
    return interpolateHue(330, 0, progress);
}

function optimizeRunSegments(segments) {
    const ranges = [];
    const otherSegments = [];

    segments.forEach((segment, index) => {
        if (segment.missing) {
            otherSegments.push({ segment, index });
            return;
        }

        const bounds = getSegmentBounds(segment);
        if (!bounds) {
            otherSegments.push({ segment, index });
            return;
        }

        const start = Math.max(0, bounds.start);
        const end = Math.min(100, bounds.end);
        if (end > start) {
            ranges.push({
                segment,
                range: { start, end },
                origIdx: index
            });
        }
    });

    ranges.sort((first, second) =>
        first.range.start - second.range.start
        || second.range.end - first.range.end
        || first.origIdx - second.origIdx);

    const components = [];
    for (const range of ranges) {
        const component = components[components.length - 1];
        if (!component || range.range.start > component.end) {
            components.push({ start: range.range.start, end: range.range.end, ranges: [range] });
        } else {
            component.end = Math.max(component.end, range.range.end);
            component.ranges.push(range);
        }
    }

    const selected = components.flatMap(component => {
        const candidates = removeSubsumedRanges(component.ranges);
        const { selected: initial, gap } = greedyCoverRanges(
            candidates,
            component.start,
            component.end
        );
        if (gap !== null) {
            return component.ranges;
        }

        const minimized = minimizeRanges(initial, component.start, component.end);
        return swapForLargerRanges(
            minimized,
            component.ranges,
            component.start,
            component.end
        );
    });

    const retained = [
        ...selected.map(entry => ({ segment: entry.segment, origIdx: entry.origIdx })),
        ...otherSegments.map(entry => ({
            segment: entry.segment,
            origIdx: entry.index
        }))
    ];
    return retained.sort((first, second) => {
        const firstBounds = getSegmentBounds(first.segment);
        const secondBounds = getSegmentBounds(second.segment);
        return (firstBounds?.start ?? Infinity) - (secondBounds?.start ?? Infinity)
            || first.origIdx - second.origIdx;
    }).map(entry => entry.segment);
}

function removeSubsumedRanges(ranges) {
    const sorted = [...ranges].sort((first, second) =>
        first.range.start - second.range.start
        || second.range.end - first.range.end);
    const kept = [];
    for (const range of sorted) {
        if (!kept.some(candidate =>
            candidate.range.start <= range.range.start
            && candidate.range.end >= range.range.end)) {
            while (kept.length
                && kept[kept.length - 1].range.start === range.range.start
                && kept[kept.length - 1].range.end <= range.range.end) {
                kept.pop();
            }
            kept.push(range);
        }
    }
    return kept;
}

function greedyCoverRanges(ranges, targetStart, targetEnd) {
    const sorted = [...ranges].sort((first, second) =>
        first.range.start - second.range.start
        || second.range.end - first.range.end);
    let coveredTo = targetStart;
    const selected = [];
    while (coveredTo < targetEnd) {
        const candidates = sorted.filter(range => range.range.start <= coveredTo);
        if (!candidates.length) {
            return { selected, gap: coveredTo };
        }

        const best = candidates.reduce((first, second) => {
            if (second.range.end !== first.range.end) {
                return second.range.end > first.range.end ? second : first;
            }
            const firstLength = first.range.end - first.range.start;
            const secondLength = second.range.end - second.range.start;
            if (secondLength !== firstLength) {
                return secondLength > firstLength ? second : first;
            }
            return second.range.start > first.range.start ? second : first;
        });
        if (best.range.end <= coveredTo) {
            return { selected, gap: coveredTo };
        }
        selected.push(best);
        coveredTo = best.range.end;
    }
    return { selected, gap: null };
}

function canCoverRanges(ranges, targetStart, targetEnd) {
    return greedyCoverRanges(ranges, targetStart, targetEnd).gap === null;
}

function compareRangeValue(first, second) {
    const firstLength = first.range.end - first.range.start;
    const secondLength = second.range.end - second.range.start;
    const lengthDifference = firstLength - secondLength;
    if (Math.abs(lengthDifference) > 1e-9) {
        return lengthDifference;
    }
    const endDifference = first.range.end - second.range.end;
    if (Math.abs(endDifference) > 1e-9) {
        return endDifference;
    }
    return first.range.start - second.range.start;
}

function minimizeRanges(initial, targetStart, targetEnd) {
    const working = [...initial];
    while (true) {
        const removable = [];
        for (let index = 0; index < working.length; index++) {
            const without = working.filter((_, candidateIndex) => candidateIndex !== index);
            if (canCoverRanges(without, targetStart, targetEnd)) {
                removable.push({ index, range: working[index] });
            }
        }
        if (!removable.length) {
            break;
        }
        removable.sort((first, second) => compareRangeValue(first.range, second.range));
        working.splice(removable[0].index, 1);
    }
    return working;
}

function swapForLargerRanges(solution, allRanges, targetStart, targetEnd) {
    let working = [...solution];
    let selectedIds = new Set(working.map(range => range.origIdx));
    let unused = allRanges.filter(range => !selectedIds.has(range.origIdx));
    let swapped = true;

    while (swapped) {
        swapped = false;
        for (let index = 0; index < working.length; index++) {
            const current = working[index];
            const currentLength = current.range.end - current.range.start;
            const candidates = unused.slice().sort((first, second) =>
                compareRangeValue(second, first));

            for (const candidate of candidates) {
                const candidateLength = candidate.range.end - candidate.range.start;
                if (candidateLength <= currentLength) {
                    continue;
                }

                const trial = [...working];
                trial[index] = candidate;
                if (canCoverRanges(trial, targetStart, targetEnd)) {
                    working = trial;
                    swapped = true;
                    break;
                }
            }

            if (swapped) {
                selectedIds = new Set(working.map(range => range.origIdx));
                unused = allRanges.filter(range => !selectedIds.has(range.origIdx));
                break;
            }
        }
    }

    return minimizeRanges(working, targetStart, targetEnd);
}

function renderRunBar(segments) {
    const ranges = segments.map((segment, index) => {
        const bounds = getSegmentBounds(segment);
        if (!bounds) {
            return null;
        }

        const start = Math.max(bounds.start, 0);
        const end = Math.min(bounds.end, 100);
        return end > start ? { segment, index, start, end } : null;
    }).filter(Boolean).sort((first, second) =>
        first.start - second.start || second.end - first.end || first.index - second.index);

    const rows = [];
    const positionedRanges = ranges.map(range => {
        let row = rows.findIndex(rowEnd => rowEnd <= range.start + 0.001);
        if (row < 0) {
            row = rows.length;
            rows.push(range.end);
        } else {
            rows[row] = range.end;
        }
        return { ...range, row };
    });

    if (!positionedRanges.length) {
        return '<div class="trk" style="height:18px" aria-label="Run coverage"></div>';
    }

    const rowHeight = 13;
    const rowGap = 3;
    const topPadding = 3;
    const trackHeight = topPadding * 2 + (rows.length - 1) * (rowHeight + rowGap) + rowHeight;
    const runBars = positionedRanges.map(({ segment, start, end, row }) => {
        const label = segment.missing
            ? `Missing run ${formatSegment(segment)}`
            : `${formatSegment(segment)} · ${segment.player}`;
        const color = segment.missing ? "var(--missing)" : getRangeColor(segment);
        return `
        <span class="trk-run" style="left:${start}%;width:${end - start}%;top:${topPadding + row * (rowHeight + rowGap)}px;height:${rowHeight}px;background:color-mix(in srgb, ${color} 88%, transparent)"
            title="${escapeHtml(label)}"
            aria-label="${escapeHtml(label)}"><span>${escapeHtml(label)}</span></span>`;
    }).join("");
    return `
        <div class="trk" style="height:${trackHeight}px" aria-label="Run coverage">${runBars}</div>`;
}
