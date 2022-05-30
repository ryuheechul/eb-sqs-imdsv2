import { assert, assertEquals } from "./deps.ts";

const fullURLToTest = Deno.env.get("FULL_URL_TO_TEST") || "";

console.log("testing url: " + fullURLToTest);

Deno.test("validate celery task via http", async (t) => {
  await t.step("verify url", async () => {
    assert(fullURLToTest != null);
  })
});

Deno.test("validate default path with `/`", async (t) => {
  const res = await fetch(fullURLToTest + '/');

  await t.step("verify metadata", async () => {
    assertEquals(res.ok, true);
    assertEquals(res.status, 200);
    assertEquals(res.redirected, false);
  })

  const resBody = await res.text();

  await t.step("verify body", async () => {
    assertEquals(resBody, "ok");
  })
});

Deno.test("validate celery task via http with `/s`", async (t) => {
  const res = await fetch(fullURLToTest + '/s');

  await t.step("verify metadata", async () => {
    assertEquals(res.ok, true);
    assertEquals(res.status, 200);
    assertEquals(res.redirected, false);
  })

  const resBody = await res.text();

  await t.step("verify body", async () => {
    assertEquals(resBody, "8");
  })
});

Deno.test("validate celery task coming from worker with `/v`", async (t) => {
  const res = await fetch(fullURLToTest + '/v');

  await t.step("verify metadata", async () => {
    assertEquals(res.ok, true);
    assertEquals(res.status, 200);
    assertEquals(res.redirected, false);
  })

  const resBody = await res.text();

  await t.step("verify body", async () => {
    assert(resBody.startsWith('w'));
  })
});
