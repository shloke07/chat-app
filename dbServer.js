const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const http = require('http');
const { Server } = require('socket.io');
const WebSocket = require('ws');
const url = require('url');

const wss = new WebSocket.Server({ noServer: true });
const rooms = {}; // Format: { roomName: { client1: username1, client2: username2, ... }, ... }

const server = http.createServer();

const app = express();
app.use(bodyParser.json());
const io = new Server(server);

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

require("dotenv").config()
const DB_HOST = process.env.DB_HOST
const DB_USER = process.env.DB_USER
const DB_PASSWORD = process.env.DB_PASSWORD
const DB_DATABASE = process.env.DB_DATABASE
const DB_PORT = process.env.DB_PORT

const db = mysql.createPool({
    connectionLimit: 100,
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_DATABASE,
    port: DB_PORT
})

let hosts = {};

// Timer to refresh database values every 20 seconds
setInterval(() => {
    db.query('SELECT * FROM conference WHERE endTime is null', (error, results) => {
        if (error) {
            console.error('Error fetching data: ', error);
            return;
        }
        let updatedHosts = {};
        results.forEach(row => {
            updatedHosts[row.roomId] = {
                roomId: row.roomId,
                id: row.hostUserId,
                startTime: row.startTime,
                endTime: row.endTime
            };
        });
        hosts = updatedHosts;
        io.emit('updateHosts', hosts);
        console.log('Hosts updated:', hosts);
    });
}, 20000);

server.on('upgrade', function upgrade(request, socket, head) {
    const pathname = url.parse(request.url).pathname;

    if (pathname === '/hosts/') {
        wss.handleUpgrade(request, socket, head, function done(ws) {
            ws.send(JSON.stringify(hosts));
        });
    } else if (pathname.startsWith('/chatroom/')) {
        const roomName = pathname.split('/')[2];

        wss.handleUpgrade(request, socket, head, function done(ws) {
            let username = 'User' + Date.now() + Math.floor(Math.random() * 1000);
            ws.username = username;
            ws.room = roomName;

            if (!rooms[roomName]) {
                rooms[roomName] = new Map();
            }
            rooms[roomName].set(ws, username);

            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

wss.on('connection', function connection(ws) {
    console.log(`${ws.username} joined room: ${ws.room}`);

    ws.on('message', function incoming(message) {
        // Broadcast message to all clients in the same room
        const room = ws.room;
        if (rooms[room]) {
            rooms[room].forEach((username, client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(`${ws.username}: ${message}`);
                }
            });
        }
    });

    ws.on('close', function close() {
        if (ws.room && rooms[ws.room]) {
            rooms[ws.room].delete(ws);
            console.log(`${ws.username} left room: ${ws.room}`);
        }
    });

    ws.on('error', function error(err) {
        console.error('WebSocket error:', err);
    });
});

// Utility function to generate OTP
const generateOTP = () => {
    return Math.floor(1000 + Math.random() * 9000); // 4-digit number
};

// OTP generator API
app.post('/otp-generate', (req, res) => {
    const { phoneNumber } = req.body;
    const phoneNumberPattern = /^\d{10}$/;
    if (!phoneNumber) {
        return res.status(400).send({ success: false, message: 'Mobile number is required' });
    }
    if (!phoneNumberPattern.test(phoneNumber)) {
        return res.status(400).send({ success: false, message: 'Enter a valid mobile number' });
    }

    const otp = generateOTP();
    res.status(200).send({ success: true, message: `Your one time password is generated.`, otp: otp });
});

// User registration API
app.post('/user-registration', (req, res) => {
    const { email, userName, userProfilePic, phoneNumber, address, androidId, fcmToken, dateOfBirth } = req.body;
    const query = 'SELECT * from user WHERE email = ? OR phoneNumber = ?';
    db.query(query, [email, phoneNumber], (error, results) => {
        if (error) {
            return res.status(500).send({ success: false, message: 'Error querying the database', error });
        }

        if (results.length) {
            return res.status(400).send({ success: false, message: 'User already exists, redirecting to login page' });
        }
        const newUser = {
            email, userName, userProfilePic, phoneNumber, address, androidId, fcmToken, dateOfBirth, userStatus: 0, isUserBlocked: false
        };

        db.query('INSERT INTO user SET ?', newUser, (error, results) => {
            if (error) {
                return res.status(500).send({ success: false, message: 'Error inserting data into the database', error });
            }

            newUser['userId'] = results.insertId;
            return res.status(200).send({ success: true, message: 'User registered successfully', user: { newUser } });
        });
    });
});

// User login API
app.post('/user-login', (req, res) => {
    const { email, phoneNumber } = req.body;
    const query = 'SELECT * FROM user WHERE email = ? OR phoneNumber = ?';
    db.query(query, [email, phoneNumber], (error, results) => {
        if (error) {
            return res.status(500).send({ success: false, message: "Error querying the database", error });
        }

        if (results.length) {
            return res.status(200).send({ isUserRegistered: true, success: true, message: 'Logging in', user: results[0] });
        } else {
            return res.status(200).send({ isUserRegistered: false, success: false, message: 'User does not exist' });
        }
    })
})

const port = process.env.PORT || 3000;

// app.get('/', (req, res) => {
//     res.send("Server is running!");
// });

server.listen(port, () => console.log(`Server Started on port ${port}...`)).setMaxListeners(10);
