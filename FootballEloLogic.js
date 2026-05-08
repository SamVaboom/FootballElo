/*
 * Core Champions League Elo engine.
 *
 * The engine is intentionally data-source agnostic. It accepts normalized match
 * objects from dataAdapter.js/sampleData.js and keeps decimal ratings internally;
 * UI code rounds only for display so winner/loser deltas remain equal and
 * opposite before rounding.
 */
(function (global) {
  const INITIAL_ELO = {
    qualifying: 800,
    preliminary: 800,
    group: 1500,
    league: 1500,
    knockout: 1500,
    final: 1500,
  };

  const ROUND_BONUSES = {
    roundOf16: 50,
    quarterFinal: 50,
    semiFinal: 50,
    final: 50,
  };

  const FINAL_WIN_BONUS = 200;

  function createEngine(options = {}) {
    return new ChampionsLeagueEloEngine(options);
  }

  class ChampionsLeagueEloEngine {
    constructor(options = {}) {
      this.baseK = options.baseK ?? 24;
      this.knockoutK = options.knockoutK ?? 32;
      this.finalK = options.finalK ?? 40;
      this.reset();
    }

    reset() {
      this.teams = new Map();
      this.history = [];
      this.matchHistory = [];
      this.seasonSnapshots = [];
      this.seasonStats = new Map();
      this.seasonTeamStartElo = new Map();
      this.appliedBonuses = new Set();
      this.finalistsRecorded = new Set();
      this.processedMatches = [];
      this.currentMatchIndex = 0;
    }

    getInitialEloForEntryStage(entryStage) {
      const normalized = (entryStage || '').toLowerCase();
      if (normalized.includes('qual') || normalized.includes('prelim')) return INITIAL_ELO.qualifying;
      return INITIAL_ELO[normalized] || INITIAL_ELO.group;
    }

    initializeTeam(teamName, firstSeason, firstEntryStage) {
      if (this.teams.has(teamName)) return this.teams.get(teamName);

      const startingElo = this.getInitialEloForEntryStage(firstEntryStage);
      const team = {
        teamName,
        currentElo: startingElo,
        startingElo,
        firstSeason,
        firstEntryStage,
        seasonsPlayed: new Set(),
        matchesPlayed: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        trophies: 0,
        finals: 0,
        semiFinals: 0,
        quarterFinals: 0,
        roundOf16s: 0,
        highestElo: startingElo,
        highestEloSeason: firstSeason,
        lowestElo: startingElo,
        biggestWinGain: null,
        biggestLossDrop: null,
        peakEvents: 0,
        totalAbsChange: 0,
      };
      this.teams.set(teamName, team);
      return team;
    }

    calculateExpectedScore(ratingA, ratingB) {
      return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
    }

    getKFactor(match) {
      const stageType = match.stageType || (global.FootballDataAdapter?.detectStageType(match.round) ?? 'group');
      const round = (match.round || '').toLowerCase();
      if (stageType === 'final' || round === 'final') return this.finalK;
      if (stageType === 'knockout') return this.knockoutK;
      return this.baseK;
    }

    getGoalDifferenceMultiplier(homeGoals, awayGoals) {
      const diff = Math.abs(homeGoals - awayGoals);
      if (diff <= 1) return 1;
      if (diff === 2) return 1.25;
      if (diff === 3) return 1.5;
      return 1.75;
    }

    calculateMatchEloChange(match, homeRating, awayRating) {
      const expectedHome = this.calculateExpectedScore(homeRating, awayRating);
      let actualHome = 0.5;
      if (match.homeGoals > match.awayGoals) actualHome = 1;
      if (match.homeGoals < match.awayGoals) actualHome = 0;

      const k = this.getKFactor(match);
      const gdMultiplier = this.getGoalDifferenceMultiplier(match.homeGoals, match.awayGoals);
      const change = k * gdMultiplier * (actualHome - expectedHome);
      return {
        homeChange: change,
        awayChange: -change,
        expectedHome,
        expectedAway: 1 - expectedHome,
        actualHome,
        actualAway: 1 - actualHome,
        k,
        gdMultiplier,
      };
    }

    processMatch(match) {
      const homeStage = match.homeEntryStage || global.FootballDataAdapter?.detectInitialEntryStage(match.round) || match.stageType;
      const awayStage = match.awayEntryStage || global.FootballDataAdapter?.detectInitialEntryStage(match.round) || match.stageType;
      const home = this.initializeTeam(match.homeTeam, match.season, homeStage);
      const away = this.initializeTeam(match.awayTeam, match.season, awayStage);

      this.prepareSeasonTeam(match.season, home.teamName, home.currentElo);
      this.prepareSeasonTeam(match.season, away.teamName, away.currentElo);
      home.seasonsPlayed.add(match.season);
      away.seasonsPlayed.add(match.season);

      const oldHome = home.currentElo;
      const oldAway = away.currentElo;
      const calc = this.calculateMatchEloChange(match, oldHome, oldAway);
      home.currentElo += calc.homeChange;
      away.currentElo += calc.awayChange;

      const result = this.getResult(match);
      this.updateTeamStats(home, match.season, match.homeGoals, match.awayGoals, result.homeResult, calc.homeChange);
      this.updateTeamStats(away, match.season, match.awayGoals, match.homeGoals, result.awayResult, calc.awayChange);

      const matchMeta = {
        ...match,
        id: match.id || `match-${++this.currentMatchIndex}`,
        score: `${match.homeGoals}-${match.awayGoals}`,
        homeOldElo: oldHome,
        awayOldElo: oldAway,
        homeNewElo: home.currentElo,
        awayNewElo: away.currentElo,
        homeChange: calc.homeChange,
        awayChange: calc.awayChange,
        favoriteBefore: oldHome >= oldAway ? match.homeTeam : match.awayTeam,
        underdogBefore: oldHome < oldAway ? match.homeTeam : match.awayTeam,
      };
      this.processedMatches.push(matchMeta);
      this.matchHistory.push(matchMeta);

      this.recordHistory({
        match,
        team: home.teamName,
        opponent: away.teamName,
        oldElo: oldHome,
        newElo: home.currentElo,
        change: calc.homeChange,
        result: result.homeResult,
      });
      this.recordHistory({
        match,
        team: away.teamName,
        opponent: home.teamName,
        oldElo: oldAway,
        newElo: away.currentElo,
        change: calc.awayChange,
        result: result.awayResult,
      });

      this.trackPeak(home, match.season, match.date, `match vs ${away.teamName}`);
      this.trackPeak(away, match.season, match.date, `match vs ${home.teamName}`);
      this.updateExtremes(home, matchMeta, calc.homeChange);
      this.updateExtremes(away, matchMeta, calc.awayChange);

      return matchMeta;
    }

    updateTeamStats(team, season, goalsFor, goalsAgainst, result, change) {
      team.matchesPlayed += 1;
      team.goalsFor += goalsFor;
      team.goalsAgainst += goalsAgainst;
      if (result === 'W') team.wins += 1;
      if (result === 'D') team.draws += 1;
      if (result === 'L') team.losses += 1;
      team.totalAbsChange += Math.abs(change);
      team.lowestElo = Math.min(team.lowestElo, team.currentElo);

      const stats = this.getSeasonTeamStats(season, team.teamName);
      stats.matches += 1;
      stats.goalsFor += goalsFor;
      stats.goalsAgainst += goalsAgainst;
      if (result === 'W') stats.wins += 1;
      if (result === 'D') stats.draws += 1;
      if (result === 'L') stats.losses += 1;
      stats.highestEloThisSeason = Math.max(stats.highestEloThisSeason, team.currentElo);
    }

    getResult(match) {
      if (match.homeGoals > match.awayGoals) return { homeResult: 'W', awayResult: 'L', winner: match.homeTeam, loser: match.awayTeam };
      if (match.homeGoals < match.awayGoals) return { homeResult: 'L', awayResult: 'W', winner: match.awayTeam, loser: match.homeTeam };
      return { homeResult: 'D', awayResult: 'D', winner: null, loser: null };
    }

    recordHistory({ match, team, opponent, oldElo, newElo, change, result }) {
      this.history.push({
        season: match.season,
        date: match.date,
        team,
        opponent,
        round: match.round,
        oldElo,
        newElo,
        change,
        reason: 'match',
        matchResult: result,
        score: `${match.homeGoals}-${match.awayGoals}`,
        match,
      });
    }

    applyRoundBonus(season, teamName, roundKey, context = {}) {
      const bonus = ROUND_BONUSES[roundKey];
      const key = `${season}|${teamName}|${roundKey}`;
      if (!bonus || this.appliedBonuses.has(key)) return null;
      const team = this.teams.get(teamName);
      if (!team) return null;

      this.appliedBonuses.add(key);
      const oldElo = team.currentElo;
      team.currentElo += bonus;
      this.incrementRoundCounter(team, roundKey);
      const stats = this.getSeasonTeamStats(season, teamName);
      stats.highestEloThisSeason = Math.max(stats.highestEloThisSeason, team.currentElo);
      stats.stageReached = this.bestStage(stats.stageReached, roundKey);

      const entry = {
        season,
        date: context.date || '',
        team: teamName,
        opponent: context.opponent || null,
        round: context.round || this.labelRoundKey(roundKey),
        oldElo,
        newElo: team.currentElo,
        change: bonus,
        reason: 'round_bonus',
        matchResult: null,
        score: context.score || '',
      };
      this.history.push(entry);
      this.trackPeak(team, season, context.date || '', `bonus: ${entry.round}`);
      return entry;
    }

    applyFinalWinBonus(season, teamName, context = {}) {
      const key = `${season}|${teamName}|final_win`;
      if (this.appliedBonuses.has(key)) return null;
      const team = this.teams.get(teamName);
      if (!team) return null;

      this.appliedBonuses.add(key);
      const oldElo = team.currentElo;
      team.currentElo += FINAL_WIN_BONUS;
      team.trophies += 1;
      const stats = this.getSeasonTeamStats(season, teamName);
      stats.isChampion = true;
      stats.stageReached = 'champion';
      stats.highestEloThisSeason = Math.max(stats.highestEloThisSeason, team.currentElo);

      const entry = {
        season,
        date: context.date || '',
        team: teamName,
        opponent: context.opponent || null,
        round: context.round || 'Final',
        oldElo,
        newElo: team.currentElo,
        change: FINAL_WIN_BONUS,
        reason: 'final_win_bonus',
        matchResult: 'W',
        score: context.score || '',
      };
      this.history.push(entry);
      this.trackPeak(team, season, context.date || '', 'final win bonus');
      return entry;
    }

    processSeason(season, matches) {
      const sorted = [...matches].sort(compareMatchesChronologically);
      for (const match of sorted) {
        const processed = this.processMatch(match);
        this.markStageParticipation(match);
        this.applyAdvancementBonuses(match, processed);
      }
      const snapshot = this.getSeasonSnapshot(season);
      this.seasonSnapshots.push(snapshot);
      return snapshot;
    }

    processAllSeasons(matches) {
      this.reset();
      const bySeason = groupBy(matches, 'season');
      Object.keys(bySeason).sort(compareSeasonLabels).forEach((season) => this.processSeason(season, bySeason[season]));
      return {
        teams: this.teams,
        history: this.history,
        matchHistory: this.matchHistory,
        seasonSnapshots: this.seasonSnapshots,
      };
    }

    applyAdvancementBonuses(match, processed) {
      const advancements = match.advancements || global.FootballDataAdapter?.detectRoundAdvancement(match) || [];
      advancements.forEach((adv) => {
        this.applyRoundBonus(match.season, adv.team, adv.roundKey, {
          date: match.date,
          opponent: adv.opponent,
          round: adv.label || this.labelRoundKey(adv.roundKey),
          score: processed.score,
        });
      });

      if (match.stageType === 'final' || /\bfinal\b/i.test(match.round)) {
        [match.homeTeam, match.awayTeam].forEach((team) => {
          this.applyRoundBonus(match.season, team, 'final', {
            date: match.date,
            opponent: team === match.homeTeam ? match.awayTeam : match.homeTeam,
            round: 'Reached Final',
            score: processed.score,
          });
        });
        const result = this.getResult(match);
        if (result.winner) {
          this.applyFinalWinBonus(match.season, result.winner, {
            date: match.date,
            opponent: result.loser,
            round: 'Final',
            score: processed.score,
          });
        }
      }
    }

    markStageParticipation(match) {
      [match.homeTeam, match.awayTeam].forEach((teamName) => {
        const stats = this.getSeasonTeamStats(match.season, teamName);
        const roundKey = global.FootballDataAdapter?.roundToStageKey(match.round) || match.stageType || 'group';
        stats.stageReached = this.bestStage(stats.stageReached, roundKey);
      });
    }

    getSeasonSnapshot(season) {
      const starts = this.seasonTeamStartElo.get(season) || new Map();
      const seasonMap = this.seasonStats.get(season) || new Map();
      const rankings = [...this.teams.values()].map((team) => {
        const stats = seasonMap.get(team.teamName) || this.createEmptySeasonStats(team.currentElo);
        const seasonStartElo = starts.get(team.teamName) ?? team.currentElo;
        return {
          rank: 0,
          team: team.teamName,
          elo: team.currentElo,
          seasonStartElo,
          seasonEndElo: team.currentElo,
          seasonChange: team.currentElo - seasonStartElo,
          active: seasonMap.has(team.teamName),
          matches: stats.matches,
          wins: stats.wins,
          draws: stats.draws,
          losses: stats.losses,
          goalsFor: stats.goalsFor,
          goalsAgainst: stats.goalsAgainst,
          goalDifference: stats.goalsFor - stats.goalsAgainst,
          highestEloThisSeason: stats.highestEloThisSeason,
          stageReached: stats.stageReached,
          isChampion: stats.isChampion,
        };
      }).sort((a, b) => b.elo - a.elo)
        .map((row, index) => ({ ...row, rank: index + 1 }));
      return { season, rankings };
    }

    getCurrentRankings() {
      return [...this.teams.values()]
        .sort((a, b) => b.currentElo - a.currentElo)
        .map((team, index) => ({ rank: index + 1, team: team.teamName, elo: team.currentElo, ...team }));
    }

    getTeamHistory(teamName) {
      return this.history.filter((entry) => entry.team === teamName);
    }

    prepareSeasonTeam(season, teamName, elo) {
      if (!this.seasonTeamStartElo.has(season)) this.seasonTeamStartElo.set(season, new Map());
      if (!this.seasonTeamStartElo.get(season).has(teamName)) this.seasonTeamStartElo.get(season).set(teamName, elo);
      this.getSeasonTeamStats(season, teamName);
    }

    getSeasonTeamStats(season, teamName) {
      if (!this.seasonStats.has(season)) this.seasonStats.set(season, new Map());
      const seasonMap = this.seasonStats.get(season);
      if (!seasonMap.has(teamName)) seasonMap.set(teamName, this.createEmptySeasonStats(this.teams.get(teamName)?.currentElo ?? 1500));
      return seasonMap.get(teamName);
    }

    createEmptySeasonStats(elo) {
      return {
        matches: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        highestEloThisSeason: elo,
        stageReached: 'not active',
        isChampion: false,
      };
    }

    incrementRoundCounter(team, roundKey) {
      if (roundKey === 'roundOf16') team.roundOf16s += 1;
      if (roundKey === 'quarterFinal') team.quarterFinals += 1;
      if (roundKey === 'semiFinal') team.semiFinals += 1;
      if (roundKey === 'final') team.finals += 1;
    }

    bestStage(current, candidate) {
      const order = ['not active', 'qualifying', 'group', 'league', 'roundOf16', 'quarterFinal', 'semiFinal', 'final', 'champion'];
      return order.indexOf(candidate) > order.indexOf(current) ? candidate : current;
    }

    labelRoundKey(roundKey) {
      return {
        roundOf16: 'Reached Round of 16',
        quarterFinal: 'Reached Quarter-finals',
        semiFinal: 'Reached Semi-finals',
        final: 'Reached Final',
      }[roundKey] || roundKey;
    }

    trackPeak(team, season, date, context) {
      if (team.currentElo > team.highestElo) {
        team.highestElo = team.currentElo;
        team.highestEloSeason = season;
        team.peakEvents += 1;
        this.history.push({
          season,
          date,
          team: team.teamName,
          opponent: null,
          round: context,
          oldElo: team.currentElo,
          newElo: team.currentElo,
          change: 0,
          reason: 'personal_peak',
          matchResult: null,
          score: '',
        });
      }
    }

    updateExtremes(team, matchMeta, change) {
      const record = {
        opponent: team.teamName === matchMeta.homeTeam ? matchMeta.awayTeam : matchMeta.homeTeam,
        score: matchMeta.score,
        date: matchMeta.date,
        round: matchMeta.round,
        oldElo: team.teamName === matchMeta.homeTeam ? matchMeta.homeOldElo : matchMeta.awayOldElo,
        newElo: team.teamName === matchMeta.homeTeam ? matchMeta.homeNewElo : matchMeta.awayNewElo,
        change,
      };
      if (change > 0 && (!team.biggestWinGain || change > team.biggestWinGain.change)) team.biggestWinGain = record;
      if (change < 0 && (!team.biggestLossDrop || change < team.biggestLossDrop.change)) team.biggestLossDrop = record;
    }
  }

  function compareMatchesChronologically(a, b) {
    return (a.date || '').localeCompare(b.date || '') || (a.order || 0) - (b.order || 0);
  }

  function compareSeasonLabels(a, b) {
    return parseInt(a, 10) - parseInt(b, 10);
  }

  function groupBy(items, key) {
    return items.reduce((acc, item) => {
      const value = item[key];
      acc[value] = acc[value] || [];
      acc[value].push(item);
      return acc;
    }, {});
  }

  global.FootballElo = {
    ChampionsLeagueEloEngine,
    createEngine,
    INITIAL_ELO,
    ROUND_BONUSES,
    FINAL_WIN_BONUS,
  };
})(window);
