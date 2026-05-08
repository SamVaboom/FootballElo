/* Records and stats are calculated from engine history/snapshots, not UI state. */
(function (global) {
  const fmt = (value) => Math.round(value).toLocaleString();
  const signed = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;

  function calculateAllRecords(engine) {
    return [
      calculateHighestEloAllTime(engine),
      calculateHighestEndSeasonElo(engine),
      calculateBiggestSingleMatchGain(engine),
      calculateBiggestSingleMatchLoss(engine),
      calculateBiggestUnderdogWin(engine),
      calculateBiggestFavoriteUpsetLoss(engine),
      calculateMostPointsGainedInSeason(engine),
      calculateMostPointsLostInSeason(engine),
      calculateBestChampionsLeagueCampaignByEloGain(engine),
      calculateWorstChampionsLeagueCampaignByEloLoss(engine),
      calculateLongestStreakAbove1800(engine),
      calculateMostSeasonsFinishingNumberOne(engine),
      calculateMostPersonalPeakEvents(engine),
      calculateBiggestFinalWinEloSwing(engine),
      calculateChampionWithLowestEloBeforeFinal(engine),
      calculateHighestRatedNonChampion(engine),
      calculateLowestRatedGroupStageTeam(engine),
      calculateLowestRatedKnockoutTeam(engine),
      calculateMostVolatileTeam(engine),
      calculateMostStableEliteTeam(engine),
    ].filter(Boolean);
  }

  function calculateHighestEloAllTime(engine) {
    const entry = maxBy(engine.history.filter((h) => h.reason !== 'personal_peak'), 'newElo');
    return entry && card('Highest Elo of all time', entry.team, `${fmt(entry.newElo)} Elo`, `${entry.season} ${entry.date || ''} · ${entry.reasonLabel || entry.reason} · ${entry.round || ''}`);
  }

  function calculateHighestEndSeasonElo(engine) {
    const rows = engine.seasonSnapshots.flatMap((snapshot) => snapshot.rankings.map((row) => ({ ...row, season: snapshot.season })));
    const row = maxBy(rows, 'elo');
    return row && card('Highest Elo at end of a season', row.team, `${fmt(row.elo)} Elo`, `${row.season} · finished #${row.rank}`);
  }

  function calculateBiggestSingleMatchGain(engine) {
    const entry = maxBy(matchEntries(engine), 'change');
    return entry && card('Biggest single-match Elo gain', entry.team, signed(entry.change), `${entry.date} vs ${entry.opponent}, ${entry.score} · ${entry.round} · ${fmt(entry.oldElo)} → ${fmt(entry.newElo)}`);
  }

  function calculateBiggestSingleMatchLoss(engine) {
    const entry = minBy(matchEntries(engine), 'change');
    return entry && card('Biggest single-match Elo loss', entry.team, signed(entry.change), `${entry.date} vs ${entry.opponent}, ${entry.score} · ${entry.round} · ${fmt(entry.oldElo)} → ${fmt(entry.newElo)}`);
  }

  function calculateBiggestUnderdogWin(engine) {
    const wins = engine.matchHistory.map((m) => underdogWinRecord(m)).filter(Boolean);
    const record = maxBy(wins, 'eloDifference');
    return record && card('Biggest underdog win', record.winner, `${fmt(record.eloDifference)} Elo gap`, `${record.date} beat ${record.loser} ${record.score} · ${fmt(record.winnerOld)} vs ${fmt(record.loserOld)} before kickoff`);
  }

  function calculateBiggestFavoriteUpsetLoss(engine) {
    const wins = engine.matchHistory.map((m) => underdogWinRecord(m)).filter(Boolean);
    const record = maxBy(wins, 'eloDifference');
    return record && card('Biggest favorite upset loss', record.loser, `Lost as ${fmt(record.eloDifference)}-point favorite`, `${record.date} vs ${record.winner}, ${record.score} · ${record.round}`);
  }

  function calculateMostPointsGainedInSeason(engine) {
    const row = maxBy(seasonRows(engine), 'seasonChange');
    return row && card('Most Elo gained in a single season', row.team, signed(row.seasonChange), `${row.season}: ${fmt(row.seasonStartElo)} → ${fmt(row.seasonEndElo)}`);
  }

  function calculateMostPointsLostInSeason(engine) {
    const row = minBy(seasonRows(engine), 'seasonChange');
    return row && card('Most Elo lost in a single season', row.team, signed(row.seasonChange), `${row.season}: ${fmt(row.seasonStartElo)} → ${fmt(row.seasonEndElo)}`);
  }

  function calculateBestChampionsLeagueCampaignByEloGain(engine) {
    const row = maxBy(seasonRows(engine).filter((r) => r.active), 'seasonChange');
    return row && card('Best campaign by Elo gain', row.team, signed(row.seasonChange), `${row.season} · ${labelStage(row.stageReached)} · ${row.matches} matches`);
  }

  function calculateWorstChampionsLeagueCampaignByEloLoss(engine) {
    const row = minBy(seasonRows(engine).filter((r) => r.active), 'seasonChange');
    return row && card('Worst campaign by Elo loss', row.team, signed(row.seasonChange), `${row.season} · ${labelStage(row.stageReached)} · ${row.matches} matches`);
  }

  function calculateLongestStreakAbove1800(engine) {
    let best = null;
    engine.teams.forEach((team) => {
      let current = 0;
      matchEntries(engine).filter((e) => e.team === team.teamName).forEach((entry) => {
        current = entry.newElo >= 1800 ? current + 1 : 0;
        if (!best || current > best.count) best = { team: team.teamName, count: current };
      });
    });
    return best && card('Longest streak above 1800 Elo', best.team, `${best.count} rating events`, 'Counted after match updates in the sample history.');
  }

  function calculateMostSeasonsFinishingNumberOne(engine) {
    const counts = {};
    engine.seasonSnapshots.forEach((s) => {
      const top = s.rankings[0];
      if (top) counts[top.team] = (counts[top.team] || 0) + 1;
    });
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best && card('Most seasons finishing #1', best[0], `${best[1]} seasons`, 'Based on end-of-season snapshots.');
  }

  function calculateMostPersonalPeakEvents(engine) {
    const team = maxBy([...engine.teams.values()], 'peakEvents');
    return team && card('Most new personal peak Elo events', team.teamName, `${team.peakEvents} peaks`, `Highest peak: ${fmt(team.highestElo)} in ${team.highestEloSeason}`);
  }

  function calculateBiggestFinalWinEloSwing(engine) {
    const finalWins = matchEntries(engine).filter((e) => /final/i.test(e.round) && e.matchResult === 'W');
    const entry = maxBy(finalWins, 'change');
    return entry && card('Biggest final win Elo swing', entry.team, signed(entry.change), `${entry.date} vs ${entry.opponent}, ${entry.score} · before title bonus`);
  }

  function calculateChampionWithLowestEloBeforeFinal(engine) {
    const finals = engine.matchHistory.filter((m) => /final/i.test(m.round));
    const winners = finals.map((m) => {
      const homeWon = m.homeGoals > m.awayGoals;
      const winner = homeWon ? m.homeTeam : m.awayTeam;
      return {
        team: winner,
        opponent: homeWon ? m.awayTeam : m.homeTeam,
        oldElo: homeWon ? m.homeOldElo : m.awayOldElo,
        score: m.score,
        season: m.season,
        date: m.date,
      };
    });
    const row = minBy(winners, 'oldElo');
    return row && card('Champion with lowest Elo before final', row.team, `${fmt(row.oldElo)} pre-final Elo`, `${row.season} vs ${row.opponent}, ${row.score}`);
  }

  function calculateHighestRatedNonChampion(engine) {
    const rows = seasonRows(engine).filter((r) => r.active && !r.isChampion);
    const row = maxBy(rows, 'highestEloThisSeason');
    return row && card('Highest-rated team that did not win', row.team, `${fmt(row.highestEloThisSeason)} peak Elo`, `${row.season} · eliminated/reached: ${labelStage(row.stageReached)}`);
  }

  function calculateLowestRatedGroupStageTeam(engine) {
    const groupEntries = engine.history.filter((h) => h.reason === 'match' && ['Group', 'League Phase'].some((term) => (h.round || '').includes(term)));
    const entry = minBy(groupEntries, 'oldElo');
    return entry && card('Lowest-rated team to reach group/league stage', entry.team, `${fmt(entry.oldElo)} Elo`, `${entry.season} · ${entry.round}`);
  }

  function calculateLowestRatedKnockoutTeam(engine) {
    const entries = engine.history.filter((h) => h.reason === 'round_bonus' && h.round.includes('Round of 16'));
    const entry = minBy(entries, 'newElo');
    return entry && card('Lowest-rated team to reach knockout stage', entry.team, `${fmt(entry.newElo)} Elo`, `${entry.season} after Round of 16 bonus`);
  }

  function calculateMostVolatileTeam(engine) {
    const eligible = [...engine.teams.values()].filter((t) => t.matchesPlayed >= 5).map((t) => ({ team: t.teamName, avg: t.totalAbsChange / t.matchesPlayed, matches: t.matchesPlayed }));
    const row = maxBy(eligible, 'avg');
    return row && card('Most volatile team', row.team, `${row.avg.toFixed(1)} avg |Δ|`, `${row.matches} matches minimum-filtered sample.`);
  }

  function calculateMostStableEliteTeam(engine) {
    const eligible = [...engine.teams.values()].filter((t) => t.matchesPlayed >= 5 && t.currentElo >= 1700).map((t) => ({ team: t.teamName, avg: t.totalAbsChange / t.matchesPlayed, elo: t.currentElo, matches: t.matchesPlayed }));
    const row = minBy(eligible, 'avg');
    return row && card('Most stable elite team', row.team, `${row.avg.toFixed(1)} avg |Δ|`, `${fmt(row.elo)} current Elo across ${row.matches} matches.`);
  }

  function card(title, team, value, detail) {
    return { title, team, value, detail };
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
    };
  }

  function maxBy(items, key) {
    return items.reduce((best, item) => (!best || Number(item[key]) > Number(best[key]) ? item : best), null);
  }

  function minBy(items, key) {
    return items.reduce((best, item) => (!best || Number(item[key]) < Number(best[key]) ? item : best), null);
  }

  function labelStage(stage) {
    return {
      champion: 'Champion', final: 'Finalist', semiFinal: 'Semi-finalist', quarterFinal: 'Quarter-finalist', roundOf16: 'Round of 16', league: 'League Phase', group: 'Group Stage', qualifying: 'Qualifying', 'not active': 'Not active',
    }[stage] || stage;
  }

  global.FootballRecords = {
    calculateAllRecords,
    calculateHighestEloAllTime,
    calculateHighestEndSeasonElo,
    calculateBiggestSingleMatchGain,
    calculateBiggestSingleMatchLoss,
    calculateBiggestUnderdogWin,
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
