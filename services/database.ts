
import { Pool, PoolClient } from 'pg';

class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  async query(text: string, params?: any[]): Promise<any> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }

  async getClient(): Promise<PoolClient> {
    return await this.pool.connect();
  }

  async end(): Promise<void> {
    await this.pool.end();
  }

  // User queries
  async createUser(email: string, passwordHash: string, username?: string) {
    const query = `
      INSERT INTO users (email, password_hash, username)
      VALUES ($1, $2, $3)
      RETURNING id, email, username, subscription_tier, created_at
    `;
    const result = await this.query(query, [email, passwordHash, username]);
    return result.rows[0];
  }

  async getUserByEmail(email: string) {
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await this.query(query, [email]);
    return result.rows[0];
  }

  async getUserById(id: number) {
    const query = 'SELECT id, email, username, subscription_tier, created_at FROM users WHERE id = $1';
    const result = await this.query(query, [id]);
    return result.rows[0];
  }

  // QR Code queries
  async createQRCode(ownerId: number, name: string, url: string, qrCodeData: string, options: any = {}) {
    const query = `
      INSERT INTO qr_codes (owner_id, name, url, qr_code_data, options)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const result = await this.query(query, [ownerId, name, url, qrCodeData, JSON.stringify(options)]);
    return result.rows[0];
  }

  async getQRCodesByOwnerId(ownerId: number) {
    const query = `
      SELECT qr.*, COUNT(qs.id) as scan_count
      FROM qr_codes qr
      LEFT JOIN qr_scans qs ON qr.id = qs.qr_code_id
      WHERE qr.owner_id = $1 AND qr.is_active = true
      GROUP BY qr.id
      ORDER BY qr.created_at DESC
    `;
    const result = await this.query(query, [ownerId]);
    return result.rows;
  }

  async getQRCodeById(id: number) {
    const query = `
      SELECT qr.*, COUNT(qs.id) as scan_count
      FROM qr_codes qr
      LEFT JOIN qr_scans qs ON qr.id = qs.qr_code_id
      WHERE qr.id = $1
      GROUP BY qr.id
    `;
    const result = await this.query(query, [id]);
    return result.rows[0];
  }

  async updateQRCode(id: number, updates: any) {
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    
    const query = `
      UPDATE qr_codes 
      SET ${setClause}
      WHERE id = $1
      RETURNING *
    `;
    const result = await this.query(query, [id, ...values]);
    return result.rows[0];
  }

  async deleteQRCode(id: number) {
    const query = 'UPDATE qr_codes SET is_active = false WHERE id = $1';
    await this.query(query, [id]);
  }

  // QR Scan tracking
  async recordQRScan(qrCodeId: number, scanData: any) {
    const query = `
      INSERT INTO qr_scans (
        qr_code_id, location, device, country_name, country_code,
        device_type, browser_name, operating_system, ip_address
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const result = await this.query(query, [
      qrCodeId,
      scanData.location,
      scanData.device,
      scanData.countryName,
      scanData.countryCode,
      scanData.deviceType,
      scanData.browserName,
      scanData.operatingSystem,
      scanData.ipAddress
    ]);
    return result.rows[0];
  }

  // Analytics queries
  async getAnalyticsSummary(ownerId: number) {
    const queries = {
      totalScans: `
        SELECT COUNT(*) as count
        FROM qr_scans qs
        JOIN qr_codes qr ON qs.qr_code_id = qr.id
        WHERE qr.owner_id = $1
      `,
      todayScans: `
        SELECT COUNT(*) as count
        FROM qr_scans qs
        JOIN qr_codes qr ON qs.qr_code_id = qr.id
        WHERE qr.owner_id = $1 AND DATE(qs.scanned_at) = CURRENT_DATE
      `,
      weekScans: `
        SELECT COUNT(*) as count
        FROM qr_scans qs
        JOIN qr_codes qr ON qs.qr_code_id = qr.id
        WHERE qr.owner_id = $1 AND qs.scanned_at >= CURRENT_DATE - INTERVAL '7 days'
      `,
      monthScans: `
        SELECT COUNT(*) as count
        FROM qr_scans qs
        JOIN qr_codes qr ON qs.qr_code_id = qr.id
        WHERE qr.owner_id = $1 AND qs.scanned_at >= CURRENT_DATE - INTERVAL '30 days'
      `,
      topCountries: `
        SELECT country_name as country, COUNT(*) as count
        FROM qr_scans qs
        JOIN qr_codes qr ON qs.qr_code_id = qr.id
        WHERE qr.owner_id = $1 AND country_name IS NOT NULL
        GROUP BY country_name
        ORDER BY count DESC
        LIMIT 5
      `,
      topDevices: `
        SELECT device_type as device, COUNT(*) as count
        FROM qr_scans qs
        JOIN qr_codes qr ON qs.qr_code_id = qr.id
        WHERE qr.owner_id = $1 AND device_type IS NOT NULL
        GROUP BY device_type
        ORDER BY count DESC
        LIMIT 5
      `
    };

    const results = await Promise.all([
      this.query(queries.totalScans, [ownerId]),
      this.query(queries.todayScans, [ownerId]),
      this.query(queries.weekScans, [ownerId]),
      this.query(queries.monthScans, [ownerId]),
      this.query(queries.topCountries, [ownerId]),
      this.query(queries.topDevices, [ownerId])
    ]);

    return {
      totalScans: parseInt(results[0].rows[0].count),
      todayScans: parseInt(results[1].rows[0].count),
      weekScans: parseInt(results[2].rows[0].count),
      monthScans: parseInt(results[3].rows[0].count),
      topCountries: results[4].rows,
      topDevices: results[5].rows
    };
  }
}

export const db = new DatabaseService();
export default db;
