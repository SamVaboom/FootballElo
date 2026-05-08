/*
 * Adapter layer for OpenFootball Champions League data.
 *
 * OpenFootball's football.txt files are human-friendly and may include dates,
 * rounds, venues, legs, scorers, notes, and aggregate results. The Elo engine
 * deliberately consumes normalized match objects, so this file is where raw
 * football.txt parsing/conversion belongs. For the MVP, sampleData.js already
 * provides normalized objects. Replace that sample array with output from
 * normalizeOpenFootballData() when importing the full dataset.
 */
(function (global) {
  function normalizeOpenFootballData(rawSeasonText, seasonLabel) {
    return parseFootballTxtSeason(rawSeasonText, seasonLabel).map((match, order) => ({
      ...match,
      order,
      competition: match.competition || 'UEFA Champions League',
      stageType: match.stageType || detectStageType(match.round),
    }));
  }

  function parseFootballTxtSeason(rawSeasonText, seasonLabel) {
    // TODO: Expand this parser for the complete openfootball/champions-league
    // syntax. A production importer should walk line-by-line, keep current
    // round/date state, parse score lines, and preserve the sourceLine for audit.
    // This small parser intentionally handles simple lines such as:
    // [Tue Sep/19] Bayern München 4-3 Manchester United
    if (!rawSeasonText) return [];
    let currentRound = 'Group Stage';
    let currentDate = '';
    const matches = [];

    rawSeasonText.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      if (/^(Preliminary|First Qualifying|Second Qualifying|Third Qualifying|Play-off|Group|League Phase|Round of 16|Quarter|Semi|Final)/i.test(trimmed) && !/\d+\s*-\s*\d+/.test(trimmed)) {
        currentRound = trimmed.replace(/:$/, '');
        return;
      }
      const dateMatch = trimmed.match(/^\[([^\]]+)\]\s*(.*)$/);
      const body = dateMatch ? dateMatch[2] : trimmed;
      if (dateMatch) currentDate = dateMatch[1];
      const scoreMatch = body.match(/^(.+?)\s+(\d+)\s*-\s*(\d+)\s+(.+)$/);
      if (!scoreMatch) return;
      matches.push({
        season: seasonLabel,
        competition: 'UEFA Champions League',
        round: currentRound,
        stageType: detectStageType(currentRound),
        date: normalizeLooseDate(currentDate, seasonLabel),
        homeTeam: scoreMatch[1].trim(),
        awayTeam: scoreMatch[4].trim(),
        homeGoals: Number(scoreMatch[2]),
        awayGoals: Number(scoreMatch[3]),
        neutralVenue: detectStageType(currentRound) === 'final',
        sourceLine: line,
      });
    });
    return matches;
  }

  function classifyRound(roundName = '') {
    const round = roundName.toLowerCase();
    if (round.includes('preliminary')) return 'preliminary';
    if (round.includes('qualifying') || round.includes('play-off') || round.includes('playoff')) return 'qualifying';
    if (round.includes('group')) return 'group';
    if (round.includes('league phase')) return 'league';
    if (round.includes('round of 16') || round.includes('last 16')) return 'roundOf16';
    if (round.includes('quarter')) return 'quarterFinal';
    if (round.includes('semi')) return 'semiFinal';
    if (/\bfinal\b/.test(round)) return 'final';
    return 'group';
  }

  function detectStageType(roundName = '') {
    const key = classifyRound(roundName);
    if (key === 'preliminary' || key === 'qualifying') return 'qualifying';
    if (key === 'group' || key === 'league') return key;
    if (key === 'final') return 'final';
    return 'knockout';
  }

  function roundToStageKey(roundName = '') {
    const key = classifyRound(roundName);
    if (key === 'preliminary') return 'qualifying';
    return key;
  }

  function detectInitialEntryStage(roundName = '') {
    const stage = detectStageType(roundName);
    if (stage === 'qualifying') return 'qualifying';
    if (stage === 'league') return 'league';
    return 'group';
  }

  function detectRoundAdvancement(match) {
    // The normalized data can explicitly attach advancements to decisive matches:
    // [{ team: 'Arsenal', roundKey: 'quarterFinal', opponent: 'Porto' }].
    // For raw OpenFootball data this should be derived after grouping two-legged
    // ties by season/round/team pair and determining aggregate winners once.
    return match.advancements || [];
  }

  function detectChampion(match) {
    if (detectStageType(match.round) !== 'final') return null;
    if (match.homeGoals === match.awayGoals) return match.penaltyWinner || null;
    return match.homeGoals > match.awayGoals ? match.homeTeam : match.awayTeam;
  }

  function normalizeLooseDate(dateText, seasonLabel) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return dateText;
    // TODO: Convert OpenFootball's textual dates precisely. For now, use the
    // season start year as a deterministic fallback for simple parser demos.
    const year = String(seasonLabel || '').slice(0, 4) || '2000';
    return `${year}-01-01`;
  }

  global.FootballDataAdapter = {
    normalizeOpenFootballData,
    parseFootballTxtSeason,
    classifyRound,
    detectStageType,
    detectInitialEntryStage,
    detectRoundAdvancement,
    detectChampion,
    roundToStageKey,
  };
})(window);
