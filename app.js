// Main application controller
const App = {
    winCount: 10,

    init() {
        // Nothing to restore - no auth needed!
    },

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    },

    showSetup() {
        this.showScreen('screen-setup');
    },

    async startGame() {
        const names = this.getPlayerNames();
        if (names.length < 2) {
            return;
        }

        Game.init(names, this.winCount);
        this.showScreen('screen-game');

        // Initialize embed and start first turn
        await Game.initEmbed();
        Game.startTurn();
    },

    getPlayerNames() {
        const inputs = document.querySelectorAll('.player-name-input');
        const names = [];
        inputs.forEach((input, i) => {
            const name = input.value.trim() || `Spiller ${i + 1}`;
            names.push(name);
        });
        return names;
    },

    addPlayer() {
        const list = document.getElementById('player-list');
        const count = list.children.length;
        if (count >= 10) return;

        const row = document.createElement('div');
        row.className = 'player-input-row fade-in';
        row.innerHTML = `
            <input type="text" class="player-name-input" placeholder="Spiller ${count + 1}" maxlength="15">
            <button class="btn-icon btn-remove-player" onclick="App.removePlayer(this)">&times;</button>
        `;
        list.appendChild(row);
        this.updateRemoveButtons();
    },

    removePlayer(btn) {
        const row = btn.parentElement;
        const list = document.getElementById('player-list');
        if (list.children.length <= 2) return;
        row.remove();
        this.updateRemoveButtons();
        document.querySelectorAll('.player-name-input').forEach((input, i) => {
            input.placeholder = `Spiller ${i + 1}`;
        });
    },

    updateRemoveButtons() {
        const buttons = document.querySelectorAll('.btn-remove-player');
        const canRemove = buttons.length > 2;
        buttons.forEach(btn => {
            btn.style.visibility = canRemove ? 'visible' : 'hidden';
        });
    },

    adjustWinCount(delta) {
        this.winCount = Math.max(3, Math.min(20, this.winCount + delta));
        document.getElementById('win-count').textContent = this.winCount;
    },

    restart() {
        this.showScreen('screen-setup');
    },
};

document.addEventListener('DOMContentLoaded', () => App.init());
