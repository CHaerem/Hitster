// Main application controller
const App = {
    winCount: 10,

    async init() {
        // Set redirect URI display
        document.getElementById('redirect-uri').textContent = SpotifyAuth.getRedirectUri();

        // Restore client ID if saved
        const savedClientId = localStorage.getItem('hitster_client_id');
        if (savedClientId) {
            document.getElementById('client-id-input').value = savedClientId;
        }

        // Check if returning from Spotify auth
        const params = new URLSearchParams(window.location.search);
        if (params.has('code')) {
            this.showScreen('screen-spotify');
            SpotifyAuth.showStatus('Logger inn med Spotify...', '');

            const success = await SpotifyAuth.handleCallback();
            if (success) {
                SpotifyAuth.showStatus('Innlogget! Starter spilleren...', 'success');
                await this.initPlayerAndStart();
            }
            return;
        }

        // Try to restore session
        const hasSession = await SpotifyAuth.tryRestoreSession();
        if (hasSession) {
            // Pre-fill client ID
            const clientId = localStorage.getItem('hitster_client_id');
            if (clientId) {
                document.getElementById('client-id-input').value = clientId;
            }
        }
    },

    async initPlayerAndStart() {
        const ready = await SpotifyAuth.initPlayer();
        if (ready) {
            SpotifyAuth.showStatus('Klar! Trykk "Start spill" for å begynne.', 'success');

            // Restore player names if returning from auth
            const savedState = this.loadGameSetup();
            if (savedState) {
                this.restoreSetup(savedState);
                // Auto-start the game
                this.startGame();
            }
        } else {
            SpotifyAuth.showStatus('Kunne ikke starte Spotify-spilleren. Sjekk at du har Premium.', 'error');
        }
    },

    // Show a specific screen
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    },

    // Navigate to setup
    showSetup() {
        this.showScreen('screen-setup');
    },

    // Navigate to Spotify auth
    async showSpotifyAuth() {
        // Validate players
        const names = this.getPlayerNames();
        if (names.length < 2) {
            alert('Du trenger minst 2 spillere!');
            return;
        }

        // Save setup state in case we need to redirect
        this.saveGameSetup(names, this.winCount);

        // Check if already authenticated
        if (SpotifyAuth.accessToken && SpotifyAuth.isReady) {
            this.startGame();
            return;
        }

        if (SpotifyAuth.accessToken && !SpotifyAuth.isReady) {
            this.showScreen('screen-spotify');
            SpotifyAuth.showStatus('Starter Spotify-spilleren...', '');
            await this.initPlayerAndStart();
            return;
        }

        if (await SpotifyAuth.tryRestoreSession()) {
            this.showScreen('screen-spotify');
            SpotifyAuth.showStatus('Gjenoppretter sesjon...', '');
            await this.initPlayerAndStart();
            return;
        }

        this.showScreen('screen-spotify');
    },

    // Start the game
    startGame() {
        const names = this.getPlayerNames();
        if (names.length < 2) return;

        Game.init(names, this.winCount);
        this.showScreen('screen-game');
        Game.startTurn();
    },

    // Get player names from input fields
    getPlayerNames() {
        const inputs = document.querySelectorAll('.player-name-input');
        const names = [];
        inputs.forEach((input, i) => {
            const name = input.value.trim() || `Spiller ${i + 1}`;
            names.push(name);
        });
        return names;
    },

    // Add player input
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

    // Remove player input
    removePlayer(btn) {
        const row = btn.parentElement;
        const list = document.getElementById('player-list');
        if (list.children.length <= 2) return;
        row.remove();
        this.updateRemoveButtons();
        // Update placeholders
        document.querySelectorAll('.player-name-input').forEach((input, i) => {
            input.placeholder = `Spiller ${i + 1}`;
        });
    },

    // Update remove button visibility
    updateRemoveButtons() {
        const buttons = document.querySelectorAll('.btn-remove-player');
        const canRemove = buttons.length > 2;
        buttons.forEach(btn => {
            btn.style.visibility = canRemove ? 'visible' : 'hidden';
        });
    },

    // Adjust win count
    adjustWinCount(delta) {
        this.winCount = Math.max(3, Math.min(20, this.winCount + delta));
        document.getElementById('win-count').textContent = this.winCount;
    },

    // Copy redirect URI to clipboard
    async copyRedirectUri() {
        const uri = SpotifyAuth.getRedirectUri();
        try {
            await navigator.clipboard.writeText(uri);
            const btn = document.querySelector('.btn-copy');
            btn.textContent = 'Kopiert!';
            setTimeout(() => btn.textContent = 'Kopier', 2000);
        } catch {
            // Fallback
            const input = document.createElement('input');
            input.value = uri;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
        }
    },

    // Update play/pause button
    updatePlayButton() {
        const iconPlay = document.getElementById('icon-play');
        const iconPause = document.getElementById('icon-pause');
        const vinyl = document.getElementById('vinyl-record');

        if (SpotifyAuth.isPlaying) {
            iconPlay.style.display = 'none';
            iconPause.style.display = 'block';
            vinyl.classList.add('spinning');
        } else {
            iconPlay.style.display = 'block';
            iconPause.style.display = 'none';
            vinyl.classList.remove('spinning');
        }
    },

    // Save game setup to localStorage (survives OAuth redirect)
    saveGameSetup(names, winCount) {
        localStorage.setItem('hitster_game_setup', JSON.stringify({ names, winCount }));
    },

    // Load game setup from localStorage
    loadGameSetup() {
        const data = localStorage.getItem('hitster_game_setup');
        if (data) {
            localStorage.removeItem('hitster_game_setup');
            return JSON.parse(data);
        }
        return null;
    },

    // Restore setup from saved state
    restoreSetup(state) {
        this.winCount = state.winCount;
        document.getElementById('win-count').textContent = state.winCount;

        const list = document.getElementById('player-list');
        list.innerHTML = '';

        state.names.forEach((name, i) => {
            const row = document.createElement('div');
            row.className = 'player-input-row';
            row.innerHTML = `
                <input type="text" class="player-name-input" placeholder="Spiller ${i + 1}" maxlength="15" value="${this.escapeAttr(name)}">
                <button class="btn-icon btn-remove-player" onclick="App.removePlayer(this)">&times;</button>
            `;
            list.appendChild(row);
        });
        this.updateRemoveButtons();
    },

    // Restart game
    restart() {
        this.showScreen('screen-setup');
    },

    escapeAttr(str) {
        return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
