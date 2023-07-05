import { int, mysqlEnum, mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { InferModel } from 'drizzle-orm';

export const ResumeDataSchemaDB = mysqlTable("resume_data", {
    id: varchar("id", { length: 256 }).primaryKey(),
    name: varchar("name", { length: 1024 }).notNull(),
    size: int("size").notNull(),
    type: varchar("type", { length: 64 }).notNull(),
    results: varchar("results", { length: 2048 }).notNull(),
    status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).notNull(),
    date: varchar("date", { length: 64 }).notNull(),
})

export type ResumeDataDB = InferModel<typeof ResumeDataSchemaDB>
export type NewResumeDataDB = InferModel<typeof ResumeDataSchemaDB, "insert">