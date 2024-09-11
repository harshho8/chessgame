const express = require("express");
const socket = require("socket.io");
const http = require("http");
const { Chess } = require("chess.js");
const path = require("path");
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socket(server);
let games = {}; // Object to hold multiple games
let playerCount = 0; // Track total players

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.render("index", { title: "Chess Game" });
});

io.on("connection", (socket) => {
    console.log("New connection:", socket.id);
    playerCount++;

    if (playerCount % 3 === 0) { // Start new game when player count is 1, 5, 9, ...
        const gameId = uuidv4();
        games[gameId] = {
            chess: new Chess(),
            players: { white: socket.id, black: null },
            spectators: [],
        };
        socket.join(gameId); // Join socket.io room for the new game
        socket.emit("playerRole", "w");
        socket.emit("boardState", games[gameId].chess.fen());
    } else {
        let joinedGame = false;

        // Try to join an existing game
        for (let gameId in games) {
            const game = games[gameId];
            if (!game.players.black) {
                game.players.black = socket.id;
                socket.join(gameId); // Join socket.io room for the existing game
                socket.emit("playerRole", "b");
                socket.emit("boardState", game.chess.fen());
                joinedGame = true;
                break;
            } else if (game.spectators.length < 2) {
                game.spectators.push(socket.id);
                socket.join(gameId); // Join socket.io room for the existing game
                socket.emit("spectatorRole");
                socket.emit("boardState", game.chess.fen());
                joinedGame = true;
                break;
            }
        }

        // If no available game, create a new one
        if (!joinedGame) {
            const gameId = uuidv4();
            games[gameId] = {
                chess: new Chess(),
                players: { white: socket.id, black: null },
                spectators: [],
            };
            socket.join(gameId); // Join socket.io room for the new game
            socket.emit("playerRole", "w");
            socket.emit("boardState", games[gameId].chess.fen());
        }
    }

    socket.on("disconnect", () => {
        console.log("Disconnected:", socket.id);
        playerCount--;

        // Clean up game state upon disconnect
        for (let gameId in games) {
            const game = games[gameId];
            if (game.players.white === socket.id) {
                delete games[gameId];
            } else if (game.players.black === socket.id) {
                game.players.black = null;
                if (game.players.white) {
                    game.players.black = game.players.white;
                    game.players.white = null;
                    io.to(gameId).emit("playerRole", "b");
                }
            } else {
                const index = game.spectators.indexOf(socket.id);
                if (index !== -1) {
                    game.spectators.splice(index, 1);
                }
            }
        }
    });

    socket.on("move", (move) => {
        try {
            const currentGameId = getCurrentGameId(socket.id);
            const game = games[currentGameId];

            if ((game.chess.turn() === 'w' && socket.id !== game.players.white) ||
                (game.chess.turn() === 'b' && socket.id !== game.players.black)) {
                return;
            }

            const result = game.chess.move(move);
            if (result) {
                io.to(currentGameId).emit("move", move);
                io.to(currentGameId).emit("boardState", game.chess.fen());
            } else {
                console.log("Invalid move:", move);
                socket.emit("invalidMove", move);
            }
        } catch (err) {
            console.error("Move error:", err);
            socket.emit("invalidMove", move);
        }
    });
});

function getCurrentGameId(playerId) {
    for (let gameId in games) {
        const game = games[gameId];
        if (game.players.white === playerId || game.players.black === playerId || game.spectators.includes(playerId)) {
            return gameId;
        }
    }
    return null;
}

server.listen(5000, () => {
    console.log("Listening on port 5000");
});
