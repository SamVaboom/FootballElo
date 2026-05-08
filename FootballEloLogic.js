/*
 * Core Champions League Elo engine. Ratings are stored as decimals internally;
 * UI rendering rounds only at display time so match deltas remain equal and
 * opposite before bonuses are applied.
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

  const K_FACTORS = {
    qualifying: 24,
    preliminary: 24,
    group: 32,
    league: 32,
    roundOf16: 36,
    quarterFinal: 40,
    semiFinal: 44,
    final: 50,
    knockout: 36,
  };

  const GOAL_DIFFERENCE_MULTIPLIERS = {
    draw: 1,
    oneGoal: 1,
    twoGoals: 1.25,
    threeGoals: 1.5,
    fourPlusGoals: 1.75,
  };

  const ROUND_BONUSES = {
    roundOf16: 50,
    quarterFinal: 50,
    semiFinal: 50,
    final: 50,
  };

  const FINAL_WIN_BONUS = 200;
  const STAGE_ORDER = global.FootballDataAdapter?.STAGE_ORDER || {
    qualifying: 0, group: 1, league: 1, knockout: 1, roundOf16: 2, quarterFinal: 3, semiFinal: 4, final: 5, champion: 6,
  };

  function createEngine(options = {}) { return new ChampionsLeagueEloEngine(options); }

  class ChampionsLeagueEloEngine {
    constructor(options = {}) {
      this.kFactors = { ...K_FACTORS, ...(options.kFactors || {}) };
      this.roundBonuses = { ...ROUND_BONUSES, ...(options.roundBonuses || {}) };
      this.finalWinBonus = options.finalWinBonus ?? FINAL_WIN_BONUS;
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
      this.processedMatches = [];
      this.currentMatchIndex = 0;
      this.debugSummary = null;
    }

    getInitialEloForEntryStage(entryStage) {
      const normalized = (entryStage || '').toLowerCase();
      if (normalized.includes('qual') || normalized.includes('prelim')) return INITIAL_ELO.qualifying;
      if (normalized.includes('league')) return INITIAL_ELO.league;
      if (normalized.includes('knock') || normalized.includes('round') || normalized.includes('final')) return INITIAL_ELO.knockout;
      return INITIAL_ELO.group;
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
        peakEvents: 0,
        totalAbsChange: 0,
      };
      this.teams.set(teamName, team);
      return team;
    }

    calculateExpectedScore(ratingA, ratingB) {
      return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
    }

    getKFactor(match) {
      const roundKey = match.roundKey || global.FootballDataAdapter?.classifyRound(match.round) || match.stageType || 'group';
      if (this.kFactors[roundKey]) return this.kFactors[roundKey];
      if (match.stageType === 'qualifying') return this.kFactors.qualifying;
      if (match.stageType === 'league') return this.kFactors.league;
      if (match.stageType === 'final') return this.kFactors.final;
      if (match.stageType === 'knockout') return this.kFactors.knockout;
      return this.kFactors.group;
    }

    getGoalDifferenceMultiplier(homeGoals, awayGoals) {
      const diff = Math.abs(homeGoals - awayGoals);
      if (diff === 0) return GOAL_DIFFERENCE_MULTIPLIERS.draw;
      if (diff === 1) return GOAL_DIFFERENCE_MULTIPLIERS.oneGoal;
      if (diff === 2) return GOAL_DIFFERENCE_MULTIPLIERS.twoGoals;
      if (diff === 3) return GOAL_DIFFERENCE_MULTIPLIERS.threeGoals;
      return GOAL_DIFFERENCE_MULTIPLIERS.fourPlusGoals;
    }

    calculateMatchEloChange(match, homeRating, awayRating) {
      const expectedHome = this.calculateExpectedScore(homeRating, awayRating);
      let actualHome = 0.5;
      if (match.homeGoals > match.awayGoals) actualHome = 1;
      if (match.homeGoals < match.awayGoals) actualHome = 0;
      const k = this.getKFactor(match);
      const gdMultiplier = this.getGoalDifferenceMultiplier(match.homeGoals, match.awayGoals);
      const change = k * (actualHome - expectedHome) * gdMultiplier;
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
      this.markStageReached(match.season, home.teamName, match.roundKey || match.round);
      this.markStageReached(match.season, away.teamName, match.roundKey || match.round);

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
        score: `${match.homeGoals}-${match.awayGoals}${match.decidedOnPenalties ? ` (${match.penaltyScore.home}-${match.penaltyScore.away} pen.)` : ''}`,
        homeOldElo: oldHome,
        awayOldElo: oldAway,
        homeNewElo: home.currentElo,
        awayNewElo: away.currentElo,
        homeChange: calc.homeChange,
        awayChange: calc.awayChange,
        k: calc.k,
        gdMultiplier: calc.gdMultiplier,
        favoriteBefore: oldHome >= oldAway ? match.homeTeam : match.awayTeam,
        underdogBefore: oldHome < oldAway ? match.homeTeam : match.awayTeam,
        ratingGap: Math.abs(oldHome - oldAway),
      };
      this.processedMatches.push(matchMeta);
      this.matchHistory.push(matchMeta);
      this.recordHistory({ match: matchMeta, team: home.teamName, opponent: away.teamName, oldElo: oldHome, newElo: home.currentElo, change: calc.homeChange, result: result.homeResult });
      this.recordHistory({ match: matchMeta, team: away.teamName, opponent: home.teamName, oldElo: oldAway, newElo: away.currentElo, change: calc.awayChange, result: result.awayResult });
      this.trackPeak(home, match.season, match.date, `match vs ${away.teamName}`);
      this.trackPeak(away, match.season, match.date, `match vs ${home.teamName}`);
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
      team.highestElo = Math.max(team.highestElo, team.currentElo);
      team.lowestElo = Math.min(team.lowestElo, team.currentElo);
      if (team.currentElo === team.highestElo) team.highestEloSeason = season;

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
        roundKey: match.roundKey,
        oldElo,
        newElo,
        change,
        reason: 'match',
        matchResult: result,
        score: match.score || `${match.homeGoals}-${match.awayGoals}`,
        match,
      });
    }

    applyRoundBonus(season, teamName, roundKey, context = {}) {
      const bonus = this.roundBonuses[roundKey];
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
        roundKey,
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
      const key = `${season}|${teamName}|champion`;
      if (this.appliedBonuses.has(key)) return null;
      const team = this.teams.get(teamName);
      if (!team) return null;
      this.appliedBonuses.add(key);
      const oldElo = team.currentElo;
      team.currentElo += this.finalWinBonus;
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
        round: 'Final winner bonus',
        roundKey: 'champion',
        oldElo,
        newElo: team.currentElo,
        change: this.finalWinBonus,
        reason: 'final_win_bonus',
        matchResult: 'Champion',
        score: context.score || '',
      };
      this.history.push(entry);
      this.trackPeak(team, season, context.date || '', 'bonus: Champion');
      return entry;
    }

    incrementRoundCounter(team, roundKey) {
      if (roundKey === 'roundOf16') team.roundOf16s += 1;
      if (roundKey === 'quarterFinal') team.quarterFinals += 1;
      if (roundKey === 'semiFinal') team.semiFinals += 1;
      if (roundKey === 'final') team.finals += 1;
    }

    processSeason(seasonData) {
      const season = seasonData.season;
      const matches = [...(seasonData.matches || [])].sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.order - b.order);
      const participationBonusApplied = new Set();
      matches.forEach((match) => {
        this.prepareEntrantsForMatch(match);
        this.applyParticipationBonuses(seasonData, match, participationBonusApplied);
        const meta = this.processMatch(match);
        if (match.roundKey === 'final') {
          const winner = this.getFinalWinner(match);
          if (winner) this.applyFinalWinBonus(season, winner, { date: match.date, opponent: winner === match.homeTeam ? match.awayTeam : match.homeTeam, score: meta.score });
        }
      });
      this.applyDerivedAdvancementBonuses(seasonData);
      const snapshot = this.createSeasonSnapshot(season);
      this.seasonSnapshots.push(snapshot);
      return snapshot;
    }

    prepareEntrantsForMatch(match) {
      [
        [match.homeTeam, match.homeEntryStage || global.FootballDataAdapter?.detectInitialEntryStage(match.round)],
        [match.awayTeam, match.awayEntryStage || global.FootballDataAdapter?.detectInitialEntryStage(match.round)],
      ].forEach(([teamName, entryStage]) => {
        const team = this.initializeTeam(teamName, match.season, entryStage);
        this.prepareSeasonTeam(match.season, teamName, team.currentElo);
      });
    }

    applyParticipationBonuses(seasonData, match, cache) {
      const roundKey = match.roundKey;
      if (!this.roundBonuses[roundKey] || cache.has(roundKey)) return;
      const teams = seasonData.participantsByRound?.[roundKey] || [];
      teams.forEach((team) => this.applyRoundBonus(seasonData.season, team, roundKey, { date: match.date, round: this.labelRoundKey(roundKey) }));
      cache.add(roundKey);
    }

    applyDerivedAdvancementBonuses(seasonData) {
      (seasonData.advancements || []).forEach((advance) => {
        if (advance.reachedRoundKey && advance.reachedRoundKey !== 'champion') {
          this.applyRoundBonus(seasonData.season, advance.team, advance.reachedRoundKey, advance);
        }
      });
    }

    getFinalWinner(match) {
      if (match.penaltyWinner) return match.penaltyWinner;
      if (match.homeGoals > match.awayGoals) return match.homeTeam;
      if (match.awayGoals > match.homeGoals) return match.awayTeam;
      return null;
    }

    processAllSeasons(seasons) {
      this.reset();
      const ordered = [...seasons].filter(Boolean).sort((a, b) => a.season.localeCompare(b.season));
      ordered.forEach((season) => this.processSeason(season));
      this.debugSummary = {
        seasonsLoaded: ordered.length,
        matchesLoaded: ordered.reduce((sum, season) => sum + season.matches.length, 0),
        teamsLoaded: this.teams.size,
        firstSeasonLoaded: ordered[0]?.season || '',
        lastSeasonLoaded: ordered[ordered.length - 1]?.season || '',
        parseWarnings: ordered.flatMap((season) => season.warnings || []),
      };
      console.info('Football Elo data summary', this.debugSummary);
      return this;
    }

    getSeasonTeamStats(season, teamName) {
      const key = `${season}|${teamName}`;
      if (!this.seasonStats.has(key)) {
        const startElo = this.teams.get(teamName)?.currentElo ?? 0;
        this.seasonStats.set(key, {
          season,
          team: teamName,
          startElo,
          matches: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          highestEloThisSeason: startElo,
          stageReached: null,
          isChampion: false,
        });
      }
      return this.seasonStats.get(key);
    }

    prepareSeasonTeam(season, teamName, currentElo) {
      const key = `${season}|${teamName}`;
      if (!this.seasonTeamStartElo.has(key)) this.seasonTeamStartElo.set(key, currentElo);
      const stats = this.getSeasonTeamStats(season, teamName);
      stats.startElo = this.seasonTeamStartElo.get(key);
      stats.highestEloThisSeason = Math.max(stats.highestEloThisSeason, currentElo);
      return stats;
    }

    markStageReached(season, teamName, roundKeyOrName) {
      const roundKey = this.normalizeStageKey(roundKeyOrName);
      const stats = this.getSeasonTeamStats(season, teamName);
      stats.stageReached = this.bestStage(stats.stageReached, roundKey);
    }

    createSeasonSnapshot(season) {
      const rankings = Array.from(this.teams.values())
        .map((team) => {
          const stats = this.seasonStats.get(`${season}|${team.teamName}`);
          const active = Boolean(stats && stats.matches > 0);
          const startElo = stats?.startElo ?? this.seasonTeamStartElo.get(`${season}|${team.teamName}`) ?? team.currentElo;
          return {
            team: team.teamName,
            elo: team.currentElo,
            seasonEndElo: team.currentElo,
            startingElo: team.startingElo,
            seasonStartElo: startElo,
            seasonChange: active ? team.currentElo - startElo : 0,
            totalChange: team.currentElo - team.startingElo,
            active,
            matches: stats?.matches || 0,
            wins: stats?.wins || 0,
            draws: stats?.draws || 0,
            losses: stats?.losses || 0,
            goalsFor: stats?.goalsFor || 0,
            goalsAgainst: stats?.goalsAgainst || 0,
            goalDifference: (stats?.goalsFor || 0) - (stats?.goalsAgainst || 0),
            highestEloThisSeason: stats?.highestEloThisSeason || team.currentElo,
            stageReached: stats?.stageReached || null,
            isChampion: stats?.isChampion || false,
            firstSeason: team.firstSeason,
            trophies: team.trophies,
          };
        })
        .sort((a, b) => b.elo - a.elo)
        .map((row, index) => ({ ...row, rank: index + 1 }));
      return { season, rankings };
    }

    getSeasonSnapshot(season) { return this.seasonSnapshots.find((snapshot) => snapshot.season === season) || null; }

    getAllTimeSnapshot() {
      if (!this.seasonSnapshots.length) return { season: 'All Time', rankings: [] };
      const rankings = Array.from(this.teams.values())
        .map((team) => ({
          team: team.teamName,
          elo: team.currentElo,
          seasonEndElo: team.currentElo,
          startingElo: team.startingElo,
          seasonStartElo: team.startingElo,
          seasonChange: team.currentElo - team.startingElo,
          totalChange: team.currentElo - team.startingElo,
          active: true,
          matches: team.matchesPlayed,
          wins: team.wins,
          draws: team.draws,
          losses: team.losses,
          goalsFor: team.goalsFor,
          goalsAgainst: team.goalsAgainst,
          goalDifference: team.goalsFor - team.goalsAgainst,
          highestEloThisSeason: team.highestElo,
          stageReached: this.getBestCareerStage(team.teamName),
          isChampion: team.trophies > 0,
          firstSeason: team.firstSeason,
          trophies: team.trophies,
        }))
        .sort((a, b) => b.elo - a.elo)
        .map((row, index) => ({ ...row, rank: index + 1 }));
      return { season: 'All Time', rankings };
    }

    getBestCareerStage(teamName) {
      let best = null;
      this.seasonSnapshots.forEach((snapshot) => {
        const row = snapshot.rankings.find((ranking) => ranking.team === teamName);
        if (row?.stageReached) best = this.bestStage(best, row.stageReached);
        if (row?.isChampion) best = 'champion';
      });
      return best;
    }

    getCurrentRankings() { return this.getAllTimeSnapshot().rankings; }
    getTeamHistory(teamName) { return this.history.filter((entry) => entry.team === teamName); }

    trackPeak(team, season, date, reason) {
      if (team.currentElo > team.highestElo) {
        team.highestElo = team.currentElo;
        team.highestEloSeason = season;
        team.peakEvents += 1;
        this.history.push({ season, date, team: team.teamName, opponent: null, oldElo: null, newElo: team.currentElo, change: 0, reason: 'personal_peak', detail: reason });
      }
    }

    bestStage(a, b) {
      if (!a) return this.normalizeStageKey(b);
      const ak = this.normalizeStageKey(a);
      const bk = this.normalizeStageKey(b);
      return (STAGE_ORDER[bk] ?? 0) > (STAGE_ORDER[ak] ?? 0) ? bk : ak;
    }

    normalizeStageKey(stage) {
      if (!stage) return null;
      if (STAGE_ORDER[stage] !== undefined) return stage;
      return global.FootballDataAdapter?.classifyRound(stage) || stage;
    }

    labelRoundKey(roundKey) {
      return ({ qualifying: 'Qualifying', group: 'Group Stage', league: 'League Phase', roundOf16: 'Round of 16', quarterFinal: 'Quarterfinals', semiFinal: 'Semifinals', final: 'Final', champion: 'Champion' })[roundKey] || roundKey;
    }
  }

  global.FootballElo = {
    createEngine,
    ChampionsLeagueEloEngine,
    INITIAL_ELO,
    K_FACTORS,
    GOAL_DIFFERENCE_MULTIPLIERS,
    ROUND_BONUSES,
    FINAL_WIN_BONUS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
