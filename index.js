const express = require('express')
const app = express()
const cors = require('cors')
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
require('dotenv').config()

app.use(cors())
app.use(express.static('public'))
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
let db; 

async function initDB() {
  db = await open({
    filename: './database.sqlite',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      _id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      description TEXT NOT NULL,
      duration INTEGER NOT NULL,
      date TEXT,
      FOREIGN KEY(user_id) REFERENCES users(_id)
    );
  `);
  
  console.log('Database initialized and tables created!');
}
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});

app.post('/api/users', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const result = await db.run(
      'INSERT INTO users (username) VALUES (?)',
      [username]
    );
    res.json({
      username: username,
      _id: result.lastID.toString() 
    });
    
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Username already taken' });
    }
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});
app.get('/api/users', async (req, res) => {
  try {
    const users = await db.all('SELECT _id, username FROM users');
    const formattedUsers = users.map(user => ({
      ...user,
      _id: user._id.toString()
    }));

    res.json(formattedUsers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/users/:_id/exercises', async (req, res) => {
  try {
    const userId = req.params._id;
    let { description, duration, date } = req.body;
    const user = await db.get('SELECT _id, username FROM users WHERE _id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    duration = parseInt(duration);
    if (isNaN(duration)) {
      return res.status(400).json({ error: 'Duration must be a number' });
    }
    let exerciseDate = date ? new Date(date) : new Date();
    if (isNaN(exerciseDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
  
    const dateString = exerciseDate.toDateString();
    await db.run(
      'INSERT INTO exercises (user_id, description, duration, date) VALUES (?, ?, ?, ?)',
      [userId, description, duration, dateString]
    );
    res.json({
      _id: user._id.toString(),
      username: user.username,
      date: dateString,
      duration: duration,
      description: description
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/users/:_id/logs', async (req, res) => {
  try {
    const userId = req.params._id;
    const { from, to, limit } = req.query;
    const user = await db.get('SELECT _id, username FROM users WHERE _id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    let log = await db.all(
      'SELECT description, duration, date FROM exercises WHERE user_id = ?', 
      [userId]
    );
    if (from) {
      const fromDate = new Date(from).getTime();
      log = log.filter(exercise => new Date(exercise.date).getTime() >= fromDate);
    }
    if (to) {
      const toDate = new Date(to).getTime();
      log = log.filter(exercise => new Date(exercise.date).getTime() <= toDate);
    }
    if (limit) {
      log = log.slice(0, parseInt(limit));
    }
    res.json({
      _id: user._id.toString(),
      username: user.username,
      count: log.length,
      log: log
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

initDB().then(() => {
  const listener = app.listen(process.env.PORT || 3000, () => {
    console.log('Your app is listening on port ' + listener.address().port);
  });
}).catch(err => {
  console.error("Failed to start database:", err);
});