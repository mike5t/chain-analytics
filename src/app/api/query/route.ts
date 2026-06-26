import { NextRequest, NextResponse } from "next/server";
import { queryRows } from "@/lib/db";

export async function GET() {
  // Dedicated endpoint to return the list of tables and their row counts
  try {
    const tables = await queryRows(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );

    const stats = [];
    for (const t of tables) {
      const name = t.name;
      const countRows = await queryRows(`SELECT COUNT(*) AS count FROM ${name}`);
      stats.push({
        Table: name,
        Rows: countRows[0]?.count || 0,
      });
    }

    return NextResponse.json(stats);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let sql = body.sql;

    if (!sql) {
      return NextResponse.json({ error: "Missing sql query in body" }, { status: 400 });
    }

    // Intercept DuckDB specific "SHOW TABLES" and map to SQLite catalog
    const cleanSql = sql.trim().toUpperCase();
    if (cleanSql === "SHOW TABLES" || cleanSql === "SHOW TABLES;") {
      const tables = await queryRows(
        "SELECT name AS 'table' FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      );
      return NextResponse.json(tables);
    }

    const params = body.params || [];
    const results = await queryRows(sql, params);
    return NextResponse.json(results);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
