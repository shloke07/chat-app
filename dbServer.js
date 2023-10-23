const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');

const app = express();
app.use(bodyParser.json());



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

db.getConnection((err, connection) => {
    if (err) throw (err);
    console.log("DB connected successful: " + connection.threadId)
})


// Utility function to generate OTP
const generateOTP = () => {
    return Math.floor(1000 + Math.random() * 9000); // 4-digit number
};

//OTP generator API
app.post('/otp-generate', (req, res) => {
    const { mobileNumber } = req.body;
    const phoneNumberPattern = /^\d{10}$/;
    if (!mobileNumber) {
        return res.status(400).send({ success: false, message: 'Mobile number is required' });
    }
    if(!phoneNumberPattern.test(mobileNumber)){
        return res.status(400).send({ success: false, message: 'Enter a valid mobile number' });

    }

    const otp = generateOTP();

    res.status(200).send({ success: true, message: `Your one time password is generated.`, otp:otp })
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

            newUser['userId']=results.insertId;
            return res.status(200).send({ success: true, message: 'User registered successfully', user:{newUser} }) 
        });
    });

});

//User login API
app.post('/user-login', (req,res) =>{
    const {email, phoneNumber} = req.body;
    const query = 'SELECT * FROM user WHERE email = ? OR phoneNumber = ?';
    db.query(query, [email, phoneNumber], (error, results ) =>{
        if(error){
            return res.status(500).send({ success:false, message: "Error querying the database", error});
        }

        if(results.length){
            return res.status(200).send({isUserRegistered: true, success:true, message: 'Logging in', user:results[0]}); 
        }
        else{
            return res.status(200).send({isUserRegistered:false, success:false,message: 'User does not exist'}); 
        }
    })
})




const port = process.env.PORT || 3000;

app.listen(port,
    () => console.log(`Server Started on port ${port}...`)).setMaxListeners(10);