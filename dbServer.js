const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const http = require('http');
const { Server } = require('socket.io');
const MySQLEvents = require('mysql-events');

const app = express();
app.use(bodyParser.json());
const server = http.createServer(app);
const io = new Server(server);


// app.get('/', (req, res) => {
//     res.sendFile(__dirname + '/public/index.html');
// });





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


const dsn = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
};


db.query('SELECT * FROM conference WHERE endTime = 0', (error, results) => {
    if (error) throw error;
    results.forEach(row => {
        hosts[row.roomId] = {
            id: row.hostId,
            startTime: row.startTime,
            endTime: row.endTime
        };
    });
});

const mysqlEventWatcher = MySQLEvents(dsn);
const watcher = mysqlEventWatcher.add(
    'u373538896_gdlive.conference.endTime',
    function (oldRow, newRow, event) {
        // Host goes offline
        if (newRow !== null && newRow.fields.endTime !== 0) {
            const roomId = newRow.fields.roomId;
            delete hosts[roomId];
            io.emit('updateHosts', hosts);
        }
        // New Host comes online
        if (oldRow === null) {
            hosts[newRow.fields.roomId] = {
                id: newRow.fields.hostId,
                startTime: newRow.fields.startTime,
                endTime: newRow.fields.endTime
            };
            io.emit('updateHosts', hosts);
        }
    },
    'active'
);


db.getConnection((err, connection) => {
    if (err) throw (err);
    console.log("DB connected successful: " + connection.threadId)
})




io.on('connection', (socket) => {
    console.log('a user has connected:', socket.id);

    // Update client with currently available hosts
    socket.emit('updateHosts', hosts);

    socket.on('joinRoom', (roomId) => {
        socket.join(roomId);
        socket.to(roomId).emit('userJoined', socket.id);
    });

    socket.on('message', (data) => {
        io.to('msg-' + data.roomId).emit('newMessage', {
            userId: socket.id,
            message: data.message
        });
    });

    socket.on('disconnect', () => {
        // Remove from hosts list if it was a host
        for (let roomId in hosts) {
            if (hosts[roomId] === socket.id) {
                delete hosts[roomId];
                io.emit('updateHosts', hosts);
            }
        }
        console.log('A user disconnected', socket.id);
    });

    // Existing WebRTC Signaling
    socket.on('createOffer', (data) => {
        socket.to(data.to).emit('offerCreated', {
            offer: data.offer,
            from: socket.id
        });
    });

    socket.on('createAnswer', (data) => {
        socket.to(data.to).emit('answerCreated', {
            answer: data.answer,
            from: socket.id
        });
    });

    socket.on('sendIceCandidate', (data) => {
        socket.to(data.to).emit('emitCandidateReceived', {
            candidate: data.candidate
        });
    });
});

// Utility function to generate OTP
const generateOTP = () => {
    return Math.floor(1000 + Math.random() * 9000); // 4-digit number
};

//OTP generator API
app.post('/otp-generate', (req, res) => {
    const { phoneNumber } = req.body;
    // console.log(phoneNumber)
    const phoneNumberPattern = /^\d{10}$/;
    if (!phoneNumber) {
        return res.status(400).send({ success: false, message: 'Mobile number is required' });
    }
    if (!phoneNumberPattern.test(phoneNumber)) {
        return res.status(400).send({ success: false, message: 'Enter a valid mobile number' });

    }

    const otp = generateOTP();

    res.status(200).send({ success: true, message: `Your one time password is generated.`, otp: otp })
});

//User registration API
app.post('/user-registration', (req, res) => {
    const { email, userName, userProfilePic, phoneNumber, address,
        androidId, fcmToken, dateOfBirth } = req.body;
    const query = 'SELECT * from user WHERE email = ? OR phoneNumber = ?';
    db.query(query, [email, phoneNumber], (error, results) => {
        if (error) {
            return res.status(500).send({ success: false, message: 'Error querying the database', error });
        }

        if (results.length) {
            return res.status(400).send({ success: false, message: 'User already exists, redirecting to login page' });
        }
        const newUser = {
            email, userName, userProfilePic, phoneNumber, address,
            androidId, fcmToken, dateOfBirth, userStatus: 0, isUserBlocked: false
        };

        db.query('INSERT INTO user SET ?', newUser, (error, results) => {
            if (error) {
                return res.status(500).send({ success: false, message: 'Error inserting data into the database', error });
            }

            newUser['userId'] = results.insertId;
            return res.status(200).send({ success: true, message: 'User registered successfully', user: { newUser } })
        });
    });

});

//User login API
app.post('/user-login', (req, res) => {
    const { email, phoneNumber } = req.body;
    const query = 'SELECT * FROM user WHERE email = ? OR phoneNumber = ?';
    db.query(query, [email, phoneNumber], (error, results) => {
        if (error) {
            return res.status(500).send({ success: false, message: "Error querying the database", error });
        }

        if (results.length) {
            return res.status(200).send({ isUserRegistered: true, success: true, message: 'Logging in', user: results[0] });
        }
        else {
            return res.status(200).send({ isUserRegistered: false, success: false, message: 'User does not exist' });
        }
    })
})




const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send("Server is running!");
});


server.listen(port,
    () => console.log(`Server Started on port ${port}...`)).setMaxListeners(10);