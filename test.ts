import { assert, assertExists } from "./deps.ts";

const fullURLToTest = Deno.env.get("FULL_URL_TO_TEST") || "";

Deno.test("validate celery task via http", async (t) => {
  await t.step("verify url", async () => {
    assert(fullURLToTest != null);
  })

  const res=await fetch(fullURLToTest);

  await t.step("verify metadata", async () => {
    assert(res.ok === true);
    assert(res.status === 200);
    assert(res.redirected === false);
  })

  const resBody=await res.text();

  await t.step("verify body", async () => {
    assert(resBody === "8");
  })
});
