#!/usr/bin/env node

/**
 * BER Project - Automated Testing Runner
 * Runs comprehensive tests for all application functionality
 */

const axios = require('axios');
const mysql = require('mysql2/promise');

// Configuration - Updated with actual working credentials
const CONFIG = {
    baseURL: 'http://localhost:3000',
    db: { host: 'localhost', port: 3307, user: 'root', password: '', database: 'ber_db' },
    users: {
        admin: { username: 'adminuser', password: 'admin123' },
        manager: { username: 'manager1', password: 'password123' },
        user: { username: 'user1', password: 'password123' }
    }
};

// Test data
const TEST_DATA = {
    projects: [
        { name: 'Auto Test Project Alpha', description: 'Automated testing project Alpha' },
        { name: 'Auto Test Project Beta', description: 'Automated testing project Beta' }
    ],
    tasks: [
        { name: 'Auto Task 1', description: 'Automated task 1' },
        { name: 'Auto Task 2', description: 'Automated task 2' }
    ],
    workElements: [
        { name: 'Auto WE 1', description: 'Automated work element 1', budget: 10000 },
        { name: 'Auto WE 2', description: 'Automated work element 2', budget: 5000 }
    ],
    production: [
        { barrels: 1000, pricePerBarrel: 75.50, date: '2024-03-15' },
        { barrels: 800, pricePerBarrel: 78.25, date: '2024-04-01' }
    ],
    bcr: { number: 'BCR-AUTO-001', amount: 2000, reason: 'Automated testing transfer' },
    afe: { number: 'AFE-AUTO-001', amount: 50000, description: 'Automated testing AFE' },
    invoice: { number: 'INV-AUTO-001', vendor: 'Auto Vendor', amount: 25000, description: 'Automated testing invoice' }
};

// Test results
let results = { total: 0, passed: 0, failed: 0, errors: [] };

// HTTP client
class TestClient {
    constructor() {
        this.cookies = [];
    }

    async login(username, password) {
        try {
            const response = await axios.post(`${CONFIG.baseURL}/login`, { username, password }, {
                headers: { 'Accept': 'application/json' },
                validateStatus: function (status) {
                    return status >= 200 && status < 400;
                }
            });
            if (response.headers['set-cookie']) {
                this.cookies = response.headers['set-cookie'];
            }
            // Check for JSON response
            if (response.data && response.data.success) {
                return { success: true };
            } else {
                return { success: false, error: response.data && response.data.error ? response.data.error : 'Unknown error' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async request(method, endpoint, data = null) {
        const config = {
            method,
            url: `${CONFIG.baseURL}${endpoint}`,
            headers: { 'Accept': 'application/json' }
        };
        if (this.cookies.length) config.headers.Cookie = this.cookies[0];
        if (data) config.data = data;

        try {
            const response = await axios(config);
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

// Database helper
class DBHelper {
    constructor() {
        this.connection = null;
    }

    async connect() {
        try {
            this.connection = await mysql.createConnection(CONFIG.db);
            return true;
        } catch (error) {
            console.error('DB connection failed:', error.message);
            return false;
        }
    }

    async query(sql, params = []) {
        const [rows] = await this.connection.execute(sql, params);
        return rows;
    }

    async cleanup() {
        const queries = [
            "DELETE FROM production_data WHERE project_name LIKE '%Auto Test%'",
            "DELETE FROM budget_changes WHERE bcr_number LIKE '%AUTO%'",
            "DELETE FROM afes WHERE afe_number LIKE '%AUTO%'",
            "DELETE FROM invoices WHERE invoice_number LIKE '%AUTO%'",
            "DELETE FROM budgets WHERE work_element_id IN (SELECT id FROM work_elements WHERE name LIKE '%Auto%')",
            "DELETE FROM work_elements WHERE name LIKE '%Auto%'",
            "DELETE FROM tasks WHERE name LIKE '%Auto%'",
            "DELETE FROM projects WHERE name LIKE '%Auto Test%'"
        ];
        
        for (const query of queries) {
            try {
                await this.query(query);
            } catch (error) {
                // Ignore cleanup errors
            }
        }
    }
}

// Test runner
class AutomatedTestRunner {
    constructor() {
        this.client = new TestClient();
        this.db = new DBHelper();
        this.testData = { projects: [], tasks: [], workElements: [], budgets: [] };
    }

    async run() {
        console.log('🚀 Starting BER Automated Test Suite');
        console.log('='.repeat(60));

        // Check if server is running
        try {
            await axios.get(`${CONFIG.baseURL}/`);
            console.log('✅ Server is running');
        } catch (error) {
            console.log('❌ Server is not running. Please start the server with: npm start');
            console.log('   Then run this test suite again.');
            return;
        }

        if (!(await this.db.connect())) {
            console.log('❌ Cannot connect to database');
            return;
        }

        try {
            await this.db.cleanup();
            
            await this.testAuthentication();
            await this.testProjectWorkflow();
            await this.testBudgetWorkflow();
            await this.testProductionWorkflow();
            await this.testBCRWorkflow();
            await this.testAFEInvoiceWorkflow();
            await this.testAdminReports();
            await this.testErrorHandling();
            
            await this.db.cleanup();
        } catch (error) {
            console.error('Test suite failed:', error.message);
        }

        this.printResults();
    }

    async testAuthentication() {
        console.log('\n🔐 Testing Authentication...');
        
        for (const [role, user] of Object.entries(CONFIG.users)) {
            results.total++;
            const result = await this.client.login(user.username, user.password);
            
            if (result.success) {
                console.log(`✅ ${role} login successful`);
                results.passed++;
            } else {
                console.log(`❌ ${role} login failed: ${result.error}`);
                results.failed++;
                results.errors.push(`${role} login failed: ${result.error}`);
            }
        }
    }

    async testProjectWorkflow() {
        console.log('\n📋 Testing Project Management...');
        
        // Login as user
        const loginResult = await this.client.login(CONFIG.users.user.username, CONFIG.users.user.password);
        if (!loginResult.success) {
            console.log('❌ Cannot test project workflow - user login failed');
            return;
        }

        // Create projects
        for (const projectData of TEST_DATA.projects) {
            results.total++;
            try {
                // Use the authenticated client to make the request
                const result = await this.client.request('POST', '/submit-project', projectData);
                
                if (result.success && result.data && result.data.includes('successfully')) {
                    console.log(`✅ Project "${projectData.name}" created`);
                    results.passed++;
                    this.testData.projects.push(projectData);
                } else {
                    console.log(`❌ Project creation failed: ${result.error || result.data}`);
                    results.failed++;
                    results.errors.push(`Project creation failed: ${result.error || result.data}`);
                }
            } catch (error) {
                if (error.response) {
                    console.log(`❌ Project creation failed: ${error.response.status} - ${error.response.data}`);
                    results.errors.push(`Project creation failed: ${error.response.status} - ${error.response.data}`);
                } else {
                    console.log(`❌ Project creation failed: ${error.message}`);
                    results.errors.push(`Project creation failed: ${error.message}`);
                }
                results.failed++;
            }
        }
    }

    async testBudgetWorkflow() {
        console.log('\n💰 Testing Budget Management...');
        
        // Login as user and create tasks/work elements/budgets
        await this.client.login(CONFIG.users.user.username, CONFIG.users.user.password);
        
        const approvedProjects = await this.db.query("SELECT * FROM projects WHERE status = 'approved' AND name LIKE '%Auto Test%'");
        
        for (const project of approvedProjects) {
            for (const taskData of TEST_DATA.tasks) {
                results.total++;
                const result = await this.client.request('POST', `/add-task/${project.id}`, taskData);
                
                if (result.success) {
                    console.log(`✅ Task "${taskData.name}" created`);
                    results.passed++;
                    this.testData.tasks.push({ ...taskData, projectId: project.id });
                    
                    // Create work element and budget
                    for (const weData of TEST_DATA.workElements) {
                        const weResult = await this.client.request('POST', `/add-work-element/${result.data.id}`, weData);
                        
                        if (weResult.success) {
                            const budgetResult = await this.client.request('POST', '/submit-budget', {
                                work_element_id: weResult.data.id,
                                amount: weData.budget,
                                description: weData.description
                            });
                            
                            if (budgetResult.success) {
                                console.log(`✅ Budget $${weData.budget} submitted`);
                                results.passed++;
                                this.testData.budgets.push({ amount: weData.budget, workElementId: weResult.data.id });
                            }
                        }
                    }
                } else {
                    console.log(`❌ Task creation failed: ${result.error}`);
                    results.failed++;
                    results.errors.push(`Task creation failed: ${result.error}`);
                }
            }
        }

        // Approve budgets as manager
        await this.client.login(CONFIG.users.manager.username, CONFIG.users.manager.password);
        
        const pendingBudgets = await this.db.query("SELECT * FROM budgets WHERE status = 'pending'");
        
        for (const budget of pendingBudgets) {
            results.total++;
            const result = await this.client.request('POST', `/approve-budget/${budget.id}`);
            
            if (result.success) {
                console.log(`✅ Budget $${budget.amount} approved`);
                results.passed++;
            } else {
                console.log(`❌ Budget approval failed: ${result.error}`);
                results.failed++;
                results.errors.push(`Budget approval failed: ${result.error}`);
            }
        }
    }

    async testProductionWorkflow() {
        console.log('\n📊 Testing Production Data...');
        
        await this.client.login(CONFIG.users.user.username, CONFIG.users.user.password);
        
        const approvedWorkElements = await this.db.query(`
            SELECT we.* FROM work_elements we 
            JOIN tasks t ON we.task_id = t.id 
            JOIN projects p ON t.project_id = p.id 
            WHERE p.name LIKE '%Auto Test%'
        `);

        for (const we of approvedWorkElements) {
            for (const prodData of TEST_DATA.production) {
                results.total++;
                const result = await this.client.request('POST', '/submit-production', {
                    work_element_id: we.id,
                    barrels: prodData.barrels,
                    price_per_barrel: prodData.pricePerBarrel,
                    production_date: prodData.date
                });
                
                if (result.success) {
                    const revenue = prodData.barrels * prodData.pricePerBarrel;
                    console.log(`✅ Production data submitted: $${revenue}`);
                    results.passed++;
                } else {
                    console.log(`❌ Production submission failed: ${result.error}`);
                    results.failed++;
                    results.errors.push(`Production submission failed: ${result.error}`);
                }
            }
        }
    }

    async testBCRWorkflow() {
        console.log('\n🔄 Testing Budget Change Requests...');
        
        const approvedBudgets = await this.db.query(`
            SELECT b.* FROM budgets b 
            JOIN work_elements we ON b.work_element_id = we.id 
            JOIN tasks t ON we.task_id = t.id 
            JOIN projects p ON t.project_id = p.id 
            WHERE b.status = 'approved' AND p.name LIKE '%Auto Test%'
        `);

        if (approvedBudgets.length >= 2) {
            results.total++;
            
            const bcrResult = await this.client.request('POST', '/submit-bcr', {
                bcr_number: TEST_DATA.bcr.number,
                from_budget_id: approvedBudgets[0].id,
                to_budget_id: approvedBudgets[1].id,
                amount: TEST_DATA.bcr.amount,
                reason: TEST_DATA.bcr.reason
            });
            
            if (bcrResult.success) {
                console.log(`✅ BCR ${TEST_DATA.bcr.number} submitted`);
                results.passed++;
                
                // Approve BCR as manager
                await this.client.login(CONFIG.users.manager.username, CONFIG.users.manager.password);
                
                const pendingBCRs = await this.db.query("SELECT * FROM budget_changes WHERE status = 'pending'");
                
                for (const bcr of pendingBCRs) {
                    results.total++;
                    const approveResult = await this.client.request('POST', `/approve-bcr/${bcr.id}`);
                    
                    if (approveResult.success) {
                        console.log(`✅ BCR ${bcr.bcr_number} approved`);
                        results.passed++;
                    } else {
                        console.log(`❌ BCR approval failed: ${approveResult.error}`);
                        results.failed++;
                        results.errors.push(`BCR approval failed: ${approveResult.error}`);
                    }
                }
            } else {
                console.log(`❌ BCR submission failed: ${bcrResult.error}`);
                results.failed++;
                results.errors.push(`BCR submission failed: ${bcrResult.error}`);
            }
        }
    }

    async testAFEInvoiceWorkflow() {
        console.log('\n📝 Testing AFE and Invoice Management...');
        // 1. Login as user
        await this.client.login(CONFIG.users.user.username, CONFIG.users.user.password);

        // 2. Get or create a project
        let project = (await this.db.query("SELECT id FROM projects WHERE name LIKE '%Auto Test%' LIMIT 1"))[0];
        if (!project) {
            await this.client.request('POST', '/submit-project', TEST_DATA.projects[0]);
            project = (await this.db.query("SELECT id FROM projects WHERE name = ?", [TEST_DATA.projects[0].name]))[0];
        }

        // 3. Create a task
        await this.client.request('POST', '/submit-task', { project_id: project.id, ...TEST_DATA.tasks[0] });
        const task = (await this.db.query("SELECT id FROM tasks WHERE project_id = ? AND name = ?", [project.id, TEST_DATA.tasks[0].name]))[0];

        // 4. Create a work element
        await this.client.request('POST', '/submit-work-element', { task_id: task.id, ...TEST_DATA.workElements[0] });
        const workElement = (await this.db.query("SELECT id FROM work_elements WHERE task_id = ? AND name = ?", [task.id, TEST_DATA.workElements[0].name]))[0];

        // 5. Submit and approve a budget
        await this.client.request('POST', '/submit-budget', { work_element_id: workElement.id, amount: TEST_DATA.workElements[0].budget, description: 'Auto budget' });
        let budget = (await this.db.query("SELECT id FROM budgets WHERE work_element_id = ? ORDER BY id DESC LIMIT 1", [workElement.id]))[0];
        await this.client.login(CONFIG.users.manager.username, CONFIG.users.manager.password);
        await this.client.request('POST', '/update-budget', { id: budget.id, status: 'approved' });
        await this.client.login(CONFIG.users.user.username, CONFIG.users.user.password);

        // 6. Submit AFE with correct fields
        results.total++;
        const afePayload = {
            budget_id: budget.id,
            afe_title: TEST_DATA.afe.number,
            description: TEST_DATA.afe.description,
            amount: TEST_DATA.afe.amount,
            activity_description: 'Auto activity',
            unit: 'unit',
            quantity: 1,
            unit_price: TEST_DATA.afe.amount
        };
        const afeResult = await this.client.request('POST', '/submit-afe', afePayload);
        if (afeResult.success) {
            console.log(`✅ AFE ${TEST_DATA.afe.number} submitted`);
            results.passed++;
        } else {
            console.log(`❌ AFE submission failed: ${afeResult.error}`);
            results.failed++;
            results.errors.push(`AFE submission failed: ${afeResult.error}`);
        }

        // 7. Approve AFE
        await this.client.login(CONFIG.users.manager.username, CONFIG.users.manager.password);
        let afe = (await this.db.query("SELECT id FROM afes WHERE budget_id = ? ORDER BY id DESC LIMIT 1", [budget.id]))[0];
        await this.client.request('POST', '/update-afe', { id: afe.id, status: 'approved' });
        await this.client.login(CONFIG.users.user.username, CONFIG.users.user.password);

        // 8. Submit Invoice with correct fields
        results.total++;
        const invoicePayload = {
            budget_id: budget.id,
            invoice_title: TEST_DATA.invoice.number,
            invoice_date: '2024-04-15',
            amount: TEST_DATA.invoice.amount,
            description: TEST_DATA.invoice.description,
            invoice_number: TEST_DATA.invoice.number,
            vendor: TEST_DATA.invoice.vendor,
            user_department: 'AutoDept',
            contract_number: 'CN-AUTO-001'
        };
        const invoiceResult = await this.client.request('POST', '/submit-invoice', invoicePayload);
        if (invoiceResult.success) {
            console.log(`✅ Invoice ${TEST_DATA.invoice.number} submitted`);
            results.passed++;
        } else {
            console.log(`❌ Invoice submission failed: ${invoiceResult.error}`);
            results.failed++;
            results.errors.push(`Invoice submission failed: ${invoiceResult.error}`);
        }

        // 9. Approve Invoice
        await this.client.login(CONFIG.users.manager.username, CONFIG.users.manager.password);
        let invoice = (await this.db.query("SELECT id FROM invoices WHERE invoice_number = ? ORDER BY id DESC LIMIT 1", [TEST_DATA.invoice.number]))[0];
        await this.client.request('POST', '/update-invoice', { id: invoice.id, status: 'approved' });
    }

    async testAdminReports() {
        console.log('\n📈 Testing Admin Reports...');
        
        await this.client.login(CONFIG.users.admin.username, CONFIG.users.admin.password);
        
        const reports = [
            '/admin/approved-projects',
            '/admin/approved-budgets',
            '/admin/production-data',
            '/admin/budget-changes'
        ];

        for (const report of reports) {
            results.total++;
            const result = await this.client.request('GET', report);
            
            if (result.success) {
                console.log(`✅ ${report} report accessible`);
                results.passed++;
            } else {
                console.log(`❌ ${report} report failed: ${result.error}`);
                results.failed++;
                results.errors.push(`${report} report failed: ${result.error}`);
            }
        }
    }

    async testErrorHandling() {
        console.log('\n⚠️ Testing Error Handling...');
        
        // Test invalid data
        results.total++;
        const invalidProject = await this.client.request('POST', '/submit-project', {});
        
        if (!invalidProject.success) {
            console.log('✅ Invalid project data correctly rejected');
            results.passed++;
        } else {
            console.log('❌ Invalid project data should have been rejected');
            results.failed++;
            results.errors.push('Invalid project data accepted');
        }

        // Test unauthorized access
        results.total++;
        const unauthorized = await this.client.request('GET', '/admin/approved-projects');
        
        if (!unauthorized.success) {
            console.log('✅ Unauthorized access correctly blocked');
            results.passed++;
        } else {
            console.log('❌ Unauthorized access should have been blocked');
            results.failed++;
            results.errors.push('Unauthorized access not blocked');
        }
    }

    printResults() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 AUTOMATED TEST RESULTS');
        console.log('='.repeat(60));
        console.log(`Total Tests: ${results.total}`);
        console.log(`Passed: ${results.passed} ✅`);
        console.log(`Failed: ${results.failed} ❌`);
        console.log(`Success Rate: ${((results.passed / results.total) * 100).toFixed(1)}%`);
        
        if (results.errors.length > 0) {
            console.log('\n❌ FAILED TESTS:');
            results.errors.forEach((error, index) => {
                console.log(`${index + 1}. ${error}`);
            });
        }
        
        if (results.passed === results.total) {
            console.log('\n🎉 ALL TESTS PASSED! BER application is fully functional.');
        } else {
            console.log('\n⚠️ Some tests failed. Please review the errors above.');
        }
    }
}

// Run tests
async function main() {
    console.log('BER Automated Test Suite');
    console.log('Testing all functionality with sample data...\n');
    
    const runner = new AutomatedTestRunner();
    await runner.run();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { AutomatedTestRunner }; 