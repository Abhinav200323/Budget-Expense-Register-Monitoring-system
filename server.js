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
// Admin: Get approved projects with optional filters
app.get('/admin/approved-projects', isAdmin, async (req, res) => {
  const { from, to } = req.query;
  const conditions = ['status = "approved"'];
  const params = [];

  if (from) {
    conditions.push('approved_at >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('approved_at <= ?');
    params.push(to);
  }

  const [rows] = await pool.query(
    `SELECT id, name, submitted_by, approved_by, approved_at
     FROM projects WHERE ${conditions.join(' AND ')}`,
    params
  );
  res.json(rows);
});


// Admin: Get approved budgets with optional filters
app.get('/admin/approved-budgets', isAdmin, async (req, res) => {
  const { from, to, manager } = req.query;
  const conditions = ['b.status = "approved"'];
  const params = [];

  if (manager) {
    conditions.push('b.approved_by = ?');
    params.push(manager);
  }
  if (from) {
    conditions.push('b.approved_at >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('b.approved_at <= ?');
    params.push(to);
  }

  const [rows] = await pool.query(`
    SELECT b.id, b.amount, b.submitted_by, b.approved_by, b.approved_at,
           we.name AS work_element_name,
           t.name AS task_name,
           p.name AS project_name
    FROM budgets b
    JOIN work_elements we ON b.work_element_id = we.id
    JOIN tasks t ON we.task_id = t.id
    JOIN projects p ON t.project_id = p.id
    WHERE ${conditions.join(' AND ')}
  `, params);

  res.json(rows);
});

// Admin: Get production records with optional filters
app.get('/admin/production-data', isAdmin, async (req, res) => {
  const { from, to, manager } = req.query;
  const conditions = ['1=1'];
  const params = [];

  if (from) {
    conditions.push('pr.production_date >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('pr.production_date <= ?');
    params.push(to);
  }
  if (manager) {
    conditions.push('p.approved_by = ?');
    params.push(manager);
  }

  const [rows] = await pool.query(`
    SELECT pr.id, pr.price_per_barrel, pr.number_of_barrels, pr.cost, pr.profit, pr.production_date,
           p.name AS project_name,
           p.approved_by AS manager
    FROM production pr
    JOIN projects p ON pr.project_id = p.id
    WHERE ${conditions.join(' AND ')}
  `, params);

  res.json(rows);
});

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
app.get('/api/approved-projects', async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name FROM projects WHERE status = 'approved'"
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching approved projects:', error);
    res.status(500).send('Server error');
  }
});
app.get('/api/budget-by-project-task', async (req, res) => {
  const { projectId, taskId } = req.query;

  if (!projectId || !taskId) return res.status(400).send('Missing params');

  try {
    const [rows] = await pool.query(`
      SELECT b.id, b.amount
      FROM budgets b
      JOIN work_elements we ON b.work_element_id = we.id
      JOIN tasks t ON we.task_id = t.id
      WHERE t.id = ? AND t.project_id = ? AND b.status = 'approved'
      LIMIT 1
    `, [taskId, projectId]);

    if (rows.length > 0) {
      res.json(rows[0]);
    } else {
      res.json({});
    }
  } catch (e) {
    console.error('Error fetching budget:', e);
    res.status(500).send('Server error');
  }
});



app.post('/login', (req, res, next) => {
  const { username, password } = req.body;

  ldap.authenticate(username, password, async (err, user) => {
    if (err || !user) {
      return res.status(401).send('LDAP auth failed');
    }

    try {
      const [rows] = await pool.query(
        'SELECT role FROM users WHERE username = ?',
        [username]
      );

      if (!rows.length) {
        return res.status(404).send('User not found in DB');
      }

      req.session.user = { username, role: rows[0].role };
      return res.redirect('/');          // ← return stops execution
    } catch (e) {
      return next(e);                    // single unified error path
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
  const {
    budget_id,
    afe_title,
    description,
    amount,
    activity_description,
    unit,
    quantity,
    unit_price
  } = req.body;


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
+     amount,                    // ✅ fix
      activity_description,
      unit,
      quantity,
      unit_price
    ]);


  res.send('AFE submitted successfully.');
});


app.get('/afe-from-budget/:budgetId', checkAuth, async (req, res) => {
  const [afe] = await pool.query(
    'SELECT id FROM afes WHERE budget_id = ? AND status = "approved"', 
    [req.params.budgetId]
  );
  res.json(afe[0] || {});
});

app.post('/submit-invoice', checkAuth, upload.single('invoice_file'), async (req, res) => {
  const {
    budget_id,
    invoice_title,
    invoice_date,
    amount,
    description,
    invoice_number,
    vendor,
    user_department,
    contract_number
  } = req.body;

  // ✅ Fix: Define filePath before using it
  const filePath = req.file ? req.file.path : null;

  // 🔍 Lookup approved AFE for the given budget
  const [afe] = await pool.query(
    'SELECT id, amount, total_invoiced FROM afes WHERE budget_id = ? AND status = "approved"',
    [budget_id]
  );

  if (!afe.length) return res.status(400).send('❌ No approved AFE found for this budget.');

  const afe_id = afe[0].id;

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

  // ✅ Update AFE invoiced total
  await pool.query('UPDATE afes SET total_invoiced = total_invoiced + ? WHERE id = ?', [amount, afe_id]);

  res.send('✅ Invoice submitted and offset recorded.');
});



app.post('/cancel-invoice', checkAuth, async (req, res) => {
  const { invoice_id } = req.body;

  const [invoiceRows] = await pool.query(
    'SELECT * FROM invoices WHERE id = ?', [invoice_id]
  );
  if (!invoiceRows.length)
    return res.status(404).send('Invoice not found');

  const inv = invoiceRows[0];
  if (inv.status === 'approved')
    return res.status(403).send('Manager has already approved this invoice');
  if (inv.status === 'cancelled')
    return res.status(400).send('Invoice already cancelled');

  // 🔁 Roll back AFE total
  await pool.query(
    'UPDATE afes SET total_invoiced = total_invoiced - ? WHERE id = ?',
    [inv.amount, inv.afe_id]
  );

  // 🛑 Mark invoice cancelled
  await pool.query(
    `UPDATE invoices
       SET status = 'cancelled',
           cancelled_by = ?,
           cancelled_at = NOW()
     WHERE id = ?`,
    [req.session.user.username, invoice_id]
  );

  res.send('Invoice cancelled and offset reverted.');
});
app.get('/my-invoices', checkAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM invoices WHERE submitted_by = ? ORDER BY created_at DESC',
      [req.session.user.username]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to fetch invoices');
  }
});

app.post('/revert-invoice', checkAuth, async (req, res) => {
  const { invoice_id } = req.body;
  const [inv] = await pool.query('SELECT * FROM invoices WHERE id = ?', [invoice_id]);

  if (!inv.length || inv[0].status !== 'cancelled')
    return res.status(400).send('Invoice is not cancelled');

  // put the money back on the AFE
  await pool.query(
    `UPDATE afes SET total_invoiced = total_invoiced + ? WHERE id = ?`,
    [inv[0].amount, inv[0].afe_id]
  );

  await pool.query(
    `UPDATE invoices
       SET status = 'pending',
           cancelled_by = NULL,
           cancelled_at = NULL
     WHERE id = ?`, [invoice_id]);

  res.send('Invoice reinstated');
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
