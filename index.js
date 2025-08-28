// ==========================================
// package.json
// ==========================================
{
  "name": "quiz-game-backend-singleplayer",
  "version": "1.0.0",
  "description": "Quiz Oyunu Backend - Singleplayer",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "mysql2": "^3.6.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}

// ==========================================
// .env (Ortam Değişkenleri)
// ==========================================
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=quiz_game
PORT=3001

// ==========================================
// database.sql (MySQL Tablo Oluşturma)
// ==========================================
CREATE DATABASE IF NOT EXISTS quiz_game CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE quiz_game;

-- Kullanıcılar tablosu
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    total_score INT