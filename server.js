const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3');
const path = require('path');
const session = require('express-session');

const app = express();
const port = 3000;

// Use a file-based SQLite database
const db = new sqlite3.Database('./database.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('Failed to open database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS daily_reports (
    date TEXT PRIMARY KEY,
    ringing INTEGER DEFAULT 0,
    paging INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS field_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS management_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT
  )`);
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.json()); // Add JSON body parsing middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));

function updateDailyReport(type) {
  const date = new Date().toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format
  db.get(`SELECT * FROM daily_reports WHERE date = ?`, [date], (err, dailyReport) => {
    if (err) {
      console.error('Error fetching daily report:', err.message);
      return;
    }
    if (dailyReport) {
      db.run(`UPDATE daily_reports SET ${type} = ${type} + 1 WHERE date = ?`, [date], (err) => {
        if (err) {
          console.error('Error updating daily report:', err.message);
        }
      });
    } else {
      db.run(`INSERT INTO daily_reports (date, ${type}) VALUES (?, 1)`, [date], (err) => {
        if (err) {
          console.error('Error inserting daily report:', err.message);
        }
      });
    }
  });
}

function checkFieldAuth(req, res, next) {
  if (req.session.fieldUser) {
    next();
  } else {
    res.redirect('/field-login');
  }
}

function checkManagementAuth(req, res, next) {
  if (req.session.managementUser) {
    next();
  } else {
    res.redirect('/management-login');
  }
}

app.get('/field-register', (req, res) => {
  res.render('field_register');
});

app.post('/field-register', (req, res) => {
  const { email, password } = req.body;
  db.run('INSERT INTO field_users (email, password) VALUES (?, ?)', [email, password], (err) => {
    if (err) {
      console.error('Error registering field user:', err.message);
      res.status(500).send('Error registering user.');
    } else {
      res.redirect('/field-login');
    }
  });
});

app.get('/field-login', (req, res) => {
  res.render('field_login');
});

app.post('/field-login', (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT * FROM field_users WHERE email = ? AND password = ?', [email, password], (err, user) => {
    if (err) {
      console.error('Error logging in field user:', err.message);
      res.status(500).send('Error logging in.');
    } else if (user) {
      req.session.fieldUser = user;
      res.redirect('/');
    } else {
      res.redirect('/field-login');
    }
  });
});

app.get('/management-register', (req, res) => {
  res.render('management_register');
});

app.post('/management-register', (req, res) => {
  const { email, password } = req.body;
  db.run('INSERT INTO management_users (email, password) VALUES (?, ?)', [email, password], (err) => {
    if (err) {
      console.error('Error registering management user:', err.message);
      res.status(500).send('Error registering user.');
    } else {
      res.redirect('/management-login');
    }
  });
});

app.get('/management-login', (req, res) => {
  res.render('management_login');
});

app.post('/management-login', (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT * FROM management_users WHERE email = ? AND password = ?', [email, password], (err, user) => {
    if (err) {
      console.error('Error logging in management user:', err.message);
      res.status(500).send('Error logging in.');
    } else if (user) {
      req.session.managementUser = user;
      res.redirect('/management');
    } else {
      res.redirect('/management-login');
    }
  });
});

app.get('/', checkFieldAuth, (req, res) => {
  res.render('field_team');
});

app.post('/action', checkFieldAuth, (req, res) => {
  const { type } = req.body;
  console.log('Received type:', type); // Debug log
  if (!type) {
    return res.status(400).send('Action type is required.');
  }
  db.run('INSERT INTO actions (type) VALUES (?)', [type], (err) => {
    if (err) {
      console.error('Error recording action:', err.message);
      res.status(500).send('Error recording action.');
    } else {
      updateDailyReport(type);
      res.status(200).send('Action recorded.');
    }
  });
});

app.get('/management', checkManagementAuth, (req, res) => {
  res.render('management');
});

app.post('/report', checkManagementAuth, (req, res) => {
  const { startDate, endDate } = req.body;
  db.all('SELECT date, ringing, paging FROM daily_reports WHERE date BETWEEN ? AND ?', [startDate, endDate], (err, rows) => {
    if (err) {
      console.error('Error fetching report:', err.message);
      res.status(500).send('Error fetching report.');
    } else {
      res.render('management', { report: rows });
    }
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
