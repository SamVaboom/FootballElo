/* Records and stats are calculated from engine history/snapshots, not UI state. */
(function (global) {
  const ALL_TIME = 'all-time';
  const fmt = (value) => Number.isFinite(Number(value)) ? Math.round(Number(value)).toLocaleString() : '—';
  const signed = (value) => Number.isFinite(Number(value)) ? `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(1)}` : '—';

  function calculateAllRecords(engine, selectedSeason = ALL_TIME) {
    const scope = createScope(engine, selectedSeason);
    return [
      calculateHighestEloAllTime(engine, scope),
      calculateHighestEndSeasonElo(engine, scope),
      calculateBiggestSingleMatchGain(engine, scope),
      calculateBiggestSingleMatchLoss(engine, scope),
      calculateBiggestUnderdogWin(engine, scope),
      calculateBiggestFavoriteUpsetLoss(engine, scope),
      calculateMostPointsGainedInSeason(engine, scope),
      calculateMostPointsLostInSeason(engine, scope),
      calculateBestChampionsLeagueCampaignByEloGain(engine, scope),
      calculateWorstChampionsLeagueCampaignByEloLoss(engine, scope),
      calculateLongestStreakAbove1800(engine, scope),
      calculateMostSeasonsFinishingNumberOne(engine, scope),
      calculateMostPersonalPeakEvents(engine, scope),
      calculateBiggestFinalWinEloSwing(engine, scope),
      calculateChampionWithLowestEloBeforeFinal(engine, scope),
      calculateHighestRatedNonChampion(engine, scope),
      calculateLowestRatedGroupStageTeam(engine, scope),
      calculateLowestRatedKnockoutTeam(engine, scope),
      calculateMostVolatileTeam(engine, scope),
      calculateMostStableEliteTeam(engine, scope),
    ].map(sanitizeCard);
  }

  function createScope(engine, selectedSeason = ALL_TIME) {
    const isAllTime = selectedSeason === ALL_TIME;
    const snapshots = isAllTime ? engine.seasonSnapshots : engine.seasonSnapshots.filter((snapshot) => snapshot.season === selectedSeason);
    const history = isAllTime ? engine.history : engine.history.filter((entry) => entry.season === selectedSeason);
    const matchHistory = isAllTime ? engine.matchHistory : engine.matchHistory.filter((match) => match.season === selectedSeason);
    return {
      selectedSeason,
      isAllTime,
      history,
      matchHistory,
      snapshots,
      seasonRows: snapshots.flatMap((snapshot) => snapshot.rankings.map((row) => ({ ...row, season: snapshot.season }))),
      matchEntries: history.filter((entry) => entry.reason === 'match'),
      labelPrefix: isAllTime ? 'All Time' : selectedSeason,
      detailSuffix: isAllTime ? 'full historical timeline' : `${selectedSeason} season`,
    };
  }

  function calculateHighestEloAllTime(engine, scope = createScope(engine)) {
    const entry = maxBy(scope.history.filter((h) => h.reason !== 'personal_peak'), 'newElo');
    if (!entry) return noData('Highest Elo of all time', scope, 'No Elo events are available for this selection.');
    return card(scope.isAllTime ? 'Highest Elo of all time' : 'Highest Elo this season', entry.team, `${fmt(entry.newElo)} Elo`, `${entry.season} ${entry.date || ''} · ${entry.reasonLabel || entry.reason} · ${entry.round || ''}`);
  }

  function calculateHighestEndSeasonElo(engine, scope = createScope(engine)) {
    const row = maxBy(scope.seasonRows, 'elo');
    if (!row) return noData('Highest Elo at end of a season', scope, 'No end-of-season snapshot is available for this selection.');
    return card(scope.isAllTime ? 'Highest Elo at end of a season' : 'Highest Elo at end of selected season', row.team, `${fmt(row.elo)} Elo`, `${row.season} · finished #${row.rank}`);
  }

  function calculateBiggestSingleMatchGain(engine, scope = createScope(engine)) {
    const entry = maxBy(scope.matchEntries, 'change');
    if (!entry) return noData('Biggest single-match Elo gain', scope, 'No match Elo gains are available for this selection.');
    return card('Biggest single-match Elo gain', entry.team, signed(entry.change), `${entry.season} ${entry.date || ''} vs ${entry.opponent}, ${entry.score} · ${entry.round} · ${fmt(entry.oldElo)} → ${fmt(entry.newElo)}`);
  }

  function calculateBiggestSingleMatchLoss(engine, scope = createScope(engine)) {
    const entry = minBy(scope.matchEntries, 'change');
    if (!entry) return noData('Biggest single-match Elo loss', scope, 'No match Elo losses are available for this selection.');
    return card('Biggest single-match Elo loss', entry.team, signed(entry.change), `${entry.season} ${entry.date || ''} vs ${entry.opponent}, ${entry.score} · ${entry.round} · ${fmt(entry.oldElo)} → ${fmt(entry.newElo)}`);
  }

  function calculateBiggestUnderdogWin(engine, scope = createScope(engine)) {
    const wins = scope.matchHistory.map((m) => underdogWinRecord(m)).filter(Boolean);
    const record = maxBy(wins, 'eloDifference');
    if (!record) return noData('Biggest underdog win', scope, 'No underdog wins are available for this selection.');
    return card('Biggest underdog win', record.winner, `${fmt(record.eloDifference)} Elo gap`, `${record.season} ${record.date || ''}: beat ${record.loser} ${record.score} · ${fmt(record.winnerOld)} vs ${fmt(record.loserOld)} before kickoff`);
  }

  function calculateBiggestFavoriteUpsetLoss(engine, scope = createScope(engine)) {
    const wins = scope.matchHistory.map((m) => underdogWinRecord(m)).filter(Boolean);
    const record = maxBy(wins, 'eloDifference');
    if (!record) return noData('Biggest favorite upset loss', scope, 'No favorite upset losses are available for this selection.');
    return card('Biggest favorite upset loss', record.loser, `Lost as ${fmt(record.eloDifference)}-point favorite`, `${record.season} ${record.date || ''} vs ${record.winner}, ${record.score} · ${record.round}`);
  }

  function calculateMostPointsGainedInSeason(engine, scope = createScope(engine)) {
    const row = maxBy(activeSeasonRows(scope), 'seasonChange');
    if (!row) return noData('Most Elo gained in a single season', scope, 'No active teams are available for this selection.');
    return card('Most Elo gained in a single season', row.team, signed(row.seasonChange), `${row.season}: ${fmt(row.seasonStartElo)} → ${fmt(row.seasonEndElo)}`);
  }

  function calculateMostPointsLostInSeason(engine, scope = createScope(engine)) {
    const row = minBy(activeSeasonRows(scope), 'seasonChange');
    if (!row) return noData('Most Elo lost in a single season', scope, 'No active teams are available for this selection.');
    return card('Most Elo lost in a single season', row.team, signed(row.seasonChange), `${row.season}: ${fmt(row.seasonStartElo)} → ${fmt(row.seasonEndElo)}`);
  }

  function calculateBestChampionsLeagueCampaignByEloGain(engine, scope = createScope(engine)) {
    const row = maxBy(activeSeasonRows(scope), 'seasonChange');
    if (!row) return noData('Best campaign by Elo gain', scope, 'No campaign rows are available for this selection.');
    return card('Best campaign by Elo gain', row.team, signed(row.seasonChange), `${row.season} · ${labelStage(row.stageReached)} · ${row.matches} matches`);
  }

  function calculateWorstChampionsLeagueCampaignByEloLoss(engine, scope = createScope(engine)) {
    const row = minBy(activeSeasonRows(scope), 'seasonChange');
    if (!row) return noData('Worst campaign by Elo loss', scope, 'No campaign rows are available for this selection.');
    return card('Worst campaign by Elo loss', row.team, signed(row.seasonChange), `${row.season} · ${labelStage(row.stageReached)} · ${row.matches} matches`);
  }

  function calculateLongestStreakAbove1800(engine, scope = createScope(engine)) {
    const entriesByTeam = groupBy(scope.matchEntries, 'team');
    let best = null;
    Object.entries(entriesByTeam).forEach(([team, entries]) => {
      let current = 0;
      entries.forEach((entry) => {
        current = entry.newElo >= 1800 ? current + 1 : 0;
        if (!best || current > best.count) best = { team, count: current };
      });
    });
    if (!best || best.count === 0) return noData('Longest streak above 1800 Elo', scope, 'No team stayed above 1800 Elo after a match in this selection.');
    return card('Longest streak above 1800 Elo', best.team, `${best.count} rating events`, `Counted after match updates in the ${scope.detailSuffix}.`);
  }

  function calculateMostSeasonsFinishingNumberOne(engine, scope = createScope(engine)) {
    const counts = {};
    scope.snapshots.forEach((s) => {
      const top = s.rankings[0];
      if (top) counts[top.team] = (counts[top.team] || 0) + 1;
    });
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (!best) return noData('Most seasons finishing #1', scope, 'No season snapshots are available for this selection.');
    return card('Most seasons finishing #1', best[0], `${best[1]} ${best[1] === 1 ? 'season' : 'seasons'}`, `Based on end-of-season snapshots in the ${scope.detailSuffix}.`);
  }

  function calculateMostPersonalPeakEvents(engine, scope = createScope(engine)) {
    const peaksByTeam = groupBy(scope.history.filter((h) => h.reason === 'personal_peak'), 'team');
    const rows = Object.entries(peaksByTeam).map(([team, entries]) => ({
      team,
      peaks: entries.length,
      highest: maxBy(entries, 'newElo')?.newElo,
      season: maxBy(entries, 'newElo')?.season,
    }));
    const row = maxBy(rows, 'peaks');
    if (!row) return noData('Most new personal peak Elo events', scope, 'No new personal peak events are available for this selection.');
    return card('Most new personal peak Elo events', row.team, `${row.peaks} peaks`, `Highest peak: ${fmt(row.highest)} in ${row.season}`);
  }

  function calculateBiggestFinalWinEloSwing(engine, scope = createScope(engine)) {
    const finalWins = scope.matchEntries.filter((e) => /final/i.test(e.round) && e.matchResult === 'W');
    const entry = maxBy(finalWins, 'change');
    if (!entry) return noData('Biggest final win Elo swing', scope, 'No winning final match Elo swing is available for this selection.');
    return card('Biggest final win Elo swing', entry.team, signed(entry.change), `${entry.season} ${entry.date || ''} vs ${entry.opponent}, ${entry.score} · before title bonus`);
  }

  function calculateChampionWithLowestEloBeforeFinal(engine, scope = createScope(engine)) {
    const finals = scope.matchHistory.filter((m) => /final/i.test(m.round));
    const winners = finals.map((m) => {
      const winner = m.penaltyWinner || (m.homeGoals > m.awayGoals ? m.homeTeam : m.awayTeam);
      if (!winner) return null;
      const homeWon = winner === m.homeTeam;
      return {
        team: winner,
        opponent: homeWon ? m.awayTeam : m.homeTeam,
        oldElo: homeWon ? m.homeOldElo : m.awayOldElo,
        score: m.score,
        season: m.season,
        date: m.date,
      };
    }).filter(Boolean);
    const row = minBy(winners, 'oldElo');
    if (!row) return noData('Champion with lowest Elo before final', scope, 'No champion final is available for this selection.');
    return card('Champion with lowest Elo before final', row.team, `${fmt(row.oldElo)} pre-final Elo`, `${row.season} vs ${row.opponent}, ${row.score}`);
  }

  function calculateHighestRatedNonChampion(engine, scope = createScope(engine)) {
    const rows = activeSeasonRows(scope).filter((r) => !r.isChampion);
    const row = maxBy(rows, 'highestEloThisSeason');
    if (!row) return noData('Highest-rated team that did not win', scope, 'No non-champion active team is available for this selection.');
    return card('Highest-rated team that did not win', row.team, `${fmt(row.highestEloThisSeason)} peak Elo`, `${row.season} · eliminated/reached: ${labelStage(row.stageReached)}`);
  }

  function calculateLowestRatedGroupStageTeam(engine, scope = createScope(engine)) {
    const groupEntries = scope.matchEntries.filter((h) => ['Group', 'League Phase'].some((term) => (h.round || '').includes(term)));
    const entry = minBy(groupEntries, 'oldElo');
    if (!entry) return noData('Lowest-rated team to reach group/league stage', scope, 'No group or league-phase match entries are available for this selection.');
    return card('Lowest-rated team to reach group/league stage', entry.team, `${fmt(entry.oldElo)} Elo`, `${entry.season} · ${entry.round}`);
  }

  function calculateLowestRatedKnockoutTeam(engine, scope = createScope(engine)) {
    const entries = scope.history.filter((h) => h.reason === 'round_bonus' && h.roundKey === 'roundOf16');
    const entry = minBy(entries, 'oldElo');
    if (!entry) return noData('Lowest-rated team to reach knockout stage', scope, 'No Round of 16 advancement bonus entries are available for this selection.');
    return card('Lowest-rated team to reach knockout stage', entry.team, `${fmt(entry.oldElo)} Elo`, `${entry.season} before Round of 16 bonus`);
  }

  function calculateMostVolatileTeam(engine, scope = createScope(engine)) {
    const minMatches = scope.isAllTime ? 5 : 2;
    const rows = Object.entries(groupBy(scope.matchEntries, 'team')).map(([team, entries]) => ({
      team,
      avg: entries.reduce((sum, entry) => sum + Math.abs(entry.change), 0) / entries.length,
      matches: entries.length,
    })).filter((row) => row.matches >= minMatches);
    const row = maxBy(rows, 'avg');
    if (!row) return noData('Most volatile team', scope, `No team has the ${minMatches}-match minimum for this selection.`);
    return card('Most volatile team', row.team, `${row.avg.toFixed(1)} avg |Δ|`, `${row.matches} matches minimum-filtered in the ${scope.detailSuffix}.`);
  }

  function calculateMostStableEliteTeam(engine, scope = createScope(engine)) {
    const minMatches = scope.isAllTime ? 5 : 2;
    const volatility = Object.entries(groupBy(scope.matchEntries, 'team')).map(([team, entries]) => ({
      team,
      avg: entries.reduce((sum, entry) => sum + Math.abs(entry.change), 0) / entries.length,
      matches: entries.length,
    }));
    const peakByTeam = new Map(scope.seasonRows.map((row) => [row.team, Math.max(row.highestEloThisSeason || 0, row.elo || 0)]));
    const eligible = volatility
      .map((row) => ({ ...row, elo: peakByTeam.get(row.team) || 0 }))
      .filter((row) => row.matches >= minMatches && row.elo >= 1700);
    const row = minBy(eligible, 'avg');
    if (!row) return noData('Most stable elite team', scope, `No 1700+ Elo team has the ${minMatches}-match minimum for this selection.`);
    return card('Most stable elite team', row.team, `${row.avg.toFixed(1)} avg |Δ|`, `${fmt(row.elo)} peak Elo across ${row.matches} matches in the ${scope.detailSuffix}.`);
  }

  function activeSeasonRows(scope) {
    return scope.seasonRows.filter((r) => r.active);
  }

  function card(title, team, value, detail) {
    return { title, team, value, detail };
  }

  function noData(title, scope, explanation) {
    return card(title, 'No data', scope.labelPrefix, explanation);
  }

  function sanitizeCard(record) {
    const clean = {};
    ['title', 'team', 'value', 'detail'].forEach((key) => {
      const value = record?.[key];
      clean[key] = value === undefined || value === null || /\b(undefined|null|NaN)\b/i.test(String(value)) ? 'No data' : String(value);
    });
    return clean;
  }

  function matchEntries(engine) {
    return engine.history.filter((h) => h.reason === 'match');
  }

  function seasonRows(engine) {
    return engine.seasonSnapshots.flatMap((snapshot) => snapshot.rankings.map((row) => ({ ...row, season: snapshot.season })));
  }

  function underdogWinRecord(m) {
    const homeWon = m.homeGoals > m.awayGoals;
    const awayWon = m.awayGoals > m.homeGoals;
    if (!homeWon && !awayWon) return null;
    const winnerOld = homeWon ? m.homeOldElo : m.awayOldElo;
    const loserOld = homeWon ? m.awayOldElo : m.homeOldElo;
    if (winnerOld >= loserOld) return null;
    return {
      winner: homeWon ? m.homeTeam : m.awayTeam,
      loser: homeWon ? m.awayTeam : m.homeTeam,
      winnerOld,
      loserOld,
      eloDifference: loserOld - winnerOld,
      score: m.score,
      date: m.date,
      round: m.round,
      season: m.season,
    };
  }

  function groupBy(items, key) {
    return items.reduce((groups, item) => {
      const groupKey = item[key];
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(item);
      return groups;
    }, {});
  }

  function maxBy(items, key) {
    return items.reduce((best, item) => (!best || Number(item[key]) > Number(best[key]) ? item : best), null);
  }

  function minBy(items, key) {
    return items.reduce((best, item) => (!best || Number(item[key]) < Number(best[key]) ? item : best), null);
  }

  function labelStage(stage) {
    return {
      champion: 'Champion', final: 'Finalist', semiFinal: 'Semi-finalist', quarterFinal: 'Quarter-finalist', roundOf16: 'Round of 16', league: 'League Phase', group: 'Group Stage', qualifying: 'Qualifying', 'not active': 'Not active', null: 'No stage', undefined: 'No stage',
    }[stage] || stage;
  }

  global.FootballRecords = {
    calculateAllRecords,
    calculateHighestEloAllTime,
    calculateHighestEndSeasonElo,
    calculateBiggestSingleMatchGain,
    calculateBiggestSingleMatchLoss,
    calculateBiggestUnderdogWin,
    calculateBiggestFavoriteUpsetLoss,
    calculateMostPointsGainedInSeason,
    calculateMostPointsLostInSeason,
    calculateBestChampionsLeagueCampaignByEloGain,
    calculateWorstChampionsLeagueCampaignByEloLoss,
    calculateLongestStreakAbove1800,
    calculateMostSeasonsFinishingNumberOne,
    calculateMostPersonalPeakEvents,
    calculateBiggestFinalWinEloSwing,
    calculateChampionWithLowestEloBeforeFinal,
    calculateHighestRatedNonChampion,
    calculateLowestRatedGroupStageTeam,
    calculateLowestRatedKnockoutTeam,
    calculateMostVolatileTeam,
    calculateMostStableEliteTeam,
    labelStage,
  };
})(window);
