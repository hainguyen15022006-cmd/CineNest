/**
 * Chuẩn bị CSDL kiểm thử: tạo database (nếu chưa có), chạy migration, nạp seed.
 * Dùng: npm run db:test:setup   (đọc DATABASE_URL từ backend/.env.test)
 */
import { execSync } from "node:child_process";
import dotenv from "dotenv";
import { Client } from "pg";

dotenv.config({ path: [".env.test"] });
const url = process.env.DATABASE_URL;
if (!url) throw new Error("Thiếu DATABASE_URL trong .env.test");

const dbName = new URL(url).pathname.slice(1);
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";

const client = new Client({ connectionString: adminUrl.toString() });
await client.connect();
const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
if (exists.rowCount === 0) {
  await client.query(`CREATE DATABASE "${dbName}"`);
  console.log(`Đã tạo database ${dbName}`);
}
await client.end();

const env = { ...process.env, DATABASE_URL: url, NODE_ENV: "test" };
execSync("npx prisma migrate deploy", { stdio: "inherit", env });
execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env });
console.log("CSDL kiểm thử sẵn sàng:", dbName);
