
SELECT * FROM projects WHERE submitted_by = 'ab';
CREATE DATABASE IF NOT EXISTS ber;
USE ber;
-- USERS (LDAP or local)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    email VARCHAR(100),
    role ENUM('user', 'manager', 'admin') NOT NULL,
    is_ldap BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- USER SESSIONS (Optional if session-based auth used)
CREATE TABLE user_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    session_token VARCHAR(255),
    expires_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- PROJECTS
CREATE TABLE projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    description TEXT,
    submitted_by VARCHAR(50),
    status ENUM('pending', 'approved', 'declined') DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_by VARCHAR(50),
    approved_at DATETIME,
    FOREIGN KEY (submitted_by) REFERENCES users(username),
    FOREIGN KEY (approved_by) REFERENCES users(username)
);
SELECT * FROM tasks WHERE project_id = 2;

-- TASKS (under project)
CREATE TABLE tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT,
    name VARCHAR(100),
    description TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id)
);
SELECT * FROM tasks WHERE project_id = 2;



-- WORK ELEMENTS (under task)
CREATE TABLE work_elements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT,
    name VARCHAR(100),
    description TEXT,
    FOREIGN KEY (task_id) REFERENCES tasks(id)
);

-- BUDGETS
CREATE TABLE budgets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    work_element_id INT,
    submitted_by VARCHAR(50),
    amount DECIMAL(15, 2),
    description TEXT,
    status ENUM('pending', 'approved', 'declined') DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_by VARCHAR(50),
    approved_at DATETIME,
    FOREIGN KEY (work_element_id) REFERENCES work_elements(id),
    FOREIGN KEY (submitted_by) REFERENCES users(username),
    FOREIGN KEY (approved_by) REFERENCES users(username)
);

-- AFE (Authorization for Expenditure)
CREATE TABLE afes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    budget_id INT,
    afe_title VARCHAR(100),
    description TEXT,
    submitted_by VARCHAR(50),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status ENUM('pending', 'approved', 'declined') DEFAULT 'pending',
    approved_by VARCHAR(50),
    approved_at DATETIME,
    FOREIGN KEY (budget_id) REFERENCES budgets(id),
    FOREIGN KEY (submitted_by) REFERENCES users(username),
    FOREIGN KEY (approved_by) REFERENCES users(username)
);

-- INVOICES
CREATE TABLE invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    afe_id INT,
    invoice_title VARCHAR(100),
    invoice_date DATE,
    amount DECIMAL(15,2),
    description TEXT,
    file_path VARCHAR(255), -- For image upload (path to uploaded invoice image)
    submitted_by VARCHAR(50),
    status ENUM('pending', 'approved', 'declined') DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_by VARCHAR(50),
    approved_at DATETIME,
    FOREIGN KEY (afe_id) REFERENCES afes(id),
    FOREIGN KEY (submitted_by) REFERENCES users(username),
    FOREIGN KEY (approved_by) REFERENCES users(username)
);
/* Extra fields the form and API already expect */
ALTER TABLE invoices
  ADD COLUMN invoice_number   VARCHAR(50),
  ADD COLUMN vendor           VARCHAR(100),
  ADD COLUMN user_department  VARCHAR(100),
  ADD COLUMN contract_number  VARCHAR(100);
SELECT * FROM afes 
WHERE budget_id = 1 AND status = 'approved';


/* Make room for ‘cancelled’ and keep the legacy states */
ALTER TABLE invoices
  MODIFY status ENUM('pending','approved','declined','cancelled') DEFAULT 'pending';

ALTER TABLE afes 
  ADD COLUMN activity_description TEXT,
  ADD COLUMN unit VARCHAR(20),
  ADD COLUMN quantity DECIMAL(10,2),
  ADD COLUMN unit_price DECIMAL(10,2);
-- AFE cost tracking
ALTER TABLE afes 
  ADD COLUMN total_invoiced DECIMAL(15,2) DEFAULT 0;
SHOW COLUMNS FROM afes LIKE 'amount';
ALTER TABLE afes ADD COLUMN amount DECIMAL(15,2);
ALTER TABLE afes 
  ADD COLUMN balance_remaining DECIMAL(15,2)
  GENERATED ALWAYS AS (amount - total_invoiced) STORED;

ALTER TABLE afes 
  ADD COLUMN balance_remaining DECIMAL(15,2) 
  GENERATED ALWAYS AS (amount - total_invoiced) STORED;

-- Invoice cancellation tracking (status already exists)
ALTER TABLE invoices 
  ADD COLUMN cancelled_by VARCHAR(50),
  ADD COLUMN cancelled_at DATETIME;

ALTER TABLE invoices
  ADD COLUMN status ENUM('active', 'cancelled') DEFAULT 'active',
  ADD COLUMN cancelled_by VARCHAR(50),
  ADD COLUMN cancelled_at DATETIME;

-- PRODUCTION DATA
CREATE TABLE production (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT,
    price_per_barrel DECIMAL(10,2),
    number_of_barrels INT,
    production_date DATE,
    cost DECIMAL(15,2),
    profit DECIMAL(15,2) GENERATED ALWAYS AS (price_per_barrel * number_of_barrels - cost) STORED,
    FOREIGN KEY (project_id) REFERENCES projects(id)
);
USE ber;

INSERT INTO users (username, role, is_ldap)
VALUES ('abhin', 'manager', true);
INSERT INTO `users`(`id`,`username`,`role`,`is_ldap`,`password_hash`) VALUES(1,'adminuser','admin',1,'admin123
');