(function (global) {
  let engine;
  let selectedSeason = 'current';
  let activeOnly = true;
  let searchTerm = '';

  function initApp() {
    engine = global.FootballElo.createEngine();
    engine.processAllSeasons(global.ChampionsLeagueSampleData);
    global.__footballEloEngine = engine;

    renderTabs();
    renderSeasonDropdown();
    renderRankingTable();
    renderRecords();
    runEloConsoleTests();
  }

  function renderTabs() {
    document.querySelectorAll('.tab-button').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.tab-button').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.remove('active'));
        button.classList.add('active');
        document.getElementById(button.dataset.tab).classList.add('active');
      });
    });

    document.getElementById('teamSearch').addEventListener('input', handleSearch);
    document.getElementById('seasonSelect').addEventListener('change', handleSeasonChange);
    document.getElementById('activeOnly').addEventListener('change', (event) => {
      activeOnly = event.target.checked;
      renderRankingTable();
    });
  }

  function renderSeasonDropdown() {
    const select = document.getElementById('seasonSelect');
    const seasons = engine.seasonSnapshots.map((snapshot) => snapshot.season).sort().reverse();
    select.innerHTML = ['<option value="current">Current / Latest</option>']
      .concat(seasons.map((season) => `<option value="${season}">${season}</option>`))
      .join('');
  }

  function handleSeasonChange(event) {
    selectedSeason = event.target.value;
    renderRankingTable();
  }

  function handleSearch(event) {
    searchTerm = event.target.value.toLowerCase();
    renderRankingTable();
  }

  function renderRankingTable() {
    const tbody = document.getElementById('rankingBody');
    const caption = document.getElementById('rankingCaption');
    const snapshot = getSelectedSnapshot();
    const rows = snapshot.rankings
      .filter((row) => (activeOnly ? row.active : true))
      .filter((row) => row.team.toLowerCase().includes(searchTerm));

    caption.textContent = selectedSeason === 'current'
      ? 'Latest ratings after all sample seasons'
      : `Ratings after the ${selectedSeason} season`;

    tbody.innerHTML = rows.map((row, index) => `
      <tr class="${index < 3 ? `podium podium-${index + 1}` : ''}">
        <td>${row.rank}</td>
        <td class="team-cell"><span>${row.team}</span>${stageBadge(row)}</td>
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
        <td>${global.FootballRecords.labelStage(row.stageReached)}</td>
      </tr>
    `).join('') || '<tr><td colspan="13" class="empty">No teams match your filters.</td></tr>';
  }

  function renderRecords() {
    const records = global.FootballRecords.calculateAllRecords(engine);
    const grid = document.getElementById('recordsGrid');
    grid.innerHTML = records.map((record) => `
      <article class="record-card">
        <p class="record-title">${record.title}</p>
        <h3>${record.team}</h3>
        <p class="record-value">${record.value}</p>
        <p class="record-detail">${record.detail}</p>
      </article>
    `).join('');
  }

  function getSelectedSnapshot() {
    if (selectedSeason !== 'current') return engine.seasonSnapshots.find((s) => s.season === selectedSeason);
    const latest = engine.seasonSnapshots[engine.seasonSnapshots.length - 1];
    return { ...latest, rankings: engine.getSeasonSnapshot(latest.season).rankings };
  }

  function stageBadge(row) {
    const label = row.isChampion ? 'Champion' : global.FootballRecords.labelStage(row.stageReached);
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `<span class="badge ${slug}">${label}</span>`;
  }

  function formatChange(value) {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
  }

  function formatGoalDiff(value) {
    return `${value >= 0 ? '+' : ''}${value}`;
  }

  function round(value) {
    return Math.round(value).toLocaleString();
  }

  function runEloConsoleTests() {
    const testEngine = global.FootballElo.createEngine();
    const equal = testEngine.calculateMatchEloChange({ homeGoals: 1, awayGoals: 0, round: 'Group Stage', stageType: 'group' }, 1500, 1500);
    const favorite = testEngine.calculateMatchEloChange({ homeGoals: 1, awayGoals: 0, round: 'Group Stage', stageType: 'group' }, 2000, 850);
    const underdog = testEngine.calculateMatchEloChange({ homeGoals: 1, awayGoals: 0, round: 'Group Stage', stageType: 'group' }, 850, 2000);
    const draw = testEngine.calculateMatchEloChange({ homeGoals: 1, awayGoals: 1, round: 'Group Stage', stageType: 'group' }, 850, 2000);

    console.group('Football Elo validation checks');
    console.assert(equal.homeChange >= 5 && equal.homeChange <= 12.5, 'Equal-team win should be moderate', equal.homeChange);
    console.assert(favorite.homeChange < 1, 'Huge favorite win should gain very little', favorite.homeChange);
    console.assert(underdog.homeChange > 23, 'Huge underdog win should be massive', underdog.homeChange);
    console.assert(draw.homeChange > 10, 'Huge underdog draw should gain meaningfully', draw.homeChange);
    console.assert(testEngine.getInitialEloForEntryStage('qualifying') === 800, 'Qualifying initial Elo is 800');
    console.assert(testEngine.getInitialEloForEntryStage('group') === 1500, 'Group initial Elo is 1500');

    testEngine.initializeTeam('Test FC', '2024-25', 'group');
    testEngine.applyRoundBonus('2024-25', 'Test FC', 'roundOf16');
    testEngine.applyRoundBonus('2024-25', 'Test FC', 'roundOf16');
    console.assert(testEngine.teams.get('Test FC').currentElo === 1550, 'Round bonus applies only once');
    testEngine.applyFinalWinBonus('2024-25', 'Test FC');
    console.assert(testEngine.teams.get('Test FC').currentElo === 1750, 'Final winner receives +200 after match Elo update path');
    console.groupEnd();
  }

  global.FootballEloUI = {
    initApp,
    renderTabs,
    renderSeasonDropdown,
    renderRankingTable,
    renderRecords,
    handleSearch,
    handleSeasonChange,
  };

  document.addEventListener('DOMContentLoaded', initApp);
})(window);
