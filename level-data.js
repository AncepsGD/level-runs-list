function countRecordedRuns(segments) {
    if (!Array.isArray(segments)) {
        return 0;
    }

    return segments.filter(segment =>
        segment
        && typeof segment === "object"
        && typeof segment.player === "string"
        && segment.player.trim() !== ""
        && segment.player !== "N/A"
        && !segment.missing
    ).length;
}

function normalizeLevelRuns(level) {
    if (!level || typeof level !== "object") {
        return level;
    }

    const segments = optimizeRunSegments(level.segments);
    const retainedSegments = new Set(segments);
    const excludedRuns = level.segments.filter(segment =>
        segment
        && typeof segment === "object"
        && typeof segment.player === "string"
        && segment.player.trim() !== ""
        && segment.player !== "N/A"
        && !segment.missing
        && !retainedSegments.has(segment)
    );
    if (excludedRuns.length > 0) {
        const runDescriptions = excludedRuns.map(segment =>
            `${segment.player} (${formatSegment(segment)})`).join(", ");
        console.log(`Excluded ${excludedRuns.length} redundant run(s) from "${level.name}": ${runDescriptions}`);
    }

    return {
        ...level,
        segments,
        accuracy: normalizeRecord(level.accuracy),
        deaths: normalizeRecord(level.deaths),
        runCount: countRecordedRuns(segments)
    };
}

function normalizeRecord(record) {
    return record === undefined || record === null
        ? null
        : (Object.keys(record).length === 0
            || (record.value === null && record.player === null))
            ? null
            : record;
}

async function loadLevels() {
    const response = await fetch("levels.json");
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} while loading levels.json`);
    }

    const data = await response.json();
    const levelRecords = Array.isArray(data) ? data : data?.levels;
    if (!Array.isArray(levelRecords) || !levelRecords.every(isValidLevel)) {
        throw new Error("levels.json must contain a levels array or a levels property with structured level records");
    }

    return levelRecords.map(level => {
        const segments = isUncompletedLevel(level)
            ? inferMissingRuns(level.segments)
            : level.segments;
        return normalizeLevelRuns({
            ...level,
            id: level.id === null || level.id === undefined ? null : String(level.id),
            rank: level.rank ?? null,
            segments
        });
    });
}

function isUncompletedLevel(level) {
    return !isCompletedLevel(level);
}

function isCompletedLevel(level) {
    return getMissingRanges(level.segments).length === 0;
}

function formatPercentage(value) {
    return Number(value.toFixed(2)).toString();
}

function getMissingRanges(segments) {
    const coverage = segments.filter(segment => !segment.missing)
        .map(getSegmentBounds)
        .filter(bounds => bounds !== null)
        .map(bounds => ({
            start: Math.max(0, bounds.start),
            end: Math.min(100, bounds.end)
        }))
        .filter(bounds => bounds.end > bounds.start)
        .sort((first, second) => first.start - second.start || first.end - second.end);

    if (!coverage.length) {
        return [{ start: 0, end: 100 }];
    }

    const missingRuns = [];
    let coveredUntil = 0;
    for (const range of coverage) {
        if (range.start > coveredUntil + 0.001) {
            missingRuns.push({
                start: coveredUntil,
                end: range.start
            });
        }
        coveredUntil = Math.max(coveredUntil, range.end);
    }

    if (coveredUntil < 100 - 0.001) {
        missingRuns.push({
            start: coveredUntil,
            end: 100
        });
    }

    return missingRuns;
}

function inferMissingRuns(segments) {
    const missingRuns = getMissingRanges(segments).map(range => ({
        player: "",
        range: `${formatPercentage(range.start)} - ${formatPercentage(range.end)}`,
        missing: true
    }));

    return [...segments, ...missingRuns].sort((first, second) => {
        const firstBounds = getSegmentBounds(first);
        const secondBounds = getSegmentBounds(second);
        return (firstBounds?.start ?? 0) - (secondBounds?.start ?? 0);
    });
}

function isValidLevel(level) {
    return level !== null
        && typeof level === "object"
        && (level.rank === undefined || Number.isInteger(level.rank) || level.rank === null)
        && typeof level.name === "string"
        && (level.benchmark === undefined
            || level.benchmark === null
            || typeof level.benchmark === "boolean")
        && (level.image === null || typeof level.image === "string")
        && (level.id === null
            || typeof level.id === "string"
            || Number.isSafeInteger(level.id))
        && (level.showcaseVideo === undefined
            || level.showcaseVideo === null
            || typeof level.showcaseVideo === "string")
        && isValidRecord(level.accuracy)
        && isValidRecord(level.deaths)
        && Array.isArray(level.segments)
        && level.segments.every(segment =>
            segment !== null
            && typeof segment === "object"
            && typeof segment.player === "string"
            && typeof segment.range === "string");
}

function isValidRecord(record) {
    return record === undefined
        || record === null
        || (record !== null
            && typeof record === "object"
            && (Object.keys(record).length === 0
                || (typeof record.value === "string"
                    && typeof record.player === "string"
                    && (record.video === undefined || record.video === null || typeof record.video === "string"))
                || (record.value === null && record.player === null
                    && (record.video === undefined || record.video === null || typeof record.video === "string"))));
}

function isBenchmark(level) {
    return level.benchmark === true;
}
