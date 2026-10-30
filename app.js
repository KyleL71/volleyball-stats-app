const PLAYER_KEYS = [
    'ZOE', 'AUBREY', 'EVELYN', 'EMMA', 'KARLEA', 'BRI', 'BRIDGET', 'MJ', 'LAILA', 'BRET',
    'PLAYER_11', 'PLAYER_12'
];
const DEFAULT_PLAYER_NAMES = {
    ZOE: 'ZOE', AUBREY: 'AUBREY', EVELYN: 'EVELYN', EMMA: 'EMMA', KARLEA: 'KARLEA',
    BRI: 'BRI', BRIDGET: 'BRIDGET', MJ: 'MJ', LAILA: 'LAILA', BRET: 'BRET'
};
const STAT_KEYS = [
    'serving-good', 'serving-ace', 'serving-error',
    'receive-3', 'receive-2', 'receive-1', 'receive-0',
    'attacking-atmpts', 'attacking-kills', 'attacking-error',
    'digging-good', 'digging-bad'
];

// Active team's player names (data-player attribute -> displayed name)
let playerNames = {};
let teams = [];
let activeTeamId = '';

// Tournament name
let tournamentName = '';

// Games of stats, each with its own history stack for Undo
let games = [];
let nextGameId = 1;

// Active tab: -1 = Tournament Totals, 0+ = selected game index
let activeGameIndex = -1;

// Edit mode state (only meaningful for game tabs)
let editMode = false;
// Current editing context
let editingContext = null;

function createEmptyStats() {
    const s = {};
    PLAYER_KEYS.forEach(p => {
        s[p] = {};
        STAT_KEYS.forEach(k => s[p][k] = 0);
    });
    return s;
}

function createDefaultTeam(id = 'team-1', name = 'Team 1', names = DEFAULT_PLAYER_NAMES) {
    const players = {};
    PLAYER_KEYS.forEach(player => {
        const playerName = typeof names[player] === 'string' ? names[player].trim() : '';
        if (playerName) players[player] = playerName;
    });
    return { id, name, players };
}

function getActiveTeam() {
    return teams.find(team => team.id === activeTeamId) || teams[0];
}

function getTeamPlayerKeys(team = getActiveTeam()) {
    if (!team) return [];
    return PLAYER_KEYS.filter(player => typeof team.players[player] === 'string' && team.players[player].trim());
}

function getStatsForGame(game, teamId = activeTeamId) {
    return game?.statsByTeam?.[teamId] || createEmptyStats();
}

function createEmptyGame(name = '', id = null) {
    const gameId = id == null ? nextGameId++ : id;
    if (gameId >= nextGameId) nextGameId = gameId + 1;
    return {
        id: gameId,
        name: name || '',
        statsByTeam: Object.fromEntries(teams.map(team => [team.id, createEmptyStats()])),
        history: []
    };
}

function gameHasData(game) {
    if ((game?.name || '').trim()) return true;
    const allStats = Object.values(game?.statsByTeam || (game?.stats ? { legacy: game.stats } : {}));
    return allStats.some(stats => PLAYER_KEYS.some(p => STAT_KEYS.some(k => (stats[p]?.[k] || 0) !== 0)));
}

function gameLabel(game, index) {
    const name = (game?.name || '').trim();
    return name || `Game ${index + 1}`;
}

function normalizeGames() {
    if (!Array.isArray(games)) games = [];
    games = games.map((g, i) => {
        const game = g && typeof g === 'object' ? g : {};
        const id = typeof game.id === 'number' ? game.id : i;
        if (id >= nextGameId) nextGameId = id + 1;
        return {
            id,
            name: typeof game.name === 'string' ? game.name : '',
            statsByTeam: game.statsByTeam || { [teams[0].id]: game.stats || createEmptyStats() },
            history: Array.isArray(game.history) ? game.history : []
        };
    });

    games.forEach(game => {
        if (!game.statsByTeam || typeof game.statsByTeam !== 'object') game.statsByTeam = {};
        teams.forEach(team => {
            if (!game.statsByTeam[team.id]) game.statsByTeam[team.id] = createEmptyStats();
            PLAYER_KEYS.forEach(player => {
                if (!game.statsByTeam[team.id][player]) game.statsByTeam[team.id][player] = {};
                STAT_KEYS.forEach(key => {
                    if (typeof game.statsByTeam[team.id][player][key] !== 'number') {
                        game.statsByTeam[team.id][player][key] = 0;
                    }
                });
            });
        });
        game.history.forEach(snapshot => {
            if (!snapshot.teamId) snapshot.teamId = teams[0].id;
        });
    });

    // Old builds always stored 27 games; drop unused empty slots once.
    if (games.length === 27) {
        const kept = games.filter(gameHasData);
        games = kept.length ? kept : [games[0]];
    }

    if (games.length === 0) {
        nextGameId = 1;
        games = [createEmptyGame('Game 1')];
    }
}

function renderGameSelect() {
    const select = document.getElementById('gameSelect');
    const removeBtn = document.getElementById('removeGameBtn');
    if (!select) return;

    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a game';
    select.appendChild(placeholder);

    games.forEach((g, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = gameLabel(g, i);
        select.appendChild(opt);
    });

    select.value = isTournamentView() ? '' : String(activeGameIndex);
    select.classList.toggle('active', !isTournamentView());
    if (removeBtn) removeBtn.disabled = games.length <= 1;
}

function renderTeamSelect() {
    const select = document.getElementById('teamSelect');
    if (!select) return;
    select.innerHTML = '';
    teams.forEach(team => {
        const option = document.createElement('option');
        option.value = team.id;
        option.textContent = team.name || 'Team';
        select.appendChild(option);
    });
    select.value = activeTeamId;
}

function renderPlayerRows() {
    const body = document.getElementById('statsBody');
    const totalsRow = document.getElementById('totals-row');
    if (!body || !totalsRow) return;

    body.querySelectorAll('tr[data-player]').forEach(row => row.remove());
    getTeamPlayerKeys().forEach(player => {
        const row = document.createElement('tr');
        row.dataset.player = player;

        const playerCell = document.createElement('td');
        playerCell.className = 'player-name';
        playerCell.textContent = playerNames[player];
        row.appendChild(playerCell);

        const addCell = (className, text, stat) => {
            const cell = document.createElement('td');
            cell.className = className;
            cell.textContent = text;
            if (stat) cell.dataset.stat = stat;
            row.appendChild(cell);
        };

        addCell('stat-cell', '0', 'serving-good');
        addCell('stat-cell', '0', 'serving-ace');
        addCell('stat-cell', '0', 'serving-error');
        addCell('calc-cell serve-percent', '0%');
        addCell('stat-cell', '0', 'receive-3');
        addCell('stat-cell', '0', 'receive-2');
        addCell('stat-cell', '0', 'receive-1');
        addCell('stat-cell', '0', 'receive-0');
        addCell('calc-cell receive-percent', '0.00');
        addCell('stat-cell', '0', 'attacking-atmpts');
        addCell('stat-cell', '0', 'attacking-kills');
        addCell('stat-cell', '0', 'attacking-error');
        addCell('calc-cell hit-percent', '0.000');
        addCell('stat-cell', '0', 'digging-good');
        addCell('stat-cell', '0', 'digging-bad');
        addCell('calc-cell dig-percent', '0%');
        body.insertBefore(row, totalsRow);
    });
}

function savePlayerNames() {
    localStorage.setItem('volleyballPlayerNames', JSON.stringify(playerNames));
}

function saveTeams() {
    localStorage.setItem('volleyballTeams', JSON.stringify(teams));
    localStorage.setItem('volleyballActiveTeam', activeTeamId);
}

function saveTournamentName() {
    localStorage.setItem('volleyballTournamentName', tournamentName);
}

function saveGames() {
    localStorage.setItem('volleyballGames', JSON.stringify(games));
}

function ensurePlayerNames() {
    const team = getActiveTeam();
    if (!team) return;
    playerNames = team.players;
}

function normalizeTeams() {
    if (!Array.isArray(teams) || teams.length === 0) teams = [createDefaultTeam()];
    const usedIds = new Set();
    teams = teams.slice(0, 3).map((team, index) => {
        let id = typeof team?.id === 'string' && team.id ? team.id : `team-${index + 1}`;
        while (usedIds.has(id)) id = `team-${id}-${index + 1}`;
        usedIds.add(id);
        const players = { ...(team?.players || {}) };
        if (index > 0) {
            Object.entries(DEFAULT_PLAYER_NAMES).forEach(([player, defaultName]) => {
                if (players[player] === defaultName) delete players[player];
            });
        }
        const normalized = createDefaultTeam(
            id,
            typeof team?.name === 'string' && team.name.trim() ? team.name.trim() : `Team ${index + 1}`,
            players
        );
        return normalized;
    });
    if (!teams.some(team => team.id === activeTeamId)) activeTeamId = teams[0].id;
    playerNames = getActiveTeam().players;
}

function renderTeamsEditor() {
    const editor = document.getElementById('teamsEditor');
    if (!editor) return;
    editor.innerHTML = '';

    teams.forEach((team, teamIndex) => {
        const section = document.createElement('section');
        section.className = 'team-editor';
        section.dataset.teamId = team.id;

        const heading = document.createElement('div');
        heading.className = 'team-editor-header';
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = team.name;
        nameInput.maxLength = 40;
        nameInput.setAttribute('aria-label', `Team ${teamIndex + 1} name`);
        nameInput.dataset.teamName = '';
        heading.appendChild(nameInput);

        if (teams.length > 1) {
            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'control-btn remove-team-btn';
            removeButton.textContent = 'Delete';
            removeButton.dataset.removeTeam = team.id;
            removeButton.setAttribute('aria-label', `Delete ${team.name}`);
            heading.appendChild(removeButton);
        }
        section.appendChild(heading);

        const playerList = document.createElement('div');
        playerList.className = 'team-player-list';
        PLAYER_KEYS.forEach((player, index) => {
            const field = document.createElement('div');
            field.className = 'team-player-field';
            const label = document.createElement('label');
            label.textContent = `Player ${index + 1}`;
            const input = document.createElement('input');
            input.className = 'team-player-input';
            input.type = 'text';
            input.value = team.players[player] || '';
            input.maxLength = 40;
            input.dataset.playerKey = player;
            input.setAttribute('aria-label', `Player ${index + 1} name for ${team.name}`);
            field.append(label, input);
            playerList.appendChild(field);
        });
        section.appendChild(playerList);
        editor.appendChild(section);
    });

    document.getElementById('addTeamBtn').disabled = teams.length >= 3;
}

function openTeamsEditor() {
    renderTeamsEditor();
    const modal = document.getElementById('teamsModal');
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
}

function closeTeamsEditor() {
    const modal = document.getElementById('teamsModal');
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
}

function addTeam() {
    if (teams.length >= 3) return;
    let number = 1;
    let id = `team-${number}`;
    while (teams.some(team => team.id === id)) {
        number += 1;
        id = `team-${number}`;
    }
    const team = createDefaultTeam(id, `Team ${number}`, {});
    teams.push(team);
    games.forEach(game => {
        game.statsByTeam[team.id] = createEmptyStats();
    });
    saveTeams();
    saveGames();
    renderTeamsEditor();
    renderTeamSelect();
}

function removeTeam(teamId) {
    if (teams.length <= 1) return;
    const team = teams.find(item => item.id === teamId);
    if (!team || !confirm(`Delete ${team.name} and its saved stats? This cannot be undone.`)) return;
    teams = teams.filter(item => item.id !== teamId);
    games.forEach(game => {
        delete game.statsByTeam[teamId];
        game.history = game.history.filter(snapshot => snapshot.teamId !== teamId);
    });
    if (activeTeamId === teamId) activeTeamId = teams[0].id;
    playerNames = getActiveTeam().players;
    saveTeams();
    savePlayerNames();
    saveGames();
    renderTeamsEditor();
    renderTeamSelect();
    renderPlayerRows();
    updateDisplay();
    updateUndoButton();
}

function selectTeam(teamId) {
    if (!teams.some(team => team.id === teamId)) return;
    activeTeamId = teamId;
    playerNames = getActiveTeam().players;
    saveTeams();
    savePlayerNames();
    renderTeamSelect();
    renderPlayerRows();
    updateDisplay();
    updateUndoButton();
}

function migrateLegacyIfNeeded() {
    const legacyStatsRaw = localStorage.getItem('volleyballStats');
    const legacyNameRaw = localStorage.getItem('volleyballGameName');
    if (!legacyStatsRaw && !legacyNameRaw) return;

    try {
        const legacyStats = legacyStatsRaw ? JSON.parse(legacyStatsRaw) : null;
        if (legacyStats) {
            // Merge legacy into Game 1 stats
            PLAYER_KEYS.forEach(p => {
                STAT_KEYS.forEach(k => {
                    const v = legacyStats?.[p]?.[k];
                    if (typeof v === 'number') games[0].statsByTeam[teams[0].id][p][k] = v;
                });
            });
        }
    } catch (_) {
        // ignore malformed legacy data
    }

    if (legacyNameRaw) {
        games[0].name = legacyNameRaw;
    }

    // Keep old keys around (non-destructive), but new code uses volleyballGames.
    saveGames();
}

// Load saved state from localStorage
function loadState() {
    const savedNames = localStorage.getItem('volleyballPlayerNames');
    const savedGames = localStorage.getItem('volleyballGames');
    const savedTournamentName = localStorage.getItem('volleyballTournamentName');
    const savedTeams = localStorage.getItem('volleyballTeams');
    const savedActiveTeam = localStorage.getItem('volleyballActiveTeam');

    if (savedNames) {
        try { playerNames = JSON.parse(savedNames) || {}; } catch (_) { playerNames = {}; }
    }

    if (savedTeams) {
        try { teams = JSON.parse(savedTeams) || []; } catch (_) { teams = []; }
    } else {
        teams = [createDefaultTeam('team-1', 'Team 1', savedNames ? playerNames : DEFAULT_PLAYER_NAMES)];
    }
    activeTeamId = savedActiveTeam || teams[0]?.id || 'team-1';
    normalizeTeams();

    if (savedTournamentName) {
        tournamentName = savedTournamentName;
    }

    if (savedGames) {
        try { games = JSON.parse(savedGames) || []; } catch (_) { games = []; }
    }

    nextGameId = 1;
    normalizeGames();

    ensurePlayerNames();
    savePlayerNames();

    migrateLegacyIfNeeded();
    normalizeGames();
}

function isTournamentView() {
    return activeGameIndex === -1;
}

function getActiveGame() {
    if (activeGameIndex < 0) return null;
    return games[activeGameIndex];
}

function getStatsForView() {
    const players = getTeamPlayerKeys();
    if (!isTournamentView()) {
        const gameStats = getStatsForGame(getActiveGame());
        const activeStats = createEmptyStats();
        players.forEach(player => {
            STAT_KEYS.forEach(key => activeStats[player][key] = gameStats[player]?.[key] || 0);
        });
        return activeStats;
    }

    // Tournament totals: sum all games into per-player totals
    const agg = createEmptyStats();
    games.forEach(g => {
        players.forEach(p => {
            STAT_KEYS.forEach(k => {
                agg[p][k] += getStatsForGame(g)[p]?.[k] || 0;
            });
        });
    });
    return agg;
}

function pushHistorySnapshot(game) {
    const snap = {
        teamId: activeTeamId,
        stats: JSON.parse(JSON.stringify(getStatsForGame(game))),
        playerNames: JSON.parse(JSON.stringify(playerNames)),
        name: game.name
    };
    game.history.push(snap);
    if (game.history.length > 50) game.history.shift();
}

function updateGameNameUI() {
    const input = document.getElementById('gameName');
    const label = document.querySelector('label[for="gameName"]');
    const editBtn = document.getElementById('editBtn');
    const undoBtn = document.getElementById('undoBtn');
    const resetBtn = document.getElementById('resetBtn');

    if (isTournamentView()) {
        if (label) label.textContent = 'Tournament:';
        if (input) {
            input.value = tournamentName || 'Tournament Totals';
            input.disabled = false;
            input.placeholder = 'Tournament Totals';
        }
        if (editBtn) editBtn.disabled = true;
        if (undoBtn) undoBtn.disabled = true;
        if (resetBtn) resetBtn.disabled = true;
        document.body.classList.remove('edit-mode-active');
        editMode = false;
    } else {
        const g = getActiveGame();
        if (label) label.textContent = 'Game Name:';
        if (input) {
            input.disabled = false;
            input.value = g.name || '';
            const gameNumber = activeGameIndex + 1;
            input.placeholder = `Game ${gameNumber}`;
        }
        if (editBtn) editBtn.disabled = false;
        if (resetBtn) resetBtn.disabled = false;
        updateUndoButton();
    }
}

function setActiveTab(tab, gameIndex) {
    if (tab === 'tournament') {
        activeGameIndex = -1;
    } else if (tab === 'game') {
        const idx = Number(gameIndex);
        if (!Number.isInteger(idx) || idx < 0 || idx >= games.length) return;
        activeGameIndex = idx;
    }

    const tournamentTab = document.getElementById('tournamentTab');
    if (tournamentTab) tournamentTab.classList.toggle('active', isTournamentView());

    renderGameSelect();
    updateGameNameUI();
    updateDisplay();
}

function addGame() {
    editingContext = { type: 'add-game' };
    showEditModal('Add Game', 'Game Name:', `Game ${games.length + 1}`);
}

function finishAddGame(name) {
    const trimmed = (name || '').trim();
    games.push(createEmptyGame(trimmed || `Game ${games.length + 1}`));
    saveGames();
    setActiveTab('game', games.length - 1);
}

function removeSelectedGame() {
    if (games.length <= 1) {
        alert('You must keep at least one game.');
        return;
    }

    const select = document.getElementById('gameSelect');
    const fromSelect = select?.value === '' ? NaN : Number(select.value);
    const indexToRemove = isTournamentView() ? fromSelect : activeGameIndex;

    if (!Number.isInteger(indexToRemove) || indexToRemove < 0 || indexToRemove >= games.length) {
        alert('Select a game from the dropdown first, then click Remove Game.');
        return;
    }

    const label = gameLabel(games[indexToRemove], indexToRemove);
    if (!confirm(`Remove "${label}"? Its stats will no longer count toward tournament totals.`)) return;

    games.splice(indexToRemove, 1);
    saveGames();

    if (isTournamentView() || activeGameIndex === indexToRemove) {
        const nextIndex = Math.min(indexToRemove, games.length - 1);
        setActiveTab('game', nextIndex);
        return;
    }

    if (activeGameIndex > indexToRemove) activeGameIndex -= 1;
    setActiveTab('game', activeGameIndex);
}

// Update the display with current stats
function updateDisplay() {
    const stats = getStatsForView();

    // Update player names
    document.querySelectorAll('.player-name').forEach(nameCell => {
        const row = nameCell.closest('tr');
        const player = row.getAttribute('data-player');
        if (!player) return; // skip totals row or any non-player rows
        nameCell.textContent = playerNames[player] || player;
    });
    
    // Update stat cells
    document.querySelectorAll('.stat-cell').forEach(cell => {
        const row = cell.closest('tr');
        const player = row.getAttribute('data-player');
        const stat = cell.getAttribute('data-stat');
        
        if (stats[player] && stats[player][stat] !== undefined) {
            cell.textContent = stats[player][stat];
        } else {
            cell.textContent = 0;
        }
    });

    // Update Serve % cells (Serving)
    document.querySelectorAll('tbody tr').forEach(row => {
        const player = row.getAttribute('data-player');
        if (!player) return;

        const good = stats[player]?.['serving-good'] || 0;
        const ace = stats[player]?.['serving-ace'] || 0;
        const error = stats[player]?.['serving-error'] || 0;
        const total = good + ace + error;

        const pctCell = row.querySelector('.serve-percent');
        if (!pctCell) return;

        if (total === 0) {
            pctCell.textContent = '0%';
        } else {
            // Formula: (GOOD + ACE + ERROR - ERROR) / (GOOD + ACE + ERROR)
            // simplifies to (GOOD + ACE) / total
            const pct = ((total - error) / total) * 100;
            pctCell.textContent = `${Math.round(pct)}%`;
        }
    });

    // Update Serve % cells (Serve/Receive rating)
    document.querySelectorAll('tbody tr').forEach(row => {
        const player = row.getAttribute('data-player');
        if (!player) return;

        const r3 = stats[player]?.['receive-3'] || 0;
        const r2 = stats[player]?.['receive-2'] || 0;
        const r1 = stats[player]?.['receive-1'] || 0;
        const r0 = stats[player]?.['receive-0'] || 0;
        const total = r3 + r2 + r1 + r0;

        const pctCell = row.querySelector('.receive-percent');
        if (!pctCell) return;

        if (total === 0) {
            pctCell.textContent = '0.00';
        } else {
            // Formula: ((3*3) + (2*2) + (1*1)) / (3+2+1+0 counts)
            const rating = ((r3 * 3) + (r2 * 2) + (r1 * 1)) / total;
            pctCell.textContent = rating.toFixed(2);
        }
    });

    // Update Hit % cells (Attack efficiency)
    document.querySelectorAll('tbody tr').forEach(row => {
        const player = row.getAttribute('data-player');
        if (!player) return;

        const attempts = stats[player]?.['attacking-atmpts'] || 0;
        const kills = stats[player]?.['attacking-kills'] || 0;
        const errors = stats[player]?.['attacking-error'] || 0;

        const hitCell = row.querySelector('.hit-percent');
        if (!hitCell) return;

        if (attempts === 0) {
            hitCell.textContent = '0.000';
        } else {
            const eff = (kills - errors) / attempts;
            hitCell.textContent = eff.toFixed(3);
        }
    });

    // Update Dig % cells
    document.querySelectorAll('tbody tr').forEach(row => {
        const player = row.getAttribute('data-player');
        if (!player) return;

        const good = stats[player]?.['digging-good'] || 0;
        const bad = stats[player]?.['digging-bad'] || 0;
        const total = good + bad;

        const digCell = row.querySelector('.dig-percent');
        if (!digCell) return;

        if (total === 0) {
            digCell.textContent = '0%';
        } else {
            const pct = (good / total) * 100;
            digCell.textContent = `${Math.round(pct)}%`;
        }
    });

    // Update totals row
    const totalsRow = document.getElementById('totals-row');
    if (totalsRow) {
        const statKeys = [
            'serving-good',
            'serving-ace',
            'serving-error',
            'receive-3',
            'receive-2',
            'receive-1',
            'receive-0',
            'attacking-atmpts',
            'attacking-kills',
            'attacking-error',
            'digging-good',
            'digging-bad'
        ];

        const totals = {};
        statKeys.forEach(k => totals[k] = 0);

        Object.keys(stats).forEach(player => {
            statKeys.forEach(key => {
                totals[key] += stats[player]?.[key] || 0;
            });
        });

        // Fill summed cells
        statKeys.forEach(key => {
            const cell = totalsRow.querySelector(`[data-total="${key}"]`);
            if (cell) cell.textContent = totals[key];
        });

        // Totals Serve %
        const serveTotal = totals['serving-good'] + totals['serving-ace'] + totals['serving-error'];
        const servePctCell = totalsRow.querySelector('.total-serve-percent');
        if (servePctCell) {
            if (serveTotal === 0) {
                servePctCell.textContent = '0%';
            } else {
                const pct = ((serveTotal - totals['serving-error']) / serveTotal) * 100;
                servePctCell.textContent = `${Math.round(pct)}%`;
            }
        }

        // Totals Receive %
        const recvTotal = totals['receive-3'] + totals['receive-2'] + totals['receive-1'] + totals['receive-0'];
        const recvPctCell = totalsRow.querySelector('.total-receive-percent');
        if (recvPctCell) {
            if (recvTotal === 0) {
                recvPctCell.textContent = '0.00';
            } else {
                const rating = ((totals['receive-3'] * 3) + (totals['receive-2'] * 2) + (totals['receive-1'] * 1)) / recvTotal;
                recvPctCell.textContent = rating.toFixed(2);
            }
        }

        // Totals Hit %
        const hitPctCell = totalsRow.querySelector('.total-hit-percent');
        if (hitPctCell) {
            const attempts = totals['attacking-atmpts'];
            if (attempts === 0) {
                hitPctCell.textContent = '0.000';
            } else {
                const eff = (totals['attacking-kills'] - totals['attacking-error']) / attempts;
                hitPctCell.textContent = eff.toFixed(3);
            }
        }

        // Totals Dig %
        const digPctCell = totalsRow.querySelector('.total-dig-percent');
        if (digPctCell) {
            const good = totals['digging-good'];
            const bad = totals['digging-bad'];
            const total = good + bad;
            if (total === 0) {
                digPctCell.textContent = '0%';
            } else {
                const pct = (good / total) * 100;
                digPctCell.textContent = `${Math.round(pct)}%`;
            }
        }
    }
}

function updateUndoButton() {
    const undoBtn = document.getElementById('undoBtn');
    if (!undoBtn) return;
    if (isTournamentView()) {
        undoBtn.disabled = true;
        return;
    }
    const g = getActiveGame();
    undoBtn.disabled = !g || g.history.length === 0 || g.history[g.history.length - 1].teamId !== activeTeamId;
}

function undoLastChange() {
    if (isTournamentView()) return;
    const g = getActiveGame();
    if (!g || g.history.length === 0) return;

    const previousState = g.history.pop();
    g.statsByTeam[activeTeamId] = previousState.stats;
    g.name = previousState.name || '';
    if (previousState.playerNames) {
        getActiveTeam().players = previousState.playerNames;
        playerNames = getActiveTeam().players;
        saveTeams();
    }
    saveGames();
    savePlayerNames();
    updateGameNameUI();
    updateDisplay();
    updateUndoButton();
}

function incrementStat(player, stat) {
    if (isTournamentView()) return;
    const g = getActiveGame();
    if (!g) return;

    pushHistorySnapshot(g);
    const stats = getStatsForGame(g);
    stats[player][stat] = (stats[player][stat] || 0) + 1;
    saveGames();
    updateDisplay();
    updateUndoButton();
}

function resetStats() {
    if (isTournamentView()) return;
    const g = getActiveGame();
    if (!g) return;

    if (confirm('Are you sure you want to reset this game? This cannot be undone.')) {
        g.history = g.history.filter(snapshot => snapshot.teamId !== activeTeamId);
        g.statsByTeam[activeTeamId] = createEmptyStats();
        g.name = '';
        saveGames();
        updateGameNameUI();
        updateDisplay();
        updateUndoButton();
    }
}

function hardReset() {
    const message = 'WARNING: This will permanently delete ALL saved data including:\n' +
                   '- All tournament totals\n' +
                   '- All game statistics\n' +
                   '- All player names\n' +
                   '- All game names\n\n' +
                   'This action CANNOT be undone!\n\n' +
                   'Are you absolutely sure you want to proceed?';
    
    if (confirm(message)) {
        // Clear all localStorage items related to volleyball stats
        localStorage.removeItem('volleyballGames');
        localStorage.removeItem('volleyballPlayerNames');
        localStorage.removeItem('volleyballTeams');
        localStorage.removeItem('volleyballActiveTeam');
        localStorage.removeItem('volleyballTournamentName');
        localStorage.removeItem('volleyballStats'); // legacy
        localStorage.removeItem('volleyballGameName'); // legacy
        
        // Reset player names
        teams = [createDefaultTeam()];
        activeTeamId = teams[0].id;
        playerNames = teams[0].players;
        ensurePlayerNames();

        // Reset games array back to a single empty game
        nextGameId = 1;
        games = [createEmptyGame('Game 1')];
        
        // Reset tournament name
        tournamentName = '';
        
        // Reset active game index
        activeGameIndex = -1;
        
        // Save the empty state
        saveGames();
        savePlayerNames();
        saveTeams();
        saveTournamentName();
        
        // Update UI
        setActiveTab('tournament');
        renderTeamSelect();
        renderPlayerRows();
        updateDisplay();
        updateGameNameUI();
        updateUndoButton();
        
        // Show confirmation
        const hardResetBtn = document.getElementById('hardResetBtn');
        const originalText = hardResetBtn.textContent;
        hardResetBtn.textContent = 'Reset Complete!';
        hardResetBtn.style.background = '#27ae60';
        
        setTimeout(() => {
            hardResetBtn.textContent = originalText;
            hardResetBtn.style.background = '';
        }, 2000);
    }
}

// Export to CSV
function exportToCSV() {
    const players = getTeamPlayerKeys();

    const escapeCsv = (value) => {
        const str = String(value ?? '');
        // Quote if it contains comma, quote, or newline
        if (/[",\n]/.test(str)) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    const calcServePct = (good, ace, err) => {
        const total = good + ace + err;
        if (total === 0) return '0%';
        const pct = ((total - err) / total) * 100;
        return `${Math.round(pct)}%`;
    };

    const calcPassRating = (r3, r2, r1, r0) => {
        const total = r3 + r2 + r1 + r0;
        if (total === 0) return '0.00';
        const rating = ((r3 * 3) + (r2 * 2) + (r1 * 1)) / total;
        return rating.toFixed(2);
    };

    const calcHitPct = (attempts, kills, errors) => {
        if (attempts === 0) return '0.000';
        const eff = (kills - errors) / attempts;
        return eff.toFixed(3);
    };

    const calcDigPct = (good, bad) => {
        const total = good + bad;
        if (total === 0) return '0%';
        const pct = (good / total) * 100;
        return `${Math.round(pct)}%`;
    };

    // Use the current view's stats (Tournament or active Game)
    const viewStats = getStatsForView();

    // Totals (for current view)
    const totals = {
        'serving-good': 0,
        'serving-ace': 0,
        'serving-error': 0,
        'receive-3': 0,
        'receive-2': 0,
        'receive-1': 0,
        'receive-0': 0,
        'attacking-atmpts': 0,
        'attacking-kills': 0,
        'attacking-error': 0,
        'digging-good': 0,
        'digging-bad': 0
    };

    players.forEach(player => {
        totals['serving-good'] += viewStats[player]?.['serving-good'] || 0;
        totals['serving-ace'] += viewStats[player]?.['serving-ace'] || 0;
        totals['serving-error'] += viewStats[player]?.['serving-error'] || 0;
        totals['receive-3'] += viewStats[player]?.['receive-3'] || 0;
        totals['receive-2'] += viewStats[player]?.['receive-2'] || 0;
        totals['receive-1'] += viewStats[player]?.['receive-1'] || 0;
        totals['receive-0'] += viewStats[player]?.['receive-0'] || 0;
        totals['attacking-atmpts'] += viewStats[player]?.['attacking-atmpts'] || 0;
        totals['attacking-kills'] += viewStats[player]?.['attacking-kills'] || 0;
        totals['attacking-error'] += viewStats[player]?.['attacking-error'] || 0;
        totals['digging-good'] += viewStats[player]?.['digging-good'] || 0;
        totals['digging-bad'] += viewStats[player]?.['digging-bad'] || 0;
    });

    // CSV content
    const lines = [];

    // Game name (top metadata row)
    const gameName = isTournamentView()
        ? 'Tournament Totals'
        : ((getActiveGame()?.name || '').trim());
    lines.push([ 'Game Name', gameName ].map(escapeCsv).join(','));
    lines.push(''); // blank line for readability in Sheets/Excel

    // Header row
    lines.push([
        'Player',
        'Serving Good',
        'Serving Ace',
        'Serving Error',
        'Serve %',
        'Receive 3',
        'Receive 2',
        'Receive 1',
        'Receive 0',
        'Pass %',
        'Attacking Attempts',
        'Attacking Kills',
        'Attacking Error',
        'Hit %',
        'Good Dig',
        'Bad Dig',
        'Dig %'
    ].map(escapeCsv).join(','));

    // Player rows
    players.forEach(player => {
        const good = viewStats[player]?.['serving-good'] || 0;
        const ace = viewStats[player]?.['serving-ace'] || 0;
        const serr = viewStats[player]?.['serving-error'] || 0;

        const r3 = viewStats[player]?.['receive-3'] || 0;
        const r2 = viewStats[player]?.['receive-2'] || 0;
        const r1 = viewStats[player]?.['receive-1'] || 0;
        const r0 = viewStats[player]?.['receive-0'] || 0;

        const att = viewStats[player]?.['attacking-atmpts'] || 0;
        const kills = viewStats[player]?.['attacking-kills'] || 0;
        const aerr = viewStats[player]?.['attacking-error'] || 0;

        const dgood = viewStats[player]?.['digging-good'] || 0;
        const dbad = viewStats[player]?.['digging-bad'] || 0;

        const row = [
            playerNames[player] || player,
            good,
            ace,
            serr,
            calcServePct(good, ace, serr),
            r3,
            r2,
            r1,
            r0,
            calcPassRating(r3, r2, r1, r0),
            att,
            kills,
            aerr,
            calcHitPct(att, kills, aerr),
            dgood,
            dbad,
            calcDigPct(dgood, dbad)
        ];
        lines.push(row.map(escapeCsv).join(','));
    });

    // Totals row (team)
    lines.push([
        'Totals',
        totals['serving-good'],
        totals['serving-ace'],
        totals['serving-error'],
        calcServePct(totals['serving-good'], totals['serving-ace'], totals['serving-error']),
        totals['receive-3'],
        totals['receive-2'],
        totals['receive-1'],
        totals['receive-0'],
        calcPassRating(totals['receive-3'], totals['receive-2'], totals['receive-1'], totals['receive-0']),
        totals['attacking-atmpts'],
        totals['attacking-kills'],
        totals['attacking-error'],
        calcHitPct(totals['attacking-atmpts'], totals['attacking-kills'], totals['attacking-error']),
        totals['digging-good'],
        totals['digging-bad'],
        calcDigPct(totals['digging-good'], totals['digging-bad'])
    ].map(escapeCsv).join(','));

    const csv = lines.join('\n') + '\n';
    
    // Create download link
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    // Generate filename: Stats_(Game Name)_(Tournament Name).csv
    const currentGameName = isTournamentView()
        ? 'Tournament Totals'
        : ((getActiveGame()?.name || '').trim() || `Game ${activeGameIndex + 1}`);
    const currentTournamentName = (tournamentName || 'Tournament').trim();
    
    // Sanitize filename: remove invalid characters and replace spaces with underscores
    const sanitizeFilename = (str) => {
        return str.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_');
    };
    
    const gameNamePart = sanitizeFilename(currentGameName);
    const tournamentNamePart = sanitizeFilename(currentTournamentName);
    const filename = `Stats_${gameNamePart}_${tournamentNamePart}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Show confirmation
    const exportBtn = document.getElementById('exportBtn');
    const originalText = exportBtn.textContent;
    exportBtn.textContent = 'Exported!';
    exportBtn.style.background = '#27ae60';
    
    setTimeout(() => {
        exportBtn.textContent = originalText;
        exportBtn.style.background = '#3498db';
    }, 2000);
}

// Toggle edit mode
function toggleEditMode() {
    editMode = !editMode;
    const editBtn = document.getElementById('editBtn');
    const body = document.body;
    
    if (editMode) {
        editBtn.textContent = 'Done Editing';
        editBtn.classList.add('edit-mode');
        body.classList.add('edit-mode-active');
    } else {
        editBtn.textContent = 'Edit';
        editBtn.classList.remove('edit-mode');
        body.classList.remove('edit-mode-active');
        hideEditModal();
    }
}

// Show edit modal
function showEditModal(title, label, currentValue, onAccept) {
    document.getElementById('editModalTitle').textContent = title;
    document.getElementById('editLabel').textContent = label;
    document.getElementById('editInput').value = currentValue;
    document.getElementById('editInput').select();
    
    const modal = document.getElementById('editModal');
    modal.classList.add('show');
}

// Hide edit modal
function hideEditModal() {
    const modal = document.getElementById('editModal');
    modal.classList.remove('show');
    editingContext = null;
}

// Handle edit accept
function handleEditAccept() {
    if (!editingContext) return;

    const newValue = document.getElementById('editInput').value.trim();

    if (editingContext.type === 'add-game') {
        finishAddGame(newValue);
        hideEditModal();
        return;
    }

    if (isTournamentView()) {
        hideEditModal();
        return;
    }
    const g = getActiveGame();
    if (!g) {
        hideEditModal();
        return;
    }
    
    if (editingContext.type === 'player') {
        // Save to history before changing
        pushHistorySnapshot(g);
        
        const oldPlayer = editingContext.player;
        
        // Update player name
        playerNames[oldPlayer] = newValue || oldPlayer;
        getActiveTeam().players = playerNames;
        saveTeams();
        savePlayerNames();
        saveGames();
        updateDisplay();
        updateUndoButton();
    } else if (editingContext.type === 'stat') {
        // Save to history before changing
        pushHistorySnapshot(g);
        
        const numValue = parseInt(newValue, 10);
        if (!isNaN(numValue) && numValue >= 0) {
            const player = editingContext.player;
            const stat = editingContext.stat;

            getStatsForGame(g)[player][stat] = numValue;
            saveGames();
            updateDisplay();
            updateUndoButton();
        }
    }
    
    hideEditModal();
}

// Handle edit cancel
function handleEditCancel() {
    hideEditModal();
}

// Set up event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Load saved state (games + roster)
    loadState();
    saveGames();
    saveTeams();
    renderGameSelect();
    renderTeamSelect();
    renderPlayerRows();
    
    // Tournament totals tab
    const tournamentTab = document.getElementById('tournamentTab');
    if (tournamentTab) {
        tournamentTab.addEventListener('click', () => setActiveTab('tournament'));
    }

    const gameSelect = document.getElementById('gameSelect');
    if (gameSelect) {
        gameSelect.addEventListener('change', () => {
            if (gameSelect.value === '') {
                setActiveTab('tournament');
                return;
            }
            setActiveTab('game', gameSelect.value);
        });
    }

    document.getElementById('addGameBtn').addEventListener('click', addGame);
    document.getElementById('removeGameBtn').addEventListener('click', removeSelectedGame);
    document.getElementById('teamSelect').addEventListener('change', event => selectTeam(event.target.value));
    document.getElementById('teamsBtn').addEventListener('click', openTeamsEditor);
    document.getElementById('closeTeamsBtn').addEventListener('click', closeTeamsEditor);
    document.getElementById('addTeamBtn').addEventListener('click', addTeam);
    document.getElementById('teamsEditor').addEventListener('input', event => {
        const section = event.target.closest('.team-editor');
        const team = teams.find(item => item.id === section?.dataset.teamId);
        if (!team) return;
        if (event.target.hasAttribute('data-team-name')) {
            team.name = event.target.value.trim() || `Team ${teams.indexOf(team) + 1}`;
            renderTeamSelect();
        } else if (event.target.dataset.playerKey) {
            const playerName = event.target.value.trim();
            if (playerName) team.players[event.target.dataset.playerKey] = playerName;
            else delete team.players[event.target.dataset.playerKey];
            if (team.id === activeTeamId) {
                playerNames = team.players;
                renderPlayerRows();
                updateDisplay();
            }
        }
        saveTeams();
        savePlayerNames();
    });
    document.getElementById('teamsEditor').addEventListener('click', event => {
        const button = event.target.closest('[data-remove-team]');
        if (button) removeTeam(button.dataset.removeTeam);
    });
    document.getElementById('teamsModal').addEventListener('click', event => {
        if (event.target.id === 'teamsModal') closeTeamsEditor();
    });

    // Edit button
    document.getElementById('editBtn').addEventListener('click', toggleEditMode);
    
    // Modal buttons
    document.getElementById('acceptBtn').addEventListener('click', handleEditAccept);
    document.getElementById('cancelBtn').addEventListener('click', handleEditCancel);
    
    // Close modal on background click
    document.getElementById('editModal').addEventListener('click', (e) => {
        if (e.target.id === 'editModal') {
            handleEditCancel();
        }
    });
    
    // Handle Enter key in edit input
    document.getElementById('editInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleEditAccept();
        } else if (e.key === 'Escape') {
            handleEditCancel();
        }
    });

    // Game name input (per-game) and Tournament name input
    const gameInput = document.getElementById('gameName');
    if (gameInput) {
        gameInput.addEventListener('input', (e) => {
            if (isTournamentView()) {
                tournamentName = e.target.value;
                saveTournamentName();
            } else {
                const g = getActiveGame();
                if (!g) return;
                g.name = e.target.value;
                saveGames();
                renderGameSelect();
            }
        });
    }
    
    const statsTable = document.getElementById('statsTable');
    statsTable.addEventListener('click', event => {
        const nameCell = event.target.closest('.player-name');
        const row = event.target.closest('tr');
        const player = row?.getAttribute('data-player');
        if (nameCell && editMode && !isTournamentView() && player) {
            editingContext = { type: 'player', player };
            showEditModal('Edit Player Name', 'Player Name:', playerNames[player] || player, handleEditAccept);
            return;
        }

        const cell = event.target.closest('.stat-cell');
        const stat = cell?.getAttribute('data-stat');
        if (!cell || !player || isTournamentView()) return;
        if (editMode) {
            const currentValue = getStatsForGame(getActiveGame())[player]?.[stat] || 0;
            editingContext = { type: 'stat', player, stat };
            showEditModal('Edit Stat Value', 'Value:', currentValue.toString(), handleEditAccept);
            return;
        }

        incrementStat(player, stat);
        cell.style.transform = 'scale(0.9)';
        setTimeout(() => {
            cell.style.transform = '';
        }, 150);
    });

    let lastTap = 0;
    statsTable.addEventListener('touchend', event => {
        const cell = event.target.closest('.stat-cell');
        if (!cell) return;
        const currentTime = Date.now();
        const tapLength = currentTime - lastTap;
        if (tapLength < 300 && tapLength > 0) event.preventDefault();
        lastTap = currentTime;
    });
    
    // Reset button
    document.getElementById('resetBtn').addEventListener('click', resetStats);
    
    // Undo button
    document.getElementById('undoBtn').addEventListener('click', undoLastChange);
    
    // Export button
    document.getElementById('exportBtn').addEventListener('click', exportToCSV);
    
    // Hard Reset button
    document.getElementById('hardResetBtn').addEventListener('click', hardReset);
    
    // Initialize undo button state
    updateUndoButton();

    // Default to Tournament Totals tab
    setActiveTab('tournament');
    
    // Auto-save on visibility change (when app is backgrounded)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            saveGames();
            savePlayerNames();
            saveTeams();
            saveTournamentName();
        }
    });
    
    // Auto-save before page unload
    window.addEventListener('beforeunload', () => {
        saveGames();
        savePlayerNames();
        saveTeams();
        saveTournamentName();
    });
});
