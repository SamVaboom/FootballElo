/* Browser UI for tabs, season selection, active-team filtering, and records. */
(function (global) {
  let engine;
  let selectedSeason = 'all-time';
  let selectedRecordsSeason = 'all-time';
  let searchTerm = '';
  let activeOnly = false;

  async function initApp() {
    renderTabs();
    bindControls();
    showLoading('Loading local Champions League data…');
    runEloConsoleTests();

    engine = global.FootballElo.createEngine();
    try {
      const { seasons, summary } = await global.FootballSeasonLoader.loadAllSeasons();
      engine.processAllSeasons(seasons);
      renderSeasonDropdowns();
      setDefaultActiveOnly();
      renderRankingTable();
      renderRecords();
      console.info('Champions League Elo debug summary', { loader: summary, engine: engine.debugSummary });
    } catch (error) {
      console.error('Failed to initialize Elo app.', error);
      showLoading('Could not load local data. Serve the repo with a local static server; opening main.html via file:// may block fetch().');
    }
  }

  function bindControls() {
    document.getElementById('teamSearch').addEventListener('input', handleSearch);
    document.getElementById('seasonSelect').addEventListener('change', handleSeasonChange);
    document.getElementById('recordsSeasonSelect').addEventListener('change', handleRecordsSeasonChange);
    document.getElementById('activeOnly').addEventListener('change', (event) => {
      activeOnly = event.target.checked;
      renderRankingTable();
    });
  }

  function renderTabs() {
    document.querySelectorAll('.tab-button').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.remove('active'));
        document.querySelectorAll('.tab-button').forEach((btn) => btn.classList.remove('active'));
        button.classList.add('active');
        document.getElementById(button.dataset.tab).classList.add('active');
      });
    });
  }

  function renderSeasonDropdowns() {
    const seasons = engine.seasonSnapshots.map((snapshot) => snapshot.season).sort();
    const options = ['<option value="all-time">All Time</option>']
      .concat(seasons.map((season) => `<option value="${season}">${season}</option>`))
      .join('');
    const rankingSelect = document.getElementById('seasonSelect');
    const recordsSelect = document.getElementById('recordsSeasonSelect');
    rankingSelect.innerHTML = options;
    recordsSelect.innerHTML = options;
    rankingSelect.value = selectedSeason;
    recordsSelect.value = selectedRecordsSeason;
  }

  function renderSeasonDropdown() {
    renderSeasonDropdowns();
  }

  function setDefaultActiveOnly() {
    activeOnly = selectedSeason !== 'all-time';
    document.getElementById('activeOnly').checked = activeOnly;
  }

  function handleSeasonChange(event) {
    selectedSeason = event.target.value;
    setDefaultActiveOnly();
    updateChangeColumnLabel();
    renderRankingTable();
  }

  function handleRecordsSeasonChange(event) {
    selectedRecordsSeason = event.target.value;
    renderRecords();
  }

  function handleSearch(event) {
    searchTerm = event.target.value.toLowerCase();
    renderRankingTable();
  }

  function renderRankingTable() {
    if (!engine) return;
    const tbody = document.getElementById('rankingBody');
    const caption = document.getElementById('rankingCaption');
    const snapshot = getSelectedSnapshot();
    const rows = (snapshot.rankings || [])
      .filter((row) => (activeOnly ? row.active : true))
      .filter((row) => row.team.toLowerCase().includes(searchTerm));

    caption.textContent = selectedSeason === 'all-time'
      ? `All-time ratings after ${engine.debugSummary?.matchesLoaded || 0} matches from ${engine.debugSummary?.firstSeasonLoaded || ''} to ${engine.debugSummary?.lastSeasonLoaded || ''}.`
      : `Historical Elo state after the ${selectedSeason} season. Season stats shown are for ${selectedSeason} only.`;

    tbody.innerHTML = rows.map((row, index) => `
      <tr class="${index < 3 ? `podium podium-${index + 1}` : ''}">
        <td>${row.rank}</td>
        <td class="team-cell"><span>${escapeHtml(row.team)}</span>${stageBadge(row)}</td>
        <td class="elo">${round(row.elo)}</td>
        <td class="${row.seasonChange >= 0 ? 'positive' : 'negative'}">${formatChange(row.seasonChange)}</td>
        <td>${row.matches}</td>
        <td>${row.wins}</td>
        <td>${row.draws}</td>
        <td>${row.losses}</td>
        <td>${row.goalsFor}</td>
        <td>${row.goalsAgainst}</td>
        <td class="${row.goalDifference >= 0 ? 'positive' : 'negative'}">${formatGoalDiff(row.goalDifference)}</td>
        <td>${round(row.highestEloThisSeason)}</td>
        <td>${global.FootballRecords.labelStage(row.stageReached || (row.active ? 'group' : 'not active'))}</td>
      </tr>
    `).join('') || '<tr><td colspan="13" class="empty">No teams match your filters.</td></tr>';
  }

  function updateChangeColumnLabel() {
    const table = document.querySelector('.ranking-table');
    const heading = table?.querySelector('thead th:nth-child(4)');
    if (heading) heading.textContent = selectedSeason === 'all-time' ? 'Total Elo Change' : 'Elo Change This Season';
  }

  function renderRecords() {
    const records = global.FootballRecords.calculateAllRecords(engine, selectedRecordsSeason);
    const grid = document.getElementById('recordsGrid');
    const caption = document.getElementById('recordsCaption');
    caption.textContent = selectedRecordsSeason === 'all-time'
      ? 'Calculated from the full historical Elo timeline.'
      : `Calculated only from Elo events during the ${selectedRecordsSeason} season.`;
    grid.innerHTML = records.map((record) => `
      <article class="record-card">
        <p class="record-title">${escapeHtml(record.title)}</p>
        <h3>${escapeHtml(record.team)}</h3>
        <p class="record-value">${escapeHtml(record.value)}</p>
        <p class="record-detail">${escapeHtml(record.detail)}</p>
      </article>
    `).join('');
  }

  function getSelectedSnapshot() {
    if (selectedSeason === 'all-time') return engine.getAllTimeSnapshot();
    return engine.getSeasonSnapshot(selectedSeason) || { season: selectedSeason, rankings: [] };
  }

  function stageBadge(row) {
    const label = row.isChampion ? 'Champion' : global.FootballRecords.labelStage(row.stageReached || (row.active ? 'group' : 'not active'));
    const slug = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `<span class="badge ${slug}">${label}</span>`;
  }

  function showLoading(message) {
    document.getElementById('rankingCaption').textContent = message;
    document.getElementById('rankingBody').innerHTML = `<tr><td colspan="13" class="empty">${escapeHtml(message)}</td></tr>`;
  }

  function formatChange(value) { return `${value >= 0 ? '+' : ''}${Number(value || 0).toFixed(1)}`; }
  function formatGoalDiff(value) { return `${value >= 0 ? '+' : ''}${value}`; }
  function round(value) { return Math.round(value || 0).toLocaleString(); }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
  }

  function runEloConsoleTests() {
    const testEngine = global.FootballElo.createEngine();
    const equal = testEngine.calculateMatchEloChange({ homeGoals: 1, awayGoals: 0, roundKey: 'group', stageType: 'group' }, 1000, 1000);
    const equalDraw = testEngine.calculateMatchEloChange({ homeGoals: 1, awayGoals: 1, roundKey: 'group', stageType: 'group' }, 1000, 1000);
    const favorite = testEngine.calculateMatchEloChange({ homeGoals: 1, awayGoals: 0, roundKey: 'group', stageType: 'group' }, 1700, 700);
    const underdog = testEngine.calculateMatchEloChange({ homeGoals: 1, awayGoals: 0, roundKey: 'group', stageType: 'group' }, 700, 1700);
    const fourGoal = testEngine.calculateMatchEloChange({ homeGoals: 4, awayGoals: 0, roundKey: 'group', stageType: 'group' }, 1000, 1000);

    console.group('Football Elo validation checks');
    console.assert(equal.homeChange >= 15.5 && equal.homeChange <= 16.5, '1000 vs 1000 group 1-goal win should be about +16', equal.homeChange);
    console.assert(Math.abs(equalDraw.homeChange) < 0.0001, '1000 vs 1000 draw should be 0', equalDraw.homeChange);
    console.assert(favorite.homeChange < 0.2, '1700 beating 700 should gain very little', favorite.homeChange);
    console.assert(underdog.homeChange > 31, '700 beating 1700 should be massive', underdog.homeChange);
    console.assert(fourGoal.homeChange > equal.homeChange && fourGoal.homeChange < 40, '4-goal equal-team win should gain more but not explode', fourGoal.homeChange);
    console.assert(testEngine.getInitialEloForEntryStage('qualifying') === 1000, 'Qualifying initial Elo is 1000');
    console.assert(testEngine.getInitialEloForEntryStage('group') === 1000, 'Main competition initial Elo is 1000');
    console.assert(testEngine.getInitialEloForEntryStage('final') === 1000, 'Final-stage initial Elo is 1000');
    testEngine.initializeTeam('Test FC', '2024-25', 'group');
    console.assert(testEngine.teams.get('Test FC').startingElo === 1000, 'New team starts at 1000, not 800 or 1500');
    testEngine.applyRoundBonus('2024-25', 'Test FC', 'roundOf16');
    testEngine.applyRoundBonus('2024-25', 'Test FC', 'roundOf16');
    console.assert(testEngine.teams.get('Test FC').currentElo === 1020, 'Round bonus applies +20 only once');
    testEngine.applyFinalWinBonus('2024-25', 'Test FC');
    console.assert(testEngine.teams.get('Test FC').currentElo === 1070, 'Final winner receives +50 after match Elo update path');
    const recordsEngine = global.FootballElo.createEngine();
    recordsEngine.initializeTeam('Alpha', '2024-25', 'group');
    recordsEngine.initializeTeam('Beta', '2024-25', 'qualifying');
    recordsEngine.processSeason({ season: '2024-25', matches: [{ season: '2024-25', date: '2025-05-31', order: 1, round: 'Final', roundKey: 'final', stageType: 'final', homeTeam: 'Alpha', awayTeam: 'Beta', homeGoals: 1, awayGoals: 0 }], participantsByRound: {}, advancements: [] });
    const allRecords = global.FootballRecords.calculateAllRecords(recordsEngine, 'all-time');
    const seasonRecords = global.FootballRecords.calculateAllRecords(recordsEngine, '2024-25');
    console.assert(allRecords.length > 0 && seasonRecords.length > 0, 'Records tab calculates All Time and specific season records');
    console.assert(allRecords.concat(seasonRecords).every((record) => !/undefined|null|NaN/.test(Object.values(record).join(' '))), 'No records card displays undefined/null/NaN');
    console.groupEnd();
  }

  global.FootballEloUI = {
    initApp,
    renderTabs,
    renderSeasonDropdown,
    renderSeasonDropdowns,
    renderRankingTable,
    renderRecords,
    renderActiveTeamsToggle: setDefaultActiveOnly,
    handleSearch,
    handleSeasonChange,
    handleRecordsSeasonChange,
  };

  document.addEventListener('DOMContentLoaded', initApp);
})(typeof window !== 'undefined' ? window : globalThis);
