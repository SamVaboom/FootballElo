/* Loads normalized seasons from europe-champions-league-master via browser fetch. */
(function (global) {
  const DATA_ROOT = 'europe-champions-league-master';
  const FIRST_SEASON = '1955-56';
  const LAST_SEASON = '2025-26';

  function listKnownSeasons(first = FIRST_SEASON, last = LAST_SEASON) {
    const seasons = [];
    let year = Number(first.slice(0, 4));
    const lastYear = Number(last.slice(0, 4));
    while (year <= lastYear) {
      seasons.push(`${year}-${String((year + 1) % 100).padStart(2, '0')}`);
      year += 1;
    }
    return seasons;
  }

  function fileForSeason(season) {
    return Number(season.slice(0, 4)) <= 2015 ? 'champs.csv' : 'cl.txt';
  }

  async function loadSeason(season) {
    const fileName = fileForSeason(season);
    const url = `${DATA_ROOT}/${season}/${fileName}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`Skipping missing season file: ${url} (${response.status})`);
        return { skipped: true, season, fileName, url, reason: `${response.status} ${response.statusText}` };
      }
      const text = await response.text();
      const parsed = fileName === 'champs.csv'
        ? global.FootballDataAdapter.parseChampsCsv(text, season)
        : global.FootballDataAdapter.parseClTxt(text, season);
      parsed.fileName = fileName;
      parsed.url = url;
      return parsed;
    } catch (error) {
      console.warn(`Skipping season ${season}; failed to fetch ${url}.`, error);
      return { skipped: true, season, fileName, url, reason: error.message };
    }
  }

  async function loadAllSeasons() {
    const knownSeasons = listKnownSeasons();
    const loaded = [];
    const skipped = [];
    for (const season of knownSeasons) {
      // Sequential fetches make console warnings easier to read and avoid
      // overwhelming lightweight static servers.
      // eslint-disable-next-line no-await-in-loop
      const result = await loadSeason(season);
      if (result.skipped) skipped.push(result);
      else loaded.push(result);
    }
    const summary = {
      seasonsLoaded: loaded.length,
      matchesLoaded: loaded.reduce((sum, season) => sum + season.matches.length, 0),
      firstSeasonLoaded: loaded[0]?.season || '',
      lastSeasonLoaded: loaded[loaded.length - 1]?.season || '',
      skippedFiles: skipped,
      parseWarnings: loaded.flatMap((season) => season.warnings || []),
      validations: loaded.map((season) => ({ season: season.season, ...season.validation })),
    };
    console.info('Season loader summary', summary);
    return { seasons: loaded, skipped, summary };
  }

  global.FootballSeasonLoader = {
    DATA_ROOT,
    FIRST_SEASON,
    LAST_SEASON,
    listKnownSeasons,
    fileForSeason,
    loadSeason,
    loadAllSeasons,
  };
})(typeof window !== 'undefined' ? window : globalThis);
