/*
 * Parsers and normalizers for the local europe-champions-league-master data.
 * The browser app consumes normalized season objects produced here, regardless
 * of whether the source file is historical champs.csv or OpenFootball cl.txt.
 */
(function (global) {
  const MONTHS = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  const STAGE_ORDER = {
    qualifying: 0,
    group: 1,
    league: 1,
    roundOf16: 2,
    quarterFinal: 3,
    semiFinal: 4,
    final: 5,
    champion: 6,
  };

  function parseChampsCsv(csvText, season) {
    const rows = parseCsv(csvText);
    if (!rows.length) return buildSeasonFromParsedMatches(season, [], { sourceType: 'champs.csv' });
    const headers = rows[0].map((header) => header.trim());
    const matches = [];
    const warnings = [];

    rows.slice(1).forEach((cells, index) => {
      if (!cells.some((cell) => cell && cell.trim())) return;
      const row = objectFromRow(headers, cells);
      const home = parseTeamWithCountry(row['Team 1']);
      const away = parseTeamWithCountry(row['Team 2']);
      const score = parseScore(row.FT);
      if (!home.teamName || !away.teamName || !score) {
        warnings.push(`Skipped ${season} champs.csv row ${index + 2}: missing team or FT score.`);
        return;
      }
      const extraTimeScore = parseScore(row.ET);
      const penaltyScore = parsePenaltyScore(row.P);
      const aggregateScore = parseScore(row['∑FT']);
      const round = [row.Stage, row.Round, row.Group].filter(Boolean).join(' - ') || row.Round || row.Stage || 'European Cup';
      const stageKey = classifyRound(`${row.Stage || ''} ${row.Round || ''} ${row.Group || ''}`);
      const stageType = detectStageType(round);
      matches.push({
        id: `${season}-csv-${index + 1}`,
        season,
        order: index,
        competition: 'UEFA Champions League',
        sourceType: 'champs.csv',
        sourceLine: cells.join(','),
        original: row,
        stage: row.Stage || '',
        round,
        roundKey: stageKey,
        stageType,
        group: row.Group || '',
        date: parseCsvDate(row.Date, season),
        rawDate: row.Date || '',
        homeTeam: home.teamName,
        homeCountry: home.country,
        awayTeam: away.teamName,
        awayCountry: away.country,
        homeGoals: score.home,
        awayGoals: score.away,
        aggregateScore,
        extraTimeScore,
        penaltyScore,
        penaltyWinner: penaltyScore ? (penaltyScore.home > penaltyScore.away ? home.teamName : away.teamName) : null,
        wentToExtraTime: Boolean(extraTimeScore || /a\.e\.t\./i.test(row.ET || row.FT || '')),
        decidedOnPenalties: Boolean(penaltyScore),
        neutralVenue: stageKey === 'final',
        homeEntryStage: detectInitialEntryStage(round),
        awayEntryStage: detectInitialEntryStage(round),
      });
    });

    return buildSeasonFromParsedMatches(season, matches, { sourceType: 'champs.csv', warnings });
  }

  function parseClTxt(txt, seasonFromFolder) {
    const headerSeason = (txt.match(/UEFA Champions League\s+(\d{4})\/(\d{2})/i) || [])[1];
    const season = seasonFromFolder || (headerSeason ? `${headerSeason}-${String(Number(headerSeason.slice(0, 2)) + 1)}${(txt.match(/UEFA Champions League\s+\d{4}\/(\d{2})/i) || [])[1]}` : '');
    const expectedMatches = Number((txt.match(/#\s*Matches\s+(\d+)/i) || [])[1] || 0);
    const matches = [];
    const warnings = [];
    let currentRound = '';
    let currentDate = '';
    let inferredYear = Number((season || '').slice(0, 4));
    let order = 0;

    txt.split(/\r?\n/).forEach((line, lineIndex) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('=')) return;
      if (trimmed.startsWith('#')) return;
      if (trimmed.startsWith('»')) {
        currentRound = trimmed.replace(/^»\s*/, '').trim();
        return;
      }
      const dateMatch = trimmed.match(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Za-z]{3})\/(\d{1,2})(?:\s+(\d{4}))?\b/i);
      if (dateMatch) {
        inferredYear = dateMatch[3] ? Number(dateMatch[3]) : inferYearForMonth(season, dateMatch[1], inferredYear);
        currentDate = toIsoDate(inferredYear, MONTHS[dateMatch[1].toLowerCase()], Number(dateMatch[2]));
        return;
      }
      const parsed = parseClMatchLine(trimmed);
      if (!parsed) return;
      const roundKey = classifyRound(currentRound);
      matches.push({
        id: `${season}-txt-${++order}`,
        season,
        order: order - 1,
        competition: 'UEFA Champions League',
        sourceType: 'cl.txt',
        sourceLine: line,
        lineNumber: lineIndex + 1,
        round: currentRound,
        roundKey,
        stageType: detectStageType(currentRound),
        date: currentDate,
        rawDate: currentDate,
        time: parsed.time,
        homeTeam: parsed.home.teamName,
        homeCountry: parsed.home.country,
        awayTeam: parsed.away.teamName,
        awayCountry: parsed.away.country,
        homeGoals: parsed.score.home,
        awayGoals: parsed.score.away,
        halfTimeScore: parsed.halfTimeScore,
        penaltyScore: parsed.penaltyScore,
        penaltyWinner: parsed.penaltyWinner === 'home' ? parsed.home.teamName : parsed.penaltyWinner === 'away' ? parsed.away.teamName : null,
        wentToExtraTime: parsed.wentToExtraTime,
        decidedOnPenalties: Boolean(parsed.penaltyScore),
        neutralVenue: roundKey === 'final',
        homeEntryStage: 'group',
        awayEntryStage: 'group',
      });
    });

    if (expectedMatches && expectedMatches !== matches.length) {
      warnings.push(`${season} cl.txt header says ${expectedMatches} matches, parsed ${matches.length}.`);
    }
    return buildSeasonFromParsedMatches(season, matches, { sourceType: 'cl.txt', expectedMatches, warnings });
  }

  function parseClMatchLine(trimmed) {
    const line = trimmed.replace(/\s+/g, ' ');
    const timeMatch = line.match(/^(\d{1,2}\.\d{2})\s+(.*)$/);
    const time = timeMatch ? timeMatch[1] : '';
    const body = timeMatch ? timeMatch[2] : line;
    const vIndex = body.indexOf(' v ');
    if (vIndex < 0) return null;
    const homeText = body.slice(0, vIndex).trim();
    const afterV = body.slice(vIndex + 3).trim();
    const scoreMatch = afterV.match(/\s(\d+)-(\d+)\s*(?:pen\.)?\s*(?:(\d+)-(\d+)\s*)?(?:a\.e\.t\.)?\s*(?:\(([^)]*)\))?\s*$/i);
    if (!scoreMatch) return null;
    const awayText = afterV.slice(0, scoreMatch.index).trim();
    const hasPen = /\bpen\./i.test(scoreMatch[0]);
    let score = { home: Number(scoreMatch[1]), away: Number(scoreMatch[2]) };
    let penaltyScore = null;
    if (hasPen && scoreMatch[3] !== undefined) {
      penaltyScore = score;
      score = { home: Number(scoreMatch[3]), away: Number(scoreMatch[4]) };
    }
    const wentToExtraTime = /a\.e\.t\./i.test(scoreMatch[0]);
    return {
      time,
      home: parseTeamWithCountry(homeText),
      away: parseTeamWithCountry(awayText),
      score,
      halfTimeScore: parseScore(scoreMatch[5] || ''),
      penaltyScore,
      wentToExtraTime,
      penaltyWinner: penaltyScore ? (penaltyScore.home > penaltyScore.away ? 'home' : 'away') : null,
    };
  }

  function buildSeasonFromParsedMatches(season, matches, meta = {}) {
    const normalized = matches
      .filter((match) => match.homeTeam && match.awayTeam && Number.isFinite(match.homeGoals) && Number.isFinite(match.awayGoals))
      .map((match, order) => ({
        ...match,
        season,
        order,
        roundKey: match.roundKey || classifyRound(match.round),
        stageType: match.stageType || detectStageType(match.round),
        homeTeam: normalizeTeamName(match.homeTeam),
        awayTeam: normalizeTeamName(match.awayTeam),
      }))
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.order - b.order);

    const advancements = detectKnockoutAdvancement(normalized, season, meta.warnings || []);
    const participantsByRound = collectParticipantsByRound(normalized);
    return {
      season,
      sourceType: meta.sourceType || '',
      expectedMatches: meta.expectedMatches || null,
      matches: normalized,
      advancements,
      participantsByRound,
      warnings: meta.warnings || [],
      validation: validateSeason(normalized, meta.expectedMatches),
    };
  }

  function detectKnockoutAdvancement(matches, season, warnings = []) {
    const advancements = [];
    const nonFinalKnockouts = matches.filter((match) => ['roundOf16', 'quarterFinal', 'semiFinal'].includes(match.roundKey));
    const groups = new Map();
    nonFinalKnockouts.forEach((match) => {
      const teams = [match.homeTeam, match.awayTeam].sort();
      const key = `${match.roundKey}|${teams[0]}|${teams[1]}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(match);
    });

    groups.forEach((legs) => {
      legs.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.order - b.order);
      const [teamA, teamB] = [legs[0].homeTeam, legs[0].awayTeam];
      let goalsA = 0; let goalsB = 0; let awayA = 0; let awayB = 0;
      legs.forEach((leg) => {
        if (leg.homeTeam === teamA) {
          goalsA += leg.homeGoals; goalsB += leg.awayGoals; awayB += leg.awayGoals;
        } else {
          goalsA += leg.awayGoals; goalsB += leg.homeGoals; awayA += leg.awayGoals;
        }
      });
      let winner = goalsA > goalsB ? teamA : goalsB > goalsA ? teamB : null;
      if (!winner && usesAwayGoals(season)) winner = awayA > awayB ? teamA : awayB > awayA ? teamB : null;
      if (!winner) {
        const penaltyLeg = legs.find((leg) => leg.penaltyWinner);
        if (penaltyLeg) winner = penaltyLeg.penaltyWinner;
      }
      if (!winner) {
        warnings.push(`Could not determine ${season} ${legs[0].round} advancement for ${teamA} / ${teamB}.`);
        return;
      }
      advancements.push({
        season,
        team: winner,
        fromRoundKey: legs[0].roundKey,
        reachedRoundKey: nextRoundKey(legs[0].roundKey),
        opponent: winner === teamA ? teamB : teamA,
        date: legs[legs.length - 1].date,
        score: `${goalsA}-${goalsB} agg.`,
      });
    });

    matches.filter((match) => match.roundKey === 'final').forEach((match) => {
      const winner = getMatchWinnerForAdvancement(match);
      if (!winner) {
        warnings.push(`Could not determine ${season} final winner.`);
        return;
      }
      advancements.push({
        season,
        team: winner,
        fromRoundKey: 'final',
        reachedRoundKey: 'champion',
        opponent: winner === match.homeTeam ? match.awayTeam : match.homeTeam,
        date: match.date,
        score: `${match.homeGoals}-${match.awayGoals}`,
      });
    });
    return advancements;
  }

  function collectParticipantsByRound(matches) {
    const map = {};
    ['roundOf16', 'quarterFinal', 'semiFinal', 'final'].forEach((roundKey) => { map[roundKey] = []; });
    matches.forEach((match) => {
      if (!map[match.roundKey]) return;
      [match.homeTeam, match.awayTeam].forEach((team) => {
        if (!map[match.roundKey].includes(team)) map[match.roundKey].push(team);
      });
    });
    return map;
  }

  function parseCsv(text) {
    const rows = [];
    let row = []; let field = ''; let inQuotes = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (char === '"') {
        if (inQuotes && text[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = !inQuotes; }
      } else if (char === ',' && !inQuotes) {
        row.push(field); field = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && text[i + 1] === '\n') i += 1;
        row.push(field); rows.push(row); row = []; field = '';
      } else {
        field += char;
      }
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function objectFromRow(headers, cells) {
    return headers.reduce((obj, header, index) => {
      obj[header] = (cells[index] || '').trim();
      return obj;
    }, {});
  }

  const TEAM_ALIASES = {
    'Real Madrid CF': 'Real Madrid',
    'Atlético Madrid': 'Atletico Madrid',
    'Club Atlético de Madrid': 'Atletico Madrid',
    'Arsenal FC': 'Arsenal',
    'Chelsea FC': 'Chelsea',
    'Liverpool FC': 'Liverpool',
    'Manchester United FC': 'Manchester United',
    'Manchester City FC': 'Manchester City',
    'Tottenham Hotspur FC': 'Tottenham Hotspur',
    'Paris Saint-Germain FC': 'Paris Saint-Germain',
    'FC Internazionale Milano': 'Internazionale',
    'Internazionale Milano': 'Internazionale',
    'FC Bayern München': 'Bayern München',
    'Bayer 04 Leverkusen': 'Bayer Leverkusen',
    'Borussia Dortmund GmbH & Co. KGaA': 'Borussia Dortmund',
    'AS Monaco FC': 'AS Monaco',
    'Juventus FC': 'Juventus',
  };

  function normalizeTeamName(raw = '') {
    const cleaned = String(raw)
      .replace(/\s*›\s*[A-Z]{2,3}\s*\(\d+\)\s*$/u, '')
      .replace(/\s*\([A-Z]{2,3}\)\s*$/u, '')
      .replace(/\s+\(\d+\)\s*$/u, '')
      .replace(/\s+/g, ' ')
      .trim();
    return TEAM_ALIASES[cleaned] || cleaned;
  }

  function parseTeamWithCountry(raw = '') {
    const text = String(raw).trim();
    const suffix = text.match(/^(.*?)\s*›\s*([A-Z]{2,3})(?:\s*\(\d+\))?\s*$/u) || text.match(/^(.*?)\s*\(([A-Z]{2,3})\)\s*$/u);
    return {
      teamName: normalizeTeamName(suffix ? suffix[1] : text),
      country: suffix ? suffix[2] : '',
      original: text,
    };
  }

  function parseScore(raw = '') {
    const match = String(raw).match(/(\d+)\s*-\s*(\d+)/);
    if (!match) return null;
    return { home: Number(match[1]), away: Number(match[2]) };
  }

  function parsePenaltyScore(raw = '') {
    if (!/pen/i.test(raw)) return null;
    return parseScore(raw);
  }

  function classifyRound(roundName = '') {
    const round = roundName.toLowerCase();
    if (round.includes('preliminary')) return 'qualifying';
    if (round.includes('qual') || round.includes('play-off') || round.includes('playoff')) return 'qualifying';
    if (round.includes('league phase')) return 'league';
    if (round.includes('group')) return 'group';
    if (round.includes('round of 16') || round.includes('last 16')) return 'roundOf16';
    if (round.includes('quarter')) return 'quarterFinal';
    if (round.includes('semi')) return 'semiFinal';
    if (/\bfinal\b/.test(round)) return 'final';
    if (/round\s+1|round\s+2|round\s+3|first round|second round|third round/i.test(roundName)) return 'knockout';
    return 'group';
  }

  function detectStageType(roundName = '') {
    const key = classifyRound(roundName);
    if (key === 'qualifying') return 'qualifying';
    if (key === 'group' || key === 'league') return key;
    if (key === 'final') return 'final';
    return 'knockout';
  }

  function detectInitialEntryStage(roundName = '') {
    return detectStageType(roundName) === 'qualifying' ? 'qualifying' : 'group';
  }

  function roundToStageKey(roundName = '') { return classifyRound(roundName); }

  function nextRoundKey(roundKey) {
    return ({ knockout: 'quarterFinal', roundOf16: 'quarterFinal', quarterFinal: 'semiFinal', semiFinal: 'final', final: 'champion' })[roundKey] || null;
  }

  function getMatchWinnerForAdvancement(match) {
    if (match.penaltyWinner) return match.penaltyWinner;
    if (match.homeGoals > match.awayGoals) return match.homeTeam;
    if (match.awayGoals > match.homeGoals) return match.awayTeam;
    return null;
  }

  function parseCsvDate(raw = '', season = '') {
    const match = String(raw).match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/i);
    if (!match) return '';
    return toIsoDate(Number(match[3]), MONTHS[match[2].toLowerCase()], Number(match[1]));
  }

  function inferYearForMonth(season, mon, fallback) {
    const startYear = Number(String(season).slice(0, 4));
    if (!Number.isFinite(startYear)) return fallback || new Date().getFullYear();
    const month = MONTHS[mon.toLowerCase()];
    return month >= 6 ? startYear : startYear + 1;
  }

  function toIsoDate(year, monthIndex, day) {
    if (!Number.isFinite(year) || monthIndex === undefined || !Number.isFinite(day)) return '';
    return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function usesAwayGoals(season = '') {
    return Number(String(season).slice(0, 4)) < 2021;
  }

  function validateSeason(matches, expectedMatches) {
    const finalCount = matches.filter((match) => match.roundKey === 'final').length;
    const groupCount = matches.filter((match) => match.roundKey === 'group').length;
    return {
      parsedMatches: matches.length,
      expectedMatches: expectedMatches || null,
      matchesHeaderOk: expectedMatches ? expectedMatches === matches.length : true,
      groupMatches: groupCount,
      finalMatches: finalCount,
      cleanTeamNames: matches.every((match) => !/[›]|\([A-Z]{2,3}\)$/.test(match.homeTeam) && !/[›]|\([A-Z]{2,3}\)$/.test(match.awayTeam)),
    };
  }

  global.FootballDataAdapter = {
    parseChampsCsv,
    parseClTxt,
    normalizeTeamName,
    parseTeamWithCountry,
    parseScore,
    parsePenaltyScore,
    classifyStage: classifyRound,
    classifyRound,
    detectStageType,
    detectInitialEntryStage,
    detectKnockoutAdvancement,
    buildSeasonFromParsedMatches,
    roundToStageKey,
    STAGE_ORDER,
    TEAM_ALIASES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
