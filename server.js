const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const LdapAuth = require('ldapauth-fork');
const ldapjs = require('ldapjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

const ldap = new LdapAuth({
  url: 'ldap://localhost:389',
  bindDN: 'cn=admin,dc=testorg,dc=com',
  bindCredentials: 'admin123',
  searchBase: 'ou=users,dc=testorg,dc=com',
  searchFilter: '(uid={{username}})',
  reconnect: true,
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({ secret: 'secret_key', resave: false, saveUninitialized: false }));
const upload = multer({ dest: path.join(__dirname, 'uploads/') });

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '231203',
  database: 'ber',
});

function checkAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.redirect('frontend/login.html');
}

function isAdmin(req, res, next) {
  if (req.session.user?.role === 'admin') return next();
  return res.status(403).send('Admins only');
}

function isManager(req, res, next) {
  if (['manager', 'admin'].includes(req.session.user?.role)) return next();
  return res.status(403).send('Managers only');
}

app.use(express.static(path.join(__dirname, 'frontend')));

app.get('/', (req, res) => {
  if (!req.session.user) return res.sendFile(path.join(__dirname, 'frontend/login.html'));
  const role = req.session.user.role;
  const file = role === 'admin' ? 'dashboard.html' : role === 'manager' ? 'manager_dashboard.html' : 'user_dashboard.html';
  res.sendFile(path.join(__dirname, 'frontend', file));
});
app.get('/my-projects', checkAuth, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM projects WHERE submitted_by = ?', [req.session.user.username]);
  res.json(rows);
});
app.get('/task-work-elements/:taskId', checkAuth, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, name FROM work_elements WHERE task_id = ?',
    [req.params.taskId]
  );
  res.json(rows);
});
app.get('/work-element-budgets/:weId', checkAuth, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, amount FROM budgets WHERE work_element_id = ? AND status = "approved"',
    [req.params.weId]
  );
  res.json(rows);
});



app.post('/login', (req, res) => {
  const { username, password } = req.body;
  ldap.authenticate(username, password, async (err, user) => {
    if (err || !user) return res.send('LDAP auth failed');
    try {
      const [rows] = await pool.query('SELECT role FROM users WHERE username = ?', [username]);
      if (!rows.length) return res.send('User not found in DB');
      req.session.user = { username, role: rows[0].role };
      res.redirect('/');
    } catch (e) {
      res.send('DB error: ' + e.message);
    }
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login.html'));
});
app.get('/dashboard-metrics', isAdmin, async (req, res) => {
  try {
    const [projects] = await pool.query('SELECT COUNT(*) as count FROM projects');
    const [budgets] = await pool.query('SELECT COUNT(*) as count FROM budgets');
    const [afes] = await pool.query('SELECT COUNT(*) as count FROM afes');
    const [invoices] = await pool.query('SELECT COUNT(*) as count FROM invoices');
    const [production] = await pool.query('SELECT SUM(price_per_barrel * number_of_barrels - cost) as profit FROM production');
    res.json({
      totalProjects: projects[0].count,
      totalBudgets: budgets[0].count,
      totalAFEs: afes[0].count,
      totalInvoices: invoices[0].count,
      totalProfit: production[0].profit || 0
    });
  } catch (e) {
    res.status(500).send('❌ Failed to load dashboard metrics');
  }
});

app.get('/user', checkAuth, (req, res) => res.json(req.session.user));
// 🔐 Admin-only: Add User (LDAP + DB)
app.post('/admin/add-user', isAdmin, async (req, res) => {
  const { username, password, role, cn, sn } = req.body;
  if (!username || !password || !role || !cn || !sn)
    return res.status(400).send('Missing fields');

  if (!['user', 'manager'].includes(role))
    return res.status(400).send('Role must be user or manager');

  try {
    // Add to LDAP
    await new Promise((resolve, reject) => {
      const client = ldapjs.createClient({ url: 'ldap://localhost:389' });
      client.bind('cn=admin,dc=testorg,dc=com', 'admin123', (err) => {
        if (err) return reject(err);

        const entry = {
          cn,
          sn,
          objectClass: ['inetOrgPerson', 'top'],
          uid: username,
          userPassword: password
        };
        const dn = `uid=${username},ou=users,dc=testorg,dc=com`;

        client.add(dn, entry, (err2) => {
          client.unbind();
          if (err2) return reject(err2);
          resolve();
        });
      });
    });

    // Add to MySQL
    await pool.query(
      'INSERT INTO users (username, role, is_ldap) VALUES (?, ?, true)',
      [username, role]
    );

    res.send('✅ User added successfully');
  } catch (e) {
    res.status(500).send('❌ Error adding user: ' + e.message);
  }
});
// 🔄 Admin-only: Change User Role
app.post('/admin/change-role', isAdmin, async (req, res) => {
  const { username, role } = req.body;

  if (!username || !role)
    return res.status(400).send('Missing fields');

  if (!['user', 'manager', 'admin'].includes(role))
    return res.status(400).send('Invalid role');

  try {
    await pool.query('UPDATE users SET role = ? WHERE username = ?', [role, username]);
    res.send('✅ User role updated');
  } catch (e) {
    res.status(500).send('❌ Error updating role: ' + e.message);
  }
});
// ❌ Admin-only: Delete User (DB only)
app.post('/admin/delete-user', isAdmin, async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).send('Username is required');

  try {
    await pool.query('DELETE FROM users WHERE username = ?', [username]);
    res.send('🗑️ User deleted from MySQL. (LDAP deletion must be manual)');
  } catch (e) {
    res.status(500).send('❌ Error deleting user: ' + e.message);
  }
});
app.get('/project-tasks/:projectId', checkAuth, async (req, res) => {
  const projectId = req.params.projectId;
  try {
    const [tasks] = await pool.query(
      'SELECT id, name FROM tasks WHERE project_id = ?',
      [projectId]
    );
    res.json(tasks);
  } catch (e) {
    console.error(e);
    res.status(500).send('Error fetching tasks');
  }
});


app.post('/submit-project', checkAuth, async (req, res) => {
  const { name, description } = req.body;
  if (!name || !description) {
    return res.status(400).send('⚠️ Project name and description required.');
  }

  try {
    await pool.query(
      'INSERT INTO projects (name, description, submitted_by, status) VALUES (?, ?, ?, ?)',
      [name, description, req.session.user.username, 'pending']
    );
    res.send('✅ Project submitted successfully.');
  } catch (e) {
    console.error('Error submitting project:', e);
    res.status(500).send('❌ Failed to submit project.');
  }
});


app.post('/submit-task', checkAuth, async (req, res) => {
  const { project_id, name, description } = req.body;

  // Check if the given project exists, is submitted by the user, and is approved
  const [project] = await pool.query(
    'SELECT id FROM projects WHERE id = ? AND submitted_by = ? AND status = "approved"',
    [project_id, req.session.user.username]
  );

  if (!project.length) {
    return res.status(400).send('Project is not approved or not owned by you. Cannot add task.');
  }

  await pool.query(
    'INSERT INTO tasks (project_id, name, description) VALUES (?, ?, ?)',
    [project_id, name, description]
  );

  res.send('Task submitted successfully.');
});
app.get('/work-element-budgets/:weId', checkAuth, async (req, res) => {
  const [rows] = await pool.query('SELECT id FROM budgets WHERE work_element_id = ? AND status = "approved"', [req.params.weId]);
  res.json(rows);
});


app.post('/submit-work-element', checkAuth, async (req, res) => {
  const { task_id, name, description } = req.body;

  // Optional: You can validate that the task exists
  const [taskCheck] = await pool.query('SELECT * FROM tasks WHERE id = ?', [task_id]);
  if (!taskCheck.length) {
    return res.status(400).send('Invalid task ID.');
  }

  await pool.query('INSERT INTO work_elements (task_id, name, description) VALUES (?, ?, ?)', [task_id, name, description]);
  res.send('Work element submitted successfully.');
});



app.post('/submit-budget', checkAuth, async (req, res) => {
  const { work_element_id, amount, description } = req.body;

  const [project] = await pool.query(`
    SELECT p.status FROM projects p
    JOIN tasks t ON t.project_id = p.id
    JOIN work_elements w ON w.task_id = t.id
    WHERE w.id = ?`, [work_element_id]);

  if (!project.length || project[0].status !== 'approved') {
    return res.status(400).send('Associated project is not approved. Cannot submit budget.');
  }

  await pool.query('INSERT INTO budgets (work_element_id, submitted_by, amount, description) VALUES (?, ?, ?, ?)',
    [work_element_id, req.session.user.username, amount, description]);
  res.send('Budget submitted successfully.');
});


app.post('/submit-afe', checkAuth, async (req, res) => {
  const { budget_id, afe_title, description } = req.body;

  const [project] = await pool.query(`
    SELECT p.status FROM projects p
    JOIN tasks t ON t.project_id = p.id
    JOIN work_elements w ON w.task_id = t.id
    JOIN budgets b ON b.work_element_id = w.id
    WHERE b.id = ?`, [budget_id]);

  if (!project.length || project[0].status !== 'approved') {
    return res.status(400).send('Associated project is not approved. Cannot submit AFE.');
  }

  await pool.query(`
  INSERT INTO afes 
  (budget_id, afe_title, description, submitted_by, amount, activity_description, unit, quantity, unit_price)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
[
  budget_id,
  afe_title,
  description,
  req.session.user.username,
  afeAmount,
  req.body.activity_description,
  req.body.unit,
  req.body.quantity,
  req.body.unit_price
]);

  res.send('AFE submitted successfully.');
});


app.post('/submit-invoice', checkAuth, upload.single('invoice_file'), async (req, res) => {
  const {
    afe_id,
    invoice_title,
    invoice_date,
    amount,
    description,
    invoice_number,
    vendor,
    user_department,
    contract_number
  } = req.body;

  const filePath = req.file ? req.file.path : null;

  // 🔎 Validate project is approved
  const [project] = await pool.query(`
    SELECT p.status FROM projects p
    JOIN tasks t ON t.project_id = p.id
    JOIN work_elements w ON w.task_id = t.id
    JOIN budgets b ON b.work_element_id = w.id
    JOIN afes a ON a.budget_id = b.id
    WHERE a.id = ?`, [afe_id]);

  if (!project.length || project[0].status !== 'approved') {
    return res.status(400).send('Associated project is not approved. Cannot submit invoice.');
  }

  // 🔎 Validate amount against AFE balance
  const [afe] = await pool.query('SELECT amount, total_invoiced FROM afes WHERE id = ?', [afe_id]);
  if (!afe.length) return res.status(400).send('Invalid AFE');

  const newInvoiced = parseFloat(afe[0].total_invoiced || 0) + parseFloat(amount);
  if (newInvoiced > parseFloat(afe[0].amount)) {
    return res.status(400).send('Invoice exceeds AFE balance.');
  }

  // ✅ Insert invoice
  await pool.query(`
    INSERT INTO invoices (
      afe_id, invoice_title, invoice_date, amount, description,
      file_path, submitted_by, invoice_number, vendor, user_department, contract_number
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      afe_id,
      invoice_title,
      invoice_date,
      amount,
      description,
      filePath,
      req.session.user.username,
      invoice_number,
      vendor,
      user_department,
      contract_number
    ]
  );

  // ✅ Offset invoice from AFE balance
  await pool.query('UPDATE afes SET total_invoiced = total_invoiced + ? WHERE id = ?', [amount, afe_id]);

  res.send('Invoice submitted and offset recorded.');
});
app.post('/cancel-invoice', checkAuth, async (req, res) => {
  const { invoice_id } = req.body;

  const [invoice] = await pool.query('SELECT * FROM invoices WHERE id = ?', [invoice_id]);
  if (!invoice.length || invoice[0].status === 'cancelled') {
    return res.status(400).send('Invalid or already cancelled invoice');
  }

  // 🔁 Revert offset in AFE
  await pool.query(`
    UPDATE afes 
    SET total_invoiced = total_invoiced - ? 
    WHERE id = (SELECT budget_id FROM afes WHERE id = ?)`, 
    [invoice[0].amount, invoice[0].afe_id]
  );

  // 🛑 Mark invoice cancelled
  await pool.query(`
    UPDATE invoices 
    SET status = 'cancelled', cancelled_by = ?, cancelled_at = NOW() 
    WHERE id = ?`,
    [req.session.user.username, invoice_id]
  );

  res.send('Invoice cancelled and offset reverted.');
});

app.post('/submit-production', checkAuth, async (req, res) => {
  const { project_id, price_per_barrel, number_of_barrels, production_date, cost } = req.body;
  const [project] = await pool.query('SELECT status FROM projects WHERE id = ?', [project_id]);

  if (!project.length || project[0].status !== 'approved') {
    return res.status(400).send('Project is not approved. Cannot add production data.');
  }

  await pool.query('INSERT INTO production (project_id, price_per_barrel, number_of_barrels, production_date, cost) VALUES (?, ?, ?, ?, ?)',
    [project_id, price_per_barrel, number_of_barrels, production_date, cost]);
  res.send('Production data submitted successfully.');
});
// Approve or Decline a Project
app.post('/update-project', isManager, async (req, res) => {
  const { id, status } = req.body;
  if (!['approved', 'declined'].includes(status)) {
    return res.status(400).send('Invalid status');
  }
  try {
    await pool.query(
      'UPDATE projects SET status = ?, approved_by = ?, approved_at = NOW() WHERE id = ?',
      [status, req.session.user.username, id]
    );
    res.send(`✅ Project ${status}`);
  } catch (e) {
    res.status(500).send('❌ Failed to update project: ' + e.message);
  }
});

// Approve or Decline a Budget
app.post('/update-budget', isManager, async (req, res) => {
  const { id, status } = req.body;
  if (!['approved', 'declined'].includes(status)) {
    return res.status(400).send('Invalid status');
  }
  try {
    await pool.query(
      'UPDATE budgets SET status = ?, approved_by = ?, approved_at = NOW() WHERE id = ?',
      [status, req.session.user.username, id]
    );
    res.send(`✅ Budget ${status}`);
  } catch (e) {
    res.status(500).send('❌ Failed to update budget: ' + e.message);
  }
});

// Approve or Decline an AFE
app.post('/update-afe', isManager, async (req, res) => {
  const { id, status } = req.body;
  if (!['approved', 'declined'].includes(status)) {
    return res.status(400).send('Invalid status');
  }
  try {
    await pool.query(
      'UPDATE afes SET status = ?, approved_by = ?, approved_at = NOW() WHERE id = ?',
      [status, req.session.user.username, id]
    );
    res.send(`✅ AFE ${status}`);
  } catch (e) {
    res.status(500).send('❌ Failed to update AFE: ' + e.message);
  }
});

// Approve or Decline an Invoice
app.post('/update-invoice', isManager, async (req, res) => {
  const { id, status } = req.body;
  if (!['approved', 'declined'].includes(status)) {
    return res.status(400).send('Invalid status');
  }
  try {
    await pool.query(
      'UPDATE invoices SET status = ?, approved_by = ?, approved_at = NOW() WHERE id = ?',
      [status, req.session.user.username, id]
    );
    res.send(`✅ Invoice ${status}`);
  } catch (e) {
    res.status(500).send('❌ Failed to update invoice: ' + e.message);
  }
});
app.get('/pending-projects', isManager, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM projects WHERE status = "pending"');
  res.json(rows);
});
app.get('/pending-budgets', isManager, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM budgets WHERE status = "pending"');
  res.json(rows);
});
app.get('/pending-afes', isManager, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM afes WHERE status = "pending"');
  res.json(rows);
});
app.get('/pending-invoices', isManager, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM invoices WHERE status = "pending"');
  res.json(rows);
});

app.use((req, res) => res.status(404).send('Not Found'));

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
