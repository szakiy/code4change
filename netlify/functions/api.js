const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

exports.handler = async (event) => {
  const { httpMethod, path } = event;
  const body = event.body ? JSON.parse(event.body) : {};

  try {
    // ----------------------------------------------------
    // POST: Register New Collaborator
    // ----------------------------------------------------
    if (httpMethod === 'POST' && path.endsWith('/register')) {
      const { full_name, email, password, primary_skill } = body;

      if (!full_name || !email || !password) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Full name, email, and password are required." })
        };
      }

      // Check if email already exists in database
      const userCheck = await pool.query('SELECT id FROM collaborators WHERE email = $1', [email]);
      if (userCheck.rows.length > 0) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "An account with this email already exists." })
        };
      }

      // Hash password securely
      const password_hash = await bcrypt.hash(password, 10);

      const query = `
        INSERT INTO collaborators (full_name, email, password_hash, primary_skill)
        VALUES ($1, $2, $3, $4)
        RETURNING id, full_name, email, primary_skill, created_at;
      `;
      const values = [full_name, email, password_hash, primary_skill || null];
      const result = await pool.query(query, values);

      return { statusCode: 201, body: JSON.stringify(result.rows[0]) };
    }

    // ----------------------------------------------------
    // POST: Authenticate / Login Collaborator
    // ----------------------------------------------------
    if (httpMethod === 'POST' && path.endsWith('/login')) {
      const { email, password } = body;

      if (!email || !password) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Email and password are required." })
        };
      }

      // Find user in database
      const userQuery = 'SELECT * FROM collaborators WHERE email = $1;';
      const result = await pool.query(userQuery, [email]);

      if (result.rows.length === 0) {
        return {
          statusCode: 401,
          body: JSON.stringify({ error: "Invalid email or password." })
        };
      }

      const user = result.rows[0];

      // Compare password hash
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        return {
          statusCode: 401,
          body: JSON.stringify({ error: "Invalid email or password." })
        };
      }

      // Do not return password hash to client
      delete user.password_hash;

      return { statusCode: 200, body: JSON.stringify(user) };
    }

    // ----------------------------------------------------
    // GET: Dashboard Stats Metric Cards
    // ----------------------------------------------------
    if (httpMethod === 'GET' && path.endsWith('/stats')) {
      const result = await pool.query('SELECT * FROM get_dashboard_stats();');
      return { statusCode: 200, body: JSON.stringify(result.rows[0]) };
    }

    // ----------------------------------------------------
    // GET: Full Challenge Feed with Join Data
    // ----------------------------------------------------
    if (httpMethod === 'GET' && path.endsWith('/challenges')) {
      const result = await pool.query('SELECT * FROM get_challenge_feed();');
      return { statusCode: 200, body: JSON.stringify(result.rows) };
    }

    // ----------------------------------------------------
    // POST: Submit a New Societal Challenge/Query
    // ----------------------------------------------------
    if (httpMethod === 'POST' && path.endsWith('/challenges')) {
      const { title, description, category_id, reporter_name, reporter_org_id } = body;

      const query = `
        INSERT INTO societal_challenges (title, description, category_id, reporter_name, reporter_org_id)
        VALUES ($1, $2, $3, $4, $5) 
        RETURNING *;
      `;
      const values = [title, description, category_id, reporter_name, reporter_org_id || null];
      const result = await pool.query(query, values);

      return { statusCode: 201, body: JSON.stringify(result.rows[0]) };
    }

    // ----------------------------------------------------
    // POST: Assign Challenge to an Industry/Company
    // ----------------------------------------------------
    if (httpMethod === 'POST' && path.endsWith('/assign')) {
      const { challenge_id, assigned_org_id } = body;

      const assignQuery = `
        INSERT INTO project_assignments (challenge_id, assigned_org_id)
        VALUES ($1, $2) RETURNING *;
      `;
      const result = await pool.query(assignQuery, [challenge_id, assigned_org_id]);

      await pool.query(
        `UPDATE societal_challenges SET status = 'ASSIGNED' WHERE id = $1;`,
        [challenge_id]
      );

      return { statusCode: 201, body: JSON.stringify(result.rows[0]) };
    }

    // ----------------------------------------------------
    // POST: Update Industry Project Progress / Milestones
    // ----------------------------------------------------
    if (httpMethod === 'POST' && path.endsWith('/progress')) {
      const { assignment_id, milestone_title, progress_percentage, remarks } = body;

      const progressQuery = `
        INSERT INTO project_progress (assignment_id, milestone_title, progress_percentage, remarks)
        VALUES ($1, $2, $3, $4) RETURNING *;
      `;
      const values = [assignment_id, milestone_title, progress_percentage, remarks];
      const result = await pool.query(progressQuery, values);

      if (progress_percentage === 100) {
        await pool.query(`
          UPDATE societal_challenges 
          SET status = 'RESOLVED' 
          WHERE id = (SELECT challenge_id FROM project_assignments WHERE id = $1);
        `, [assignment_id]);
      }

      return { statusCode: 201, body: JSON.stringify(result.rows[0]) };
    }

    return { statusCode: 404, body: JSON.stringify({ error: "Route not found" }) };

  } catch (error) {
    console.error('Database query error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error", details: error.message })
    };
  }
};