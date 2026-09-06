const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

exports.handler = async (event) => {
  const { httpMethod, path } = event;
  const body = event.body ? JSON.parse(event.body) : {};

  try {
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

      // Create Assignment
      const assignQuery = `
        INSERT INTO project_assignments (challenge_id, assigned_org_id)
        VALUES ($1, $2) RETURNING *;
      `;
      const result = await pool.query(assignQuery, [challenge_id, assigned_org_id]);

      // Update Challenge Status
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

      // Automatically update main status to RESOLVED if 100% complete
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
