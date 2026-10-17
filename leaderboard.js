function getPlayerLeaderboard() {
    const players = new Map();
    const rankedLevels = levels.filter(level => !isBenchmark(level));
    const ranks = rankedLevels.map(level => level.rank).filter(Number.isFinite);
    const maxRank = Math.max(1, ...ranks);

    function addLevelRuns(level) {
        const levelKey = level.id
            ? `id:${level.id}`
            : `name:${level.name.trim().toLowerCase()}`;
        const levelRank = Number.isFinite(level.rank) ? level.rank : maxRank;
        const difficultyProgress = maxRank > 1
            ? (maxRank - levelRank) / (maxRank - 1)
            : 0;
        const difficultyMultiplier = 0.5 + 0.5 * Math.min(Math.max(difficultyProgress, 0), 1);
        for (const segment of level.segments) {
            const name = segment.player.trim();
            if (!name || name.toLowerCase().includes("redacted player") || segment.missing) {
                continue;
            }
            const player = players.get(name) || {
                name,
                runCount: 0,
                levels: new Set(),
                runs: new Set(),
                records: [],
                bestPercentage: 0
            };
            const runKey = `${levelKey}\u0000${name}\u0000${segment.range.replace(/\s/g, "")}`;
            if (!player.runs.has(runKey)) {
                player.runs.add(runKey);
                player.runCount++;
                player.levels.add(levelKey);
                const bounds = getSegmentBounds(segment);
                const startPercentage = bounds
                    ? Math.min(Math.max(bounds.start, 0), 100)
                    : 0;
                const endPercentage = bounds
                    ? Math.min(Math.max(bounds.end, 0), 100)
                    : 0;
                player.records.push({
                    levelKey,
                    levelName: level.name,
                    range: formatSegment(segment),
                    startPercentage,
                    endPercentage,
                    difficultyMultiplier,
                    points: 0
                });
            }
            const bounds = getSegmentBounds(segment);
            if (bounds) {
                player.bestPercentage = Math.max(
                    player.bestPercentage,
                    Math.min(Math.max(bounds.end, 0), 100)
                );
            }
            players.set(name, player);
        }
    }

    levels.filter(level => !isBenchmark(level)).forEach(addLevelRuns);
    const leaderboard = [...players.values()];

    for (const player of leaderboard) {
        const recordsByLevel = new Map();
        for (const record of player.records) {
            const records = recordsByLevel.get(record.levelKey) || [];
            records.push(record);
            recordsByLevel.set(record.levelKey, records);
        }
        for (const records of recordsByLevel.values()) {
            const coveredRecords = records.filter(record =>
                record.endPercentage > record.startPercentage);
            const boundaries = [...new Set(coveredRecords.flatMap(record => [
                record.startPercentage,
                record.endPercentage
            ]))].sort((first, second) => first - second);

            for (let index = 1; index < boundaries.length; index++) {
                const start = boundaries[index - 1];
                const end = boundaries[index];
                const overlappingRecords = coveredRecords.filter(record =>
                    record.startPercentage <= start && record.endPercentage >= end);
                if (!overlappingRecords.length) {
                    continue;
                }

                const points = (end - start) / 100
                    * 30
                    * overlappingRecords[0].difficultyMultiplier
                    / overlappingRecords.length;
                overlappingRecords.forEach(record => {
                    record.points += points;
                });
            }
        }

        for (const record of player.records) {
            record.points *= 10;
        }
        player.score = player.records.reduce((total, record) => total + record.points, 0);

        player.records.sort((first, second) =>
            second.points - first.points
            || second.endPercentage - first.endPercentage
            || first.levelName.localeCompare(second.levelName));
    }

    return leaderboard.sort((first, second) =>
        second.score - first.score
        || second.bestPercentage - first.bestPercentage
        || second.runCount - first.runCount
        || second.levels.size - first.levels.size
        || first.name.localeCompare(second.name));
}

function renderLeaderboards() {
    const players = getPlayerLeaderboard()
        .map((player, index) => ({ player, rank: index + 1 }))
        .filter(({ player }) => player.name.toLowerCase().includes(searchTerms.leaderboards));
    elements.list.innerHTML = players.length
        ? `<div class="leaderboard-heading">
                <h2>Player leaderboard</h2>
                <p>Relevant recorded runs from both lists are included.</p>
            </div>
            <div class="leaderboard-list">${players.map(({ player, rank }) => {
            const isExpanded = expandedPlayers.has(player.name);
            const records = player.records.map((record, recordIndex) => `
                    <div class="leaderboard-record">
                        <span class="leaderboard-record-rank">#${recordIndex + 1}</span>
                        <span class="leaderboard-record-level">${escapeHtml(record.levelName)}</span>
                        <span class="leaderboard-record-range">${escapeHtml(record.range)}</span>
                        <b class="leaderboard-record-points">${record.points.toFixed(2)} pts</b>
                    </div>
                `).join("");
            return `
                    <article class="leaderboard-card${isExpanded ? " expanded" : ""}">
                        <button class="leaderboard-toggle" type="button" data-player-toggle="${escapeHtml(player.name)}" aria-expanded="${isExpanded}">
                            <span class="leaderboard-rank">#${rank}</span>
                            <span class="leaderboard-player-info">
                                <span class="leaderboard-player" style="color:${getPlayerColor(player.name)}">${escapeHtml(player.name)}</span>
                                <span class="leaderboard-metrics">
                                    <span><b>${player.runCount}</b> ${player.runCount === 1 ? "run" : "runs"}</span>
                                    <span><b>${player.levels.size}</b> ${player.levels.size === 1 ? "level" : "levels"}</span>
                                </span>
                            </span>
                            <span class="leaderboard-score">
                                <b>${player.score.toFixed(1)}</b>
                                <span>points</span>
                            </span>
                            <span class="leaderboard-chevron" aria-hidden="true">${isExpanded ? "−" : "+"}</span>
                        </button>
                        <div class="leaderboard-records"${isExpanded ? "" : " hidden"}>
                            ${records}
                        </div>
                    </article>`;
        }).join("")}</div>`
        : '<div class="empty">No players match your search.</div>';
}
