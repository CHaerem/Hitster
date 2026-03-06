// Spotify Authentication (PKCE) and Playback
const SpotifyAuth = {
    clientId: null,
    accessToken: null,
    refreshToken: null,
    tokenExpiry: null,
    player: null,
    deviceId: null,
    isPlaying: false,
    isReady: false,
    currentTrackUri: null,

    // Generate random string for PKCE
    generateRandomString(length) {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const values = crypto.getRandomValues(new Uint8Array(length));
        return values.reduce((acc, x) => acc + possible[x % possible.length], '');
    },

    // SHA-256 hash for PKCE
    async sha256(plain) {
        const encoder = new TextEncoder();
        const data = encoder.encode(plain);
        return window.crypto.subtle.digest('SHA-256', data);
    },

    // Base64 URL encode
    base64urlencode(input) {
        return btoa(String.fromCharCode(...new Uint8Array(input)))
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
    },

    // Get redirect URI (current page without hash/query)
    getRedirectUri() {
        return window.location.origin + window.location.pathname;
    },

    // Start login flow
    async login() {
        const clientIdInput = document.getElementById('client-id-input');
        this.clientId = clientIdInput.value.trim();

        if (!this.clientId) {
            this.showStatus('Vennligst skriv inn Client ID', 'error');
            return;
        }

        // Save client ID to localStorage
        localStorage.setItem('hitster_client_id', this.clientId);

        const codeVerifier = this.generateRandomString(64);
        const hashed = await this.sha256(codeVerifier);
        const codeChallenge = this.base64urlencode(hashed);

        localStorage.setItem('hitster_code_verifier', codeVerifier);

        const scope = 'streaming user-read-email user-read-private';
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.clientId,
            scope: scope,
            code_challenge_method: 'S256',
            code_challenge: codeChallenge,
            redirect_uri: this.getRedirectUri(),
        });

        window.location.href = 'https://accounts.spotify.com/authorize?' + params.toString();
    },

    // Handle callback after OAuth redirect
    async handleCallback() {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const error = params.get('error');

        if (error) {
            this.showStatus('Spotify-autentisering feilet: ' + error, 'error');
            return false;
        }

        if (!code) return false;

        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);

        const codeVerifier = localStorage.getItem('hitster_code_verifier');
        this.clientId = localStorage.getItem('hitster_client_id');

        if (!codeVerifier || !this.clientId) {
            this.showStatus('Autentiseringsdata mangler. Prøv igjen.', 'error');
            return false;
        }

        try {
            const response = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: this.clientId,
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: this.getRedirectUri(),
                    code_verifier: codeVerifier,
                }),
            });

            const data = await response.json();

            if (data.error) {
                this.showStatus('Token-feil: ' + data.error_description, 'error');
                return false;
            }

            this.accessToken = data.access_token;
            this.refreshToken = data.refresh_token;
            this.tokenExpiry = Date.now() + (data.expires_in * 1000);

            localStorage.removeItem('hitster_code_verifier');
            localStorage.setItem('hitster_access_token', this.accessToken);
            localStorage.setItem('hitster_refresh_token', this.refreshToken);
            localStorage.setItem('hitster_token_expiry', this.tokenExpiry);

            return true;
        } catch (err) {
            this.showStatus('Nettverksfeil ved innlogging: ' + err.message, 'error');
            return false;
        }
    },

    // Refresh access token
    async refreshAccessToken() {
        if (!this.refreshToken || !this.clientId) return false;

        try {
            const response = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: this.clientId,
                    grant_type: 'refresh_token',
                    refresh_token: this.refreshToken,
                }),
            });

            const data = await response.json();

            if (data.error) return false;

            this.accessToken = data.access_token;
            if (data.refresh_token) this.refreshToken = data.refresh_token;
            this.tokenExpiry = Date.now() + (data.expires_in * 1000);

            localStorage.setItem('hitster_access_token', this.accessToken);
            if (data.refresh_token) localStorage.setItem('hitster_refresh_token', data.refresh_token);
            localStorage.setItem('hitster_token_expiry', this.tokenExpiry);

            return true;
        } catch {
            return false;
        }
    },

    // Ensure valid token
    async ensureToken() {
        if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry - 60000) {
            return true;
        }
        return await this.refreshAccessToken();
    },

    // Try to restore session from localStorage
    async tryRestoreSession() {
        this.clientId = localStorage.getItem('hitster_client_id');
        this.accessToken = localStorage.getItem('hitster_access_token');
        this.refreshToken = localStorage.getItem('hitster_refresh_token');
        this.tokenExpiry = parseInt(localStorage.getItem('hitster_token_expiry') || '0');

        if (this.accessToken && this.refreshToken) {
            if (await this.ensureToken()) {
                return true;
            }
        }
        return false;
    },

    // Initialize Web Playback SDK
    initPlayer() {
        return new Promise((resolve) => {
            if (this.player) {
                resolve(true);
                return;
            }

            window.onSpotifyWebPlaybackSDKReady = () => {
                this.player = new Spotify.Player({
                    name: 'Hitster Web App',
                    getOAuthToken: async (cb) => {
                        await this.ensureToken();
                        cb(this.accessToken);
                    },
                    volume: 0.8,
                });

                this.player.addListener('ready', ({ device_id }) => {
                    this.deviceId = device_id;
                    this.isReady = true;
                    console.log('Spotify Player ready, device:', device_id);
                    resolve(true);
                });

                this.player.addListener('not_ready', () => {
                    this.isReady = false;
                    console.log('Spotify Player not ready');
                });

                this.player.addListener('initialization_error', ({ message }) => {
                    console.error('Init error:', message);
                    resolve(false);
                });

                this.player.addListener('authentication_error', ({ message }) => {
                    console.error('Auth error:', message);
                    resolve(false);
                });

                this.player.addListener('player_state_changed', (state) => {
                    if (!state) return;
                    this.isPlaying = !state.paused;
                    App.updatePlayButton();
                });

                this.player.connect();
            };

            // If SDK already loaded, trigger manually
            if (window.Spotify) {
                window.onSpotifyWebPlaybackSDKReady();
            }
        });
    },

    // Search for a track on Spotify
    async searchTrack(title, artist) {
        await this.ensureToken();

        const query = encodeURIComponent(`track:${title} artist:${artist}`);
        try {
            const response = await fetch(
                `https://api.spotify.com/v1/search?q=${query}&type=track&limit=3`,
                {
                    headers: { 'Authorization': `Bearer ${this.accessToken}` },
                }
            );

            const data = await response.json();

            if (data.tracks && data.tracks.items.length > 0) {
                return data.tracks.items[0].uri;
            }

            // Fallback: simpler search
            const simpleQuery = encodeURIComponent(`${title} ${artist}`);
            const response2 = await fetch(
                `https://api.spotify.com/v1/search?q=${simpleQuery}&type=track&limit=3`,
                {
                    headers: { 'Authorization': `Bearer ${this.accessToken}` },
                }
            );

            const data2 = await response2.json();
            if (data2.tracks && data2.tracks.items.length > 0) {
                return data2.tracks.items[0].uri;
            }

            return null;
        } catch (err) {
            console.error('Search error:', err);
            return null;
        }
    },

    // Play a track
    async play(trackUri) {
        if (!this.isReady || !this.deviceId) {
            console.error('Player not ready');
            return false;
        }

        await this.ensureToken();
        this.currentTrackUri = trackUri;

        try {
            await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${this.deviceId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ uris: [trackUri] }),
            });
            this.isPlaying = true;
            return true;
        } catch (err) {
            console.error('Play error:', err);
            return false;
        }
    },

    // Toggle play/pause
    async togglePlayback() {
        if (!this.player) return;
        await this.player.togglePlay();
    },

    // Pause
    async pause() {
        if (!this.player) return;
        await this.player.pause();
        this.isPlaying = false;
    },

    // Resume
    async resume() {
        if (!this.player) return;
        await this.player.resume();
    },

    showStatus(message, type = '') {
        const el = document.getElementById('spotify-status');
        if (el) {
            el.textContent = message;
            el.className = 'spotify-status ' + type;
        }
    },
};
