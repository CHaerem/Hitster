// Game state and logic
const Game = {
    players: [],
    currentPlayerIndex: 0,
    cardsToWin: 10,
    deck: [],
    currentSong: null,
    usedSongs: new Set(),
    isWaitingForPlacement: false,
    selectedDropIndex: null,

    // Initialize a new game
    init(playerNames, cardsToWin) {
        this.players = playerNames.map(name => ({
            name,
            timeline: [],
            score: 0,
        }));
        this.cardsToWin = cardsToWin;
        this.currentPlayerIndex = 0;
        this.usedSongs = new Set();
        this.deck = shuffleArray(SONGS_DATABASE);
        this.currentSong = null;
        this.isWaitingForPlacement = false;
        this.selectedDropIndex = null;
    },

    // Get current player
    get currentPlayer() {
        return this.players[this.currentPlayerIndex];
    },

    // Draw next song from deck
    drawSong() {
        // Find an unused song
        while (this.deck.length > 0) {
            const song = this.deck.pop();
            const key = `${song.title}-${song.artist}`;
            if (!this.usedSongs.has(key)) {
                this.usedSongs.add(key);
                return song;
            }
        }
        // If deck runs out, reshuffle
        this.deck = shuffleArray(SONGS_DATABASE.filter(s => {
            const key = `${s.title}-${s.artist}`;
            return !this.usedSongs.has(key);
        }));
        if (this.deck.length === 0) {
            // All songs used, reset
            this.usedSongs.clear();
            this.deck = shuffleArray(SONGS_DATABASE);
        }
        return this.deck.pop();
    },

    // Start a new turn
    async startTurn() {
        this.currentSong = this.drawSong();
        this.isWaitingForPlacement = true;
        this.selectedDropIndex = null;

        // Update UI
        this.renderScores();
        this.renderCurrentTurn();
        this.renderTimeline();
        this.renderGameActions();

        // Search and play the song on Spotify
        const vinyl = document.getElementById('vinyl-record');
        vinyl.classList.remove('spinning');

        const trackUri = await SpotifyAuth.searchTrack(this.currentSong.title, this.currentSong.artist);

        if (trackUri) {
            const success = await SpotifyAuth.play(trackUri);
            if (success) {
                vinyl.classList.add('spinning');
            }
        } else {
            // Song not found, skip to next
            console.warn('Song not found on Spotify:', this.currentSong.title);
            this.currentSong = null;
            // Try next song
            await this.startTurn();
        }
    },

    // Toggle playback
    async togglePlayback() {
        await SpotifyAuth.togglePlayback();
    },

    // Check if placement is correct
    isPlacementCorrect(timeline, song, index) {
        // index = position in the timeline array where the song would be inserted
        const year = song.year;

        // Check song before (if exists)
        if (index > 0 && timeline[index - 1].year > year) {
            return false;
        }

        // Check song after (if exists)
        if (index < timeline.length && timeline[index].year < year) {
            return false;
        }

        return true;
    },

    // Place song at index in current player's timeline
    async placeSong(dropIndex) {
        if (!this.isWaitingForPlacement || !this.currentSong) return;

        this.isWaitingForPlacement = false;

        // Pause music
        await SpotifyAuth.pause();
        const vinyl = document.getElementById('vinyl-record');
        vinyl.classList.remove('spinning');

        const player = this.currentPlayer;
        const correct = this.isPlacementCorrect(player.timeline, this.currentSong, dropIndex);

        if (correct) {
            // Insert song into timeline
            player.timeline.splice(dropIndex, 0, {
                title: this.currentSong.title,
                artist: this.currentSong.artist,
                year: this.currentSong.year,
            });
            player.score = player.timeline.length;
        }

        // Show result
        this.showReveal(correct);
    },

    // Show song reveal overlay
    showReveal(correct) {
        const overlay = document.getElementById('song-reveal-overlay');
        const icon = document.getElementById('reveal-result-icon');
        const title = document.getElementById('reveal-title');
        const name = document.getElementById('reveal-song-name');
        const artist = document.getElementById('reveal-song-artist');
        const year = document.getElementById('reveal-song-year');

        icon.className = 'reveal-icon ' + (correct ? 'correct' : 'wrong');
        title.textContent = correct ? 'Riktig!' : 'Feil!';
        name.textContent = this.currentSong.title;
        artist.textContent = this.currentSong.artist;
        year.textContent = this.currentSong.year;

        overlay.classList.add('active');
    },

    // Move to next turn
    nextTurn() {
        const overlay = document.getElementById('song-reveal-overlay');
        overlay.classList.remove('active');

        // Check for winner
        const winner = this.players.find(p => p.score >= this.cardsToWin);
        if (winner) {
            this.showWinner(winner);
            return;
        }

        // Next player
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;

        // Start next turn
        this.startTurn();
    },

    // Show winner screen
    showWinner(winner) {
        document.getElementById('winner-name').textContent = winner.name;

        const scoresEl = document.getElementById('final-scores');
        const sorted = [...this.players].sort((a, b) => b.score - a.score);
        scoresEl.innerHTML = sorted.map(p => `
            <div class="final-score-row ${p === winner ? 'winner' : ''}">
                <span class="final-score-name">${this.escapeHtml(p.name)}</span>
                <span class="final-score-count">${p.score} kort</span>
            </div>
        `).join('');

        App.showScreen('screen-winner');
        SpotifyAuth.pause();
    },

    // Render score chips
    renderScores() {
        const el = document.getElementById('game-scores');
        el.innerHTML = this.players.map((p, i) => `
            <div class="score-chip ${i === this.currentPlayerIndex ? 'active' : ''}">
                ${this.escapeHtml(p.name)}: ${p.score}
            </div>
        `).join('');
    },

    // Render current turn indicator
    renderCurrentTurn() {
        const el = document.getElementById('current-turn');
        el.innerHTML = `<strong>${this.escapeHtml(this.currentPlayer.name)}</strong> sin tur`;
    },

    // Render timeline with drop zones
    renderTimeline() {
        const el = document.getElementById('timeline');
        const player = this.currentPlayer;
        const timeline = player.timeline;

        let html = '';

        // Drop zone at the top (before first card) - "Tidligst"
        if (this.isWaitingForPlacement) {
            html += this.renderDropZone(0, timeline.length === 0 ? 'Plasser her' : 'Eldst');
        }

        for (let i = 0; i < timeline.length; i++) {
            const card = timeline[i];
            html += `
                <div class="timeline-card">
                    <span class="card-year">${card.year}</span>
                    <div class="card-info">
                        <div class="card-title">${this.escapeHtml(card.title)}</div>
                        <div class="card-artist">${this.escapeHtml(card.artist)}</div>
                    </div>
                </div>
            `;

            // Drop zone after each card
            if (this.isWaitingForPlacement) {
                const label = i === timeline.length - 1 ? 'Nyest' : '';
                html += this.renderDropZone(i + 1, label);
            }
        }

        if (timeline.length === 0 && !this.isWaitingForPlacement) {
            html = '<p style="text-align:center;color:var(--text-dim);padding:20px;">Tidslinjen er tom</p>';
        }

        el.innerHTML = html;

        // Update title
        document.getElementById('timeline-title').textContent =
            `${this.escapeHtml(this.currentPlayer.name)}s tidslinje (${timeline.length} kort)`;
    },

    // Render a drop zone
    renderDropZone(index, label = '') {
        return `
            <div class="drop-zone" onclick="Game.onDropZoneClick(${index})">
                <span>${label || 'Plasser her'}</span>
            </div>
        `;
    },

    // Handle drop zone click
    onDropZoneClick(index) {
        if (!this.isWaitingForPlacement) return;

        // Show confirmation
        this.selectedDropIndex = index;
        this.showPlacementConfirmation(index);
    },

    // Show placement confirmation
    showPlacementConfirmation(index) {
        // Remove existing confirmation
        const existing = document.querySelector('.confirm-placement');
        if (existing) existing.remove();

        const player = this.currentPlayer;
        const timeline = player.timeline;

        let positionText = '';
        if (timeline.length === 0) {
            positionText = 'Start tidslinjen med denne sangen?';
        } else if (index === 0) {
            positionText = `Plassere før ${timeline[0].year}?`;
        } else if (index === timeline.length) {
            positionText = `Plassere etter ${timeline[timeline.length - 1].year}?`;
        } else {
            positionText = `Plassere mellom ${timeline[index - 1].year} og ${timeline[index].year}?`;
        }

        const html = `
            <div class="confirm-placement slide-up">
                <p>${positionText}</p>
                <div class="confirm-buttons">
                    <button class="btn btn-secondary" onclick="Game.cancelPlacement()">Avbryt</button>
                    <button class="btn btn-success" onclick="Game.confirmPlacement()">Bekreft</button>
                </div>
            </div>
        `;

        document.getElementById('screen-game').insertAdjacentHTML('beforeend', html);

        // Highlight selected drop zone
        const dropZones = document.querySelectorAll('.drop-zone');
        dropZones.forEach((dz, i) => {
            dz.classList.toggle('highlight', i === index);
        });
    },

    // Cancel placement
    cancelPlacement() {
        const existing = document.querySelector('.confirm-placement');
        if (existing) existing.remove();

        this.selectedDropIndex = null;

        // Remove highlights
        document.querySelectorAll('.drop-zone').forEach(dz => dz.classList.remove('highlight'));
    },

    // Confirm placement
    confirmPlacement() {
        const existing = document.querySelector('.confirm-placement');
        if (existing) existing.remove();

        if (this.selectedDropIndex !== null) {
            this.placeSong(this.selectedDropIndex);
        }
    },

    // Render game action buttons
    renderGameActions() {
        const el = document.getElementById('game-actions');
        el.innerHTML = ''; // Actions are handled via drop zones and confirmation
    },

    // Escape HTML to prevent XSS
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },
};
