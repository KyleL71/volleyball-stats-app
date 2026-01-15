const PLAYER_KEYS = ['ZOE', 'AUBREY', 'EVELYN', 'EMMA', 'KARLEA', 'BRI', 'BRIDGET', 'MJ', 'LAILA', 'BRET'];
const STAT_KEYS = [
    'serving-good', 'serving-ace', 'serving-error',
    'receive-3', 'receive-2', 'receive-1', 'receive-0',
    'attacking-atmpts', 'attacking-kills', 'attacking-error',
    'digging-good', 'digging-bad'
];

// Player names mapping (data-player attribute -> displayed name) - shared across all games
let playerNames = {};

// 10 games of stats, each with its own history stack for Undo
let games = [];

// Active tab: -1 = Tournament Totals, 0-9 = Game 1..10
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

function createEmptyGame(index) {
    return {
        id: index,
        name: '',
        stats: createEmptyStats(),
        history: []
    };
}

function savePlayerNames() {
    localStorage.setItem('volleyballPlayerNames', JSON.stringify(playerNames));
}

function saveGames() {
    localStorage.setItem('volleyballGames', JSON.stringify(games));
}

function ensurePlayerNames() {
    PLAYER_KEYS.forEach(player => {
        if (!playerNames[player]) playerNames[player] = player;
    });
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
                    if (typeof v === 'number') games[0].stats[p][k] = v;
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

    if (savedNames) {
        try { playerNames = JSON.parse(savedNames) || {}; } catch (_) { playerNames = {}; }
    }

    if (savedGames) {
        try { games = JSON.parse(savedGames) || []; } catch (_) { games = []; }
    }

    // Ensure 10 games exist
    if (!Array.isArray(games)) games = [];
    for (let i = 0; i < 10; i++) {
        if (!games[i]) games[i] = createEmptyGame(i);
        if (!games[i].stats) games[i].stats = createEmptyStats();
        if (!Array.isArray(games[i].history)) games[i].history = [];
        if (typeof games[i].name !== 'string') games[i].name = '';
    }

    ensurePlayerNames();
    savePlayerNames();

    migrateLegacyIfNeeded();
}

function isTournamentView() {
    return activeGameIndex === -1;
}

function getActiveGame() {
    if (activeGameIndex < 0) return null;
    return games[activeGameIndex];
}

function getStatsForView() {
    if (!isTournamentView()) return getActiveGame().stats;

    // Tournament totals: sum all games into per-player totals
    const agg = createEmptyStats();
    games.forEach(g => {
        PLAYER_KEYS.forEach(p => {
            STAT_KEYS.forEach(k => {
                agg[p][k] += g.stats?.[p]?.[k] || 0;
            });
        });
    });
    return agg;
}

function pushHistorySnapshot(game) {
    const snap = {
        stats: JSON.parse(JSON.stringify(game.stats)),
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
            input.value = 'Tournament Totals';
            input.disabled = true;
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
        }
        if (editBtn) editBtn.disabled = false;
        if (resetBtn) resetBtn.disabled = false;
        updateUndoButton();
    }
}

function setActiveTab(tab, gameIndex) {
    if (tab === 'tournament') activeGameIndex = -1;
    if (tab === 'game') activeGameIndex = Number(gameIndex);

    // Update tab button state
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const selector = tab === 'tournament'
        ? '.tab-btn[data-tab="tournament"]'
        : `.tab-btn[data-tab="game"][data-game-index="${activeGameIndex}"]`;
    const activeBtn = document.querySelector(selector);
    if (activeBtn) activeBtn.classList.add('active');

    updateGameNameUI();
    updateDisplay();
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
    undoBtn.disabled = !g || g.history.length === 0;
}

function undoLastChange() {
    if (isTournamentView()) return;
    const g = getActiveGame();
    if (!g || g.history.length === 0) return;

    const previousState = g.history.pop();
    g.stats = previousState.stats;
    g.name = previousState.name || '';
    playerNames = previousState.playerNames || playerNames;
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
    g.stats[player][stat] = (g.stats[player][stat] || 0) + 1;
    saveGames();
    updateDisplay();
    updateUndoButton();
}

function resetStats() {
    if (isTournamentView()) return;
    const g = getActiveGame();
    if (!g) return;

    if (confirm('Are you sure you want to reset this game? This cannot be undone.')) {
        g.history = [];
        g.stats = createEmptyStats();
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
        localStorage.removeItem('volleyballStats'); // legacy
        localStorage.removeItem('volleyballGameName'); // legacy
        
        // Reset games array
        games = [];
        for (let i = 0; i < 10; i++) {
            games[i] = createEmptyGame(i);
        }
        
        // Reset player names
        playerNames = {};
        ensurePlayerNames();
        
        // Reset active game index
        activeGameIndex = -1;
        
        // Save the empty state
        saveGames();
        savePlayerNames();
        
        // Update UI
        setActiveTab('tournament');
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
    const players = PLAYER_KEYS.slice();

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
    
    link.setAttribute('href', url);
    link.setAttribute('download', `volleyball_stats_${new Date().toISOString().split('T')[0]}.csv`);
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
    if (isTournamentView()) {
        hideEditModal();
        return;
    }
    const g = getActiveGame();
    if (!g) {
        hideEditModal();
        return;
    }
    
    const newValue = document.getElementById('editInput').value.trim();
    
    if (editingContext.type === 'player') {
        // Save to history before changing
        pushHistorySnapshot(g);
        
        const oldPlayer = editingContext.player;
        
        // Update player name
        playerNames[oldPlayer] = newValue || oldPlayer;
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

            g.stats[player][stat] = numValue;
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
    // Load saved state (10 games + roster)
    loadState();
    saveGames();
    
    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-tab');
            const idx = btn.getAttribute('data-game-index');
            setActiveTab(tab, idx);
        });
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

    // Game name input (per-game)
    const gameInput = document.getElementById('gameName');
    if (gameInput) {
        gameInput.addEventListener('input', (e) => {
            if (isTournamentView()) return;
            const g = getActiveGame();
            if (!g) return;
            g.name = e.target.value;
            saveGames();
        });
    }
    
    // Add click listeners to player names
    document.querySelectorAll('.player-name').forEach(nameCell => {
        nameCell.addEventListener('click', (e) => {
            if (!editMode) return;
            if (isTournamentView()) return;
            
            const row = e.target.closest('tr');
            const player = row.getAttribute('data-player');
            if (!player) return;
            const currentName = playerNames[player] || player;
            
            editingContext = {
                type: 'player',
                player: player
            };
            
            showEditModal('Edit Player Name', 'Player Name:', currentName, handleEditAccept);
        });
    });
    
    // Add click listeners to stat cells
    document.querySelectorAll('.stat-cell').forEach(cell => {
        cell.addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            const player = row.getAttribute('data-player');
            const stat = e.target.getAttribute('data-stat');
            if (!player) return;
            if (isTournamentView()) return;
            
            if (editMode) {
                // Edit mode: show edit dialog
                const currentValue = getActiveGame()?.stats?.[player]?.[stat] || 0;
                
                editingContext = {
                    type: 'stat',
                    player: player,
                    stat: stat
                };
                
                showEditModal('Edit Stat Value', 'Value:', currentValue.toString(), handleEditAccept);
            } else {
                // Normal mode: increment stat
                incrementStat(player, stat);
                
                // Visual feedback
                e.target.style.transform = 'scale(0.9)';
                setTimeout(() => {
                    e.target.style.transform = '';
                }, 150);
            }
        });
        
        // Prevent double-tap zoom on mobile
        let lastTap = 0;
        cell.addEventListener('touchend', (e) => {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;
            if (tapLength < 300 && tapLength > 0) {
                e.preventDefault();
            }
            lastTap = currentTime;
        });
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
        }
    });
    
    // Auto-save before page unload
    window.addEventListener('beforeunload', () => {
        saveGames();
        savePlayerNames();
    });
});
