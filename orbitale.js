class OrbitaleGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.centerX = this.canvas.width / 2;
        this.centerY = this.canvas.height / 2;
        
        this.rings = 12;
        this.sectors = 24;
        this.maxRadius = 350;
        this.minRadius = 50;
        this.ringWidth = (this.maxRadius - this.minRadius) / this.rings;
        
        this.grid = [];
        this.initGrid();
        
        this.currentPiece = null;
        this.nextPiece = null;
        this.pieceRing = this.rings - 1;
        this.pieceSector = 0;
        this.pieceRotation = 0;
        
        this.arenaRotation = 0;
        this.arenaRotationSpeed = 0;
        
        this.score = 0;
        this.level = 1;
        this.energy = 0;
        this.cascadeMultiplier = 1;
        
        this.phase = 'solid';
        this.availablePhases = ['solid', 'liquid', 'ghost'];
        
        this.dropTimer = 0;
        this.dropSpeed = 60;
        
        this.magneticContacts = [];
        this.clearedRings = [];
        this.clearedRays = [];
        
        this.precessionActive = false;
        this.solarStormActive = false;
        
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.noteFrequencies = this.generateNoteFrequencies();
        
        this.keys = {};
        this.setupControls();
        
        this.generateNextPiece();
        this.spawnNewPiece();
        
        this.lastTime = 0;
        this.gameLoop();
    }
    
    initGrid() {
        for (let ring = 0; ring < this.rings; ring++) {
            this.grid[ring] = [];
            for (let sector = 0; sector < this.sectors; sector++) {
                this.grid[ring][sector] = {
                    filled: false,
                    color: null,
                    polarity: null,
                    shielded: false
                };
            }
        }
    }
    
    generateNoteFrequencies() {
        const baseFreq = 220;
        const notes = [];
        for (let i = 0; i < this.rings; i++) {
            notes.push(baseFreq * Math.pow(2, i / 12));
        }
        return notes;
    }
    
    setupControls() {
        document.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            
            if (e.key === '1') this.setPhase('solid');
            if (e.key === '2') this.setPhase('liquid');
            if (e.key === '3') this.setPhase('ghost');
            if (e.key === ' ') this.hardDrop();
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });
    }
    
    setPhase(phase) {
        if (this.currentPiece && !this.currentPiece.phaseUsed) {
            this.phase = phase;
            this.currentPiece.phase = phase;
            this.currentPiece.phaseUsed = true;
            
            const indicator = document.getElementById('phaseIndicator');
            indicator.textContent = phase.toUpperCase();
            indicator.className = `phase-${phase}`;
        }
    }
    
    generatePieceTypes() {
        return [
            {
                name: 'arc',
                cells: [[0, 0], [0, 1], [0, 2]],
                color: '#00ffff',
                polarities: ['+', '-', '+']
            },
            {
                name: 'spoke',
                cells: [[0, 0], [1, 0], [2, 0]],
                color: '#ff00ff',
                polarities: ['-', null, '-']
            },
            {
                name: 'hook',
                cells: [[0, 0], [0, 1], [1, 0]],
                color: '#ffff00',
                polarities: ['+', '-', null]
            },
            {
                name: 'zigzag',
                cells: [[0, 0], [0, 1], [1, 1], [1, 2]],
                color: '#00ff00',
                polarities: ['+', null, null, '-']
            },
            {
                name: 'tee',
                cells: [[0, 0], [0, 1], [0, 2], [1, 1]],
                color: '#ff0000',
                polarities: ['-', '+', '-', null]
            },
            {
                name: 'wye',
                cells: [[0, 0], [1, 0], [1, 1], [1, -1]],
                color: '#00ff88',
                polarities: [null, '+', '-', '+']
            }
        ];
    }
    
    generateNextPiece() {
        const types = this.generatePieceTypes();
        const type = types[Math.floor(Math.random() * types.length)];
        
        this.nextPiece = {
            ...type,
            phase: 'solid',
            phaseUsed: false,
            ring: this.rings - 1,
            sector: Math.floor(this.sectors / 2)
        };
    }
    
    spawnNewPiece() {
        this.currentPiece = this.nextPiece;
        this.pieceRing = this.rings - 1;
        this.pieceSector = Math.floor(this.sectors / 2);
        this.pieceRotation = 0;
        this.phase = 'solid';
        
        const indicator = document.getElementById('phaseIndicator');
        indicator.textContent = 'SOLID';
        indicator.className = 'phase-solid';
        
        this.generateNextPiece();
    }
    
    rotatePiece(direction) {
        if (!this.currentPiece) return;
        
        const newRotation = this.pieceRotation + direction;
        const rotatedPiece = this.getRotatedPieceCells(this.currentPiece, newRotation);
        
        if (this.canPlacePiece(rotatedPiece, this.pieceRing, this.pieceSector)) {
            this.pieceRotation = newRotation;
        }
    }
    
    getRotatedPieceCells(piece, rotation) {
        const angle = (rotation * Math.PI * 2) / 8;
        return piece.cells.map(([r, s]) => {
            const newS = Math.round(s * Math.cos(angle) - r * Math.sin(angle));
            const newR = Math.round(s * Math.sin(angle) + r * Math.cos(angle));
            return [newR, newS];
        });
    }
    
    canPlacePiece(cells, baseRing, baseSector) {
        for (let [r, s] of cells) {
            const ring = baseRing - r;
            const sector = (baseSector + s + this.sectors) % this.sectors;
            
            if (ring < 0 || ring >= this.rings) return false;
            if (this.grid[ring][sector].filled) {
                if (this.currentPiece.phase !== 'ghost') return false;
            }
        }
        return true;
    }
    
    movePiece() {
        if (!this.currentPiece) return;
        
        this.dropTimer++;
        if (this.dropTimer >= this.dropSpeed) {
            this.dropTimer = 0;
            
            if (this.pieceRing > 0) {
                const cells = this.getRotatedPieceCells(this.currentPiece, this.pieceRotation);
                if (this.canPlacePiece(cells, this.pieceRing - 1, this.pieceSector)) {
                    this.pieceRing--;
                } else {
                    this.lockPiece();
                }
            } else {
                this.lockPiece();
            }
        }
    }
    
    hardDrop() {
        if (!this.currentPiece) return;
        
        while (this.pieceRing > 0) {
            const cells = this.getRotatedPieceCells(this.currentPiece, this.pieceRotation);
            if (this.canPlacePiece(cells, this.pieceRing - 1, this.pieceSector)) {
                this.pieceRing--;
            } else {
                break;
            }
        }
        this.lockPiece();
    }
    
    lockPiece() {
        if (!this.currentPiece) return;
        
        const cells = this.getRotatedPieceCells(this.currentPiece, this.pieceRotation);
        let magneticBonus = 0;
        
        for (let i = 0; i < cells.length; i++) {
            const [r, s] = cells[i];
            const ring = this.pieceRing - r;
            const sector = (this.pieceSector + s + this.sectors) % this.sectors;
            
            if (ring >= 0 && ring < this.rings) {
                this.grid[ring][sector] = {
                    filled: true,
                    color: this.currentPiece.color,
                    polarity: this.currentPiece.polarities[i],
                    shielded: false
                };
                
                this.score += 10 + (this.rings - ring) * 5;
                
                magneticBonus += this.checkMagneticContacts(ring, sector);
            }
        }
        
        if (magneticBonus >= 3) {
            this.energy = Math.min(100, this.energy + magneticBonus * 5);
            this.updateUI();
        }
        
        this.checkClears();
        this.spawnNewPiece();
    }
    
    checkMagneticContacts(ring, sector) {
        let contacts = 0;
        const polarity = this.grid[ring][sector].polarity;
        if (!polarity) return 0;
        
        const neighbors = [
            [ring, (sector + 1) % this.sectors],
            [ring, (sector - 1 + this.sectors) % this.sectors],
            [ring + 1, sector],
            [ring - 1, sector]
        ];
        
        for (let [r, s] of neighbors) {
            if (r >= 0 && r < this.rings) {
                const neighbor = this.grid[r][s];
                if (neighbor.filled && neighbor.polarity) {
                    if (polarity !== neighbor.polarity) {
                        contacts++;
                    }
                }
            }
        }
        
        return contacts;
    }
    
    checkClears() {
        this.clearedRings = [];
        this.clearedRays = [];
        
        for (let ring = 0; ring < this.rings; ring++) {
            let ringFull = true;
            for (let sector = 0; sector < this.sectors; sector++) {
                if (!this.grid[ring][sector].filled) {
                    ringFull = false;
                    break;
                }
            }
            if (ringFull) {
                this.clearedRings.push(ring);
            }
        }
        
        for (let sector = 0; sector < this.sectors; sector++) {
            let rayFull = true;
            for (let ring = 0; ring < this.rings; ring++) {
                if (!this.grid[ring][sector].filled) {
                    rayFull = false;
                    break;
                }
            }
            if (rayFull) {
                this.clearedRays.push(sector);
            }
        }
        
        if (this.clearedRings.length > 0 || this.clearedRays.length > 0) {
            this.performClears();
        }
    }
    
    performClears() {
        for (let ring of this.clearedRings) {
            this.playRingNote(ring);
            this.score += 1000 * this.cascadeMultiplier * this.level;
            
            for (let sector = 0; sector < this.sectors; sector++) {
                this.grid[ring][sector] = {
                    filled: false,
                    color: null,
                    polarity: null,
                    shielded: false
                };
            }
            
            for (let r = ring + 1; r < this.rings; r++) {
                for (let s = 0; s < this.sectors; s++) {
                    this.grid[r - 1][s] = this.grid[r][s];
                    this.grid[r][s] = {
                        filled: false,
                        color: null,
                        polarity: null,
                        shielded: false
                    };
                }
            }
        }
        
        for (let sector of this.clearedRays) {
            this.score += 700 * this.cascadeMultiplier * this.level;
            
            for (let ring = 0; ring < this.rings; ring++) {
                this.grid[ring][sector] = {
                    filled: false,
                    color: null,
                    polarity: null,
                    shielded: false
                };
            }
        }
        
        this.cascadeMultiplier += 0.5;
        this.updateUI();
        
        setTimeout(() => {
            this.checkClears();
        }, 100);
    }
    
    playRingNote(ring) {
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.frequency.value = this.noteFrequencies[ring];
        oscillator.type = 'sine';
        
        gainNode.gain.value = 0.3;
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 0.5);
    }
    
    updateArena(deltaTime) {
        if (this.keys['ArrowLeft']) {
            this.arenaRotation -= 0.03;
        }
        if (this.keys['ArrowRight']) {
            this.arenaRotation += 0.03;
        }
        
        if (this.precessionActive) {
            this.arenaRotation += 0.005;
        }
        
        const sectorAngle = (Math.PI * 2) / this.sectors;
        const rotationDelta = this.arenaRotation / sectorAngle;
        if (Math.abs(rotationDelta) >= 1) {
            const sectorShift = Math.floor(rotationDelta);
            this.pieceSector = (this.pieceSector - sectorShift + this.sectors) % this.sectors;
            this.arenaRotation -= sectorShift * sectorAngle;
        }
    }
    
    update(deltaTime) {
        if (this.keys['q'] || this.keys['Q']) {
            this.rotatePiece(-1);
            this.keys['q'] = false;
            this.keys['Q'] = false;
        }
        if (this.keys['e'] || this.keys['E']) {
            this.rotatePiece(1);
            this.keys['e'] = false;
            this.keys['E'] = false;
        }
        
        if (this.keys['ArrowDown']) {
            this.dropSpeed = 10;
        } else {
            this.dropSpeed = Math.max(10, 60 - this.level * 5);
        }
        
        this.updateArena(deltaTime);
        this.movePiece();
        
        if (this.cascadeMultiplier > 1 && Math.random() < 0.01) {
            this.cascadeMultiplier = Math.max(1, this.cascadeMultiplier - 0.1);
        }
    }
    
    drawGrid() {
        for (let ring = 0; ring < this.rings; ring++) {
            const radius = this.minRadius + ring * this.ringWidth;
            
            this.ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.arc(this.centerX, this.centerY, radius, 0, Math.PI * 2);
            this.ctx.stroke();
            
            for (let sector = 0; sector < this.sectors; sector++) {
                const angle = (sector * Math.PI * 2) / this.sectors + this.arenaRotation;
                const nextAngle = ((sector + 1) * Math.PI * 2) / this.sectors + this.arenaRotation;
                
                const cell = this.grid[ring][sector];
                if (cell.filled) {
                    this.ctx.fillStyle = cell.color;
                    this.ctx.globalAlpha = 0.8;
                    
                    this.ctx.beginPath();
                    this.ctx.arc(this.centerX, this.centerY, radius, angle, nextAngle);
                    this.ctx.arc(this.centerX, this.centerY, radius + this.ringWidth, nextAngle, angle, true);
                    this.ctx.closePath();
                    this.ctx.fill();
                    
                    if (cell.polarity) {
                        this.ctx.globalAlpha = 1;
                        this.ctx.fillStyle = '#ffffff';
                        this.ctx.font = '16px monospace';
                        const textAngle = angle + (nextAngle - angle) / 2;
                        const textRadius = radius + this.ringWidth / 2;
                        const textX = this.centerX + Math.cos(textAngle) * textRadius;
                        const textY = this.centerY + Math.sin(textAngle) * textRadius;
                        this.ctx.fillText(cell.polarity, textX - 5, textY + 5);
                    }
                }
                
                if (sector % 6 === 0) {
                    this.ctx.strokeStyle = 'rgba(0, 255, 255, 0.1)';
                    this.ctx.lineWidth = 0.5;
                    this.ctx.beginPath();
                    this.ctx.moveTo(
                        this.centerX + Math.cos(angle) * this.minRadius,
                        this.centerY + Math.sin(angle) * this.minRadius
                    );
                    this.ctx.lineTo(
                        this.centerX + Math.cos(angle) * this.maxRadius,
                        this.centerY + Math.sin(angle) * this.maxRadius
                    );
                    this.ctx.stroke();
                }
            }
        }
        
        this.ctx.globalAlpha = 1;
    }
    
    drawPiece() {
        if (!this.currentPiece) return;
        
        const cells = this.getRotatedPieceCells(this.currentPiece, this.pieceRotation);
        
        for (let i = 0; i < cells.length; i++) {
            const [r, s] = cells[i];
            const ring = this.pieceRing - r;
            const sector = (this.pieceSector + s + this.sectors) % this.sectors;
            
            if (ring >= 0 && ring < this.rings) {
                const radius = this.minRadius + ring * this.ringWidth;
                const angle = (sector * Math.PI * 2) / this.sectors + this.arenaRotation;
                const nextAngle = ((sector + 1) * Math.PI * 2) / this.sectors + this.arenaRotation;
                
                this.ctx.fillStyle = this.currentPiece.color;
                this.ctx.globalAlpha = this.currentPiece.phase === 'ghost' ? 0.4 : 0.9;
                
                this.ctx.beginPath();
                this.ctx.arc(this.centerX, this.centerY, radius, angle, nextAngle);
                this.ctx.arc(this.centerX, this.centerY, radius + this.ringWidth, nextAngle, angle, true);
                this.ctx.closePath();
                this.ctx.fill();
                
                if (this.currentPiece.phase === 'liquid') {
                    this.ctx.strokeStyle = '#00aaff';
                    this.ctx.lineWidth = 2;
                    this.ctx.stroke();
                }
                
                if (this.currentPiece.polarities[i]) {
                    this.ctx.globalAlpha = 1;
                    this.ctx.fillStyle = '#ffffff';
                    this.ctx.font = '16px monospace';
                    const textAngle = angle + (nextAngle - angle) / 2;
                    const textRadius = radius + this.ringWidth / 2;
                    const textX = this.centerX + Math.cos(textAngle) * textRadius;
                    const textY = this.centerY + Math.sin(textAngle) * textRadius;
                    this.ctx.fillText(this.currentPiece.polarities[i], textX - 5, textY + 5);
                }
            }
        }
        
        this.ctx.globalAlpha = 1;
    }
    
    drawGhostPiece() {
        if (!this.currentPiece) return;
        
        let ghostRing = this.pieceRing;
        const cells = this.getRotatedPieceCells(this.currentPiece, this.pieceRotation);
        
        while (ghostRing > 0) {
            if (this.canPlacePiece(cells, ghostRing - 1, this.pieceSector)) {
                ghostRing--;
            } else {
                break;
            }
        }
        
        for (let [r, s] of cells) {
            const ring = ghostRing - r;
            const sector = (this.pieceSector + s + this.sectors) % this.sectors;
            
            if (ring >= 0 && ring < this.rings) {
                const radius = this.minRadius + ring * this.ringWidth;
                const angle = (sector * Math.PI * 2) / this.sectors + this.arenaRotation;
                const nextAngle = ((sector + 1) * Math.PI * 2) / this.sectors + this.arenaRotation;
                
                this.ctx.strokeStyle = this.currentPiece.color;
                this.ctx.globalAlpha = 0.3;
                this.ctx.lineWidth = 2;
                
                this.ctx.beginPath();
                this.ctx.arc(this.centerX, this.centerY, radius, angle, nextAngle);
                this.ctx.arc(this.centerX, this.centerY, radius + this.ringWidth, nextAngle, angle, true);
                this.ctx.closePath();
                this.ctx.stroke();
            }
        }
        
        this.ctx.globalAlpha = 1;
    }
    
    drawCenter() {
        const gradient = this.ctx.createRadialGradient(
            this.centerX, this.centerY, 0,
            this.centerX, this.centerY, this.minRadius
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(0.5, 'rgba(0, 255, 255, 0.4)');
        gradient.addColorStop(1, 'rgba(0, 255, 255, 0.1)');
        
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, this.minRadius, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.strokeStyle = '#00ffff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }
    
    render() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.save();
        
        this.drawGrid();
        this.drawGhostPiece();
        this.drawPiece();
        this.drawCenter();
        
        this.ctx.restore();
    }
    
    updateUI() {
        document.getElementById('score').textContent = `SCORE: ${this.score}`;
        document.getElementById('level').textContent = `LEVEL: ${this.level}`;
        document.getElementById('energy').textContent = `ENERGY: ${Math.floor(this.energy)}%`;
        
        if (this.score > this.level * 5000) {
            this.level++;
        }
    }
    
    gameLoop(currentTime) {
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        
        this.update(deltaTime);
        this.render();
        
        requestAnimationFrame((time) => this.gameLoop(time));
    }
}

window.addEventListener('load', () => {
    new OrbitaleGame();
});