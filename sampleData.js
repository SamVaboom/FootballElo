/* Illustrative normalized sample data proving the Elo engine/UI without requiring a backend.
 * It is intentionally small and is not a complete official OpenFootball season archive.
 * The shape matches the intended output of an OpenFootball football.txt import.
 */
(function (global) {
  const matches = [
    { season: '2021-22', round: 'First Qualifying Round', stageType: 'qualifying', date: '2021-07-06', homeTeam: 'Lincoln Red Imps', awayTeam: 'CFR Cluj', homeGoals: 1, awayGoals: 2 },
    { season: '2021-22', round: 'Third Qualifying Round', stageType: 'qualifying', date: '2021-08-03', homeTeam: 'CFR Cluj', awayTeam: 'Young Boys', homeGoals: 1, awayGoals: 1 },
    { season: '2021-22', round: 'Group A', stageType: 'group', date: '2021-09-15', homeTeam: 'Manchester City', awayTeam: 'RB Leipzig', homeGoals: 6, awayGoals: 3, advancements: [{ team: 'Manchester City', roundKey: 'roundOf16', opponent: 'RB Leipzig' }] },
    { season: '2021-22', round: 'Group A', stageType: 'group', date: '2021-09-15', homeTeam: 'Club Brugge', awayTeam: 'Paris Saint-Germain', homeGoals: 1, awayGoals: 1, advancements: [{ team: 'Paris Saint-Germain', roundKey: 'roundOf16', opponent: 'Club Brugge' }] },
    { season: '2021-22', round: 'Group B', stageType: 'group', date: '2021-09-15', homeTeam: 'Liverpool', awayTeam: 'Milan', homeGoals: 3, awayGoals: 2, advancements: [{ team: 'Liverpool', roundKey: 'roundOf16', opponent: 'Milan' }] },
    { season: '2021-22', round: 'Group D', stageType: 'group', date: '2021-09-28', homeTeam: 'Real Madrid', awayTeam: 'Sheriff Tiraspol', homeGoals: 1, awayGoals: 2, advancements: [{ team: 'Real Madrid', roundKey: 'roundOf16', opponent: 'Sheriff Tiraspol' }] },
    { season: '2021-22', round: 'Group E', stageType: 'group', date: '2021-09-29', homeTeam: 'Bayern München', awayTeam: 'Barcelona', homeGoals: 3, awayGoals: 0, advancements: [{ team: 'Bayern München', roundKey: 'roundOf16', opponent: 'Barcelona' }] },
    { season: '2021-22', round: 'Round of 16', stageType: 'knockout', date: '2022-02-15', homeTeam: 'Paris Saint-Germain', awayTeam: 'Real Madrid', homeGoals: 1, awayGoals: 0 },
    { season: '2021-22', round: 'Round of 16', stageType: 'knockout', date: '2022-03-09', homeTeam: 'Real Madrid', awayTeam: 'Paris Saint-Germain', homeGoals: 3, awayGoals: 1, advancements: [{ team: 'Real Madrid', roundKey: 'quarterFinal', opponent: 'Paris Saint-Germain' }] },
    { season: '2021-22', round: 'Round of 16', stageType: 'knockout', date: '2022-02-16', homeTeam: 'Inter', awayTeam: 'Liverpool', homeGoals: 0, awayGoals: 2 },
    { season: '2021-22', round: 'Round of 16', stageType: 'knockout', date: '2022-03-08', homeTeam: 'Liverpool', awayTeam: 'Inter', homeGoals: 0, awayGoals: 1, advancements: [{ team: 'Liverpool', roundKey: 'quarterFinal', opponent: 'Inter' }] },
    { season: '2021-22', round: 'Quarter-finals', stageType: 'knockout', date: '2022-04-06', homeTeam: 'Chelsea', awayTeam: 'Real Madrid', homeGoals: 1, awayGoals: 3 },
    { season: '2021-22', round: 'Quarter-finals', stageType: 'knockout', date: '2022-04-12', homeTeam: 'Real Madrid', awayTeam: 'Chelsea', homeGoals: 2, awayGoals: 3, advancements: [{ team: 'Real Madrid', roundKey: 'semiFinal', opponent: 'Chelsea' }] },
    { season: '2021-22', round: 'Semi-finals', stageType: 'knockout', date: '2022-04-26', homeTeam: 'Manchester City', awayTeam: 'Real Madrid', homeGoals: 4, awayGoals: 3 },
    { season: '2021-22', round: 'Semi-finals', stageType: 'knockout', date: '2022-05-04', homeTeam: 'Real Madrid', awayTeam: 'Manchester City', homeGoals: 3, awayGoals: 1, advancements: [{ team: 'Real Madrid', roundKey: 'final', opponent: 'Manchester City' }] },
    { season: '2021-22', round: 'Final', stageType: 'final', date: '2022-05-28', homeTeam: 'Liverpool', awayTeam: 'Real Madrid', homeGoals: 0, awayGoals: 1, neutralVenue: true },

    { season: '2022-23', round: 'Play-off Round', stageType: 'qualifying', date: '2022-08-17', homeTeam: 'Maccabi Haifa', awayTeam: 'Red Star Belgrade', homeGoals: 3, awayGoals: 2 },
    { season: '2022-23', round: 'Group A', stageType: 'group', date: '2022-09-07', homeTeam: 'Napoli', awayTeam: 'Liverpool', homeGoals: 4, awayGoals: 1, advancements: [{ team: 'Napoli', roundKey: 'roundOf16', opponent: 'Liverpool' }, { team: 'Liverpool', roundKey: 'roundOf16', opponent: 'Napoli' }] },
    { season: '2022-23', round: 'Group C', stageType: 'group', date: '2022-09-13', homeTeam: 'Bayern München', awayTeam: 'Barcelona', homeGoals: 2, awayGoals: 0, advancements: [{ team: 'Bayern München', roundKey: 'roundOf16', opponent: 'Barcelona' }] },
    { season: '2022-23', round: 'Group F', stageType: 'group', date: '2022-09-14', homeTeam: 'Real Madrid', awayTeam: 'RB Leipzig', homeGoals: 2, awayGoals: 0, advancements: [{ team: 'Real Madrid', roundKey: 'roundOf16', opponent: 'RB Leipzig' }, { team: 'RB Leipzig', roundKey: 'roundOf16', opponent: 'Real Madrid' }] },
    { season: '2022-23', round: 'Round of 16', stageType: 'knockout', date: '2023-02-21', homeTeam: 'Liverpool', awayTeam: 'Real Madrid', homeGoals: 2, awayGoals: 5 },
    { season: '2022-23', round: 'Round of 16', stageType: 'knockout', date: '2023-03-15', homeTeam: 'Real Madrid', awayTeam: 'Liverpool', homeGoals: 1, awayGoals: 0, advancements: [{ team: 'Real Madrid', roundKey: 'quarterFinal', opponent: 'Liverpool' }] },
    { season: '2022-23', round: 'Quarter-finals', stageType: 'knockout', date: '2023-04-11', homeTeam: 'Manchester City', awayTeam: 'Bayern München', homeGoals: 3, awayGoals: 0 },
    { season: '2022-23', round: 'Quarter-finals', stageType: 'knockout', date: '2023-04-19', homeTeam: 'Bayern München', awayTeam: 'Manchester City', homeGoals: 1, awayGoals: 1, advancements: [{ team: 'Manchester City', roundKey: 'semiFinal', opponent: 'Bayern München' }] },
    { season: '2022-23', round: 'Semi-finals', stageType: 'knockout', date: '2023-05-09', homeTeam: 'Real Madrid', awayTeam: 'Manchester City', homeGoals: 1, awayGoals: 1 },
    { season: '2022-23', round: 'Semi-finals', stageType: 'knockout', date: '2023-05-17', homeTeam: 'Manchester City', awayTeam: 'Real Madrid', homeGoals: 4, awayGoals: 0, advancements: [{ team: 'Manchester City', roundKey: 'final', opponent: 'Real Madrid' }] },
    { season: '2022-23', round: 'Final', stageType: 'final', date: '2023-06-10', homeTeam: 'Manchester City', awayTeam: 'Inter', homeGoals: 1, awayGoals: 0, neutralVenue: true },

    { season: '2023-24', round: 'Group A', stageType: 'group', date: '2023-09-19', homeTeam: 'Bayern München', awayTeam: 'Manchester United', homeGoals: 4, awayGoals: 3, advancements: [{ team: 'Bayern München', roundKey: 'roundOf16', opponent: 'Manchester United' }] },
    { season: '2023-24', round: 'Group C', stageType: 'group', date: '2023-09-20', homeTeam: 'Real Madrid', awayTeam: 'Union Berlin', homeGoals: 1, awayGoals: 0, advancements: [{ team: 'Real Madrid', roundKey: 'roundOf16', opponent: 'Union Berlin' }] },
    { season: '2023-24', round: 'Group F', stageType: 'group', date: '2023-10-04', homeTeam: 'Newcastle United', awayTeam: 'Paris Saint-Germain', homeGoals: 4, awayGoals: 1 },
    { season: '2023-24', round: 'Round of 16', stageType: 'knockout', date: '2024-02-13', homeTeam: 'RB Leipzig', awayTeam: 'Real Madrid', homeGoals: 0, awayGoals: 1 },
    { season: '2023-24', round: 'Round of 16', stageType: 'knockout', date: '2024-03-06', homeTeam: 'Real Madrid', awayTeam: 'RB Leipzig', homeGoals: 1, awayGoals: 1, advancements: [{ team: 'Real Madrid', roundKey: 'quarterFinal', opponent: 'RB Leipzig' }] },
    { season: '2023-24', round: 'Quarter-finals', stageType: 'knockout', date: '2024-04-09', homeTeam: 'Real Madrid', awayTeam: 'Manchester City', homeGoals: 3, awayGoals: 3 },
    { season: '2023-24', round: 'Quarter-finals', stageType: 'knockout', date: '2024-04-17', homeTeam: 'Manchester City', awayTeam: 'Real Madrid', homeGoals: 1, awayGoals: 1, advancements: [{ team: 'Real Madrid', roundKey: 'semiFinal', opponent: 'Manchester City' }] },
    { season: '2023-24', round: 'Semi-finals', stageType: 'knockout', date: '2024-04-30', homeTeam: 'Bayern München', awayTeam: 'Real Madrid', homeGoals: 2, awayGoals: 2 },
    { season: '2023-24', round: 'Semi-finals', stageType: 'knockout', date: '2024-05-08', homeTeam: 'Real Madrid', awayTeam: 'Bayern München', homeGoals: 2, awayGoals: 1, advancements: [{ team: 'Real Madrid', roundKey: 'final', opponent: 'Bayern München' }] },
    { season: '2023-24', round: 'Final', stageType: 'final', date: '2024-06-01', homeTeam: 'Borussia Dortmund', awayTeam: 'Real Madrid', homeGoals: 0, awayGoals: 2, neutralVenue: true },

    { season: '2024-25', round: 'League Phase', stageType: 'league', date: '2024-09-17', homeTeam: 'Aston Villa', awayTeam: 'Young Boys', homeGoals: 3, awayGoals: 0, advancements: [{ team: 'Aston Villa', roundKey: 'roundOf16', opponent: 'Young Boys' }] },
    { season: '2024-25', round: 'League Phase', stageType: 'league', date: '2024-09-18', homeTeam: 'Manchester City', awayTeam: 'Inter', homeGoals: 0, awayGoals: 0, advancements: [{ team: 'Manchester City', roundKey: 'roundOf16', opponent: 'Inter' }, { team: 'Inter', roundKey: 'roundOf16', opponent: 'Manchester City' }] },
    { season: '2024-25', round: 'League Phase', stageType: 'league', date: '2024-10-02', homeTeam: 'Lille', awayTeam: 'Real Madrid', homeGoals: 1, awayGoals: 0, advancements: [{ team: 'Real Madrid', roundKey: 'roundOf16', opponent: 'Lille' }] },
    { season: '2024-25', round: 'Round of 16', stageType: 'knockout', date: '2025-02-18', homeTeam: 'Real Madrid', awayTeam: 'Aston Villa', homeGoals: 2, awayGoals: 1 },
    { season: '2024-25', round: 'Round of 16', stageType: 'knockout', date: '2025-03-12', homeTeam: 'Aston Villa', awayTeam: 'Real Madrid', homeGoals: 0, awayGoals: 2, advancements: [{ team: 'Real Madrid', roundKey: 'quarterFinal', opponent: 'Aston Villa' }] },
    { season: '2024-25', round: 'Quarter-finals', stageType: 'knockout', date: '2025-04-09', homeTeam: 'Arsenal', awayTeam: 'Real Madrid', homeGoals: 3, awayGoals: 0 },
    { season: '2024-25', round: 'Quarter-finals', stageType: 'knockout', date: '2025-04-16', homeTeam: 'Real Madrid', awayTeam: 'Arsenal', homeGoals: 1, awayGoals: 2, advancements: [{ team: 'Arsenal', roundKey: 'semiFinal', opponent: 'Real Madrid' }] },
    { season: '2024-25', round: 'Semi-finals', stageType: 'knockout', date: '2025-05-07', homeTeam: 'Arsenal', awayTeam: 'Inter', homeGoals: 2, awayGoals: 1, advancements: [{ team: 'Arsenal', roundKey: 'final', opponent: 'Inter' }] },
    { season: '2024-25', round: 'Final', stageType: 'final', date: '2025-05-31', homeTeam: 'Arsenal', awayTeam: 'Bayern München', homeGoals: 1, awayGoals: 2, neutralVenue: true },
  ];

  global.ChampionsLeagueSampleData = matches.map((match, index) => ({
    competition: 'UEFA Champions League',
    neutralVenue: false,
    ...match,
    order: index,
    sourceLine: match.sourceLine || 'sample normalized data',
  }));
})(window);
