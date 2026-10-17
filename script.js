const elements = {
    list: document.getElementById("list"),
    search: document.getElementById("q"),
    sort: document.getElementById("s"),
    sortControl: document.getElementById("sort-control"),
    navigation: document.querySelector(".page-nav")
};

const expandedRanks = new Set();
const expandedPlayers = new Set();
const playerColors = new Map();
let levels = [];
const searchTerms = { main: "", leaderboards: "", uncompleted: "" };
let activeView = "main";
let sortMode = "rank";

function getSegmentOverlap(segments) {
    const ranges = segments.map(getSegmentBounds).filter(Boolean);
    let overlap = 0;
    for (let first = 0; first < ranges.length; first++) {
        for (let second = first + 1; second < ranges.length; second++) {
            overlap += Math.max(
                0,
                Math.min(ranges[first].end, ranges[second].end)
                - Math.max(ranges[first].start, ranges[second].start)
            );
        }
    }
    return overlap;
}

function interpolateHue(start, end, progress) {
    const clampedProgress = Math.min(Math.max(progress, 0), 1);
    const hue = start + (end - start) * clampedProgress;
    return `hsl(${hue} 85% 62%)`;
}

function getDifficultyColor(level, rankedLevels) {
    const mostRuns = Math.max(...rankedLevels.map(item => item.runCount));
    if (level.runCount >= 5) {
        if (mostRuns <= 5) {
            return interpolateHue(330, 120, level.runCount === mostRuns ? 0 : 1);
        }
        const progress = (mostRuns - level.runCount) / (mostRuns - 5);
        return interpolateHue(330, 120, progress);
    }

    if (level.runCount === 4) {
        return interpolateHue(120, 60, 0.5);
    }
    if (level.runCount === 3) {
        return interpolateHue(120, 60, 1);
    }

    if (level.runCount === 2) {
        const twoRunLevels = rankedLevels.filter(item => item.runCount === 2);
        const overlaps = twoRunLevels.map(item =>
            getSegmentOverlap(item.segments.filter(segment => !segment.missing)));
        const minOverlap = Math.min(...overlaps);
        const maxOverlap = Math.max(...overlaps);
        const overlapRange = maxOverlap - minOverlap;
        const progress = overlapRange === 0
            ? 1
            : (getSegmentOverlap(level.segments.filter(segment => !segment.missing)) - minOverlap) / overlapRange;
        return interpolateHue(30, 0, progress);
    }

    return interpolateHue(0, 0, 0);
}

function getMissingPercentage(level) {
    return level.segments.reduce((total, segment) => {
        if (!segment.missing) {
            return total;
        }
        const bounds = getSegmentBounds(segment);
        if (!bounds) {
            return total;
        }
        return total + Math.max(0, Math.min(bounds.end, 100) - Math.max(bounds.start, 0));
    }, 0);
}

function getUncompletedColor(level, uncompletedLevels) {
    const missingPercentages = uncompletedLevels.map(getMissingPercentage);
    const minMissing = Math.min(...missingPercentages);
    const maxMissing = Math.max(...missingPercentages);
    const missingRange = maxMissing - minMissing;
    const progress = missingRange === 0
        ? 0
        : (getMissingPercentage(level) - minMissing) / missingRange;
    return interpolateHue(0, 330, progress);
}

function renderWinRate(label, winRate) {
    if (!winRate) {
        return "";
    }
    const unit = label === "Acc WR:" ? "%" : "";
    const videoUrl = typeof winRate.video === "string" ? winRate.video.trim() : "";
    const text = `${label} ${escapeHtml(winRate.value)}${unit} · ${escapeHtml(winRate.player)}`;

    if (videoUrl) {
        return `<button class="pill" type="button" data-run-video="${escapeHtml(videoUrl)}" aria-label="Watch ${escapeHtml(label)} video">${text}</button>`;
    }

    return `<span class="pill">${text}</span>`;
}

function renderPills(level) {
    const idPill = level.id
        ? `<button class="pill" data-copy="${escapeHtml(level.id)}">ID: ${escapeHtml(level.id)}</button>`
        : '<span class="pill">ID unknown</span>';
    const showcaseVideo = typeof level.showcaseVideo === "string"
        ? level.showcaseVideo.trim()
        : "";
    const showcaseVideoPill = showcaseVideo
        ? `<button class="pill" type="button" data-run-video="${escapeHtml(showcaseVideo)}" aria-label="Watch ${escapeHtml(level.name)} showcase video">Showcase</button>`
        : "";

    return idPill
        + showcaseVideoPill
        + renderWinRate("Acc WR:", level.accuracy)
        + renderWinRate("Death WR:", level.deaths);
}

function renderSegments(segments) {
    return segments.map(segment => {
        const videoUrl = !segment.missing && typeof segment.video === "string"
            ? segment.video.trim()
            : "";
        const hasVideo = videoUrl !== "";
        return `
        <div class="${segment.missing ? "missing-run" : ""}${hasVideo ? " video-run" : ""}" style="--c:${segment.missing ? "var(--missing)" : getPlayerColor(segment.player)}"${hasVideo
                ? ` data-run-video="${escapeHtml(videoUrl)}" role="button" tabindex="0" aria-label="Watch ${escapeHtml(segment.player)}'s run video"`
                : ""}>
            <b>${segment.missing ? "Missing run" : escapeHtml(segment.player)}</b>
            <span style="color:${segment.missing ? "var(--missing)" : getRangeColor(segment)}">${escapeHtml(formatSegment(segment))}</span>
        </div>`;
    }).join("");
}

function getThumbnailUrlSequence(image, levelID) {
    const urls = [];
    if (image) {
        urls.push(image);
    }
    if (levelID) {
        urls.push(`https://levelthumbs.prevter.me/thumbnail/${encodeURIComponent(levelID)}`);
    }
    return urls;
}

function renderCard(level, displayRank, benchmark, rankedLevels, uncompleted = false) {
    const cardKey = `${uncompleted ? "uncompleted-" : ""}${level.rank ?? level.id ?? level.name}`;
    const expandedClass = expandedRanks.has(cardKey) ? " open" : "";
    const difficultyColor = benchmark
        ? "#ae32d5"
        : uncompleted
            ? getUncompletedColor(level, rankedLevels)
            : getDifficultyColor(level, rankedLevels);
    const rankLabel = benchmark
        ? "Benchmark"
        : displayRank === null
            ? "Unranked"
            : `#${displayRank}`;
    const missingCount = level.segments.filter(segment => segment.missing).length;
    const thumbnailUrls = getThumbnailUrlSequence(level.image, level.id);
    const thumbnail = thumbnailUrls.length
        ? `<img class="thumb-img" src="${escapeHtml(thumbnailUrls[0])}" data-thumbnail-urls="${escapeHtml(JSON.stringify(thumbnailUrls))}" alt="" loading="lazy">`
        : "";
    const thumbnailContainer = thumbnail ? `<div class="th">${thumbnail}</div>` : "";

    return `
        <div class="card${expandedClass}${benchmark ? " benchmark-card" : ""}${uncompleted ? " uncompleted-card" : ""}" data-r="${cardKey}" style="--difficulty-color:${difficultyColor}">
            <div class="row">
                ${thumbnailContainer}
                <div class="rk${benchmark ? " benchmark-label" : ""}">${rankLabel}</div>
                <div class="bd">
                    <div class="nm">${escapeHtml(level.name)}</div>
                    <div class="mt">${uncompleted
            ? `<b class="run-count">${level.runCount}</b> relevant runs · <b class="missing-count">${missingCount}</b> missing runs`
            : `Completed in <b class="run-count">${level.runCount}</b> runs`}</div>
                </div>
                <div class="card-coverage">
                    ${renderRunBar(level.segments)}
                </div>
            </div>
            <div class="dt">
                <div class="ids">${renderPills(level)}</div>
                <div class="run-section-title runs-title">Runs</div>
                <div class="sg">${renderSegments(level.segments)}</div>
            </div>
        </div>`;
}

function filterLevels(levelList, searchTerm = searchTerms.main) {
    return levelList.filter(level => {
        const searchableText = [
            level.name,
            level.id,
            ...level.segments.map(segment => segment.player),
            level.accuracy ? `${level.accuracy.value} ${level.accuracy.player}` : "",
            level.deaths ? `${level.deaths.value} ${level.deaths.player}` : ""
        ].join(" ").toLowerCase();
        return !searchTerm || searchableText.includes(searchTerm);
    });
}

function sortLevels(filteredLevels) {
    const withOverlap = filteredLevels.map(level => ({
        level,
        overlap: getSegmentOverlap(level.segments)
    }));
    if (sortMode === "most") {
        return withOverlap.sort((first, second) =>
            second.level.runCount - first.level.runCount
            || second.overlap - first.overlap
            || first.level.rank - second.level.rank)
            .map(entry => entry.level);
    }
    if (sortMode === "fewest") {
        return withOverlap.sort((first, second) =>
            first.level.runCount - second.level.runCount
            || second.overlap - first.overlap
            || first.level.rank - second.level.rank)
            .map(entry => entry.level);
    }
    return filteredLevels;
}

function renderLevels() {
    const completedLevels = levels.filter(isCompletedLevel);
    const rankedLevels = completedLevels.filter(level => !isBenchmark(level))
        .sort((first, second) => first.rank - second.rank);
    const allLevels = [...completedLevels]
        .sort((first, second) => first.rank - second.rank);
    const displayRanks = new Map(rankedLevels.map((level, index) => [level, index + 1]));
    const visibleLevels = sortLevels(filterLevels(allLevels));

    elements.list.innerHTML = visibleLevels.length
        ? visibleLevels.map(level =>
            renderCard(
                level,
                displayRanks.get(level),
                isBenchmark(level),
                rankedLevels
            )).join("")
        : '<div class="empty">No completed levels match your search.</div>';
}

function renderUncompletedLevels() {
    const uncompletedLevels = levels.filter(isUncompletedLevel);
    const visibleLevels = sortLevels(
        filterLevels(uncompletedLevels, searchTerms.uncompleted));
    const missingRunCount = uncompletedLevels.reduce(
        (count, level) => count + level.segments.filter(segment => segment.missing).length,
        0
    );
    const cards = visibleLevels.map(level =>
        renderCard(level, level.rank, false, uncompletedLevels, true)).join("");

    elements.list.innerHTML = visibleLevels.length
        ? `<div class="uncompleted-heading">
                <h2>Uncompleted levels</h2>
                <p>${missingRunCount} missing runs across ${uncompletedLevels.length} levels. Missing ranges are runs still needed.</p>
            </div>${cards}`
        : '<div class="empty">No uncompleted levels match your search.</div>';
}

function renderView() {
    const isLeaderboardView = activeView === "leaderboards";
    const isUncompletedView = activeView === "uncompleted";
    elements.search.placeholder = isLeaderboardView
        ? "Search player"
        : isUncompletedView ? "Search uncompleted level or player" : "Search level, ID or player";
    elements.sortControl.hidden = isLeaderboardView;
    elements.navigation.querySelectorAll("[data-view]").forEach(button => {
        const isActive = button.dataset.view === activeView;
        button.classList.toggle("active", isActive);
        if (isActive) {
            button.setAttribute("aria-current", "page");
        } else {
            button.removeAttribute("aria-current");
        }
    });
    if (isLeaderboardView) {
        renderLeaderboards();
    } else if (isUncompletedView) {
        renderUncompletedLevels();
    } else {
        renderLevels();
    }
}

function handleNavigationClick(event) {
    const button = event.target.closest("[data-view]");
    if (!button || button.dataset.view === activeView) {
        return;
    }
    searchTerms[activeView] = elements.search.value.trim().toLowerCase();
    activeView = button.dataset.view;
    elements.search.value = searchTerms[activeView];
    renderView();
}

async function copyLevelId(button) {
    const originalText = button.textContent;
    try {
        await navigator.clipboard.writeText(button.dataset.copy);
        button.textContent = "Copied";
    } catch (error) {
        console.error("Unable to copy level ID:", error);
        button.textContent = "Copy failed";
    }
    setTimeout(() => {
        button.textContent = originalText;
    }, 1200);
}

function handleListClick(event) {
    const videoRun = event.target.closest("[data-run-video]");
    if (videoRun) {
        event.preventDefault();
        openVideoModal(videoRun.dataset.runVideo);
        return;
    }

    const playerToggle = event.target.closest("[data-player-toggle]");
    if (playerToggle) {
        const playerName = playerToggle.dataset.playerToggle;
        if (expandedPlayers.has(playerName)) {
            expandedPlayers.delete(playerName);
        } else {
            expandedPlayers.add(playerName);
        }
        renderLeaderboards();
        return;
    }

    const copyButton = event.target.closest("[data-copy]");
    if (copyButton) {
        copyLevelId(copyButton);
        return;
    }

    const card = event.target.closest(".card");
    if (!card || event.target.closest(".dt")) {
        return;
    }

    const rank = card.dataset.r;
    if (expandedRanks.has(rank)) {
        expandedRanks.delete(rank);
    } else {
        expandedRanks.add(rank);
    }
    card.classList.toggle("open");
}

function handleListKeydown(event) {
    const videoRun = event.target.closest("[data-run-video]");
    if (!videoRun
        || videoRun.tagName === "BUTTON"
        || (event.key !== "Enter" && event.key !== " ")) {
        return;
    }

    event.preventDefault();
    openVideoModal(videoRun.dataset.runVideo);
}

function openVideoModal(url) {
    const modal = document.getElementById("video-modal");
    const iframe = document.getElementById("video-modal-iframe");
    const embedUrl = window.getEmbedVideoUrl?.(url);
    if (!modal || !iframe) {
        return;
    }
    if (!embedUrl) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
    }

    iframe.src = embedUrl;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
}

function closeVideoModal() {
    const modal = document.getElementById("video-modal");
    const iframe = document.getElementById("video-modal-iframe");
    if (!modal || !iframe) {
        return;
    }

    modal.hidden = true;
    iframe.removeAttribute("src");
    document.body.style.overflow = "";
}

function bindVideoModalEvents() {
    document.addEventListener("click", event => {
        if (event.target.closest("[data-close-video-modal]")) {
            event.preventDefault();
            closeVideoModal();
        }
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeVideoModal();
        }
    });
}

function handleThumbnailError(event) {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.classList.contains("thumb-img")) {
        return;
    }

    const thumbnailUrls = JSON.parse(image.dataset.thumbnailUrls);
    const nextIndex = Number(image.dataset.thumbnailIndex || 0) + 1;
    if (nextIndex < thumbnailUrls.length) {
        image.dataset.thumbnailIndex = String(nextIndex);
        image.src = thumbnailUrls[nextIndex];
        return;
    }

    image.closest(".th").remove();
}

function bindEvents() {
    elements.search.addEventListener("input", event => {
        searchTerms[activeView] = event.target.value.trim().toLowerCase();
        renderView();
    });
    elements.sort.addEventListener("change", event => {
        sortMode = event.target.value;
        renderView();
    });
    elements.list.addEventListener("click", handleListClick);
    elements.list.addEventListener("keydown", handleListKeydown);
    elements.list.addEventListener("error", handleThumbnailError, true);
    elements.navigation.addEventListener("click", handleNavigationClick);
    bindVideoModalEvents();
}

function showLoadError(error) {
    console.error("Unable to load level data:", error);
    elements.list.innerHTML = '<div class="empty">Unable to load level data.</div>';
}

async function initialize() {
    levels = await loadLevels();
    initializePlayerColors();
    bindEvents();
    renderView();
}

initialize().catch(showLoadError);