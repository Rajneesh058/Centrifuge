/* -------------------------------------------------------------------
   CENTRIFUGE PRO CONTROLLER - CORE JAVASCRIPT & DUAL ENGINE + AUDIO CHIMES
   ------------------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
    // --- Application State ---
    const state = {
        commMode: 'dual',          // 'dual' | 'sim' | 'serial' | 'ws'
        isConnected: false,
        usbConnected: false,
        wifiConnected: false,
        activeChannel: 'SIM',      // 'USB' | 'WIFI' | 'SIM'
        
        audioEnabled: true,        // Web Audio API Chimes toggle
        audioCtx: null,
        
        lidClosed: true,           // Physical Lid Interlock State
        motorState: 'IDLE',        // 'IDLE' | 'RAMPING_UP' | 'RUNNING' | 'PAUSED' | 'RAMPING_DOWN' | 'ESTOP'
        currentRPM: 0,
        targetRPM: 3500,
        maxRPM: 10000,
        
        // Timer state
        timerTotalSec: 180,
        timerRemainingSec: 180,
        timerInterval: null,
        
        // Communications
        serialPort: null,
        serialReader: null,
        wsClient: null,
        wifiPollInterval: null,
        espIP: '192.168.4.1',
        
        // Chart history (last 60 data points)
        rpmHistory: new Array(60).fill(0),
        
        // Ramping Physics (Used for simulation & visual interpolation)
        accelerationRate: 150,     // RPM increase per update (10Hz)
        decelerationRate: 200,     // RPM decrease per update
        emergencyBrakeRate: 1200   // Rapid E-Brake deceleration
    };

    // --- DOM Elements ---
    const el = {
        commModeSelect: document.getElementById('comm-mode'),
        btnConnect: document.getElementById('btn-connect'),
        btnAudioToggle: document.getElementById('btn-audio-toggle'),
        txtAudio: document.getElementById('txt-audio'),
        
        pillConn: document.getElementById('pill-conn'),
        txtConn: document.getElementById('txt-conn'),
        
        safetyBanner: document.getElementById('safety-banner'),
        safetyMsg: document.getElementById('safety-msg'),
        btnLidToggleSim: document.getElementById('btn-lid-toggle-sim'),
        
        lblLid: document.getElementById('lbl-lid'),
        badgeLid: document.getElementById('badge-lid'),
        lblStatus: document.getElementById('lbl-status'),
        badgeMotor: document.getElementById('badge-motor'),
        
        currentRPM: document.getElementById('current-rpm'),
        targetRPMDisp: document.getElementById('target-rpm-disp'),
        meterFill: document.getElementById('meter-fill'),
        
        inputRPM: document.getElementById('input-rpm'),
        sliderRPM: document.getElementById('slider-rpm'),
        
        timerDisplay: document.getElementById('timer-display'),
        timerMin: document.getElementById('timer-min'),
        timerSec: document.getElementById('timer-sec'),
        
        btnStart: document.getElementById('btn-start'),
        btnPause: document.getElementById('btn-pause'),
        btnStop: document.getElementById('btn-stop'),
        btnEstop: document.getElementById('btn-estop'),
        
        logConsole: document.getElementById('log-console'),
        btnClearLogs: document.getElementById('btn-clear-logs'),
        
        canvas: document.getElementById('rpmChart')
    };

    let canvasCtx = null;
    if (el.canvas) {
        canvasCtx = el.canvas.getContext('2d');
    }

    // --- Initialization ---
    initCanvas();
    bindEvents();
    updateUIState();
    startSimulationLoop();
    logEvent('SYSTEM', 'Centrifuge Controller Initialized. Dual Wi-Fi + USB Serial + Piezo Audio feedback active.');

    // --- Canvas Setup & Responsive Scaling ---
    function initCanvas() {
        if (!el.canvas) return;
        const rect = el.canvas.parentElement.getBoundingClientRect();
        el.canvas.width = rect.width;
        el.canvas.height = rect.height;
    }

    window.addEventListener('resize', () => {
        initCanvas();
    });

    // --- Web Audio Synthesizer Tunes ---
    function initAudioContext() {
        if (!state.audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            state.audioCtx = new AudioContext();
        }
        if (state.audioCtx.state === 'suspended') {
            state.audioCtx.resume();
        }
    }

    function playToneNote(freq, startTime, duration, type = 'sine') {
        if (!state.audioEnabled || !state.audioCtx) return;

        const osc = state.audioCtx.createOscillator();
        const gain = state.audioCtx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.15, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(gain);
        gain.connect(state.audioCtx.destination);

        osc.start(startTime);
        osc.stop(startTime + duration);
    }

    function playAudioTune(tuneName) {
        if (!state.audioEnabled) return;
        initAudioContext();
        if (!state.audioCtx) return;

        const now = state.audioCtx.currentTime;

        switch (tuneName) {
            case 'START':
                // Upward Arpeggio: C5 -> E5 -> G5 -> C6
                playToneNote(523.25, now, 0.1, 'triangle');
                playToneNote(659.25, now + 0.1, 0.1, 'triangle');
                playToneNote(783.99, now + 0.2, 0.1, 'triangle');
                playToneNote(1046.50, now + 0.3, 0.25, 'triangle');
                break;

            case 'PAUSE':
                // Soft Descending Tones: G5 -> E5
                playToneNote(783.99, now, 0.12, 'sine');
                playToneNote(659.25, now + 0.13, 0.2, 'sine');
                break;

            case 'STOP':
                // Fanfare Completion Tune: C5 -> G5 -> C6 -> E6
                playToneNote(523.25, now, 0.1, 'triangle');
                playToneNote(783.99, now + 0.11, 0.1, 'triangle');
                playToneNote(1046.50, now + 0.22, 0.12, 'triangle');
                playToneNote(1318.51, now + 0.35, 0.3, 'triangle');
                break;

            case 'ESTOP':
                // High Pitch Emergency Alarm Siren
                for (let i = 0; i < 4; i++) {
                    playToneNote(2500, now + i * 0.12, 0.05, 'sawtooth');
                    playToneNote(1800, now + i * 0.12 + 0.06, 0.05, 'sawtooth');
                }
                break;

            case 'LID_WARN':
                // Low Double Warning Beep
                playToneNote(350, now, 0.12, 'square');
                playToneNote(350, now + 0.18, 0.2, 'square');
                break;

            case 'STEP':
                // Subtle Click Tone
                playToneNote(880, now, 0.04, 'sine');
                break;
        }
    }

    // --- Render RPM Graph ---
    function drawChart() {
        if (!canvasCtx || !el.canvas) return;
        const w = el.canvas.width;
        const h = el.canvas.height;

        canvasCtx.clearRect(0, 0, w, h);

        // Grid lines
        canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        canvasCtx.lineWidth = 1;
        
        for (let i = 0; i <= 4; i++) {
            const y = h - (i / 4) * (h - 20) - 10;
            canvasCtx.beginPath();
            canvasCtx.moveTo(0, y);
            canvasCtx.lineTo(w, y);
            canvasCtx.stroke();
        }

        // Draw Target Line
        const targetY = h - (state.targetRPM / state.maxRPM) * (h - 20) - 10;
        canvasCtx.strokeStyle = 'rgba(0, 242, 254, 0.3)';
        canvasCtx.setLineDash([4, 4]);
        canvasCtx.beginPath();
        canvasCtx.moveTo(0, targetY);
        canvasCtx.lineTo(w, targetY);
        canvasCtx.stroke();
        canvasCtx.setLineDash([]);

        // Draw Live RPM Line
        const stepX = w / (state.rpmHistory.length - 1);
        canvasCtx.beginPath();
        canvasCtx.strokeStyle = state.motorState === 'ESTOP' ? '#ef4444' : '#00f2fe';
        canvasCtx.lineWidth = 2.5;

        for (let i = 0; i < state.rpmHistory.length; i++) {
            const val = state.rpmHistory[i];
            const x = i * stepX;
            const y = h - (val / state.maxRPM) * (h - 20) - 10;

            if (i === 0) {
                canvasCtx.moveTo(x, y);
            } else {
                canvasCtx.lineTo(x, y);
            }
        }
        canvasCtx.stroke();

        // Gradient Fill under curve
        const gradient = canvasCtx.createLinearGradient(0, 0, 0, h);
        if (state.motorState === 'ESTOP') {
            gradient.addColorStop(0, 'rgba(239, 68, 68, 0.3)');
            gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
        } else {
            gradient.addColorStop(0, 'rgba(0, 242, 254, 0.25)');
            gradient.addColorStop(1, 'rgba(0, 242, 254, 0)');
        }
        canvasCtx.lineTo(w, h);
        canvasCtx.lineTo(0, h);
        canvasCtx.closePath();
        canvasCtx.fillStyle = gradient;
        canvasCtx.fill();
    }

    // --- Simulation & Telemetry Loop (Runs at 10Hz) ---
    function startSimulationLoop() {
        setInterval(() => {
            // Physics state machine (applies in Sim mode or when disconnected)
            if (state.commMode === 'sim' || (!state.usbConnected && !state.wifiConnected)) {
                updatePhysics();
            }

            // Push to history
            state.rpmHistory.shift();
            state.rpmHistory.push(state.currentRPM);

            // Update UI elements
            renderTelemetry();
            drawChart();
        }, 100);
    }

    function updatePhysics() {
        // Handle Safety Lock override
        if (!state.lidClosed && state.motorState !== 'IDLE' && state.motorState !== 'ESTOP') {
            state.motorState = 'ESTOP';
            playAudioTune('ESTOP');
            logEvent('WARN', 'SAFETY BREACH: Lid opened while motor was spinning! Hardware Interlock triggered.');
        }

        switch (state.motorState) {
            case 'RAMPING_UP':
            case 'RUNNING':
                if (state.currentRPM < state.targetRPM) {
                    state.currentRPM = Math.min(state.targetRPM, state.currentRPM + state.accelerationRate);
                } else if (state.currentRPM > state.targetRPM) {
                    state.currentRPM = Math.max(state.targetRPM, state.currentRPM - state.decelerationRate);
                }

                if (state.currentRPM === state.targetRPM) {
                    state.motorState = 'RUNNING';
                }
                break;

            case 'PAUSED':
            case 'RAMPING_DOWN':
                if (state.currentRPM > 0) {
                    state.currentRPM = Math.max(0, state.currentRPM - state.decelerationRate);
                } else {
                    if (state.motorState === 'RAMPING_DOWN') {
                        playAudioTune('STOP'); // Completion sound on full stop
                    }
                    state.motorState = 'IDLE';
                }
                break;

            case 'ESTOP':
                if (state.currentRPM > 0) {
                    state.currentRPM = Math.max(0, state.currentRPM - state.emergencyBrakeRate);
                }
                break;

            case 'IDLE':
            default:
                if (state.currentRPM > 0) {
                    state.currentRPM = Math.max(0, state.currentRPM - 50);
                }
                break;
        }
    }

    // --- Telemetry Render ---
    function renderTelemetry() {
        // Digital display
        el.currentRPM.textContent = Math.round(state.currentRPM);
        el.targetRPMDisp.textContent = state.targetRPM;

        // Meter Bar
        const pct = Math.min(100, (state.currentRPM / state.maxRPM) * 100);
        el.meterFill.style.width = `${pct}%`;

        // Motor Status Badge
        el.lblStatus.textContent = state.motorState;
        el.badgeMotor.className = 'badge';

        if (state.motorState === 'RUNNING' || state.motorState === 'RAMPING_UP') {
            el.badgeMotor.classList.add('success');
        } else if (state.motorState === 'ESTOP') {
            el.badgeMotor.classList.add('danger');
        } else if (state.motorState === 'PAUSED' || state.motorState === 'RAMPING_DOWN') {
            el.badgeMotor.classList.add('warning');
        }

        // Action Buttons Enable/Disable state
        const isSpinning = state.motorState !== 'IDLE' && state.motorState !== 'ESTOP';
        el.btnStart.disabled = !state.lidClosed || state.motorState === 'RUNNING' || state.motorState === 'RAMPING_UP';
        el.btnPause.disabled = !isSpinning || state.motorState === 'PAUSED';
        el.btnStop.disabled = state.motorState === 'IDLE';
    }

    // --- Update Global UI State ---
    function updateUIState() {
        // Lid Indicator
        if (state.lidClosed) {
            el.lblLid.textContent = 'CLOSED';
            el.badgeLid.className = 'badge success';
            el.safetyBanner.classList.add('hidden');
        } else {
            el.lblLid.textContent = 'OPEN (WARNING)';
            el.badgeLid.className = 'badge danger';
            el.safetyBanner.classList.remove('hidden');
            el.safetyMsg.textContent = 'SAFETY INTERLOCK: Lid is OPEN. Motor power is HARDWARE DISABLED.';
        }

        // Audio Button Icon Update
        if (el.txtAudio) {
            el.txtAudio.textContent = state.audioEnabled ? 'Audio ON' : 'Audio OFF';
            el.btnAudioToggle.querySelector('i').className = state.audioEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
        }

        // Connection Status Pill
        const dot = el.pillConn.querySelector('.status-dot');
        dot.className = 'status-dot';

        if (state.commMode === 'sim') {
            dot.classList.add('simulating');
            el.txtConn.textContent = 'Simulator Mode';
            el.btnConnect.style.display = 'none';
        } else if (state.commMode === 'dual') {
            el.btnConnect.style.display = 'inline-flex';
            if (state.usbConnected && state.wifiConnected) {
                dot.classList.add('connected');
                el.txtConn.textContent = 'DUAL LINK: USB + Wi-Fi OK';
                el.btnConnect.innerHTML = '<i class="fa-solid fa-plug-circle-xmark"></i> Disconnect';
            } else if (state.usbConnected) {
                dot.classList.add('connected');
                el.txtConn.textContent = 'DUAL LINK: USB Active (Wi-Fi Backup)';
                el.btnConnect.innerHTML = '<i class="fa-solid fa-plug-circle-xmark"></i> Disconnect';
            } else if (state.wifiConnected) {
                dot.classList.add('connected');
                el.txtConn.textContent = 'DUAL LINK: Wi-Fi Active (USB Backup)';
                el.btnConnect.innerHTML = '<i class="fa-solid fa-plug-circle-xmark"></i> Disconnect';
            } else {
                dot.classList.add('disconnected');
                el.txtConn.textContent = 'DUAL LINK: Disconnected';
                el.btnConnect.innerHTML = '<i class="fa-solid fa-bolt"></i> Connect Dual Link';
            }
        } else if (state.usbConnected || state.wifiConnected) {
            dot.classList.add('connected');
            el.txtConn.textContent = state.usbConnected ? 'USB Serial Connected' : 'Wi-Fi Connected';
            el.btnConnect.style.display = 'inline-flex';
            el.btnConnect.innerHTML = '<i class="fa-solid fa-plug-circle-xmark"></i> Disconnect';
        } else {
            dot.classList.add('disconnected');
            el.txtConn.textContent = 'Disconnected';
            el.btnConnect.style.display = 'inline-flex';
            el.btnConnect.innerHTML = '<i class="fa-solid fa-plug"></i> Connect';
        }

        renderTimerDisplay();
    }

    // --- Timer System ---
    function renderTimerDisplay() {
        const mins = Math.floor(state.timerRemainingSec / 60);
        const secs = state.timerRemainingSec % 60;
        el.timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    function startTimer() {
        stopTimer();
        state.timerRemainingSec = state.timerTotalSec;
        renderTimerDisplay();

        state.timerInterval = setInterval(() => {
            if (state.motorState === 'RUNNING' || state.motorState === 'RAMPING_UP') {
                if (state.timerRemainingSec > 0) {
                    state.timerRemainingSec--;
                    renderTimerDisplay();
                } else {
                    stopTimer();
                    logEvent('SUCCESS', 'Run timer expired! Initiating controlled ramp down.');
                    playAudioTune('STOP');
                    stopMotor();
                }
            }
        }, 1000);
    }

    function stopTimer() {
        if (state.timerInterval) {
            clearInterval(state.timerInterval);
            state.timerInterval = null;
        }
    }

    // --- Control Handlers ---
    function setTargetRPM(val) {
        let num = parseInt(val, 10);
        if (isNaN(num)) num = 0;
        num = Math.max(0, Math.min(state.maxRPM, num));

        state.targetRPM = num;
        el.inputRPM.value = num;
        el.sliderRPM.value = num;
        el.targetRPMDisp.textContent = num;

        playAudioTune('STEP');
        sendCommand(`SETRPM:${num}`);
    }

    function startMotor() {
        if (!state.lidClosed) {
            playAudioTune('LID_WARN');
            logEvent('ERR', 'Cannot start motor while Lid is OPEN!');
            return;
        }

        state.motorState = 'RAMPING_UP';
        playAudioTune('START');
        logEvent('SYS', `Starting centrifuge... Ramping up to target ${state.targetRPM} RPM.`);
        startTimer();
        sendCommand('START');
    }

    function pauseMotor() {
        state.motorState = 'PAUSED';
        playAudioTune('PAUSE');
        logEvent('WARN', 'Centrifuge PAUSED. Decelerating motor.');
        sendCommand('PAUSE');
    }

    function stopMotor() {
        stopTimer();
        state.motorState = 'RAMPING_DOWN';
        playAudioTune('STOP');
        logEvent('SYS', 'Stopping centrifuge... Controlled ramp down.');
        sendCommand('STOP');
    }

    function triggerEmergencyBrake() {
        stopTimer();
        state.motorState = 'ESTOP';
        playAudioTune('ESTOP');
        logEvent('ERR', 'EMERGENCY BRAKE ENGAGED! Immediate power cut & active braking.');
        sendCommand('ESTOP');
    }

    // --- Dual Integrated Communications Driver ---
    function sendCommand(cmd) {
        if (state.commMode === 'sim') return;

        let sent = false;

        if (state.usbConnected && state.serialPort) {
            try {
                const encoder = new TextEncoder();
                const writer = state.serialPort.writable.getWriter();
                writer.write(encoder.encode(cmd + '\n'));
                writer.releaseLock();
                logEvent('SYS', `[TX USB]: ${cmd}`);
                sent = true;
            } catch (err) {
                logEvent('ERR', `USB Serial TX Error: ${err.message}. Falling back to Wi-Fi.`);
                state.usbConnected = false;
            }
        }

        if (state.wifiConnected || state.commMode === 'dual' || state.commMode === 'ws') {
            fetch(`http://${state.espIP}/cmd?c=${encodeURIComponent(cmd)}`)
                .then(res => res.json())
                .then(data => {
                    if (!sent) logEvent('SYS', `[TX Wi-Fi]: ${cmd}`);
                    parseTelemetryData(data);
                })
                .catch(() => {});
        }
    }

    // Dual Connection Trigger
    async function toggleDualConnections() {
        if (state.usbConnected || state.wifiConnected) {
            if (state.serialReader) await state.serialReader.cancel();
            if (state.serialPort) await state.serialPort.close();
            if (state.wifiPollInterval) clearInterval(state.wifiPollInterval);
            
            state.usbConnected = false;
            state.wifiConnected = false;
            state.isConnected = false;
            logEvent('SYS', 'All Dual Communication links disconnected.');
            updateUIState();
            return;
        }

        logEvent('SYS', 'Initiating Dual Link connection (USB + Wi-Fi)...');

        if ('serial' in navigator) {
            try {
                state.serialPort = await navigator.serial.requestPort();
                await state.serialPort.open({ baudRate: 115200 });
                state.usbConnected = true;
                logEvent('SUCCESS', 'Channel 1 (USB Serial) Connected @ 115200 baud.');
                readSerialData();
            } catch (err) {
                logEvent('WARN', `USB Serial not connected: ${err.message}. Continuing with Wi-Fi.`);
            }
        }

        startWiFiPolling();
        updateUIState();
    }

    function startWiFiPolling() {
        if (state.wifiPollInterval) clearInterval(state.wifiPollInterval);

        state.wifiPollInterval = setInterval(() => {
            fetch(`http://${state.espIP}/status`, { timeout: 1500 })
                .then(res => res.json())
                .then(data => {
                    if (!state.wifiConnected) {
                        state.wifiConnected = true;
                        logEvent('SUCCESS', `Channel 2 (Wi-Fi) Connected at http://${state.espIP}`);
                        updateUIState();
                    }
                    parseTelemetryData(data);
                })
                .catch(() => {
                    if (state.wifiConnected) {
                        state.wifiConnected = false;
                        logEvent('WARN', 'Channel 2 (Wi-Fi) lost. USB Serial remaining active.');
                        updateUIState();
                    }
                });
        }, 300);
    }

    async function readSerialData() {
        const textDecoder = new TextDecoderStream();
        const readableStreamClosed = state.serialPort.readable.pipeTo(textDecoder.writable);
        state.serialReader = textDecoder.readable.getReader();

        try {
            while (true) {
                const { value, done } = await state.serialReader.read();
                if (done) break;
                if (value) {
                    parseTelemetryString(value.trim());
                }
            }
        } catch (err) {
            state.usbConnected = false;
            logEvent('WARN', `USB Serial lost: ${err.message}. Wi-Fi channel remaining active.`);
            updateUIState();
        }
    }

    function parseTelemetryData(obj) {
        if (obj.rpm !== undefined) state.currentRPM = obj.rpm;
        if (obj.lid !== undefined) {
            state.lidClosed = (obj.lid === 1 || obj.lid === true);
            updateUIState();
        }
        if (obj.state !== undefined) state.motorState = obj.state;
    }

    function parseTelemetryString(dataStr) {
        const parts = dataStr.split(',');
        parts.forEach(p => {
            const [key, val] = p.split(':');
            if (key === 'RPM') state.currentRPM = parseInt(val, 10) || 0;
            if (key === 'LID') {
                state.lidClosed = val === '1';
                updateUIState();
            }
            if (key === 'STATE') state.motorState = val;
        });
    }

    // --- Logging Helper ---
    function logEvent(type, message) {
        if (!el.logConsole) return;
        const entry = document.createElement('div');
        const timestamp = new Date().toLocaleTimeString();
        
        let typeClass = 'sys';
        if (type === 'WARN') typeClass = 'warn';
        if (type === 'ERR') typeClass = 'err';
        if (type === 'SUCCESS') typeClass = 'success';

        entry.className = `log-entry ${typeClass}`;
        entry.textContent = `[${timestamp}] ${message}`;

        el.logConsole.appendChild(entry);
        el.logConsole.scrollTop = el.logConsole.scrollHeight;
    }

    // --- DOM Event Bindings ---
    function bindEvents() {
        // Audio Toggle Button
        if (el.btnAudioToggle) {
            el.btnAudioToggle.addEventListener('click', () => {
                state.audioEnabled = !state.audioEnabled;
                if (state.audioEnabled) playAudioTune('START');
                updateUIState();
                logEvent('SYS', `Web Audio feedback set to: ${state.audioEnabled ? 'ON' : 'OFF'}`);
            });
        }

        // Communication mode switch
        el.commModeSelect.addEventListener('change', (e) => {
            state.commMode = e.target.value;
            updateUIState();
            logEvent('SYS', `Communication mode set to: ${e.target.options[e.target.selectedIndex].text}`);
        });

        el.btnConnect.addEventListener('click', () => {
            toggleDualConnections();
        });

        // Lid simulator toggle
        el.btnLidToggleSim.addEventListener('click', () => {
            state.lidClosed = !state.lidClosed;
            if (!state.lidClosed) playAudioTune('LID_WARN');
            updateUIState();
            logEvent('SYS', `Simulated Lid state changed: ${state.lidClosed ? 'CLOSED' : 'OPEN'}`);
        });

        // RPM inputs & adjustments
        el.inputRPM.addEventListener('change', (e) => setTargetRPM(e.target.value));
        el.sliderRPM.addEventListener('input', (e) => setTargetRPM(e.target.value));

        document.querySelectorAll('[data-adj]').forEach(btn => {
            btn.addEventListener('click', () => {
                const delta = parseInt(btn.getAttribute('data-adj'), 10);
                setTargetRPM(state.targetRPM + delta);
            });
        });

        document.querySelectorAll('[data-rpm]').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = parseInt(btn.getAttribute('data-rpm'), 10);
                setTargetRPM(target);
            });
        });

        // Timer setup
        function updateTimerStateFromInputs() {
            const m = parseInt(el.timerMin.value, 10) || 0;
            const s = parseInt(el.timerSec.value, 10) || 0;
            state.timerTotalSec = m * 60 + s;
            state.timerRemainingSec = state.timerTotalSec;
            renderTimerDisplay();
        }

        el.timerMin.addEventListener('change', updateTimerStateFromInputs);
        el.timerSec.addEventListener('change', updateTimerStateFromInputs);

        document.querySelectorAll('[data-min]').forEach(btn => {
            btn.addEventListener('click', () => {
                const m = parseInt(btn.getAttribute('data-min'), 10);
                el.timerMin.value = m;
                el.timerSec.value = 0;
                updateTimerStateFromInputs();
            });
        });

        // Action Buttons
        el.btnStart.addEventListener('click', startMotor);
        el.btnPause.addEventListener('click', pauseMotor);
        el.btnStop.addEventListener('click', stopMotor);
        el.btnEstop.addEventListener('click', triggerEmergencyBrake);

        // Clear logs
        el.btnClearLogs.addEventListener('click', () => {
            el.logConsole.innerHTML = '';
            logEvent('SYS', 'Logs cleared.');
        });
    }
});
