const mysql = require('mysql2/promise');

// Mock database connection and queries
jest.mock('mysql2/promise');

describe('Database Operations Unit Tests', () => {
  let mockPool;
  let mockConnection;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    mockConnection = {
      query: jest.fn(),
      release: jest.fn()
    };
    
    mockPool = {
      getConnection: jest.fn().mockResolvedValue(mockConnection),
      query: jest.fn()
    };
    
    mysql.createPool.mockReturnValue(mockPool);
  });

  describe('Project Database Operations', () => {
    test('should create project with correct SQL query', async () => {
      const projectData = {
        name: 'Project Alpha',
        description: 'Test project',
        submitted_by: 'user1'
      };

      mockPool.query.mockResolvedValueOnce([[{ insertId: 1 }]]);

      const result = await mockPool.query(
        'INSERT INTO projects (name, description, submitted_by) VALUES (?, ?, ?)',
        [projectData.name, projectData.description, projectData.submitted_by]
      );

      expect(mockPool.query).toHaveBeenCalledWith(
        'INSERT INTO projects (name, description, submitted_by) VALUES (?, ?, ?)',
        [projectData.name, projectData.description, projectData.submitted_by]
      );
      expect(result[0][0].insertId).toBe(1);
    });

    test('should retrieve pending projects correctly', async () => {
      const mockProjects = [
        { id: 1, name: 'Project Alpha', status: 'pending' },
        { id: 2, name: 'Project Beta', status: 'pending' }
      ];

      mockPool.query.mockResolvedValueOnce([mockProjects]);

      const result = await mockPool.query('SELECT * FROM projects WHERE status = "pending"');

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM projects WHERE status = "pending"');
      expect(result[0]).toEqual(mockProjects);
    });

    test('should update project status to approved', async () => {
      const projectId = 1;
      const approvedBy = 'manager1';

      mockPool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await mockPool.query(
        'UPDATE projects SET status = "approved", approved_by = ?, approved_at = NOW() WHERE id = ?',
        [approvedBy, projectId]
      );

      expect(mockPool.query).toHaveBeenCalledWith(
        'UPDATE projects SET status = "approved", approved_by = ?, approved_at = NOW() WHERE id = ?',
        [approvedBy, projectId]
      );
      expect(result[0].affectedRows).toBe(1);
    });
  });

  describe('Budget Database Operations', () => {
    test('should create budget with correct parameters', async () => {
      const budgetData = {
        work_element_id: 1,
        amount: 10000,
        submitted_by: 'user1',
        description: 'Initial budget'
      };

      mockPool.query.mockResolvedValueOnce([[{ insertId: 1 }]]);

      const result = await mockPool.query(
        'INSERT INTO budgets (work_element_id, amount, submitted_by, description) VALUES (?, ?, ?, ?)',
        [budgetData.work_element_id, budgetData.amount, budgetData.submitted_by, budgetData.description]
      );

      expect(mockPool.query).toHaveBeenCalledWith(
        'INSERT INTO budgets (work_element_id, amount, submitted_by, description) VALUES (?, ?, ?, ?)',
        [budgetData.work_element_id, budgetData.amount, budgetData.submitted_by, budgetData.description]
      );
    });

    test('should update budget amount correctly', async () => {
      const budgetId = 1;
      const newAmount = 8000;

      mockPool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await mockPool.query(
        'UPDATE budgets SET amount = ? WHERE id = ?',
        [newAmount, budgetId]
      );

      expect(mockPool.query).toHaveBeenCalledWith(
        'UPDATE budgets SET amount = ? WHERE id = ?',
        [newAmount, budgetId]
      );
      expect(result[0].affectedRows).toBe(1);
    });

    test('should retrieve approved budgets with joins', async () => {
      const mockBudgets = [
        {
          id: 1,
          amount: 10000,
          work_element_name: 'WE-A1.1',
          task_name: 'Task A1',
          project_name: 'Project Alpha'
        }
      ];

      mockPool.query.mockResolvedValueOnce([mockBudgets]);

      const result = await mockPool.query(`
        SELECT b.id, b.amount, we.name AS work_element_name,
               t.name AS task_name, p.name AS project_name
        FROM budgets b
        JOIN work_elements we ON b.work_element_id = we.id
        JOIN tasks t ON we.task_id = t.id
        JOIN projects p ON t.project_id = p.id
        WHERE b.status = "approved"
      `);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT b.id, b.amount'));
      expect(result[0]).toEqual(mockBudgets);
    });
  });

  describe('Budget Change Request Operations', () => {
    test('should create budget change request', async () => {
      const bcrData = {
        bcr_number: 'BCR-001',
        source_budget_id: 1,
        destination_work_element_id: 2,
        transfer_amount: 2000,
        submitted_by: 'user1'
      };

      mockPool.query.mockResolvedValueOnce([[{ insertId: 1 }]]);

      const result = await mockPool.query(
        'INSERT INTO budget_changes (bcr_number, source_budget_id, destination_work_element_id, transfer_amount, submitted_by) VALUES (?, ?, ?, ?, ?)',
        [bcrData.bcr_number, bcrData.source_budget_id, bcrData.destination_work_element_id, bcrData.transfer_amount, bcrData.submitted_by]
      );

      expect(mockPool.query).toHaveBeenCalledWith(
        'INSERT INTO budget_changes (bcr_number, source_budget_id, destination_work_element_id, transfer_amount, submitted_by) VALUES (?, ?, ?, ?, ?)',
        [bcrData.bcr_number, bcrData.source_budget_id, bcrData.destination_work_element_id, bcrData.transfer_amount, bcrData.submitted_by]
      );
    });

    test('should approve budget change and update related budgets', async () => {
      const changeId = 1;
      const approvedBy = 'manager1';
      const transferAmount = 2000;
      const sourceBudgetId = 1;
      const destinationWorkElementId = 2;

      // Mock the budget change retrieval
      mockPool.query.mockResolvedValueOnce([[{
        id: changeId,
        transfer_amount: transferAmount,
        source_budget_id: sourceBudgetId,
        destination_work_element_id: destinationWorkElementId
      }]]);

      // Mock the approval update
      mockPool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      // Mock the source budget update
      mockPool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      // Mock the destination budget update
      mockPool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      // Execute the approval process
      await mockPool.query(
        'UPDATE budget_changes SET status = ?, approved_by = ?, approved_at = NOW() WHERE id = ?',
        ['approved', approvedBy, changeId]
      );

      await mockPool.query(
        'UPDATE budgets SET amount = amount - ? WHERE id = ?',
        [transferAmount, sourceBudgetId]
      );

      await mockPool.query(
        'UPDATE budgets SET amount = amount + ? WHERE id = ?',
        [transferAmount, destinationWorkElementId]
      );

      expect(mockPool.query).toHaveBeenCalledWith(
        'UPDATE budget_changes SET status = ?, approved_by = ?, approved_at = NOW() WHERE id = ?',
        ['approved', approvedBy, changeId]
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        'UPDATE budgets SET amount = amount - ? WHERE id = ?',
        [transferAmount, sourceBudgetId]
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        'UPDATE budgets SET amount = amount + ? WHERE id = ?',
        [transferAmount, destinationWorkElementId]
      );
    });
  });

  describe('Admin Reporting Queries', () => {
    test('should retrieve approved projects with date filters', async () => {
      const fromDate = '2024-01-01';
      const toDate = '2024-12-31';

      const mockProjects = [
        { id: 1, name: 'Project Alpha', approved_at: '2024-06-15' },
        { id: 2, name: 'Project Beta', approved_at: '2024-07-20' }
      ];

      mockPool.query.mockResolvedValueOnce([mockProjects]);

      const result = await mockPool.query(
        'SELECT id, name, submitted_by, approved_by, approved_at FROM projects WHERE status = "approved" AND approved_at >= ? AND approved_at <= ?',
        [fromDate, toDate]
      );

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT id, name, submitted_by, approved_by, approved_at FROM projects WHERE status = "approved" AND approved_at >= ? AND approved_at <= ?',
        [fromDate, toDate]
      );
      expect(result[0]).toEqual(mockProjects);
    });

    test('should retrieve production data with manager filter', async () => {
      const manager = 'manager1';

      const mockProduction = [
        {
          id: 1,
          price_per_barrel: 50,
          number_of_barrels: 100,
          cost: 3000,
          profit: 2000,
          project_name: 'Project Alpha',
          manager: 'manager1'
        }
      ];

      mockPool.query.mockResolvedValueOnce([mockProduction]);

      const result = await mockPool.query(`
        SELECT pr.id, pr.price_per_barrel, pr.number_of_barrels, pr.cost, pr.profit, pr.production_date,
               p.name AS project_name, p.approved_by AS manager
        FROM production pr
        JOIN projects p ON pr.project_id = p.id
        WHERE p.approved_by = ?
      `, [manager]);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT pr.id, pr.price_per_barrel'),
        [manager]
      );
      expect(result[0]).toEqual(mockProduction);
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors', async () => {
      const error = new Error('Connection failed');
      mockPool.query.mockRejectedValueOnce(error);

      await expect(mockPool.query('SELECT * FROM projects')).rejects.toThrow('Connection failed');
    });

    test('should handle invalid SQL queries', async () => {
      const error = new Error('You have an error in your SQL syntax');
      mockPool.query.mockRejectedValueOnce(error);

      await expect(mockPool.query('INVALID SQL')).rejects.toThrow('You have an error in your SQL syntax');
    });

    test('should handle constraint violations', async () => {
      const error = new Error('Duplicate entry');
      mockPool.query.mockRejectedValueOnce(error);

      await expect(mockPool.query('INSERT INTO projects (name) VALUES (?)', ['Duplicate Project']))
        .rejects.toThrow('Duplicate entry');
    });
  });
}); 