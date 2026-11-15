import { PgDialect } from "drizzle-orm/pg-core";
import { expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@lobbystack/db", async original => ({ ...(await original<typeof import("@lobbystack/db")>()), withBusinessTransaction: mock.transaction }));
import { loadCourseCatalogue } from "./courseCatalogue";
const dialect = new PgDialect();

it("keeps source ownership and active indexed filters on every query and invalidates changed or deactivated pages", async () => {
  let revision = 1, active = true;
  mock.transaction.mockImplementation(async (_db, actor, callback) => {
    expect(actor).toEqual({ businessId: "catalogue-tenant-a", actorType: "worker" });
    return callback({ execute: async (statement: Parameters<typeof dialect.sqlToQuery>[0]) => {
      const q = dialect.sqlToQuery(statement);
      if (q.sql.startsWith("SET")) return { rows: [] };
      expect(q.params).toContain(actor.businessId);
      expect(q.sql).toContain("d.active=true AND d.status='indexed'");
      if (q.sql.includes("string_agg")) {
        expect(q.sql).toContain("c.business_id=d.business_id");
        return { rows: active ? [{ title: `Course ${revision}`, url: "https://college.test/courses/course", text: "CODE 101" }] : [] };
      }
      return { rows: active ? [{ id: "doc", revision, title: "Course", url: "https://college.test/courses/course" }] : [] };
    } });
  });
  const context = { db: {} as never };
  expect((await loadCourseCatalogue(context, { businessId: "catalogue-tenant-a" }))[0]?.title).toBe("Course 1");
  revision++;
  expect((await loadCourseCatalogue(context, { businessId: "catalogue-tenant-a" }))[0]?.title).toBe("Course 2");
  active = false;
  expect(await loadCourseCatalogue(context, { businessId: "catalogue-tenant-a" })).toEqual([]);
});

it("does not reuse another business's cached catalogue even for the same document signature", async () => {
  mock.transaction.mockImplementation(async (_db, actor, callback) => callback({ execute: async (statement: Parameters<typeof dialect.sqlToQuery>[0]) => {
    const q = dialect.sqlToQuery(statement);
    if (q.sql.startsWith("SET")) return { rows: [] };
    return { rows: q.sql.includes("string_agg") ? [{ title: actor.businessId, url: "https://college.test/courses/course", text: "CODE 101" }] : [{ id: "same", revision: 1, title: "same", url: "same" }] };
  } }));
  const context = { db: {} as never };
  for (const businessId of ["catalogue-tenant-b", "catalogue-tenant-c"]) expect((await loadCourseCatalogue(context, { businessId }))[0]?.title).toBe(businessId);
});
