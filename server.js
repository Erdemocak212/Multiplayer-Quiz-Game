const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory data storage (replaces database)
let gameData = {
    users: new Map(), // userId -> user data
    leaderboard: [], // top scores
    gameHistory: [] // completed games
};

// Oyun durumu
let gameState = {
    isActive: false,
    currentQuestion: 0,
    totalQuestions: 10,
    timeLeft: 15,
    players: new Map(),
    gameTimer: null,
    gameId: null,
    startTime: null
};

// Sorular (normalde veritabanından gelecek)
const questions = [
    {
        id: 1,
        text: "Türkiye'nin başkenti neresidir?",
        options: ["İstanbul", "Ankara", "İzmir", "Antalya", "Bursa"],
        correct: 1
    },
    {
        id: 2,
        text: "Dünyanın en büyük okyanusu hangisidir?",
        options: ["Atlantik", "Pasifik", "Hint", "Arktik", "Güney"],
        correct: 1
    },
    {
        id: 3,
        text: "JavaScript hangi yılda yaratıldı?",
        options: ["1993", "1995", "1997", "1999", "2001"],
        correct: 1
    },
    {
        id: 4,
        text: "Güneş sisteminde kaç gezegen vardır?",
        options: ["7", "8", "9", "10", "6"],
        correct: 1
    },
    {
        id: 5,
        text: "HTML açılımı nedir?",
        options: ["Hyper Text Markup Language", "High Tech Modern Language", "Home Tool Markup Language", "Hyper Transfer Markup Language", "Host Type Markup Language"],
        correct: 0
    },
    {
        id: 6,
        text: "Dünyanın en yüksek dağı hangisidir?",
        options: ["K2", "Everest", "Kilimanjaro", "Mont Blanc", "Denali"],
        correct: 1
    },
    {
        id: 7,
        text: "CSS neyi ifade eder?",
        options: ["Computer Style Sheets", "Creative Style Sheets", "Cascading Style Sheets", "Colorful Style Sheets", "Common Style Sheets"],
        correct: 2
    },
    {
        id: 8,
        text: "Türkiye kaç ile sahiptir?",
        options: ["79", "80", "81", "82", "83"],
        correct: 2
    },
    {
        id: 9,
        text: "İnternetin babası kimdir?",
        options: ["Bill Gates", "Steve Jobs", "Tim Berners-Lee", "Mark Zuckerberg", "Elon Musk"],
        correct: 2
    },
    {
        id: 10,
        text: "JSON açılımı nedir?",
        options: ["JavaScript Object Notation", "Java Standard Object Notation", "JavaScript Online Notation", "Java Syntax Object Notation", "JavaScript Operator Notation"],
        correct: 0
    }
];

// Helper functions for in-memory data management
function generateUserId() {
    return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function createOrGetUser(name) {
    // Check if user exists
    for (let [userId, userData] of gameData.users) {
        if (userData.name === name) {
            return { id: userId, ...userData };
        }
    }
    
    // Create new user
    const userId = generateUserId();
    const newUser = {
        id: userId,
        name: name,
        total_score: 0,
        games_played: 0,
        created_at: new Date().toISOString()
    };
    
    gameData.users.set(userId, newUser);
    return newUser;
}

function updateLeaderboard(userId, score) {
    const user = gameData.users.get(userId);
    if (user) {
        user.total_score += score;
        user.games_played += 1;
        
        // Update leaderboard
        const leaderboardEntry = gameData.leaderboard.find(entry => entry.id === userId);
        if (leaderboardEntry) {
            leaderboardEntry.total_score = user.total_score;
            leaderboardEntry.games_played = user.games_played;
        } else {
            gameData.leaderboard.push({
                id: userId,
                name: user.name,
                total_score: user.total_score,
                games_played: user.games_played
            });
        }
        
        // Sort leaderboard by score
        gameData.leaderboard.sort((a, b) => b.total_score - a.total_score);
        
        // Keep only top 10
        gameData.leaderboard = gameData.leaderboard.slice(0, 10);
    }
}

function saveGameHistory(gameId, finalScores) {
    const gameHistory = {
        id: gameId,
        start_time: gameState.startTime,
        end_time: new Date().toISOString(),
        total_players: finalScores.length,
        players: finalScores.map(p => p.name),
        scores: finalScores.map(p => p.score),
        status: 'finished'
    };
    
    gameData.gameHistory.unshift(gameHistory);
    
    // Keep only last 10 games
    gameData.gameHistory = gameData.gameHistory.slice(0, 10);
}

// Yeni oyun başlat
function startNewGame() {
    const gameId = 'game_' + Date.now();
    gameState.gameId = gameId;
    gameState.isActive = true;
    gameState.currentQuestion = 0;
    gameState.startTime = new Date().toISOString();

    console.log(`🎮 Yeni oyun başladı: ID ${gameState.gameId}`);
    
    // İlk soruyu gönder
    sendNextQuestion();
}

// Sonraki soruyu gönder
function sendNextQuestion() {
    if (gameState.currentQuestion >= questions.length) {
        endGame();
        return;
    }

    const question = questions[gameState.currentQuestion];
    gameState.timeLeft = 15;

    // Tüm oyunculara soruyu gönder
    io.emit('new_question', {
        questionNumber: gameState.currentQuestion + 1,
        totalQuestions: questions.length,
        question: {
            text: question.text,
            options: question.options
        },
        timeLeft: gameState.timeLeft
    });

    // Oyuncuların cevap durumunu sıfırla
    gameState.players.forEach(player => {
        player.hasAnswered = false;
    });

    // Timer başlat
    startQuestionTimer();
}

// Soru timer'ı
function startQuestionTimer() {
    if (gameState.gameTimer) {
        clearInterval(gameState.gameTimer);
    }

    gameState.gameTimer = setInterval(() => {
        gameState.timeLeft--;

        // Süre güncellemesi gönder
        io.emit('timer_update', { timeLeft: gameState.timeLeft });

        if (gameState.timeLeft <= 0) {
            clearInterval(gameState.gameTimer);
            // Süre bitti, sonraki soruya geç
            setTimeout(() => {
                gameState.currentQuestion++;
                sendNextQuestion();
            }, 2000);
        }
    }, 1000);
}

// Oyunu bitir
function endGame() {
    gameState.isActive = false;
    clearInterval(gameState.gameTimer);

    // Final skorları hazırla
    const finalScores = Array.from(gameState.players.values())
        .sort((a, b) => b.score - a.score)
        .map((player, index) => ({
            rank: index + 1,
            name: player.name,
            score: player.score,
            correctAnswers: player.correctAnswers
        }));

    // Skorları kaydet ve leaderboard güncelle
    for (const [socketId, player] of gameState.players) {
        updateLeaderboard(player.userId, player.score);
    }

    // Oyun geçmişine kaydet
    saveGameHistory(gameState.gameId, finalScores);

    // Final skorları gönder
    io.emit('game_finished', { finalScores });

    console.log('🏁 Oyun bitti!');
    
    // Oyun durumunu sıfırla
    setTimeout(() => {
        resetGameState();
    }, 5000);
}

// Oyun durumunu sıfırla
function resetGameState() {
    gameState = {
        isActive: false,
        currentQuestion: 0,
        totalQuestions: 10,
        timeLeft: 15,
        players: new Map(),
        gameTimer: null,
        gameId: null,
        startTime: null
    };
}

// Socket.IO bağlantıları
io.on('connection', (socket) => {
    console.log('👤 Yeni oyuncu bağlandı:', socket.id);

    // Oyuncu katıldı
    socket.on('join_game', (data) => {
        try {
            const { playerName } = data;
            
            // Kullanıcıyı oluştur veya getir
            const user = createOrGetUser(playerName);
            
            // Oyuncu bilgilerini kaydet
            gameState.players.set(socket.id, {
                userId: user.id,
                name: playerName,
                score: 0,
                correctAnswers: 0,
                hasAnswered: false,
                socketId: socket.id
            });

            console.log(`✅ ${playerName} oyuna katıldı`);

            // Oyuncuya katılım onayı gönder
            socket.emit('joined_game', {
                playerId: socket.id,
                playerName: playerName,
                totalPlayers: gameState.players.size
            });

            // Diğer oyunculara bildir
            socket.broadcast.emit('player_joined', {
                playerName: playerName,
                totalPlayers: gameState.players.size
            });

            // Eğer oyun aktif değilse ve yeterli oyuncu varsa başlat
            if (!gameState.isActive && gameState.players.size >= 2) {
                setTimeout(() => {
                    if (gameState.players.size > 0) {
                        startNewGame();
                    }
                }, 3000); // 3 saniye bekle
            }

            // Eğer oyun aktifse mevcut durumu gönder
            if (gameState.isActive && gameState.currentQuestion < questions.length) {
                const question = questions[gameState.currentQuestion];
                socket.emit('new_question', {
                    questionNumber: gameState.currentQuestion + 1,
                    totalQuestions: questions.length,
                    question: {
                        text: question.text,
                        options: question.options
                    },
                    timeLeft: gameState.timeLeft
                });
            }

        } catch (error) {
            console.error('Oyuncu katılım hatası:', error);
            socket.emit('error', { message: 'Oyuna katılırken hata oluştu' });
        }
    });

    // Cevap geldi
    socket.on('answer_question', (data) => {
        const { selectedOption } = data;
        const player = gameState.players.get(socket.id);
        
        if (!player || player.hasAnswered || !gameState.isActive) {
            return;
        }

        const question = questions[gameState.currentQuestion];
        const isCorrect = selectedOption === question.correct;
        
        player.hasAnswered = true;

        if (isCorrect) {
            // Puan hesapla (hız bonusu ile)
            const timeBonus = Math.max(1, gameState.timeLeft);
            const points = 100 + (timeBonus * 10);
            player.score += points;
            player.correctAnswers++;
        }

        // Oyuncuya sonucu gönder
        socket.emit('answer_result', {
            isCorrect,
            correctAnswer: question.correct,
            score: player.score,
            earnedPoints: isCorrect ? (100 + (Math.max(1, gameState.timeLeft) * 10)) : 0
        });

        // Güncel skorları tüm oyunculara gönder
        const currentScores = Array.from(gameState.players.values())
            .sort((a, b) => b.score - a.score)
            .map(p => ({
                name: p.name,
                score: p.score,
                correctAnswers: p.correctAnswers
            }));

        io.emit('score_update', { scores: currentScores });

        // Tüm oyuncular cevapladıysa sonraki soruya geç
        const allAnswered = Array.from(gameState.players.values())
            .every(p => p.hasAnswered);

        if (allAnswered) {
            clearInterval(gameState.gameTimer);
            setTimeout(() => {
                gameState.currentQuestion++;
                sendNextQuestion();
            }, 2000);
        }
    });

    // Bağlantı koptu
    socket.on('disconnect', () => {
        const player = gameState.players.get(socket.id);
        if (player) {
            console.log(`👋 ${player.name} oyundan ayrıldı`);
            gameState.players.delete(socket.id);
            
            // Diğer oyunculara bildir
            socket.broadcast.emit('player_left', {
                playerName: player.name,
                totalPlayers: gameState.players.size
            });

            // Eğer oyuncu kalmadıysa oyunu sıfırla
            if (gameState.players.size === 0) {
                resetGameState();
            }
        }
    });
});

// API Rotaları

// En iyi skorlar
app.get('/api/leaderboard', (req, res) => {
    try {
        const topScores = gameData.leaderboard
            .filter(user => user.total_score > 0)
            .slice(0, 10)
            .map(user => ({
                name: user.name,
                total_score: user.total_score,
                games_played: user.games_played
            }));
        
        res.json(topScores);
    } catch (error) {
        console.error('Liderlik tablosu hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Son oyun sonuçları
app.get('/api/recent-games', (req, res) => {
    try {
        const recentGames = gameData.gameHistory.slice(0, 5).map(game => ({
            id: game.id,
            start_time: game.start_time,
            total_players: game.total_players,
            players: game.players.join(','),
            scores: game.scores.join(',')
        }));
        
        res.json(recentGames);
    } catch (error) {
        console.error('Son oyunlar hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Oyun durumu
app.get('/api/game-status', (req, res) => {
    res.json({
        isActive: gameState.isActive,
        totalPlayers: gameState.players.size,
        currentQuestion: gameState.currentQuestion + 1,
        totalQuestions: questions.length
    });
});

// Ana sayfa
app.get('/', (req, res) => {
    res.send(`
        <h1>🧠 Quiz Oyunu Backend</h1>
        <p>Socket.IO sunucusu çalışıyor!</p>
        <ul>
            <li><a href="/api/leaderboard">Liderlik Tablosu</a></li>
            <li><a href="/api/recent-games">Son Oyunlar</a></li>
            <li><a href="/api/game-status">Oyun Durumu</a></li>
        </ul>
        <p>Frontend'i buraya yerleştirin: <code>public/</code> klasörü</p>
    `);
});

// Sunucuyu başlat
const PORT = process.env.PORT || 3000;

function startServer() {
    server.listen(PORT, () => {
        console.log(`🚀 Server çalışıyor: http://localhost:${PORT}`);
        console.log(`🔌 Socket.IO hazır!`);
        console.log(`💾 In-memory veri depolama aktif!`);
        console.log(`📊 API endpoints:`);
        console.log(`   - GET /api/leaderboard`);
        console.log(`   - GET /api/recent-games`);
        console.log(`   - GET /api/game-status`);
    });
}

// Hata yakalama
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

startServer();